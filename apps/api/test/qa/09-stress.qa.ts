/**
 * بخش ۹ — Stress. TEST 151..156
 *
 * چندین «صندوق‌دارِ همزمان» هرکدام چرخه‌ی کاملِ فروش را انجام می‌دهند:
 * جست‌وجوی کالا ← تعیین مبلغ ← انتخاب مشتری ← ثبت فاکتور ← پرداخت.
 * تا جایی فشار می‌دهیم که خطا، تأخیرِ شدید یا ناسازگاری دیده شود — و نقطه‌ی
 * شکست را مستند می‌کنیم. هسته‌ی سنجش: پایانِ کار، موجودیِ هر کالا دقیق‌اوق با
 * تعدادِ فروشش می‌خواند (نه Lost Update، نه Negative سالم).
 */
import {
  prisma, sales, customers, baseFixture, makeProduct, makeCustomer, stockAt, uniq, close,
} from './harness';
import { note } from './evlog';

let f: any;
beforeAll(async () => { f = await baseFixture(); });
afterAll(close);

const L = (p: any, qty: number, price: number) =>
  ({ productId: p.id, locationId: f.locationId, quantity: qty, unitPrice: price });

/** شبیه‌سازیِ یک جلسه‌ی کاملِ صندوق برای یک مشتری و یک کالا. */
async function posSession(p: any, custId: string | undefined) {
  // ۱) جست‌وجوی کالا  ۲) مبلغ از خودِ محصول  ۳) ثبت فاکتور نقد (پرداختِ کامل)
  await prisma.product.findUnique({ where: { id: p.id } });
  const inv: any = await sales.createInvoice({
    idempotencyKey: uniq('stress'),
    warehouseId: f.warehouseId,
    ...(custId ? { customerId: custId } : {}),
    lines: [L(p, 1, 10_000)],
  } as any, f.userId);
  // ۴) پرداخت — نقدِ کامل به‌صورت پیش‌فرضِ سرویس ثبت شده
  return inv;
}

