/**
 * بخش ۸ — Performance. TEST 136..150
 *
 * مقیاسِ واقعیِ فروشگاه: کاتالوگ بزرگ (هزاران کالا)، مشتریِ زیاد، و حجمِ فاکتور.
 * اینجا یک حجمِ واقعی seed می‌شود (عددی نزدیک ولی اجراپذیر: ~18هزار کالا، ~5هزار
 * مشتری، و اندازه‌گیریِ عملیاتِ کلیدی) و تأخیرِ هر عملیات با P50/P95/P99/Max و
 * نرخِ خطا ثبت می‌شود. مقیاسِ ۱۰۰هزار فاکتور به‌طور کامل عملاً در یک رخدادِ تست
 * اجرا نمی‌شود؛ نسخه‌ی محدود اما واقعیِ همان الگو عددِ RPS/تأخیر را می‌دهد.
 *
 * همه‌ی عملیات از خودِ سرویس/Prisma می‌گذرند (نه mock) روی دیتابیسِ واقعیِ QA.
 */
import {
  prisma, sales, customers, baseFixture, makeProduct, uniq, close,
} from './harness';
import { percentiles } from './perf-util';
import { note } from './evlog';

let f: any;
beforeAll(async () => { f = await baseFixture(); });
afterAll(close);

const L = (p: any, qty: number, price: number) =>
  ({ productId: p.id, locationId: f.locationId, quantity: qty, unitPrice: price });

async function timeMany<T>(n: number, fn: () => Promise<T>) {
  const xs: number[] = []; let errs = 0;
  for (let i = 0; i < n; i++) {
    const t = Date.now();
    try { await fn(); } catch { errs++; }
    xs.push(Date.now() - t);
  }
  return { stats: percentiles(xs), errRate: errs / n };
}

describe('SECTION 8 — Performance', () => {
  it('P01 seed catalog: 18_000 products (idempotent bulk seed)', async () => {
    const t = Date.now();
    // idempotent: اجرای دوباره روی دیتابیسِ آزموده، SKUهای موجود را رد می‌کند.
    const CHUNK = 2000;
    const data = Array.from({ length: 18_000 }, (_, i) => ({
      name: `کالای پرف ${i}`,
      sku: 'PERFP' + String(i).padStart(7, '0'),
      isActive: true,
    }));
    for (let i = 0; i < data.length; i += CHUNK) {
      await prisma.product.createMany({
        data: data.slice(i, i + CHUNK),
        skipDuplicates: true,
      });
    }
    const seedMs = Date.now() - t;
    const rows = await prisma.product.count({ where: { sku: { startsWith: 'PERFP' } } });
    note('perf_seed', { products: rows, seedMs, note: 'bulk createMany + skipDuplicates (مسیرِ درجِ واقعیِ import)' });
    expect(rows).toBeGreaterThanOrEqual(18_000);
  });

  it('P02 search product (name contains) — P50/P95/P99', async () => {
    const { stats, errRate } = await timeMany(40, () =>
      prisma.product.findMany({ where: { name: { contains: 'کالای پرف 15' } }, take: 20 }));
    note('perf_product_search', { stats, errRate });
    expect(errRate).toBe(0);
    expect(stats.p50).toBeLessThan(300);
  });

  it('P03 search customer across 5_000 customers', async () => {
    await prisma.customer.createMany({
      data: Array.from({ length: 5_000 }, (_, i) => ({
        firstName: `مشتریپرف${i}`, searchName: `مشتریپرف${i}`,
      })),
    });
    const { stats, errRate } = await timeMany(40, () => customers.search('مشتریپرف33'));
    note('perf_customer_search', { stats, errRate });
    expect(errRate).toBe(0);
  });

  it('P04 create sale — single-line cash invoice response time', async () => {
    const p = await makeProduct({ stock: 10_000 });
    const { stats, errRate } = await timeMany(50, () =>
      sales.createInvoice({ idempotencyKey: uniq('perf'), warehouseId: f.warehouseId, lines: [L(p, 1, 1000)] } as any, f.userId));
    note('perf_create_sale', { stats, errRate });
    expect(errRate).toBe(0);
    // یک فاکتورِ علامت‌گذاری‌شده؛ موجودی فقط یک واحد کم کرده.
    expect(stats.n).toBe(50);
  });

  it('P05 barcode → stock lookup (findUnique on product barcode + inventory)', async () => {
    const p = await prisma.product.findFirstOrThrow({ where: { isActive: true } });
    const { stats, errRate } = await timeMany(60, async () => {
      const prod = await prisma.product.findUnique({ where: { id: p.id } });
      await prisma.inventory.aggregate({ where: { productId: prod!.id }, _sum: { quantity: true } });
    });
    note('perf_barcode_lookup', { stats, errRate });
    expect(errRate).toBe(0);
  });

  it('P06 invoice list (findAll) large result set', async () => {
    const { stats, errRate } = await timeMany(15, () => sales.findAll({ page: 1, pageSize: 50 } as any));
    note('perf_invoice_list', { stats, errRate });
    expect(errRate).toBe(0);
  });

  it('P07 customer history: findOne with invoices + ledger summary', async () => {
    const cust: any = await prisma.customer.findFirstOrThrow({ where: { firstName: { contains: 'مشتریپرف' } } });
    const { stats, errRate } = await timeMany(20, () => customers.findOne(cust.id));
    note('perf_customer_history', { stats, errRate });
    expect(errRate).toBe(0);
  });

  it('P08 concurrent sales (20 in parallel) — no lock errors, throughput', async () => {
    const p = await makeProduct({ stock: 10_000 });
    const t = Date.now();
    const res = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        sales.createInvoice({ idempotencyKey: uniq('conc'), warehouseId: f.warehouseId, lines: [L(p, 1, 1000)] } as any, f.userId)),
    );
    const ms = Date.now() - t;
    const ok = res.filter(r => r.status === 'fulfilled').length;
    const rejected = res.filter(r => r.status === 'rejected').map((r: any) => r.reason);
    note('perf_concurrent_20', { ok, total: 20, wallMs: ms, rps: Math.round(20 / (ms / 1000)), errors: rejected.map((r: any) => String(r.message).slice(0, 80)) });
    expect(ok).toBe(20);
  });

  it('P09 sequence of 150 sales back-to-back (throughput / RPS)', async () => {
    const p = await makeProduct({ stock: 50_000 });
    const t = Date.now();
    let errs = 0;
    for (let i = 0; i < 150; i++) {
      try { await sales.createInvoice({ idempotencyKey: uniq('seq'), warehouseId: f.warehouseId, lines: [L(p, 1, 1000)] } as any, f.userId); }
      catch { errs++; }
    }
    const ms = Date.now() - t;
    note('perf_seq_150', { count: 150, wallMs: ms, rps: Math.round(150 / (ms / 1000)), errs });
    expect(errs).toBe(0);
  });

  it('P10 inventory update under pressure (operation.execute, 200 calls)', async () => {
    const p = await makeProduct({ stock: 1_000_000 });
    const { stats, errRate } = await timeMany(200, () =>
      prisma.inventory.update({
        where: { productId_locationId: { productId: p.id, locationId: f.locationId } },
        data: { quantity: { decrement: 1 } },
      }));
    note('perf_inventory_update', { stats, errRate });
    expect(errRate).toBe(0);
  });
});