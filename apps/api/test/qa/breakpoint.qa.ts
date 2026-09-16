/**
 * نقطه‌ی شکست: در چه سطحی از هم‌زمانی، ثبت فروش شروع به شکست می‌کند؟
 * یکپارچگی در هر سطح هم بررسی می‌شود — شکستِ درخواست نباید موجودی را خراب کند.
 */
import {
  prisma,
  sales,
  baseFixture,
  makeProduct,
  stockAt,
  uniq,
  close,
} from './harness';
import { note } from './evlog';

let f: any;
beforeAll(async () => {
  f = await baseFixture();
});
afterAll(close);

const pct = (a: number[], p: number) =>
  a.length
    ? a.slice().sort((x, y) => x - y)[
        Math.min(a.length - 1, Math.floor(a.length * p))
      ]
    : 0;

async function sweep(n: number) {
  const p = await makeProduct({ stock: n });
  const lat: number[] = [];
  const res = await Promise.allSettled(
    Array.from({ length: n }, async () => {
      const t0 = Date.now();
      try {
        return await sales.createInvoice(
          {
            idempotencyKey: uniq('bp'),
            warehouseId: f.warehouseId,
            lines: [
              {
                productId: p.id,
                locationId: f.locationId,
                quantity: 1,
                unitPrice: 1000,
              },
            ],
          },
          f.userId,
        );
      } finally {
        lat.push(Date.now() - t0);
      }
    }),
  );
  const failed: any[] = res.filter((r) => r.status === 'rejected') as any[];
  const codes: Record<string, number> = {};
  for (const r of failed) {
    const k = r.reason?.code ?? r.reason?.name ?? '?';
    codes[k] = (codes[k] ?? 0) + 1;
  }
  const stock = await stockAt(p.id, f.locationId);
  const logs = await prisma.inventoryLog.count({
    where: { productId: p.id, action: 'SALE' },
  });
  return {
    concurrency: n,
    ok: res.length - failed.length,
    failed: failed.length,
    errorRate: +((failed.length / n) * 100).toFixed(1),
    codes,
    p50: pct(lat, 0.5),
    p95: pct(lat, 0.95),
    max: Math.max(...lat),
    stockExact: stock === n - logs,
  };
}

describe('BREAKING POINT — concurrent sale throughput', () => {
  it('BP sweep 5 → 100 concurrent sales', async () => {
    const rows: any[] = [];
    for (const n of [5, 10, 20, 30, 50, 75, 100]) rows.push(await sweep(n));
    note('breaking_point_sweep', rows);
    console.table(
      rows.map((r) => ({
        concurrency: r.concurrency,
        ok: r.ok,
        failed: r.failed,
        'error%': r.errorRate,
        p50ms: r.p50,
        p95ms: r.p95,
        maxms: r.max,
        codes: Object.keys(r.codes).join(',') || '-',
        stockExact: r.stockExact,
      })),
    );
    // مهم‌ترین ادعا: در هر سطحِ فشار، موجودی دقیق می‌ماند حتی وقتی درخواست‌ها می‌میرند.
    for (const r of rows) expect(r.stockExact).toBe(true);
  }, 900000);
});
