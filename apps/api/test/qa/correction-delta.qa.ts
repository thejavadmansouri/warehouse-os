/**
 * دوباره‌شماریِ مبلغِ اصلاحیه (رگرسیون).
 *
 * اصلاحیه و مرجوعیِ **اعتباری** هر دو `invoice.total` را در جا به‌روز می‌کنند.
 * پس `deltaByInvoice` باید فقط مرجوعیِ **نقد/کارت** را برگرداند — وگرنه
 * صورتحسابِ مشتری و حسابِ باز، اصلاحیه یا مرجوعیِ اعتباری را دو بار حساب
 * می‌کنند.
 */
import {
  prisma,
  sales,
  returns,
  corrections,
  effects,
  baseFixture,
  makeProduct,
  makeCustomer,
  uniq,
  close,
} from './harness';
import { note } from './evlog';

let f: any;
beforeAll(async () => {
  f = await baseFixture();
});
afterAll(close);

const creditSale = async (qty: number, price: number) => {
  const cust = await makeCustomer();
  const p = await makeProduct({ stock: 500 });
  const inv: any = await sales.createInvoice(
    {
      idempotencyKey: uniq('cd'),
      warehouseId: f.warehouseId,
      customerId: cust.id,
      lines: [
        {
          productId: p.id,
          locationId: f.locationId,
          quantity: qty,
          unitPrice: price,
        },
      ],
      payments: [{ method: 'CREDIT', amount: qty * price }],
    } as any,
    f.userId,
  );
  const saleLog = await prisma.inventoryLog.findFirst({
    where: { invoiceId: inv.id, action: 'SALE' },
  });
  return { cust, p, inv, saleLog: saleLog! };
};

/** آنچه صفحه‌ی صورتحساب/حساب‌باز واقعاً نشان می‌دهد. */
const displayed = async (invoiceId: string) => {
  const inv = await prisma.saleInvoice.findUnique({ where: { id: invoiceId } });
  const delta = await effects.deltaByInvoice([invoiceId]);
  return inv!.total + (delta.get(invoiceId) ?? 0);
};

describe('CORRECTION / RETURN delta — no double counting', () => {
  it('D1 REGRESSION: a correction that increases the amount is counted exactly once', async () => {
    const { inv, saleLog } = await creditSale(5, 1000);
    await corrections.createCorrection(
      {
        idempotencyKey: uniq('cc'),
        invoiceId: inv.id,
        reason: 'افزایش تعداد',
        lines: [{ saleLogId: saleLog.id, newQuantity: 8, newUnitPrice: 1000 }],
      },
      f.userId,
    );

    const shown = await displayed(inv.id);
    note('D1_correction_increase', { truth: 8000, shown });
    expect(shown).toBe(8000); // پیش از رفع: ۱۱۰۰۰
  });

  it('D2 REGRESSION: a correction that decreases the amount is counted exactly once', async () => {
    const { inv, saleLog } = await creditSale(10, 1000);
    await corrections.createCorrection(
      {
        idempotencyKey: uniq('cc'),
        invoiceId: inv.id,
        reason: 'کاهش تعداد',
        lines: [{ saleLogId: saleLog.id, newQuantity: 4, newUnitPrice: 1000 }],
      },
      f.userId,
    );

    const shown = await displayed(inv.id);
    note('D2_correction_decrease', { truth: 4000, shown });
    expect(shown).toBe(4000); // پیش از رفع: ۱۰۰۰- (۴۰۰۰ + دلتای ۶۰۰۰-)
  });

  it('D3 a return still lowers the displayed amount (the returns half must keep working)', async () => {
    const { inv, saleLog } = await creditSale(10, 1000);
    await returns.createReturn(
      {
        idempotencyKey: uniq('rr'),
        invoiceId: inv.id,
        refundMethod: 'CREDIT',
        reason: 'مرجوعی تست',
        lines: [{ saleLogId: saleLog.id, quantity: 3 }],
      } as any,
      f.userId,
    );

    const shown = await displayed(inv.id);
    note('D3_return_still_applies', { truth: 7000, shown });
    // مرجوعیِ اعتباری خودش `total` را به ۷۰۰۰ آورده، پس دلتای نقد/کارت صفر
    // است و جمعِ نمایشی همان ۷۰۰۰ می‌ماند.
    expect(shown).toBe(7000);
  });

  it('D4 correction + return together land on the right number', async () => {
    const { inv, saleLog } = await creditSale(10, 1000);
    // ۱۰ → ۱۲ با اصلاحیه
    await corrections.createCorrection(
      {
        idempotencyKey: uniq('cc'),
        invoiceId: inv.id,
        reason: 'اضافه',
        lines: [{ saleLogId: saleLog.id, newQuantity: 12, newUnitPrice: 1000 }],
      },
      f.userId,
    );
    // بعد ۲ تا برگشت
    await returns.createReturn(
      {
        idempotencyKey: uniq('rr'),
        invoiceId: inv.id,
        refundMethod: 'CREDIT',
        reason: 'برگشت',
        lines: [{ saleLogId: saleLog.id, quantity: 2 }],
      } as any,
      f.userId,
    );

    const shown = await displayed(inv.id);
    note('D4_correction_plus_return', { truth: 10000, shown });
    expect(shown).toBe(10000); // ۱۲۰۰۰ اصلاح‌شده منهای ۲۰۰۰ مرجوعی
  });

  it('D5 the displayed amount agrees with the customer ledger balance', async () => {
    const { cust, inv, saleLog } = await creditSale(6, 1000);
    await corrections.createCorrection(
      {
        idempotencyKey: uniq('cc'),
        invoiceId: inv.id,
        reason: 'تغییر قیمت',
        lines: [{ saleLogId: saleLog.id, newQuantity: 6, newUnitPrice: 1500 }],
      },
      f.userId,
    );

    const shown = await displayed(inv.id);
    const balance = await prisma.customerLedger
      .aggregate({ where: { customerId: cust.id }, _sum: { amount: true } })
      .then((a) => a._sum.amount ?? 0);

    note('D5_display_vs_ledger', { shown, balance });
    // دفتر همیشه درست بود؛ حالا نمایش هم با آن می‌خواند.
    expect(shown).toBe(balance);
  });
});
