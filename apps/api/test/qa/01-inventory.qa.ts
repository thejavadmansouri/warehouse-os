/**
 * بخش ۱ — درستیِ موجودی. TEST 001..025
 */
import {
  prisma, sales, operation, baseFixture, makeProduct, stockAt, totalStock,
  uniq, close, snapshot,
} from './harness';
import { note } from './evlog';

let f: any;
beforeAll(async () => { f = await baseFixture(); });
afterAll(close);

const sell = (over: any = {}) => sales.createInvoice({
  idempotencyKey: uniq('idem'),
  warehouseId: f.warehouseId,
  ...over,
} as any, f.userId);

const line = (p: any, quantity: number, unitPrice = 100_000, locationId?: string) =>
  ({ productId: p.id, locationId: locationId ?? f.locationId, quantity, unitPrice });

describe('SECTION 1 — Inventory integrity', () => {

  it('T001 sale with sufficient stock: 10 - 2 = 8', async () => {
    const p = await makeProduct({ stock: 10 });
    await sell({ lines: [line(p, 2)] });
    expect(await stockAt(p.id, f.locationId)).toBe(8);
  });

  it('T002 sell entire stock: 10 - 10 = 0', async () => {
    const p = await makeProduct({ stock: 10 });
    await sell({ lines: [line(p, 10)] });
    expect(await stockAt(p.id, f.locationId)).toBe(0);
  });

  it('T003 oversell (10 avail, sell 11) — records ACTUAL behaviour', async () => {
    const p = await makeProduct({ stock: 10 });
    const before = await snapshot(p.id);
    let threw: any = null;
    let inv: any = null;
    try { inv = await sell({ lines: [line(p, 11)] }); } catch (e) { threw = e; }
    const after = await stockAt(p.id, f.locationId);
    // مستندسازیِ رفتار واقعی: فروش allowNegative است.
    (global as any).__T003 = { threw: !!threw, stockAfter: after, invoiceCreated: !!inv };
    if (threw) {
      expect(after).toBe(10);
      expect(after).toBe(before.stock);
    } else {
      // فروش انجام شد و موجودی منفی شد — تصمیمِ طراحی، نه گمشدنِ عدد.
      expect(after).toBe(-1);
      expect(inv.total).toBe(11 * 100_000);
    }
  });

  it('T004 two concurrent sales of the last unit — no lost update', async () => {
    const p = await makeProduct({ stock: 1 });
    const results = await Promise.allSettled([
      sell({ lines: [line(p, 1)] }),
      sell({ lines: [line(p, 1)] }),
    ]);
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const stock = await stockAt(p.id, f.locationId);
    // قانونِ کلیدی: هر فروشِ موفق باید دقیقاً یک واحد کم کرده باشد.
    expect(stock).toBe(1 - ok);
    const logs = await prisma.inventoryLog.count({ where: { productId: p.id, action: 'SALE' } });
    expect(logs).toBe(ok);
  });

  it('T005 100 concurrent single-unit sales, stock 50 — no lost update', async () => {
    const p = await makeProduct({ stock: 50 });
    const results = await Promise.allSettled(
      Array.from({ length: 100 }, () => sell({ lines: [line(p, 1)] })),
    );
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const stock = await stockAt(p.id, f.locationId);
    const saleLogs = await prisma.inventoryLog.count({ where: { productId: p.id, action: 'SALE' } });
    const soldQty = await prisma.inventoryLog.aggregate({
      where: { productId: p.id, action: 'SALE' }, _sum: { quantity: true },
    });
    (global as any).__T005 = { ok, stock, saleLogs };
    // اصلِ سنجش: هیچ کاهشی گم نشود و هیچ ردیفی بدون کاهش ساخته نشود.
    expect(saleLogs).toBe(ok);
    expect(stock).toBe(50 - (soldQty._sum.quantity ?? 0));
  });

  it('T006 sale from zero stock', async () => {
    const p = await makeProduct({ stock: 0 });
    let threw: any = null;
    try { await sell({ lines: [line(p, 3)] }); } catch (e) { threw = e; }
    const stock = await stockAt(p.id, f.locationId);
    expect(threw ? stock : stock).toBe(threw ? 0 : -3);
  });

  it('T007 sale when DB stock already negative stays arithmetically exact', async () => {
    const p = await makeProduct({ stock: 0 });
    await prisma.inventory.update({
      where: { productId_locationId: { productId: p.id, locationId: f.locationId } },
      data: { quantity: -5 },
    });
    await sell({ lines: [line(p, 2)] });
    expect(await stockAt(p.id, f.locationId)).toBe(-7);
  });

  it('T008 very large stock decrements exactly', async () => {
    const p = await makeProduct({ stock: 2_000_000_000 });
    await sell({ lines: [line(p, 1, 1)] });
    expect(await stockAt(p.id, f.locationId)).toBe(1_999_999_999);
  });

  it('T009 quantity 0 is rejected at the operation layer', async () => {
    const p = await makeProduct({ stock: 5 });
    await expect(operation.execute({
      type: 'SALE', productId: p.id, locationId: f.locationId, quantity: 0,
      allowNegative: true,
    })).rejects.toMatchObject({ response: { error: 'INVALID_QUANTITY' } });
    expect(await stockAt(p.id, f.locationId)).toBe(5);
  });

  it('T010 negative quantity is rejected at the operation layer', async () => {
    const p = await makeProduct({ stock: 5 });
    await expect(operation.execute({
      type: 'SALE', productId: p.id, locationId: f.locationId, quantity: -3,
      allowNegative: true,
    })).rejects.toMatchObject({ response: { error: 'INVALID_QUANTITY' } });
    expect(await stockAt(p.id, f.locationId)).toBe(5);
  });

  it('T011 REGRESSION (H-1): fractional quantity is rejected, stock and invoice untouched', async () => {
    const p = await makeProduct({ stock: 10 });
    const before = await prisma.saleInvoice.count();
    await expect(
      sell({ lines: [{ productId: p.id, locationId: f.locationId, quantity: 2.5, unitPrice: 100 }] }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_QUANTITY', lineIndex: 0 } });
    expect(await stockAt(p.id, f.locationId)).toBe(10);
    expect(await prisma.saleInvoice.count()).toBe(before);
  });

  it('T012 huge quantity is caught by the INT4 guard, stock untouched', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(sell({ lines: [line(p, 999_999_999, 100_000)] }))
      .rejects.toMatchObject({ response: { error: 'AMOUNT_TOO_LARGE' } });
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T013 product with NO inventory row: row is created negative, not 500', async () => {
    const p = await makeProduct({});
    const inv: any = await sell({ lines: [line(p, 3)] });
    expect(inv.id).toBeTruthy();
    expect(await totalStock(p.id)).toBe(-3);
  });

  it('T014 inactive product', async () => {
    const p = await makeProduct({ stock: 10, isActive: false });
    let threw: any = null;
    try { await sell({ lines: [line(p, 1)] }); } catch (e) { threw = e; }
    (global as any).__T014 = { threw: threw ? String(threw?.message) : null };
    const stock = await stockAt(p.id, f.locationId);
    expect(threw ? stock : stock).toBe(threw ? 10 : 9);
  });

  it('T015 soft-deleted product', async () => {
    const p = await makeProduct({ stock: 10, deleted: true });
    let threw: any = null;
    try { await sell({ lines: [line(p, 1)] }); } catch (e) { threw = e; }
    (global as any).__T015 = { threw: threw ? String(threw?.message) : null };
    const stock = await stockAt(p.id, f.locationId);
    expect(threw ? stock : stock).toBe(threw ? 10 : 9);
  });

  it('T016 non-existent product id gives a clean error, no partial invoice', async () => {
    const invBefore = await prisma.saleInvoice.count();
    await expect(sell({
      lines: [{ productId: '00000000-0000-0000-0000-000000000000', locationId: f.locationId, quantity: 1, unitPrice: 1000 }],
    })).rejects.toBeDefined();
    expect(await prisma.saleInvoice.count()).toBe(invBefore);
  });

  it('T017 location belonging to a different warehouse is rejected', async () => {
    const p = await makeProduct({ stock: 10, locationId: f.foreignLocationId });
    await expect(sell({ lines: [line(p, 1, 1000, f.foreignLocationId)] }))
      .rejects.toMatchObject({ response: { error: 'LOCATION_NOT_IN_WAREHOUSE' } });
    expect(await stockAt(p.id, f.foreignLocationId)).toBe(10);
  });

  it('T018 fabricated location id is rejected cleanly', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(sell({ lines: [line(p, 1, 1000, '11111111-1111-1111-1111-111111111111')] }))
      .rejects.toMatchObject({ response: { error: 'LOCATION_NOT_FOUND' } });
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T019 duplicate line (same product+location twice) is rejected', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(sell({ lines: [line(p, 1), line(p, 2)] }))
      .rejects.toMatchObject({ response: { error: 'DUPLICATE_LINE' } });
    expect(await stockAt(p.id, f.locationId)).toBe(10);
  });

  it('T020 multi-line invoice: every line decrements, all or nothing', async () => {
    const a = await makeProduct({ stock: 10 });
    const b = await makeProduct({ stock: 10 });
    const c = await makeProduct({ stock: 10 });
    await sell({ lines: [line(a, 1), line(b, 2), line(c, 3)] });
    expect(await stockAt(a.id, f.locationId)).toBe(9);
    expect(await stockAt(b.id, f.locationId)).toBe(8);
    expect(await stockAt(c.id, f.locationId)).toBe(7);
  });

  it('T021 mid-invoice failure rolls back ALL lines (partial failure)', async () => {
    const a = await makeProduct({ stock: 10 });
    const b = await makeProduct({ stock: 10 });
    const invBefore = await prisma.saleInvoice.count();
    // خطِ سوم به مکانِ ساختگی می‌خورد → کلِ تراکنش باید برگردد
    await expect(sell({
      lines: [
        line(a, 1), line(b, 2),
        { productId: a.id, locationId: '22222222-2222-2222-2222-222222222222', quantity: 1, unitPrice: 100 },
      ],
    })).rejects.toBeDefined();
    expect(await stockAt(a.id, f.locationId)).toBe(10);
    expect(await stockAt(b.id, f.locationId)).toBe(10);
    expect(await prisma.saleInvoice.count()).toBe(invBefore);
  });

  it('T022 concurrent sales from two POS on two different shelves are both exact', async () => {
    const p = await makeProduct({ stock: 10 });
    await prisma.inventory.create({ data: { productId: p.id, locationId: f.location2Id, quantity: 10 } });
    await Promise.all([
      sell({ lines: [line(p, 4, 1000, f.locationId)] }),
      sell({ lines: [line(p, 6, 1000, f.location2Id)] }),
    ]);
    expect(await stockAt(p.id, f.locationId)).toBe(6);
    expect(await stockAt(p.id, f.location2Id)).toBe(4);
  });

  it('T023 no deadlock: 20 concurrent 2-line invoices with reversed cart order', async () => {
    const a = await makeProduct({ stock: 1000 });
    const b = await makeProduct({ stock: 1000 });
    const jobs = Array.from({ length: 20 }, (_, i) =>
      sell({ lines: i % 2 === 0 ? [line(a, 1), line(b, 1)] : [line(b, 1), line(a, 1)] }),
    );
    const res = await Promise.allSettled(jobs);
    const failed = res.filter(r => r.status === 'rejected');
    if (failed.length) {
      const byMsg: Record<string, number> = {};
      for (const r of failed as any[]) {
        const k = `${r.reason?.code ?? r.reason?.name ?? '?'} | ${String(r.reason?.message ?? '').slice(0, 240)}`;
        byMsg[k] = (byMsg[k] ?? 0) + 1;
      }
      note('T023_failures', { failed: failed.length, byMsg });
    }
    expect(failed.length).toBe(0);
    expect(await stockAt(a.id, f.locationId)).toBe(980);
    expect(await stockAt(b.id, f.locationId)).toBe(980);
  });

  it('T024 line without locationId lands on the system "unregistered" shelf', async () => {
    const p = await makeProduct({});
    await sell({ lines: [{ productId: p.id, quantity: 2, unitPrice: 1000 }] });
    const rows = await prisma.inventory.findMany({
      where: { productId: p.id }, include: { location: true },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].location.code.startsWith('SYS-UNREG-')).toBe(true);
    expect(rows[0].quantity).toBe(-2);
  });

  it('T025 every stock change has a matching log row (log <-> stock parity)', async () => {
    const p = await makeProduct({ stock: 100 });
    for (let i = 0; i < 5; i++) await sell({ lines: [line(p, 3)] });
    const logs = await prisma.inventoryLog.findMany({ where: { productId: p.id } });
    const delta = logs.reduce((s, l) => s + (l.action === 'SALE' || l.action === 'OUT' ? -l.quantity : l.quantity), 0);
    expect(await totalStock(p.id)).toBe(100 + delta);
    expect(logs.filter(l => l.action === 'SALE').length).toBe(5);
  });
});
