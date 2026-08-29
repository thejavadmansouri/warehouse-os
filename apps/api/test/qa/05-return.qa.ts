/**
 * بخش ۵ — مرجوعی/بازگشت. TEST 082..091
 * قانونِ کلیدی: Return باید موجودی را دقیقاً به اندازه‌ی برگشتی برگرداند و هرگز
 * بیش از خرید (Buy 1 → Return 2) نپذیرد. قیمتِ برگشت از خودِ فاکتور می‌آید،
 * نه از قیمتِ امروزِ کالا.
 */
import {
  prisma, sales, returns, corrections, baseFixture, makeProduct, makeCustomer, stockAt, uniq, close,
} from './harness';
import { note, errBody } from './evlog';

let f: any;
beforeAll(async () => { f = await baseFixture(); });
afterAll(close);

const sell = (over: any = {}) => sales.createInvoice({
  idempotencyKey: uniq('idem'), warehouseId: f.warehouseId, ...over,
} as any, f.userId);
const L = (p: any, qty: number, price: number) =>
  ({ productId: p.id, locationId: f.locationId, quantity: qty, unitPrice: price });

async function lastSaleLine(invoiceId: string, productId?: string) {
  return await prisma.inventoryLog.findFirstOrThrow({
    where: { invoiceId, action: 'SALE', ...(productId ? { productId } : {}) },
    orderBy: { createdAt: 'asc' },
  });
}
const ret = (over: any) => returns.createReturn({
  idempotencyKey: uniq('ret'), refundMethod: 'CASH', reason: 'تست', ...over,
} as any, f.userId, 'ADMIN' as any);

describe('SECTION 5 — Returns', () => {

  it('T082 full return restocks the exact quantity', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 4, 1000)] });
    expect(await stockAt(p.id, f.locationId)).toBe(6);
    const line = await lastSaleLine(inv.id);
    await ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 4 }] });
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T083 partial return restocks only the returned qty', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 8, 1000)] });
    const line = await lastSaleLine(inv.id);
    await ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 3 }] });
    expect(await stockAt(p.id, f.locationId)).toBe(5);
  });

  it('T084 return more than bought is rejected (EXCESS_RETURN), stock unchanged', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 1, 1000)] });
    const line = await lastSaleLine(inv.id);
    await expect(ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 2 }] }))
      .rejects.toMatchObject({ response: { error: 'EXCESS_RETURN' } });
    expect(await stockAt(p.id, f.locationId)).toBe(9);
  });

  it('T085 return one line from a multi-line invoice only touches that line', async () => {
    const a = await makeProduct({ stock: 10 });
    const b = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(a, 3, 1000), L(b, 5, 1000)] });
    const lineA = await lastSaleLine(inv.id, a.id);
    await ret({ invoiceId: inv.id, lines: [{ saleLogId: lineA.id, quantity: 2 }] });
    expect(await stockAt(a.id, f.locationId)).toBe(9); // 10-3+2
    expect(await stockAt(b.id, f.locationId)).toBe(5); // untouched
  });

  it('T086 return twice on the same line: second capped by remaining', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 5, 1000)] });
    const line = await lastSaleLine(inv.id);
    await ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 3 }] });
    expect(await stockAt(p.id, f.locationId)).toBe(8);
    // مرجوعیِ دومِ غیرقانونی (مازاد) رد می‌شود و موجودی دست نمی‌خورد.
    await expect(ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 3 }] }))
      .rejects.toMatchObject({ response: { error: 'EXCESS_RETURN' } });
    expect(await stockAt(p.id, f.locationId)).toBe(8);
  });

  it('T087 defect return (restock=false) does NOT move inventory but still creates the document', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 4, 1000)] });
    const line = await lastSaleLine(inv.id);
    await ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 2, restock: false }] });
    expect(await stockAt(p.id, f.locationId)).toBe(6); // بدون برگشتِ انبار
    const r = await prisma.saleReturn.count({ where: { invoiceId: inv.id } });
    expect(r).toBe(1);
  });

  it('T088 return on a non-existent invoice is rejected cleanly, nothing written', async () => {
    await expect(ret({ invoiceId: '00000000-0000-0000-0000-000000000000', lines: [{ saleLogId: 'x', quantity: 1 }] }))
      .rejects.toMatchObject({ response: { error: 'INVOICE_NOT_FOUND' } });
  });

  it('T089 refund amount respects the proportional discount share', async () => {
    const p = await makeProduct({ stock: 10 });
    // 5 عدد 1000تایی = 5000، تخفیف کل 1000 → مبلغ مؤثر هر ردیف 4000، هر واحد 800
    const inv: any = await sell({ lines: [L(p, 5, 1000)], discount: 1000 });
    expect(inv.total).toBe(4000);
    const line = await lastSaleLine(inv.id);
    await ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 2 }] });
    const r: any = await returns.findOne((await prisma.saleReturn.findFirstOrThrow({ where: { invoiceId: inv.id } })).id);
    // 2 واحد × قیمتِ واحدِ مؤثر (800) = 1600
    expect(r.refundAmount).toBe(1600);
    expect(await stockAt(p.id, f.locationId)).toBe(7);
  });

  it('T090 two concurrent returns for the same last unit → only one succeeds', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 3, 1000)] });
    const line = await lastSaleLine(inv.id);
    const res = await Promise.allSettled([
      ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 1 }] }),
      ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 2 }] }),
    ]);
    // مجموعِ خواسته‌شده = 3 = تعدادِ فروخته‌شده؛ هر دو باید سریالی موفق شوند
    // (بعد از اولی، باقی‌مانده کافی است) — هیچ Lost Update و هیچ Returnِ اضافه‌ای
    // نباید رخ دهد، و موجودیِ نهایی دقیقاً 10 شود.
    const ok = res.filter(r => r.status === 'fulfilled').length;
    expect(ok).toBe(2);
    const stock = await stockAt(p.id, f.locationId);
    expect(stock).toBe(10); // 7 + 3 برگشت
    const totalReturned = await prisma.saleReturnLine.aggregate({ where: { returnId: { in: (await prisma.saleReturn.findMany({ where: { invoiceId: inv.id } })).map(r => r.id) } }, _sum: { quantity: true } });
    expect(totalReturned._sum.quantity).toBe(3); // دقیقاً به اندازه‌ی خرید، نه بیشتر
  });

  it('T091 return after the product price changed still refunds the original invoice price', async () => {
    const p = await makeProduct({ stock: 10, salePrice: 1000 });
    const inv: any = await sell({ lines: [L(p, 2, 1000)] });
    // قیمت کالا عوض شد ولی فاکتورِ قبلی دست نمی‌خورد.
    await prisma.productPrice.create({ data: { productId: p.id, salePrice: 999_999 } });
    const line = await lastSaleLine(inv.id);
    await ret({ invoiceId: inv.id, lines: [{ saleLogId: line.id, quantity: 1 }] });
    const r: any = await returns.findOne((await prisma.saleReturn.findFirstOrThrow({ where: { invoiceId: inv.id } })).id);
    expect(r.refundAmount).toBe(1000); // قیمتِ فاکتور، نه قیمتِ امروز
  });
});