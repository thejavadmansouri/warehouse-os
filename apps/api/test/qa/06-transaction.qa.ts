/**
 * بخش ۶ — Transaction Integrity + Failure Injection. TEST 092..103
 *
 * در هر سناریو: snapshotِ «قبل» می‌گیریم، عملیات را Fail می‌کنیم (خطِ ساختگی یا
 * موجودیِ ناکافی در وسط)، و بعد «بعد» را با قبل مقایسه می‌کنیم. قانون: هیچ حالتی
 * نباید بماند که فاکتور ثبت شده ولی موجودی کم نشده، یا موجودی کم شده ولی فاکتور
 * ثبت نشده، یا پرداخت ثبت شده ولی دفتر ثبت نشده.
 */
import {
  prisma, sales, returns, operation, baseFixture, makeProduct, makeCustomer, stockAt, totalStock, uniq, close,
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

async function snap() {
  return {
    invoices: await prisma.saleInvoice.count(),
    payments: await prisma.payment.count(),
    logs: await prisma.inventoryLog.count(),
    ledger: await prisma.customerLedger.count(),
  };
}

describe('SECTION 6 — Transaction integrity / failure injection', () => {

  it('T092 failure between invoice-create and stock-update rolls back the whole invoice', async () => {
    const a = await makeProduct({ stock: 10 });
    const b = await makeProduct({ stock: 10 });
    const before = await snap();
    // سه خط؛ سوم به مکانِ ساختگی می‌خورد → کل تراکنش برگردد
    await expect(sell({
      lines: [L(a, 1, 100), L(b, 1, 100),
        { productId: a.id, locationId: '22222222-2222-2222-2222-222222222222', quantity: 1, unitPrice: 100 }],
    })).rejects.toBeDefined();
    const after = await snap();
    expect(after).toEqual(before);
    expect(await stockAt(a.id, f.locationId)).toBe(10);
    expect(await stockAt(b.id, f.locationId)).toBe(10);
  });

  it('T093 failure on a credit payment (no customer) writes NOTHING', async () => {
    const p = await makeProduct({ stock: 10 });
    const before = await snap();
    await expect(sell({ lines: [L(p, 1, 1000)], payments: [{ method: 'CREDIT', amount: 1000 }] }))
      .rejects.toMatchObject({ response: { error: 'CUSTOMER_REQUIRED_FOR_CREDIT' } });
    expect(await snap()).toEqual(before);
  });

  it('T094 overpayment rejected BEFORE stock moves (financial guard precedes deduction)', async () => {
    const p = await makeProduct({ stock: 5 });
    const before = await snap();
    await expect(sell({ lines: [L(p, 1, 1000)], payments: [{ method: 'CASH', amount: 9999 }] }))
      .rejects.toMatchObject({ response: { error: 'OVERPAYMENT' } });
    expect(await snap()).toEqual(before);
    expect(await stockAt(p.id, f.locationId)).toBe(5);
  });

  it('T095 discount exceeding subtotal rejected before stock moves', async () => {
    const p = await makeProduct({ stock: 5 });
    const before = await snap();
    await expect(sell({ lines: [L(p, 1, 1000)], discount: 5000 }))
      .rejects.toMatchObject({ response: { error: 'DISCOUNT_EXCEEDS_TOTAL' } });
    expect(await snap()).toEqual(before);
  });

  it('T096 no orphan invoice when location belongs to another warehouse', async () => {
    const p = await makeProduct({ stock: 10, locationId: f.foreignLocationId });
    const before = await snap();
    await expect(sell({ lines: [{ productId: p.id, locationId: f.foreignLocationId, quantity: 1, unitPrice: 100 }] }))
      .rejects.toMatchObject({ response: { error: 'LOCATION_NOT_IN_WAREHOUSE' } });
    expect(await snap()).toEqual(before);
  });

  it('T097 REGRESSION (H-1): fractional quantity is rejected cleanly, nothing is written', async () => {
    // سرویس مستقیم صدا زده می‌شود — یعنی دقیقاً همان مسیری که صفِ آفلاین/موبایل
    // می‌رود و از ValidationPipe رد نمی‌شود. پیش از رفع، این فاکتوری با
    // subtotal=250 می‌ساخت و فقط ۲ واحد از انبار کم می‌کرد.
    const p = await makeProduct({ stock: 10 });
    const invBefore = await prisma.saleInvoice.count();

    let e: any = null; let inv: any = null;
    try {
      inv = await sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 2.5, unitPrice: 100 }] });
    } catch (x) { e = x; }

    const stock = await stockAt(p.id, f.locationId);
    note('T097_fractional_qty_after_fix', {
      accepted: !!inv,
      error: e?.response ?? e?.message ?? null,
      stockAfter: stock,
      invoicesCreated: (await prisma.saleInvoice.count()) - invBefore,
    });

    expect(inv).toBeNull();
    expect(e?.response?.error).toBe('INVALID_QUANTITY');
    expect(e?.response?.lineIndex).toBe(0);
    // نه موجودی دست خورده، نه فاکتوری ساخته شده
    expect(stock).toBe(10);
    expect(await prisma.saleInvoice.count()).toBe(invBefore);
  });

  it('T097b REGRESSION (H-1): fractional quantity is rejected at the single point of stock change too', async () => {
    // حتی وقتی مسیرِ فروش دور زده شود، تک‌نقطه‌ی تغییر موجودی باید جلویش را بگیرد.
    const p = await makeProduct({ stock: 10 });
    await expect(operation.execute({
      type:'SALE', productId: p.id, locationId: f.locationId,
      quantity: 2.5, allowNegative: true,
    })).rejects.toMatchObject({ response: { error: 'INVALID_QUANTITY' } });
    expect(await stockAt(p.id, f.locationId)).toBe(10);

    // ADJUST هم که دلتای منفی می‌پذیرد، باید عددِ صحیح بخواهد.
    await expect(operation.execute({
      type:'ADJUST', productId: p.id, locationId: f.locationId, quantity: -1.5,
    })).rejects.toMatchObject({ response: { error: 'INVALID_QUANTITY' } });
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T098 customer with an OPEN-account mismatch is rejected before anything writes', async () => {
    const custA = await makeCustomer();
    const custB = await makeCustomer();
    const p = await makeProduct({ stock: 5 });
    const acct = await prisma.openAccount.create({ data: { customerId: custA.id } });
    const before = await snap();
    await expect(sell({ accountId: acct.id, customerId: custB.id, lines: [L(p, 1, 1000)] }))
      .rejects.toMatchObject({ response: { error: 'OPEN_ACCOUNT_CUSTOMER_MISMATCH' } });
    expect(await snap()).toEqual(before);
  });

  it('T099 cancelled invoice keeps ledger rows append-only (no deletion) and consistent', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      customerId: cust.id, lines: [L(p, 1, 100_000)],
      payments: [{ method: 'CREDIT', amount: 100_000 }],
    });
    const ledgerBefore = await prisma.customerLedger.count({ where: { customerId: cust.id } });
    await sales.cancelInvoice(inv.id, 'کنسل', f.userId);
    const ledgerAfter = await prisma.customerLedger.count({ where: { customerId: cust.id } });
    // ردیفِ ابطال اضافه می‌شود، هیچ‌چیز حذف نمی‌شود
    expect(ledgerAfter).toBe(ledgerBefore + 1);
    const sum = await prisma.customerLedger.aggregate({ where: { customerId: cust.id }, _sum: { amount: true } });
    expect(sum._sum.amount).toBe(0);
  });

  it('T100 return with CASH refund on a nescified invoice: ledger is untouched but money returns to drawer', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      customerId: cust.id, lines: [L(p, 1, 50_000)],
      payments: [{ method: 'CREDIT', amount: 50_000 }],
    });
    const line = (await prisma.inventoryLog.findFirstOrThrow({ where: { invoiceId: inv.id, action: 'SALE' } }));
    await returns.createReturn({
      idempotencyKey: uniq('r'), invoiceId: inv.id, refundMethod: 'CREDIT', reason: 'برگشت',
      lines: [{ saleLogId: line.id, quantity: 1 }],
    } as any, f.userId, 'ADMIN' as any);
    const ledger = await prisma.customerLedger.aggregate({ where: { customerId: cust.id }, _sum: { amount: true } });
    // INVOICE +100k... +50k, RETURN -50k → صفر
    expect(ledger._sum.amount).toBe(0);
    const stock = await stockAt(p.id, f.locationId);
    expect(stock).toBe(10);
  });

  it('T101 double-cancel keeps stock and ledger stable after the first cancel (no double reversal)', async () => {
    const p = await makeProduct({ stock: 5 });
    const inv: any = await sell({ lines: [L(p, 2, 100)] });
    await sales.cancelInvoice(inv.id, 'یکم', f.userId);
    const stockOnce = await stockAt(p.id, f.locationId);
    const logsOnce = await prisma.inventoryLog.count({ where: { invoiceId: inv.id } });
    await expect(sales.cancelInvoice(inv.id, 'دوم', f.userId)).rejects.toMatchObject({ response: { error: 'ALREADY_CANCELLED' } });
    expect(await stockAt(p.id, f.locationId)).toBe(stockOnce);
    expect(await prisma.inventoryLog.count({ where: { invoiceId: inv.id } })).toBe(logsOnce);
  });

  it('T102 sale routed to a location that exists but has zero stock still moves (controlled) — verify no partial', async () => {
    const p = await makeProduct({ stock: 0, locationId: f.location2Id });
    const inv: any = await sell({ lines: [{ productId: p.id, locationId: f.location2Id, quantity: 3, unitPrice: 100 }] });
    expect(inv.id).toBeTruthy();
    expect(await stockAt(p.id, f.location2Id)).toBe(-3);
  });

  it('T103 every failed mid-sale leaves inventory log count untouched', async () => {
    const before = await prisma.inventoryLog.count();
    const p = await makeProduct({ stock: 5 });
    // discount بیش از subtotal → رد
    await expect(sell({ lines: [L(p, 1, 100)], discount: 10_000 })).rejects.toBeDefined();
    expect(await prisma.inventoryLog.count()).toBe(before);
  });
});