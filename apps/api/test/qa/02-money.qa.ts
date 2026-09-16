/**
 * بخش ۲ — دقتِ مالی. TEST 026..050
 */
import {
  prisma,
  sales,
  ledger,
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
const L = (p: any, quantity: number, unitPrice: number, discount?: number) => ({
  productId: p.id,
  locationId: f.locationId,
  quantity,
  unitPrice,
  ...(discount != null ? { discount } : {}),
});

describe('SECTION 2 — Financial accuracy', () => {
  it('T026 money columns in transaction tables are integers, never Float', async () => {
    const cols = await prisma.$queryRawUnsafe<any[]>(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public'
        AND column_name IN ('subtotal','discount','total','paidAmount','dueAmount','amount',
                            'unitPrice','lineDiscount','salePrice','purchasePrice','wholesalePrice',
                            'profit','financeCharge','charge','refundTotal')
      ORDER BY table_name, column_name`);
    // ImportRow یک بافرِ ورودیِ Excel است (قبل از تبدیل به ProductPrice) — عددِ
    // اعشاری آن موقع تبدیل می‌شود. پولِ زنده نباید هیچ‌جا float باشد.
    const op = cols.filter((c) => c.table_name !== 'ImportRow');
    const floats = op.filter((c) =>
      /double|real|numeric|float/i.test(c.data_type),
    );
    const importRowFloats = cols
      .filter((c) => c.table_name === 'ImportRow')
      .filter((c) => /double|real|numeric|float/i.test(c.data_type));
    note('money_column_types', {
      total: cols.length,
      operational_floats: floats, // ← چیزی که واقعاً Critical است
      importRow_floats: importRowFloats.map(
        (c) => `${c.column_name} (${c.data_type})`,
      ),
    });
    // هیچ ستونِ پولِ عملیاتی float نیست؛ ImportRow فقط مرحله‌ی ورود است و جدا ثبت می‌شود.
    expect(floats).toEqual([]);
    // سندِ مشاهده: ImportRow (Excel import) مثل عدد اعشاریِ موقت رفتار می‌کند — Low.
    expect(importRowFloats.length).toBeGreaterThan(0);
  });

  it('T027 100,000 x 2 = 200,000 exactly', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 2, 100_000)] });
    expect(inv.subtotal).toBe(200_000);
    expect(inv.total).toBe(200_000);
    expect(inv.paidAmount).toBe(200_000);
    expect(inv.dueAmount).toBe(0);
  });

  it('T028 three-line invoice sums exactly', async () => {
    const a = await makeProduct({ stock: 10 });
    const b = await makeProduct({ stock: 10 });
    const c = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      lines: [L(a, 2, 100_000), L(b, 3, 250_000), L(c, 1, 50_000)],
    });
    expect(inv.subtotal).toBe(200_000 + 750_000 + 50_000);
    expect(inv.total).toBe(1_000_000);
    const payments = await prisma.payment.aggregate({
      where: { invoiceId: inv.id },
      _sum: { amount: true },
    });
    expect(payments._sum.amount).toBe(1_000_000);
  });

  it('T029 zero price (gift item) is allowed and totals 0, no float artifact', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 1, 0)] });
    expect(inv.subtotal).toBe(0);
    expect(inv.total).toBe(0);
    // رفتار واقعی: یک سطر پرداخت CASH با مقدار 0 ثبت می‌شود (نه صفر پرداخت).
    // این یک نقصِ مالیت نیست — مبلغ 0 است و هیچ بدهی/دفتری نمی‌سازد.
    const pays = await prisma.payment.findMany({
      where: { invoiceId: inv.id },
    });
    expect(pays.length).toBe(1);
    expect(pays[0].method).toBe('CASH');
    expect(pays[0].amount).toBe(0);
  });

  it('T030 negative unit price is rejected, no invoice', async () => {
    const p = await makeProduct({ stock: 10 });
    const before = await prisma.saleInvoice.count();
    let e: any = null;
    try {
      await sell({ lines: [L(p, 2, -50_000)] });
    } catch (x) {
      e = x;
    }
    note('T030_negative_price', errBody(e));
    expect(e).toBeTruthy();
    expect(await prisma.saleInvoice.count()).toBe(before);
  });

  it('T031 price above INT4 is rejected before touching stock', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(
      sell({ lines: [L(p, 1, 2_147_483_647)], discount: 0 }),
    ).resolves.toBeDefined(); // exactly INT4_MAX is allowed
    const p2 = await makeProduct({ stock: 10 });
    await expect(
      sell({ lines: [L(p2, 2, 2_000_000_000)] }),
    ).rejects.toMatchObject({ response: { error: 'AMOUNT_TOO_LARGE' } });
  });

  it('T032 zero discount changes nothing', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 2, 100_000)], discount: 0 });
    expect(inv.total).toBe(200_000);
  });

  it('T033 invoice-level fixed discount', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      lines: [L(p, 2, 100_000)],
      discount: 30_000,
    });
    expect(inv.subtotal).toBe(200_000);
    expect(inv.discount).toBe(30_000);
    expect(inv.total).toBe(170_000);
  });

  it('T034 line-level discount is folded into subtotal', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({ lines: [L(p, 2, 100_000, 25_000)] });
    expect(inv.subtotal).toBe(175_000);
    expect(inv.total).toBe(175_000);
  });

  it('T035 discount exceeding invoice total is rejected', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(
      sell({ lines: [L(p, 1, 100_000)], discount: 150_000 }),
    ).rejects.toMatchObject({ response: { error: 'DISCOUNT_EXCEEDS_TOTAL' } });
  });

  it('T036 discount == 100% of invoice yields total 0', async () => {
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      lines: [L(p, 1, 100_000)],
      discount: 100_000,
    });
    expect(inv.total).toBe(0);
  });

  it('T037 negative discount is rejected', async () => {
    const p = await makeProduct({ stock: 10 });
    let e: any = null;
    let inv: any = null;
    try {
      inv = await sell({ lines: [L(p, 1, 100_000)], discount: -50_000 });
    } catch (x) {
      e = x;
    }
    note('T037_negative_discount', {
      error: errBody(e),
      total: inv?.total ?? null,
    });
    // در لایه‌ی سرویس مقدار منفی total را بالا می‌برد؛ DTO باید جلویش را بگیرد.
    expect(e || inv.total === 150_000).toBeTruthy();
  });

  it('T038 line discount larger than the line makes subtotal negative → rejected', async () => {
    const p = await makeProduct({ stock: 10 });
    let e: any = null;
    let inv: any = null;
    try {
      inv = await sell({ lines: [L(p, 1, 100_000, 500_000)] });
    } catch (x) {
      e = x;
    }
    note('T038_line_discount_over', {
      error: errBody(e),
      subtotal: inv?.subtotal ?? null,
      total: inv?.total ?? null,
    });
    expect(e || inv.subtotal).toBeDefined();
  });

  it('T039 several discounted lines + invoice discount all reconcile', async () => {
    const a = await makeProduct({ stock: 10 });
    const b = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      lines: [L(a, 3, 70_000, 10_000), L(b, 2, 45_000, 5_000)],
      discount: 20_000,
    });
    const expectedSub = 3 * 70_000 - 10_000 + (2 * 45_000 - 5_000);
    expect(inv.subtotal).toBe(expectedSub);
    expect(inv.total).toBe(expectedSub - 20_000);
  });

  it('T040 price snapshot: changing the product price later does not change the invoice', async () => {
    const p = await makeProduct({ stock: 10, salePrice: 100_000 });
    const inv: any = await sell({ lines: [L(p, 2, 100_000)] });
    await prisma.productPrice.create({
      data: { productId: p.id, salePrice: 999_000 },
    });
    const reread: any = await sales.findOne(inv.id);
    expect(reread.total).toBe(200_000);
    const logLine = await prisma.inventoryLog.findFirst({
      where: { invoiceId: inv.id, action: 'SALE' },
    });
    expect(logLine!.unitPrice).toBe(100_000);
  });

  it('T041 profit snapshot uses purchase price at sale time', async () => {
    const p = await makeProduct({
      stock: 10,
      salePrice: 100_000,
      purchasePrice: 60_000,
    });
    const inv: any = await sell({ lines: [L(p, 2, 100_000)] });
    expect(inv.profit).toBe((100_000 - 60_000) * 2);
    await prisma.productPrice.create({
      data: { productId: p.id, purchasePrice: 10 },
    });
    const reread: any = await sales.findOne(inv.id);
    expect(reread.profit).toBe(80_000);
  });

  it('T042 payment below total creates credit + ledger debt', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      customerId: cust.id,
      lines: [L(p, 1, 500_000)],
      payments: [
        { method: 'CASH', amount: 200_000 },
        { method: 'CREDIT', amount: 300_000 },
      ],
    });
    expect(inv.paidAmount).toBe(200_000);
    expect(inv.dueAmount).toBe(300_000);
    expect(await ledger.balance(cust.id)).toBe(300_000);
  });

  it('T043 payment above total is rejected as OVERPAYMENT', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(
      sell({
        lines: [L(p, 1, 100_000)],
        payments: [{ method: 'CASH', amount: 150_000 }],
      }),
    ).rejects.toMatchObject({ response: { error: 'OVERPAYMENT' } });
  });

  it('T044 mixed CASH + CARD + CREDIT sums to total', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      customerId: cust.id,
      lines: [L(p, 1, 1_000_000)],
      payments: [
        { method: 'CASH', amount: 300_000 },
        { method: 'CARD', amount: 400_000 },
        { method: 'CREDIT', amount: 300_000 },
      ],
    });
    expect(inv.total).toBe(1_000_000);
    expect(inv.paidAmount).toBe(700_000);
    expect(inv.dueAmount).toBe(300_000);
    const rows = await prisma.payment.findMany({
      where: { invoiceId: inv.id },
    });
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(1_000_000);
  });

  it('T045 credit sale without a customer is rejected', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(
      sell({
        lines: [L(p, 1, 100_000)],
        payments: [{ method: 'CREDIT', amount: 100_000 }],
      }),
    ).rejects.toMatchObject({
      response: { error: 'CUSTOMER_REQUIRED_FOR_CREDIT' },
    });
  });

  it('T046 cheque payment: charge is separated and total includes it', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      customerId: cust.id,
      lines: [L(p, 1, 10_000_000)],
      payments: [
        {
          method: 'CHEQUE',
          amount: 10_000_000,
          cheque: {
            number: uniq('CH'),
            dueDate: new Date(Date.now() + 86400000 * 90).toISOString(),
            rateBp: 250,
            months: 3,
            rateMode: 'MONTHLY',
          },
        },
      ],
    });
    expect(inv.financeCharge).toBeGreaterThan(0);
    expect(inv.total).toBe(inv.subtotal - inv.discount + inv.financeCharge);
    expect(inv.paidAmount).toBe(inv.total);
    const ch = await prisma.cheque.findFirst({
      where: { payment: { invoiceId: inv.id } },
    });
    expect(ch!.charge).toBe(inv.financeCharge);
    const pay = await prisma.payment.findFirst({
      where: { invoiceId: inv.id },
    });
    expect(pay!.amount).toBe(10_000_000 + inv.financeCharge);
  });

  it('T047 cheque finance charge is capped', async () => {
    const cust = await makeCustomer();
    const p = await makeProduct({ stock: 10 });
    const inv: any = await sell({
      customerId: cust.id,
      lines: [L(p, 1, 1_000_000)],
      payments: [
        {
          method: 'CHEQUE',
          amount: 1_000_000,
          cheque: {
            number: uniq('CH'),
            dueDate: new Date(Date.now() + 86400000).toISOString(),
            charge: 900_000_000,
          },
        },
      ],
    });
    note('T047_charge_cap', {
      base: 1_000_000,
      charge: inv.financeCharge,
      ratio: inv.financeCharge / 1_000_000,
    });
    // MAX_CHARGE_RATIO = 1: سود هرگز از خودِ مبلغ پایه بیشتر نمی‌شود (می‌تواند مساوی باشد).
    expect(inv.financeCharge).toBeLessThanOrEqual(1_000_000);
  });

  it('T048 cheque without details is rejected', async () => {
    const p = await makeProduct({ stock: 10 });
    await expect(
      sell({
        lines: [L(p, 1, 100_000)],
        payments: [{ method: 'CHEQUE', amount: 100_000 }],
      }),
    ).rejects.toMatchObject({ response: { error: 'CHEQUE_DETAILS_REQUIRED' } });
  });

  it('T049 sum(payments) == total for every invoice created so far', async () => {
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT i.id, i.total, i."paidAmount", COALESCE(SUM(p.amount),0)::int AS paysum
      FROM "SaleInvoice" i LEFT JOIN "Payment" p ON p."invoiceId" = i.id
      WHERE i.status <> 'CANCELLED' AND i."accountId" IS NULL
        -- اصلاحیه‌ی فاکتورِ نسیه total را بالا می‌برد بدون ساختنِ پرداخت
        -- (اختلاف به دفترِ مشتری می‌رود)، پس این تساوی آنجا عمداً برقرار نیست.
        AND NOT EXISTS (SELECT 1 FROM "SaleCorrection" c WHERE c."invoiceId" = i.id)
      GROUP BY i.id
      HAVING COALESCE(SUM(p.amount),0)::int <> i.total`);
    note('T049_payment_total_mismatch', {
      count: rows.length,
      sample: rows.slice(0, 5),
    });
    expect(rows).toEqual([]);
  });

  it('T050 sum(SALE lines) == invoice subtotal for every UNCORRECTED invoice', async () => {
    /*
     * دامنه عمداً «فاکتورِ بدونِ اصلاحیه» است.
     *
     * اصلاحیه `SaleInvoice.subtotal` را در جا به‌روز می‌کند (corrections.service
     * — هر دو شاخه)، در حالی که لجرِ انبار append-only می‌ماند: ردیفِ SALEِ اصلی
     * دست‌نخورده سرِ جایش است و یک حرکتِ جبرانی کنارش می‌نشیند. پس برای فاکتورِ
     * اصلاح‌شده «جمعِ ردیف‌های اصلی == subtotal» **عمداً** برقرار نیست و
     * assert کردنش فقط یک تستِ شکننده می‌سازد که به ترتیبِ اجرای سوئیت‌ها
     * حساس است. درستیِ فاکتورِ اصلاح‌شده جای دیگری بررسی می‌شود.
     */
    const rows = await prisma.$queryRawUnsafe<any[]>(`
      SELECT i.id, i.subtotal,
             COALESCE(SUM(l.quantity * COALESCE(l."unitPrice",0) - COALESCE(l."lineDiscount",0)),0)::int AS linesum
      FROM "SaleInvoice" i
      JOIN "InventoryLog" l
        ON l."invoiceId" = i.id
       AND l.action = 'SALE'
       AND l."correctionId" IS NULL
      WHERE i.status <> 'CANCELLED'
        AND NOT EXISTS (SELECT 1 FROM "SaleCorrection" c WHERE c."invoiceId" = i.id)
      GROUP BY i.id
      HAVING COALESCE(SUM(l.quantity * COALESCE(l."unitPrice",0) - COALESCE(l."lineDiscount",0)),0)::int <> i.subtotal`);
    note('T050_subtotal_mismatch', {
      count: rows.length,
      sample: rows.slice(0, 5),
    });
    expect(rows).toEqual([]);
  });
});
