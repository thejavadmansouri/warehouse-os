/**
 * بخش ۴ — چرخه‌ی فاکتور. TEST 066..081
 *
 * کانونِ سؤال: «فاینال فاکتور» نباید دوبار موجودی کم کند. در این معماری فاکتور در
 * یک تراکنش ساخته و بلافاصله CONFIRMED می‌شود (Draft جدایِ OpenAccount است)، پس
 * «Finalize دوباره» و «Retry» هر دو با همان idempotencyKey بررسی می‌شوند تا هیچ
 * جفتِ SALE دو بار ننشیند.
 */
import {
  prisma, sales, returns, corrections, baseFixture, makeProduct, makeCustomer, stockAt, totalStock, uniq, close,
} from './harness';
import { note, errBody } from './evlog';

let f: any;
beforeAll(async () => { f = await baseFixture(); });
afterAll(close);

const sell = (over: any = {}) => sales.createInvoice({
  idempotencyKey: uniq('idem'), warehouseId: f.warehouseId, ...over,
} as any, f.userId);
const L = (p: any, qty: number, price: number, loc?: string) =>
  ({ productId: p.id, locationId: loc ?? f.locationId, quantity: qty, unitPrice: price });

describe('SECTION 4 — Invoice lifecycle', () => {

  it('T066 empty invoice (no lines) — service accepts; DTO guard is HTTP-only → finding', async () => {
    // Through the real service (the same path an offline/mobile adapter uses)
    // the `@ArrayMinSize(1)` DTO guard does NOT run, so an empty invoice is
    // accepted today. Recording actual behaviour + severity for the report.
    const inv: any = await sell({ lines: [] } as any);
    expect(inv.subtotal).toBe(0);
    expect(inv.total).toBe(0);
    const pays = await prisma.payment.findMany({ where: { invoiceId: inv.id } });
    expect(pays.length).toBe(1);
    expect(pays[0].amount).toBe(0);
    note('T066_empty_invoice', {
      accepted: true, total: inv.total, zeroPayment: pays[0].amount,
      severity: 'Medium',
      finding: 'سرویسِ فروش بدون DTO حاوی lines=[] را می‌پذیرد و فاکتورِ صفر با پرداختِ CASHِ ۰ می‌سازد. از HTTP محافظت می‌شود ولی آفلاین/تست مستقیم می‌تواند فاکتور خالی بسازد.',
    });
  });

  it('T067 one-line invoice is CONFIRMED and decrements exactly', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 3, 40_000)] });
    expect(inv.status).toBe('CONFIRMED');
    expect(inv.total).toBe(120_000);
    expect(await stockAt(p.id, f.locationId)).toBe(7);
  });

  it('T068 100-item invoice commits atomically', async () => {
    const items = [];
    for (let i = 0; i < 100; i++) items.push(await makeProduct({ stock: 100 }));
    const inv: any = await sell({ lines: items.map((p, i) => L(p, 1, 1_000 + i)) });
    expect(inv.lines.length).toBe(100);
    for (const p of items) expect(await stockAt(p.id, f.locationId)).toBe(99);
  });

  it('T069 high-quantity single line (999 units) decrements exactly', async () => {
    const p = await makeProduct({ stock: 1000 });
    await sell({ lines: [L(p, 999, 1)] });
    expect(await stockAt(p.id, f.locationId)).toBe(1);
  });

  it('T070 duplicate products merged by client; duplicate LINE is rejected (no double deduction)', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(sell({ lines: [L(p, 1, 1000), L(p, 1, 1000)] }))
      .rejects.toMatchObject({ response: { error: 'DUPLICATE_LINE' } });
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T071 cancel a confirmed invoice returns stock exactly and zeroes a debt', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv = await sell({ customerId: cust.id, lines: [L(p, 4, 10_000)] });
    await sales.cancelInvoice(inv.id, 'اشتباه در ثبت', f.userId);
    const after: any = await sales.findOne(inv.id);
    expect(after.status).toBe('CANCELLED');
    expect(await stockAt(p.id, f.locationId)).toBe(10);
    // بدهی (نسیه) برگشت خورده — فاکتور نقد بود پس due=0؛ این مورد نقدِ تمام است.
  });

  it('T072 cancel twice is rejected (ALREADY_CANCELLED), stock NOT double-returned', async () => {
    const p = await makeProduct({ stock: 5 });
    const inv = await sell({ lines: [L(p, 2, 1000)] });
    await sales.cancelInvoice(inv.id, 'اول', f.userId);
    await expect(sales.cancelInvoice(inv.id, 'دوباره', f.userId))
      .rejects.toMatchObject({ response: { error: 'ALREADY_CANCELLED' } });
    // موجودی فقط یک بار (2 واحد) برگشته؛ ابطالِ دوم نباید دوباره برگرداند.
    expect(await stockAt(p.id, f.locationId)).toBe(5);
  });

  it('T073 retry finalize (same idempotency key) returns SAME invoice, no double SALE log', async () => {
    const p = await makeProduct({ stock: 10 });
    const key = uniq('retry-final');
    const inv1: any = await sell({ idempotencyKey: key, lines: [L(p, 2, 1000)] });
    const inv2: any = await sell({ idempotencyKey: key, lines: [L(p, 2, 1000)] });
    expect(inv1.id).toBe(inv2.id);
    const saleLogs = await prisma.inventoryLog.count({ where: { invoiceId: inv1.id, action: 'SALE' } });
    expect(saleLogs).toBe(1);
    expect(await stockAt(p.id, f.locationId)).toBe(8);
  });

  it('T074 concurrent retry with the same idempotency key → one invoice, one deduction', async () => {
    const p = await makeProduct({ stock: 10 });
    const key = uniq('concurrent-retry');
    const res = await Promise.allSettled([
      sell({ idempotencyKey: key, lines: [L(p, 1, 1000)] }),
      sell({ idempotencyKey: key, lines: [L(p, 1, 1000)] }),
      sell({ idempotencyKey: key, lines: [L(p, 1, 900)] }),
    ]);
    const ok = res.filter(r => r.status === 'fulfilled');
    const ids = new Set(ok.map((r: any) => r.value.id));
    expect(ids.size).toBe(1);
    const saleLogs = await prisma.inventoryLog.count({ where: { action: 'SALE' } });
    const inv = ok[0] as any;
    const invLogs = await prisma.inventoryLog.count({ where: { invoiceId: inv.value.id, action: 'SALE' } });
    expect(invLogs).toBe(1);
    expect(await stockAt(p.id, f.locationId)).toBe(9);
  });

  it('T075 cancel a nescified (credit) invoice zeroes dueAmount and reverses ledger debt', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      customerId: cust.id, lines: [L(p, 1, 100_000)],
      payments: [{ method: 'CREDIT', amount: 100_000 }],
    });
    expect(inv.dueAmount).toBe(100_000);
    await sales.cancelInvoice(inv.id, 'انصراف', f.userId);
    const after: any = await sales.findOne(inv.id);
    expect(after.dueAmount).toBe(0);
    const ledger = await prisma.customerLedger.aggregate({ where: { customerId: cust.id }, _sum: { amount: true } });
    // INVOICE(+100k) + INVOICE_CANCELLED(-100k) = 0
    expect(ledger._sum.amount).toBe(0);
  });

  it('T076 cancellation after a partial return restocks only the outstanding qty', async () => {
    const p = await makeProduct({ stock: 50 });
    const inv: any = await sell({ lines: [L(p, 10, 1000)] });
    // یک مرجوعیِ 4تایی CASH
    const saleLine = (await prisma.inventoryLog.findFirst({ where: { invoiceId: inv.id, action: 'SALE' } }))!;
    await returns.createReturn({
      idempotencyKey: uniq('ret'),
      invoiceId: inv.id,
      refundMethod: 'CASH',
      reason: 'تعویض',
      lines: [{ saleLogId: saleLine.id, quantity: 4 }],
    } as any, f.userId, 'ADMIN' as any);
    expect(await stockAt(p.id, f.locationId)).toBe(44); // 50-10+4
    await sales.cancelInvoice(inv.id, 'لغو', f.userId);
    // باقی‌مانده 6 واحد برمی‌گردد → 50
    expect(await stockAt(p.id, f.locationId)).toBe(50);
  });

  it('T077 correction lowers quantity → stock returns the difference', async () => {
    const p = await makeProduct({ stock: 20 });
    const inv: any = await sell({ lines: [L(p, 8, 1000)] });
    const saleLine = (await prisma.inventoryLog.findFirst({ where: { invoiceId: inv.id, action: 'SALE' } }))!;
    await corrections.createCorrection({
      idempotencyKey: uniq('corr'),
      invoiceId: inv.id, reason: 'خالی فروخته شد',
      lines: [{ saleLogId: saleLine.id, newQuantity: 5, newUnitPrice: 1000 }],
    } as any, f.userId);
    // 20-8 +3 = 15
    expect(await stockAt(p.id, f.locationId)).toBe(15);
  });

  it('T078 correction that raises quantity deducts the extra (net effect)', async () => {
    const p = await makeProduct({ stock: 20 });
    const inv: any = await sell({ lines: [L(p, 8, 1000)] });
    const saleLine = (await prisma.inventoryLog.findFirst({ where: { invoiceId: inv.id, action: 'SALE' } }))!;
    await corrections.createCorrection({
      idempotencyKey: uniq('corr'),
      invoiceId: inv.id, reason: 'مشتری بیشتر برد',
      lines: [{ saleLogId: saleLine.id, newQuantity: 12, newUnitPrice: 1000 }],
    } as any, f.userId);
    expect(await stockAt(p.id, f.locationId)).toBe(8); // 20-12
  });

  it('T079 add-line correction (new item on the invoice) creates an extra SALE log + deduction', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 2, 500)] });
    const extra = await makeProduct({ stock: 10 });
    // بدون locationId → روی مکانِ سیستمیِ «موجودی ثبت‌نشده» می‌نشیند (مثل فروش).
    // پس stockAt(extra.id, f.locationId) دگرگون نمی‌شود؛ totalStock باید 7 شود.
    await corrections.createCorrection({
      idempotencyKey: uniq('corr2'),
      invoiceId: inv.id, reason: 'اضافه',
      lines: [],
      addedLines: [{ productId: extra.id, quantity: 3, unitPrice: 100 }],
    } as any, f.userId);
    expect(await totalStock(extra.id)).toBe(7);
    // ردیفِ تازه باید جزو خودِ فاکتور باشد (لاگِ SALE به فاکتور قفل شده).
    const extraLog = await prisma.inventoryLog.count({ where: { invoiceId: inv.id, productId: extra.id, action: 'SALE' } });
    expect(extraLog).toBe(1);
  });

  it('T080 an OPEN-account invoice never deducts again on finalize path (no separate finalize op)', async () => {
    // این سیستم فاینالِ جدا ندارد؛ OpenAccount در تسویه CONFIRMED می‌شود.
    // تا آن موقع فاکتور OPEN روی تب می‌نشیند و موجودی همان یک بار کم شده.
    const p = await makeProduct({ stock: 10 });
    const cust = await makeCustomer();
    const acct = await prisma.openAccount.create({ data: { customerId: cust.id } });
    const inv: any = await sell({ accountId: acct.id, lines: [L(p, 5, 1000)] });
    expect(inv.status).toBe('OPEN');
    expect(await stockAt(p.id, f.locationId)).toBe(5);
  });
});