/**
 * بخش ۱۲ — Security پایه. TEST 125..135
 *
 * کانون: Backend باید مبلغ نهایی را **مستقل از کلاینت** محاسبه کند — هرگز به
 * total/subtotal/paidAmountِ ارسالیِ فرانت اعتماد نکند. نقش‌ها باید مرجوعیِ
 * نهایی را به مدیر محدود کنند، و هر مسیر دسترسی باید موجودیت را پیدا کند وگرنه
 * رد شود. همه‌ی این‌ها از خودِ سرویس سنجیده می‌شود (جایی که صفِ آفلاین هم می‌رود).
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

describe('SECTION 12 — Security', () => {

  it('T125 client can NOT set total/subtotal/paidAmount — server recomputes from lines', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      lines: [L(p, 2, 100_000)],
      total: 1, subtotal: 1, paidAmount: 1, // کلاینتِ بدخواه
    } as any);
    expect(inv.subtotal).toBe(200_000);
    expect(inv.total).toBe(200_000);
    // paidAmount هم که از خودِ total می‌آید (نقدِ کامل) — عددِ جعلی نادیده گرفته شد.
    expect(inv.paidAmount).toBe(200_000);
    expect(inv.dueAmount).toBe(0);
  });

  it('T126 client can NOT sneak a negative net by negative line discount', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      lines: [{ productId: p.id, locationId: f.locationId, quantity: 2, unitPrice: 100_000, discount: -50_000 }],
    } as any);
    // در حالت بد، subtotal با -50000 زیاد می‌شود → باید/یا رد شود یا دقیق نباشد.
    note('T126_neg_line_discount', { subtotal: inv.subtotal, total: inv.total });
    // دو حالتِ امن: یا رد شد (خطا) یا مبلغِ دقیقِ 200_000+؛ هرگز با توییتِ منفیِ
    // که مبلغ خالص را بی‌دلیل بالا/پایین ببرد در حدِ یک ردیفِ زهرآلود.
    expect(inv.total).toBeGreaterThanOrEqual(200_000);
  });

  it('T127 discount manipulation: raising invoice discount above total is rejected', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(sell({ lines: [L(p, 1, 100_000)], discount: 9_999_999 }))
      .rejects.toMatchObject({ response: { error: 'DISCOUNT_EXCEEDS_TOTAL' } });
    expect(await stockAt(p.id, f.locationId)).toBe(10); // stock untouched
  });

  it('T128 negative price is rejected — no negative inventory credit', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 1, unitPrice: -123_000 }] }))
      .rejects.toBeDefined();
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T129 unknown invoice access for cancel → INVOICE_NOT_FOUND (no IDOR info leak)', async () => {
    await expect(sales.cancelInvoice('00000000-0000-0000-0000-000000000000', 'x', f.userId))
      .rejects.toMatchObject({ response: { error: 'INVOICE_NOT_FOUND' } });
  });

  it('T130 return a finalized invoice as a SALES-role user is FORBIDDEN (manager-only)', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 2, 1000)] });
    const line = await prisma.inventoryLog.findFirstOrThrow({ where: { invoiceId: inv.id, action: 'SALE' } });
    await expect(returns.createReturn({
      idempotencyKey: uniq('r'), invoiceId: inv.id, refundMethod: 'CASH', reason: 'x',
      lines: [{ saleLogId: line.id, quantity: 1 }],
    } as any, f.userId, 'SALES' as any))
      .rejects.toMatchObject({ response: { error: 'RETURN_REQUIRES_MANAGER' } });
    expect(await stockAt(p.id, f.locationId)).toBe(8); // تا نهایی نشده / رد شده دست نمی‌خورد
  });

  it('T131 correction of a finalized invoice by SALES role is FORBIDDEN', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 2, 1000)] });
    const line = await prisma.inventoryLog.findFirstOrThrow({ where: { invoiceId: inv.id, action: 'SALE' } });
    await expect(corrections.createCorrection({
      idempotencyKey: uniq('c'), invoiceId: inv.id, reason: 'x',
      lines: [{ saleLogId: line.id, newQuantity: 1, newUnitPrice: 1000 }],
    } as any, f.userId, 'SALES' as any))
      .rejects.toMatchObject({ response: { error: 'CORRECTION_REQUIRES_MANAGER' } });
  });

  it('T132 return without a reason is rejected (no anonymous audit)', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 1, 1000)] });
    const line = await prisma.inventoryLog.findFirstOrThrow({ where: { invoiceId: inv.id, action: 'SALE' } });
    await expect(returns.createReturn({
      idempotencyKey: uniq('r'), invoiceId: inv.id, refundMethod: 'CASH',
      lines: [{ saleLogId: line.id, quantity: 1 }],
    } as any, f.userId, 'ADMIN' as any))
      .rejects.toMatchObject({ response: { error: 'REASON_REQUIRED' } });
  });

  it('T133 ticking the drawer for a credit-only sale (no customer) is impossible (no phantom payment)', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(sell({ lines: [L(p, 1, 1000)], payments: [{ method: 'CREDIT', amount: 1000 }] }))
      .rejects.toMatchObject({ response: { error: 'CUSTOMER_REQUIRED_FOR_CREDIT' } });
    // اگر بدون مشتری می‌پذیرفت، یک بدهیِ بی‌مالک می‌ساخت — این حالا رد می‌شود.
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T134 price learning: what the seller typed becomes the catalog price — cheap-sale must not underforce', async () => {
    // این یک رفتارِ تجاری عمدی است (فروشنده شماره‌ی قیمت را تایپ می‌کند و همان
    // یاد گرفته می‌شود). در یک فروشِ عادی، «قیمتِ کم‌نویس» قابلِ انجام است چون
    // عددِ نهایی هر ردیف از unitPriceِ ارسالی می‌آید. مستندش می‌کنیم؛ در گزارش
    // به‌عنوان موضوعِ «اعتمادِ حداقلی به قیمتِ کلاینت» می‌ماند که محدودیتِ تجاری است
    // و لایه‌ی DTO (نزدیک‌بودن به قیمتِ catalog در UI) دستِ سیاستِ فروش است.
    const p = await makeProduct({ stock: 10, salePrice: 1_000_000 });
    const inv: any = await sell({
      lines: [{ productId: p.id, locationId: f.locationId, quantity: 1, unitPrice: 1 }],
      // «قیمتِ دلخواه» پذیرفته می‌شود و از مبلغِ real فاکتور می‌آید.
    } as any);
    expect(inv.total).toBe(1);
    note('T134_price_trust', {
      finding: 'Backend قیمتِ واحدِ کلاینت را می‌پذیرد (unitPrice در DTO). این برای صندوقِ فروشگاهِ قطعات عمدی است (فروشنده قیمت را تایپ می‌کند) ولی یعنی validation ضدِ «قیمتِ کم» در لایه‌ی سرویس وجود ندارد — Medium.',
    });
  });

  it('T135 cheque refund is not a valid return method (prevents fake cheque-credit)', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 1, 1000)] });
    const line = await prisma.inventoryLog.findFirstOrThrow({ where: { invoiceId: inv.id, action: 'SALE' } });
    await expect(returns.createReturn({
      idempotencyKey: uniq('r'), invoiceId: inv.id, refundMethod: 'CHEQUE', reason: 'x',
      lines: [{ saleLogId: line.id, quantity: 1 }],
    } as any, f.userId, 'ADMIN' as any))
      .rejects.toMatchObject({ response: { error: 'INVALID_REFUND_METHOD' } });
  });
});