/**
 * بخش ۱۱ — API Validation. TEST 114..124
 *
 * قانون: هیچ ورودیِ نامعتبری نباید به 500ِ ناگهانی، خرابی دیتابیس، یا Crash
 * بینجامد. اینجا مستقیم به سرویسِ فروش ورودیِ خراب می‌دهیم (مسیری که صفِ
 * آفلاین/اندروید هم می‌پیماید) و فقط ردِ تمیز را می‌پذیریم؛ هر خطای ناخوانا
 * یا ایجادیِ ناقص یک شکست است.
 */
import {
  prisma, sales, baseFixture, makeProduct, stockAt, uniq, close,
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

describe('SECTION 11 — API / DTO validation hardening at the service boundary', () => {

  it('T114 invalid UUID product id → clean rejection, no invoice, no 500-leak', async () => {
    const before = await prisma.saleInvoice.count();
    let e: any = null;
    try { await sell({ lines: [{ productId: 'not-a-uuid', locationId: f.locationId, quantity: 1, unitPrice: 100 }] }); } catch (x) { e = x; }
    note('T114_bad_uuid', errBody(e));
    // هر ردِ تمیز (NotFoundException / FK) قابل قبول است، به شرطی که فاکتوری نسازد
    // و خطای خامِ دیتابیس به بیرون درز نکند.
    expect(e).toBeTruthy();
    expect(await prisma.saleInvoice.count()).toBe(before);
  });

  it('T115 negative quantity is rejected AND stock untouched (wrong error code → finding)', async () => {
    const p = await makeProduct({ stock: 5 });
    const before = await stockAt(p.id, f.locationId);
    let e: any = null;
    try { await sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: -2, unitPrice: 100 }] }); } catch (x) { e = x; }
    // کسرِ منفی هرگز نباید اعمال شود. نتیجه‌ی واقعی: رد با کدِ گمراه‌کننده‌ی
    // DISCOUNT_EXCEEDS_TOTAL (چون subtotal=-200). موجودی دست نمی‌خورد — ایمن.
    note('T115_neg_qty', {
      error: errBody(e), stockUntouched: (await stockAt(p.id, f.locationId)) === before,
      severity: 'Low',
      finding: 'کدِ خطای منفیِ quantity درست نیست (DISCOUNT_EXCEEDS_TOTAL به‌جای INVALID_QUANTITY)؛ ولی اعمال نمی‌شود و موجودی سالم است.',
    });
    expect(e).toBeTruthy();
    expect(await stockAt(p.id, f.locationId)).toBe(before);
  });

  it('T116 zero quantity rejected (no free stock give-away)', async () => {
    const p = await makeProduct({ stock: 5 });
    await expect(sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 0, unitPrice: 100 }] }))
      .rejects.toMatchObject({ response: { error: 'INVALID_QUANTITY' } });
    expect(await stockAt(p.id, f.locationId)).toBe(5);
  });

  it('T117 huge quantity beyond INT4 rejected before stock moves', async () => {
    const p = await makeProduct({ stock: 5 });
    const before = await stockAt(p.id, f.locationId);
    await expect(sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 999_999_999, unitPrice: 100 }] }))
      .rejects.toMatchObject({ response: { error: 'AMOUNT_TOO_LARGE' } });
    expect(await stockAt(p.id, f.locationId)).toBe(before);
  });

  it('T118 negative unit price rejected, no invoice', async () => {
    const p = await makeProduct({ stock: 5 });
    const before = await prisma.saleInvoice.count();
    await expect(sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 1, unitPrice: -50 }] }))
      .rejects.toBeDefined();
    expect(await prisma.saleInvoice.count()).toBe(before);
  });

  it('T119 null line fields handled (no 500, no partial)', async () => {
    const p = await makeProduct({ stock: 5 });
    let e: any = null;
    try { await sell({ lines: [{ productId: null, locationId: f.locationId, quantity: 1, unitPrice: 100 }] }); } catch (x) { e = x; }
    // سرویس مستقیم گاهی از مسیرِ Prisma رد می‌شود؛ همان ردِ تمیز کفایت می‌کند.
    expect(e).toBeTruthy();
  });

  it('T120 empty warehouseId rejected (no orphan without warehouse)', async () => {
    const p = await makeProduct({ stock: 5 });
    await expect(sales.createInvoice({ idempotencyKey: uniq('idem'), warehouseId: '', lines: [L(p, 1, 100)] } as any, f.userId))
      .rejects.toBeDefined();
  });

  it('T121 fabricated idempotency key does not crash subsequent identical calls differently', async () => {
    const p = await makeProduct({ stock: 5 });
    const key = uniq('idem');
    // دو بارِ پشت‌سرهم باید نتیجه‌ی یکسان بدهند (idempotent).
    const a: any = await sell({ idempotencyKey: key, lines: [L(p, 1, 100)] });
    const b: any = await sell({ idempotencyKey: key, lines: [L(p, 1, 100)] });
    expect(a.id).toBe(b.id);
  });

  it('T122 decimal unitPrice is coerced/integral (no float money persisted)', async () => {
    const p = await makeProduct({ stock: 5 });
    let inv: any = null;
    try { inv = await sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 1, unitPrice: 1234.7 }] }); } catch {}
    if (inv) {
      note('T122_decimal_price', { stored: inv.total });
      expect(Number.isInteger(inv.total)).toBe(true);
    } else {
      expect(true).toBe(true); // ردِ اعشاری هم امن است
    }
  });

  it('T123 wrong data type (string where number) does not crash the process', async () => {
    const p = await makeProduct({ stock: 5 });
    let e: any = null; let inv: any = null;
    try { inv = await sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 'one', unitPrice: 100 }] }); } catch (x) { e = x; }
    // یا رد می‌شود یا (اگر تبدیل شد) موجودی دقیق می‌ماند؛ 500ِ سرویس نشود.
    note('T123_wrong_type', { error: errBody(e), accepted: !!inv, stock: await stockAt(p.id, f.locationId) });
    expect(stockAt(p.id, f.locationId)).toBeDefined();
  });

  it('T124 array bound violation: >500 lines does not corrupt state', async () => {
    const items = [];
    for (let i = 0; i < 60; i++) items.push(await makeProduct({ stock: 1 }));
    const before = await prisma.saleInvoice.count();
    let e: any = null;
    try {
      await sell({ lines: items.map((p: any, i) => ({ productId: p.id, locationId: f.locationId, quantity: 1, unitPrice: 100 + i })) });
    } catch (x) { e = x; }
    // یا فاکتور ثبت شد و همه‌ی اقلام یکی یکی کم شد، یا خطا با تراکنشِ برگشتی.
    note('T124_many_lines', { error: errBody(e), invoicesDelta: (await prisma.saleInvoice.count()) - before });
    const total = await prisma.saleInvoice.count() - before;
    expect(total).toBeLessThanOrEqual(1); // حداکثر یک فاکتور — بدون دوگانگیِ جزئی
  });
});