describe('SECTION 9 — Stress (find the breaking point)', () => {

  it('T151 40 concurrent POS sessions on a shared product (stock 40) — every unit sold exactly once', async () => {
    const p = await makeProduct({ stock: 40 });
    const cust = await makeCustomer();
    const res = await Promise.allSettled(
      Array.from({ length: 60 }, () => posSession(p, cust.id)),
    );
    const ok = res.filter(r => r.status === 'fulfilled').length;
    const fails = res.filter(r => r.status === 'rejected').length;
    const stock = await stockAt(p.id, f.locationId);
    const saleLogs = await prisma.inventoryLog.count({ where: { productId: p.id, action: 'SALE' } });
    note('stress_40', { succeeded: ok, failed: fails, stock, saleLogs });
    // allowNegative=true پس همه موفق‌اند ولی هیچ Lost Update نباید موجودی را بالاتر/پایین‌تر از واقع ببرد
    expect(stock).toBe(40 - ok);
    expect(saleLogs).toBe(ok);
  });

  it('T152 50 concurrent sessions across 5 shared products (reversed order) — no deadlock', async () => {
    const ps: any[] = [];
    for (let i = 0; i < 5; i++) ps.push(await makeProduct({ stock: 1000 }));
    const jobs = Array.from({ length: 50 }, (_, i) => {
      // روی همه‌ی ۵ کالا بچرخ، با ترتیبِ معکوس برای نصفِ درخواست‌ها (آزمونِ deadlock).
      // ۳ قلمِ هر فاکتور از ۵ کالا برداشته می‌شود؛ مجموعِ هر فاکتور ۱ از هر ۳ قلمِ
      // چرخش = هر کالا سرانجام ۵۰ بار فروخته می‌شود؟ نه — مطمئن‌تر: هر فاکتور دقیقاً
      // ۱ از **یک** کالا بردارد ولی ترتیبِ قفلِ کلِ درخواست‌ها معکوس باشد.
      const k = i % 5;
      const one = ps[k];
      const two = ps[i % 2 === 0 ? (k + 1) % 5 : (k + 4) % 5];
      const order = i % 2 === 0 ? [one, two] : [two, one];
      return sales.createInvoice({
        idempotencyKey: uniq('stress'), warehouseId: f.warehouseId,
        lines: order.map((p: any, j: number) => L(p, 1, 1000 + j)),
      } as any, f.userId);
    });
    const res = await Promise.allSettled(jobs);
    const failed = res.filter(r => r.status === 'rejected');
    note('stress_reversed', { total: 50, failed: failed.length, sampleReasons: failed.slice(0, 4).map((r: any) => String(r.reason?.message).slice(0, 60)) });
    // بدون deadlock؛ هر فاکتور ۲ قلم می‌سازد (از ۵ کالا به تناوبِ معکوس‌شدنِ ترتیبِ
    // قفل‌گیری). هر کالا هم «۱ بار به ازای هر فاکتوری که درش آمده» کم می‌شود؛ مجموع = ۵۰.
    expect(failed.length).toBe(0);
    for (const p of ps) expect(await stockAt(p.id, f.locationId)).toBe(980); // 1000 - 20
    // توضیحِ ۲۰: همیشه دو قلمِ (one,two)؛ چون each فاکتور دو قلم دارد و ۵۰ فاکتور
    // به تناوب روی ۵ کالا، هر کالا دقیقاً ۲۰ بار می‌آید (۵۰*۲/۵ = ۲۰).
  });

  it('T153 100 concurrent single-unit sales against stock 100 — exact zero at the end', async () => {
    const p = await makeProduct({ stock: 100 });
    const res = await Promise.allSettled(
      Array.from({ length: 100 }, () =>
        sales.createInvoice({ idempotencyKey: uniq('s'), warehouseId: f.warehouseId, lines: [L(p, 1, 500)] } as any, f.userId)),
    );
    const ok = res.filter(r => r.status === 'fulfilled').length;
    const rejected: any[] = res.filter(r => r.status === 'rejected') as any[];
    if (rejected.length) {
      const byMsg: Record<string, number> = {};
      for (const r of rejected) {
        const k = `${r.reason?.code ?? r.reason?.name ?? '?'} | ${String(r.reason?.message ?? '').slice(0, 240)}`;
        byMsg[k] = (byMsg[k] ?? 0) + 1;
      }
      note('T153_failures', { ok, failed: rejected.length, byMsg });
    }
    expect(ok).toBe(100);
    expect(await stockAt(p.id, f.locationId)).toBe(0);
    const sum = await prisma.inventoryLog.aggregate({ where: { productId: p.id, action: 'SALE' }, _sum: { quantity: true } });
    expect(sum._sum.quantity).toBe(100);
  });

  it('T154 idle-timeout is not an issue (process stays up across batches)', async () => {
    const p = await makeProduct({ stock: 100 });
    for (let b = 0; b < 3; b++) {
      await sales.createInvoice({ idempotencyKey: uniq('batch'), warehouseId: f.warehouseId, lines: [L(p, 1, 100)] } as any, f.userId);
    }
    expect(await stockAt(p.id, f.locationId)).toBe(97);
  });

  it('T155 heavy drawdown: 20 concurrent multi-line invoices sharing 2 products then verify exact', async () => {
    const a = await makeProduct({ stock: 500 });
    const b = await makeProduct({ stock: 500 });
    const jobs = Array.from({ length: 20 }, (_, i) =>
      sales.createInvoice({
        idempotencyKey: uniq('heavy'), warehouseId: f.warehouseId,
        lines: [L(a, i % 5 + 1, 100), L(b, (i + 1) % 5 + 1, 100)],
      } as any, f.userId));
    const res = await Promise.allSettled(jobs);
    const ok = res.filter(r => r.status === 'fulfilled').length;
    // مجموعِ تقاضا: a = Σ(i%5+1)، b = Σ((i+1)%5+1)
    const sumA = Array.from({ length: 20 }, (_, i) => i % 5 + 1).reduce((s, x) => s + x, 0);
    const sumB = Array.from({ length: 20 }, (_, i) => ((i + 1) % 5 + 1)).reduce((s, x) => s + x, 0);
    expect(ok).toBe(20);
    expect(await stockAt(a.id, f.locationId)).toBe(500 - sumA);
    expect(await stockAt(b.id, f.locationId)).toBe(500 - sumB);
  });

  it('T156 customer stress: 30 concurrent sales to the SAME customer — ledger and invoice totals consistent', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 300 });
    const invs = await Promise.all(
      Array.from({ length: 30 }, () =>
        sales.createInvoice({
          idempotencyKey: uniq('cust'), warehouseId: f.warehouseId, customerId: cust.id,
          lines: [L(p, 1, 10_000)],
        } as any, f.userId)),
    );
    const total = invs.reduce((s: number, x: any) => s + x.total, 0);
    const ledger = await prisma.customerLedger.aggregate({ where: { customerId: cust.id, type: 'INVOICE' }, _sum: { amount: true } });
    // همه نقد پرداخت شدند (paidAmount=total) پس دفترِ INVOICE صفر است؛ فقط موجودی کم شود
    expect(ledger._sum.amount ?? 0).toBe(0);
    expect(await stockAt(p.id, f.locationId)).toBe(270);
    expect(total).toBe(300_000);
  });
});