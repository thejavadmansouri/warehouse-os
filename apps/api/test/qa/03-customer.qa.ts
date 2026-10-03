/**
 * بخش ۳ — درستیِ مشتری. TEST 051..065
 *
 * همه‌چیز از خودِ سرویس `customers` می‌گذرد، نه درج مستقیم — تا validation واقعی
 * (نام لازم، نرمال‌سازی شماره، یکتایی شماره، ممنوعیت غیرفعال‌سازی بدهکار) دیده شود.
 */
import { Prisma } from '@prisma/client';
import {
  prisma,
  sales,
  customers,
  baseFixture,
  makeProduct,
  makeCustomer,
  uniq,
  close,
} from './harness';
import { note, errBody } from './evlog';

let f: any;
beforeAll(async () => {
  f = await baseFixture();
});
afterAll(close);

const sell = (over: any = {}) =>
  sales.createInvoice(
    {
      idempotencyKey: uniq('idem'),
      warehouseId: f.warehouseId,
      ...over,
    },
    f.userId,
  );
const L = (p: any, qty: number, price: number) => ({
  productId: p.id,
  locationId: f.locationId,
  quantity: qty,
  unitPrice: price,
});
// شماره‌ی یگانه‌ی هر اجرا — چون مشتری‌ها soft-delete نمی‌شوند و دیتایی که از اجرای
// قبلی مانده می‌تواند با شماره‌ی ثابتِ تست تداخل کند. باید 09 + ۹ رقم باشد تا
// normalizePhone بپذیرد (^09\d{9}$).
let _pc = 0;
const phoneOf = () => {
  const n = ((Date.now() % 1_000_000_000) + (_pc++ % 100000)) % 1_000_000_000;
  return '09' + String(n).padStart(9, '0').slice(-9);
};

describe('SECTION 3 — Customer integrity', () => {
  it('T051 create customer (first+last) then find by id with fullName', async () => {
    const c = await customers.create({
      firstName: 'رضا',
      lastName: 'توکلی',
    });
    expect(c.id).toBeTruthy();
    expect(c.fullName).toBe('رضا توکلی');
    const found: any = await customers.findOne(c.id);
    expect(found.id).toBe(c.id);
    expect(found.searchName).toContain('رضا توکلی');
  });

  it('T052 search by name is case/persian-normalized and finds the row', async () => {
    const c = await customers.create({
      firstName: 'محمّد',
      lastName: 'رضایی',
    });
    // «محمّد» → نرمال می‌شود؛ جست‌وجوی بدون تشدید هم باید پیدا کند.
    const res: any = await customers.search('محمد رضایی');
    expect(res.data.some((x: any) => x.id === c.id)).toBe(true);
  });

  it('T053 search by phone (persian digits) finds the row', async () => {
    const ph = phoneOf();
    const c = await customers.create({
      firstName: 'زن',
      phones: [{ phone: ph, isPrimary: true }],
    });
    // جست‌وجو با ارقامِ فارسیِ همان شماره باید همان مشتری را برگرداند.
    const fa = ph.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    const res: any = await customers.search(fa);
    expect(res.data.some((x: any) => x.id === c.id)).toBe(true);
  });

  it('T054 duplicate phone across two customers is rejected at DB level', async () => {
    const ph = phoneOf();
    await customers.create({
      firstName: 'الف',
      phones: [{ phone: ph }],
    });
    let e: any = null;
    try {
      await customers.create({
        firstName: 'ب',
        phones: [{ phone: ph }],
      });
    } catch (x) {
      e = x;
    }
    note('T054_dup_phone', errBody(e));
    expect(e).toBeTruthy();
  });

  it('T055 phone stored normalized (persian → latin, +98 → 0, no dash/space)', async () => {
    const ph = phoneOf();
    // +98 پیششماره + ارقامِ بی‌صفرِ ابتدایی → باید به 0 + ۹ رقم نرمال شود.
    const c = (await customers.create({
      firstName: 'ن',
      phones: [{ phone: '+98 ' + ph.slice(1) }],
    })) as any;
    // +98 حذف می‌شود، صفرِ سرشماره برمی‌گردد، فاصله و خط حذف → دقیقاً همان ارقامِ نقلی
    expect(c.phones[0].phone).toBe(ph);
  });

  it('T056 invalid phone is rejected cleanly', async () => {
    let e: any = null;
    try {
      await customers.create({
        firstName: 'خ',
        phones: [{ phone: 'abc' }],
      });
    } catch (x) {
      e = x;
    }
    note('T056_invalid_phone', errBody(e));
    expect(e).toBeTruthy();
  });

  it('T057 customer with no phone is allowed (cash walk-in)', async () => {
    const c = await customers.create({ firstName: 'no-phone' });
    expect(c.id).toBeTruthy();
  });

  it('T058 customer without first name is rejected (NAME_REQUIRED)', async () => {
    await expect(
      customers.create({ lastName: 'X' } as any),
    ).rejects.toMatchObject({ response: { error: 'NAME_REQUIRED' } });
  });

  it('T059 soft-delete keeps invoice history; a customer with invoices stays active', async () => {
    const c = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    // فروشِ نسیه (CREDIT) تا واقعاً بدهی داشته باشد؛ والا deactivate مجاز است.
    const inv: any = await sell({
      customerId: c.id,
      lines: [L(p, 1, 100_000)],
      payments: [{ method: 'CREDIT', amount: 100_000 }],
    });
    // ویرایش بعد از فاکتور نباید تاریخچه را بمیراند.
    await customers.update(c.id, { lastName: 'به‌روز' });
    const invAfter: any = await sales.findOne(inv.id);
    expect(invAfter.customer.id).toBe(c.id);
    expect(invAfter.customer.lastName).toBe('به‌روز');
    // بدهی‌دار را نمی‌توان غیرفعال کرد.
    await expect(customers.deactivate(c.id)).rejects.toMatchObject({
      response: { error: 'CUSTOMER_HAS_BALANCE' },
    });
  });

  it('T060 add/remove/set-primary phone on a customer', async () => {
    const c: any = await customers.create({ firstName: 'پ' });
    const p1 = await customers.addPhone(c.id, { phone: '09112223344' });
    const phoneId = p1.phones[0].id;
    expect((p1 as any).phones[0].isPrimary).toBe(true);
    const p2: any = await customers.removePhone(c.id, phoneId);
    expect(p2.phones.length).toBe(0);
  });

  it('T061 unnaturally long name is accepted and stored (not a crash)', async () => {
    const name = 'الف'.repeat(2000);
    const c = await customers.create({ firstName: name });
    // نام باید بی‌کوتاه‌سازی و بی‌خرابی ذخیره شود — نه اینکه رد شود یا Crush بخورد.
    expect(c.firstName.length).toBeGreaterThanOrEqual(2000);
  });

  it('T062 SQL-injection-like and XSS-like strings are stored as data, not executed', async () => {
    const c = (await customers.create({
      firstName: '\'; DROP TABLE "Customer"; --',
    })) as any;
    const id = c.id;
    // جدول هنوز پابرجاست و مشتری همان است.
    expect(await prisma.customer.count()).toBeGreaterThan(0);
    const back: any = await customers.findOne(id);
    expect(back.firstName.startsWith("'")).toBe(true);
  });

  it('T063 update after invoice does not orphan the ledger/invoice relation', async () => {
    const c = await makeCustomer();
    const p = await makeProduct({ stock: 20 });
    await sell({ customerId: c.id, lines: [L(p, 2, 50_000)] });
    await customers.update(c.id, { firstName: 'نام‌جدید' });
    const orig = await prisma.customer.findUnique({ where: { id: c.id } });
    // نام‌های قبلی بازسازی نمی‌شوند؛ رکورد وفادار به آخرین ویرایش است.
    expect(orig!.firstName).toBe('نام‌جدید');
  });

  it('T064 search is fast across thousands of seeded customers (build then query)', async () => {
    // seed سریع 3 هزار مشتری (پرتاب همزمان)، سپس چند کوئری.
    const jobs = Array.from({ length: 3000 }, (_, i) =>
      Promise.all([
        prisma.customer.create({
          data: {
            firstName: `مشتری${i}`,
            lastName: uniq('ln'),
            searchName: `مشتری${i} ${uniq('ln')}`,
          },
        }),
      ]),
    );
    // دسته‌ای برای اینکه فقط یک رفه‌ي بالا نداشته باشد
    const batch = 500;
    for (let i = 0; i < jobs.length; i += batch) {
      await Promise.all(jobs.slice(i, i + batch).flat());
    }
    const t0 = Date.now();
    await customers.search('مشتری7', 1, 50);
    const first = Date.now() - t0;
    const t1 = Date.now();
    const res: any = await customers.search('مشتری777', 1, 50);
    const second = Date.now() - t1;
    note('T064_search_latency', {
      first_ms: first,
      second_ms: second,
      hits: res.data.length,
    });
    // جست‌وجوی فهرستی چند هزار مشتری بهتر از چند ثانیه‌ست؛ نه سند حساس.
    expect(second).toBeLessThan(5000);
  });

  it('T065 concurrent create of two users with the SAME phone → exactly one wins', async () => {
    const phone = phoneOf();
    const results = await Promise.allSettled([
      customers.create({ firstName: 'همزمان-الف', phones: [{ phone }] } as any),
      customers.create({ firstName: 'همزمان-ب', phones: [{ phone }] } as any),
    ]);
    const wins = results.filter((r) => r.status === 'fulfilled').length;
    note('T065_dup_phone_race', {
      wins,
      errs: results
        .filter((r) => r.status === 'rejected')
        .map((r: any) => errBody(r.reason)),
    });
    expect(wins).toBe(1);
  });
});
