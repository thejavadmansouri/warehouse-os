import { Test, TestingModule } from '@nestjs/testing';
import {
  FixedAccount,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  PurchaseStatus,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from './reconciliation.service';

/**
 * تستِ تطبیقِ سندری.
 *
 * یک سناریوی کاملِ دخل ساخته می‌شود (فروش نقد/نسیه/چک، رسید، مرجوعیِ نقدی و
 * نسیه‌ای، اصلاحیه، چرخه‌ی کاملِ چک: سپردن → برگشت → وصول، پرداخت به مشتری،
 * خرید) و «مانده از سندها» باید با «مانده از مدلِ عملیاتی» برای هر حسابِ ثابت
 * یکی دربیاید. این تست همان نگهبانِ فاز ۲ است: اگر پستینگِ یک اکشن از فرمولش
 * جدا بیفتد یا اکشنی سند نگیرد، اینجا قرمز می‌شود.
 *
 * ارقام طوری انتخاب شده‌اند که هر سند موازنه باشد (جمعِ خطوط = ۰) و خالصِ هر
 * حسابِ عملیاتی با مدلِ عملیاتیِ خودش دقیقاً بخواند.
 */

// ───────────────────────── سناریوی پایه ─────────────────────────────────────
const CUST_A = 'cust-a';
const CUST_B = 'cust-b';

/** کلیدِ مشترکِ «سندِ عملیاتی → سندِ مالی» در mock — فقط برای خوانایی. */
const V = {
  inv1: 'v-inv1', // فروش نقد+نسیه به الف
  rec1: 'v-rec1', // رسیدِ تسویه از الف
  inv2: 'v-inv2', // فروش چکی به ب (با سودِ مدت‌دار)
  ret1: 'v-ret1', // مرجوعیِ نقدی روی فاکتور ۲
  dep1: 'v-dep1', // سپردن چکِ فاکتور ۲ به بانک
  bnc1: 'v-bnc1', // برگشت همان چک
  csh1: 'v-csh1', // وصولِ چکِ برگشتی
  inv3: 'v-inv3', // فروشِ چکیِ گذری با تخفیف
  cor1: 'v-cor1', // اصلاحیه‌ی فاکتور ۱
  ret2: 'v-ret2', // مرجوعیِ نسیه‌ای روی فاکتور ۱
  ret3: 'v-ret3', // مرجوعیِ نسیه‌ای روی فاکتور ۲
  pay1: 'v-pay1', // پرداخت وجه به ب
  pur1: 'v-pur1', // فاکتور خرید
} as const;

interface VoucherLineMock {
  voucherId: string;
  account: FixedAccount;
  amount: number;
  customerId: string | null;
}

type LedgerRowMock = {
  customerId: string;
  amount: number;
  type: LedgerEntryType;
};
type InvoiceMock = {
  status: InvoiceStatus;
  subtotal: number;
  discount: number;
  financeCharge: number;
  lines: { lineDiscount: number | null }[];
};
type ChequeMock = {
  payment: { amount: number } | null;
  receiptPayment: { amount: number } | null;
};

/** شکلِ حداقلیِ mockِ دیتابیس — فقط همان کوئری‌هایی که سرویس می‌زند. */
interface DbMock {
  voucher: { findMany: jest.Mock<Promise<{ sourceType: string }[]>> };
  voucherLine: { findMany: jest.Mock<Promise<VoucherLineMock[]>> };
  customerLedger: { findMany: jest.Mock<Promise<LedgerRowMock[]>> };
  saleInvoice: { findMany: jest.Mock<Promise<InvoiceMock[]>> };
  saleCorrection: { findMany: jest.Mock<Promise<{ amountAdjust: number }[]>> };
  saleReturn: { findMany: jest.Mock<Promise<{ refundAmount: number }[]>> };
  purchaseInvoice: {
    findMany: jest.Mock<Promise<{ status: PurchaseStatus; total: number }[]>>;
  };
  cheque: { findMany: jest.Mock<Promise<ChequeMock[]>> };
  customerPayout: {
    findMany: jest.Mock<Promise<{ method: PaymentMethod; amount: number }[]>>;
  };
  receiptPayment: {
    findMany: jest.Mock<Promise<{ cheque: { charge: number } | null }[]>>;
  };
  receipt: { findMany: jest.Mock<Promise<{ id: string }[]>> };
  paymentReversal: { findMany: jest.Mock<Promise<{ id: string }[]>> };
}

function line(
  voucherId: string,
  account: FixedAccount,
  amount: number,
  customerId?: string,
): VoucherLineMock {
  return { voucherId, account, amount, customerId: customerId ?? null };
}

/** ساختِ سندهای سناریو — با این امکان که بعضی را حذف کنیم (تستِ سندِ گم‌شده). */
function scenarioVoucherLines(exclude: string[] = []): VoucherLineMock[] {
  const all: VoucherLineMock[] = [
    // فروش ۱ به الف: ۸٬۰۰۰ نقد + ۱۰٬۰۰۰ نسیه — تخفیف سرِ فاکتور ۲٬۰۰۰.
    line(V.inv1, FixedAccount.CASH, 8_000),
    line(V.inv1, FixedAccount.CUSTOMERS, 10_000, CUST_A),
    line(V.inv1, FixedAccount.SALES, -20_000),
    line(V.inv1, FixedAccount.DISCOUNT, 2_000),
    line(V.inv1, FixedAccount.COGS, 600),
    line(V.inv1, FixedAccount.INVENTORY, -600),

    // رسید ۱: الف ۱۰٬۰۰۰ نقد آورد — بدهی‌اش صفر شد.
    line(V.rec1, FixedAccount.CASH, 10_000),
    line(V.rec1, FixedAccount.CUSTOMERS, -10_000, CUST_A),

    // فروش ۲ به ب: چک ۱۰٬۸۰۰ (سودِ مدت‌دار ۸۰۰) — بدون نسیه.
    line(V.inv2, FixedAccount.CHEQUES, 10_800),
    line(V.inv2, FixedAccount.SALES, -10_000),
    line(V.inv2, FixedAccount.FINANCE_CHARGE, -800),
    line(V.inv2, FixedAccount.COGS, 300),
    line(V.inv2, FixedAccount.INVENTORY, -300),

    // مرجوعی ۱: ۲٬۰۰۰ نقد برگشت (روی فاکتور ۲) + انبارِ سالم.
    line(V.ret1, FixedAccount.SALES_RETURN, 2_000),
    line(V.ret1, FixedAccount.CASH, -2_000),
    line(V.ret1, FixedAccount.INVENTORY, 60),
    line(V.ret1, FixedAccount.COGS, -60),

    // چرخه‌ی چکِ فاکتور ۲: سپردن → برگشت → وصول (قرینه‌ی برگشت).
    line(V.dep1, FixedAccount.BANK, 10_800),
    line(V.dep1, FixedAccount.CHEQUES, -10_800),

    line(V.bnc1, FixedAccount.CUSTOMERS, 10_800, CUST_B),
    line(V.bnc1, FixedAccount.BANK, -10_800),

    line(V.csh1, FixedAccount.CUSTOMERS, -10_800, CUST_B),
    line(V.csh1, FixedAccount.BANK, 10_800),

    // فروش ۳ (گذری، چک ۵٬۰۰۰): تخفیف ۱٬۰۰۰ از ۶٬۰۰۰.
    line(V.inv3, FixedAccount.CHEQUES, 5_000),
    line(V.inv3, FixedAccount.SALES, -6_000),
    line(V.inv3, FixedAccount.DISCOUNT, 1_000),
    line(V.inv3, FixedAccount.COGS, 180),
    line(V.inv3, FixedAccount.INVENTORY, -180),

    // اصلاحیه ۱: مبلغِ فاکتور ۱ هزار ریال بالاتر رفت.
    line(V.cor1, FixedAccount.CUSTOMERS, 1_000, CUST_A),
    line(V.cor1, FixedAccount.SALES, -1_000),

    // مرجوعی ۲ (نسیه‌ای روی فاکتور ۱): ۵۰۰ از حسابِ الف کم شد.
    line(V.ret2, FixedAccount.SALES_RETURN, 500),
    line(V.ret2, FixedAccount.CUSTOMERS, -500, CUST_A),
    line(V.ret2, FixedAccount.INVENTORY, 60),
    line(V.ret2, FixedAccount.COGS, -60),

    // مرجوعی ۳ (نسیه‌ای روی فاکتور ۲): ۱٬۲۰۰ بستانکارِ ب شد.
    line(V.ret3, FixedAccount.SALES_RETURN, 1_200),
    line(V.ret3, FixedAccount.CUSTOMERS, -1_200, CUST_B),

    // پرداخت به ب: بستانکاری‌اش (۱٬۲۰۰) نقد تسویه شد.
    line(V.pay1, FixedAccount.CUSTOMERS, 1_200, CUST_B),
    line(V.pay1, FixedAccount.CASH, -1_200),

    // خرید ۳۰٬۰۰۰ — موجودی در برابر تأمین‌کننده.
    line(V.pur1, FixedAccount.INVENTORY, 30_000),
    line(V.pur1, FixedAccount.SUPPLIERS, -30_000),
  ];

  const excluded = new Set(exclude);
  return all.filter((l) => !excluded.has(l.voucherId));
}

/** سرصفحه‌ی سندها — برای شمارشِ پوششِ هر خانواده. */
function scenarioVoucherHeaders(
  exclude: string[] = [],
): { sourceType: string }[] {
  const all: { id: string; sourceType: string }[] = [
    { id: V.inv1, sourceType: 'SALE_INVOICE' },
    { id: V.rec1, sourceType: 'RECEIPT' },
    { id: V.inv2, sourceType: 'SALE_INVOICE' },
    { id: V.ret1, sourceType: 'SALE_RETURN' },
    { id: V.dep1, sourceType: 'CHEQUE_DEPOSIT' },
    { id: V.bnc1, sourceType: 'CHEQUE_BOUNCED' },
    { id: V.csh1, sourceType: 'CHEQUE_CASHED' },
    { id: V.inv3, sourceType: 'SALE_INVOICE' },
    { id: V.cor1, sourceType: 'SALE_CORRECTION' },
    { id: V.ret2, sourceType: 'SALE_RETURN' },
    { id: V.ret3, sourceType: 'SALE_RETURN' },
    { id: V.pay1, sourceType: 'CUSTOMER_PAYOUT' },
    { id: V.pur1, sourceType: 'PURCHASE_INVOICE' },
  ];
  const excluded = new Set(exclude);
  return all
    .filter((v) => !excluded.has(v.id))
    .map(({ sourceType }) => ({ sourceType }));
}

function resolve<T>(value: T[]) {
  return jest.fn().mockResolvedValue(value) as jest.Mock<Promise<T[]>>;
}

/** mockِ کاملِ دیتابیس — هر findMany سناریو را برمی‌گرداند. */
function mockPrisma(exclude: string[] = []): DbMock {
  return {
    voucher: { findMany: resolve(scenarioVoucherHeaders(exclude)) },
    voucherLine: { findMany: resolve(scenarioVoucherLines(exclude)) },
    customerLedger: {
      findMany: resolve<LedgerRowMock>([
        // ردیف‌های دستی (بدون سند) — باید از تطبیق بیرون بمانند.
        { customerId: CUST_A, amount: 777, type: LedgerEntryType.OPENING },
        { customerId: CUST_A, amount: -277, type: LedgerEntryType.ADJUSTMENT },
        // ردِ واقعیِ حسابِ الف.
        { customerId: CUST_A, amount: 10_000, type: LedgerEntryType.INVOICE },
        { customerId: CUST_A, amount: -10_000, type: LedgerEntryType.RECEIPT },
        { customerId: CUST_A, amount: 1_000, type: LedgerEntryType.CORRECTION },
        { customerId: CUST_A, amount: -500, type: LedgerEntryType.RETURN },
        // ردِ واقعیِ حسابِ ب.
        {
          customerId: CUST_B,
          amount: 10_800,
          type: LedgerEntryType.CHEQUE_BOUNCED,
        },
        {
          customerId: CUST_B,
          amount: -10_800,
          type: LedgerEntryType.CHEQUE_CASHED,
        },
        { customerId: CUST_B, amount: -1_200, type: LedgerEntryType.RETURN },
        { customerId: CUST_B, amount: 1_200, type: LedgerEntryType.PAYOUT },
      ]),
    },
    saleInvoice: {
      findMany: resolve<InvoiceMock>([
        {
          status: InvoiceStatus.CONFIRMED,
          subtotal: 20_000,
          discount: 2_000,
          financeCharge: 0,
          lines: [{ lineDiscount: 0 }, { lineDiscount: 0 }],
        },
        {
          status: InvoiceStatus.CONFIRMED,
          subtotal: 10_000,
          discount: 0,
          financeCharge: 800,
          lines: [{ lineDiscount: 0 }],
        },
        {
          status: InvoiceStatus.CONFIRMED,
          subtotal: 6_000,
          discount: 1_000,
          financeCharge: 0,
          lines: [{ lineDiscount: 0 }],
        },
      ]),
    },
    saleCorrection: {
      findMany: resolve([{ amountAdjust: 1_000 }]),
    },
    saleReturn: {
      findMany: resolve([
        { refundAmount: 2_000 },
        { refundAmount: 500 },
        { refundAmount: 1_200 },
      ]),
    },
    purchaseInvoice: {
      findMany: resolve([{ status: PurchaseStatus.CONFIRMED, total: 30_000 }]),
    },
    cheque: {
      findMany: resolve<ChequeMock>([
        // فقط چکِ فاکتور ۳ هنوز نزدِ ماست (۵٬۰۰۰). چکِ فاکتور ۲ مسیرش کامل شد.
        { payment: { amount: 5_000 }, receiptPayment: null },
      ]),
    },
    customerPayout: {
      findMany: resolve([{ method: PaymentMethod.CASH, amount: 1_200 }]),
    },
    receiptPayment: {
      findMany: resolve([]),
    },
    receipt: {
      findMany: resolve([{ id: 'rec-1' }]),
    },
    paymentReversal: {
      findMany: resolve([]),
    },
  };
}

async function buildService(db: DbMock) {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      ReconciliationService,
      { provide: PrismaService, useValue: db },
    ],
  }).compile();
  return module.get(ReconciliationService);
}

describe('ReconciliationService — تستِ تطبیقِ سندری', () => {
  const rowOf = (
    report: Awaited<ReturnType<ReconciliationService['reconcile']>>,
    account: FixedAccount,
  ) => report.accounts.find((r) => r.account === account)!;

  it('سناریوی کامل: مانده‌ی هر حساب از سندها با مدلِ عملیاتی می‌خواند → سبز', async () => {
    const service = await buildService(mockPrisma());
    const report = await service.reconcile();

    expect(report.ok).toBe(true);
    // هر ۱۲ حسابِ ثابت در گزارش هستند.
    expect(report.accounts).toHaveLength(12);
    expect(report.journal).toEqual({ vouchers: 13, unbalanced: 0 });

    // حساب‌هایِ با مدلِ عملیاتی — اختلاف صفر.
    const expected: Partial<Record<FixedAccount, number>> = {
      CUSTOMERS: 500, // الف ۵۰۰ بدهکار؛ ب تسویه
      SUPPLIERS: -30_000,
      CHEQUES: 5_000, // فقط چکِ فاکتور ۳ نزدِ ماست
      SALES: -37_000,
      DISCOUNT: 3_000,
      FINANCE_CHARGE: -800,
      SALES_RETURN: 3_700,
    };
    for (const [account, balance] of Object.entries(expected) as [
      FixedAccount,
      number,
    ][]) {
      const row = rowOf(report, account);
      expect(row.kind).toBe('operational');
      expect(row.fromVouchers).toBe(balance);
      expect(row.fromOperations).toBe(balance);
      expect(row.difference).toBe(0);
    }

    // مانده‌ی هر مشتری به‌تفکیک — از دفترِ مشتری و از سندها یکی است.
    expect(report.customers).toEqual([
      {
        customerId: CUST_A,
        fromVouchers: 500,
        fromOperations: 500,
        difference: 0,
      },
      { customerId: CUST_B, fromVouchers: 0, fromOperations: 0, difference: 0 },
    ]);

    // پوششِ سند: هر سندِ عملیاتی سندِ مالیِ خودش را دارد.
    expect(report.coverage.every((c) => c.ok)).toBe(true);
    const coverage = (t: string) =>
      report.coverage.find((c) => c.sourceType === t)!;
    expect(coverage('SALE_INVOICE')).toMatchObject({
      documents: 3,
      vouchers: 3,
    });
    expect(coverage('RECEIPT')).toMatchObject({ documents: 1, vouchers: 1 });
    expect(coverage('SALE_RETURN')).toMatchObject({
      documents: 3,
      vouchers: 3,
    });
    expect(coverage('CUSTOMER_PAYOUT')).toMatchObject({
      documents: 1,
      vouchers: 1,
    });
    expect(coverage('PURCHASE_INVOICE')).toMatchObject({
      documents: 1,
      vouchers: 1,
    });
  });

  it('حساب‌هایِ بدونِ مدلِ عملیاتی مستقل informational هستند و در گزارش می‌آیند', async () => {
    const service = await buildService(mockPrisma());
    const report = await service.reconcile();

    for (const account of [
      FixedAccount.CASH,
      FixedAccount.BANK,
      FixedAccount.REFUND_PAYABLE,
      FixedAccount.INVENTORY,
      FixedAccount.COGS,
    ]) {
      const row = rowOf(report, account);
      expect(row.kind).toBe('informational');
      expect(row.fromOperations).toBeNull();
      expect(row.difference).toBeNull();
      expect(row.note).toBeTruthy();
    }

    // صندوق ۸٬۰۰۰ + ۱۰٬۰۰۰ − ۲٬۰۰۰ − ۱٬۲۰۰ = ۱۴٬۸۰۰؛ بانک فقط چکِ فاکتور ۲.
    expect(rowOf(report, FixedAccount.CASH).fromVouchers).toBe(14_800);
    expect(rowOf(report, FixedAccount.BANK).fromVouchers).toBe(10_800);
  });

  it('اختلافِ پستینگ (مبلغِ اشتباه بین دو حسابِ موازنه) را پیدا می‌کند → قرمز', async () => {
    // فروش ۳ را «اشتباه» ثبت می‌کنیم: چک ۵٬۰۰۰ → ۴٬۹۰۰ و تخفیف ۱٬۰۰۰ → ۱٬۱۰۰
    // (سند همچنان موازنه است، ولی از واقعیتِ فاکتور جدا افتاده).
    const lines = scenarioVoucherLines();
    for (const l of lines) {
      if (l.voucherId === V.inv3 && l.account === FixedAccount.CHEQUES)
        l.amount = 4_900;
      if (l.voucherId === V.inv3 && l.account === FixedAccount.DISCOUNT)
        l.amount = 1_100;
    }
    const db = mockPrisma();
    db.voucherLine.findMany.mockResolvedValue(lines);

    const service = await buildService(db);
    const report = await service.reconcile();

    expect(report.ok).toBe(false);
    expect(rowOf(report, FixedAccount.CHEQUES).difference).toBe(-100);
    expect(rowOf(report, FixedAccount.DISCOUNT).difference).toBe(100);
  });

  it('سندِ گم‌شده (فاکتورِ بدون سندِ مالی) را در پوشش و مانده‌ها پیدا می‌کند → قرمز', async () => {
    // فاکتور ۳ اصلاً سند نگرفته — مثل اینکه پستینگِ آن مسیر قطع شده باشد.
    const service = await buildService(mockPrisma([V.inv3]));
    const report = await service.reconcile();

    expect(report.ok).toBe(false);
    const coverage = report.coverage.find(
      (c) => c.sourceType === 'SALE_INVOICE',
    )!;
    expect(coverage).toMatchObject({ documents: 3, vouchers: 2, ok: false });

    // چکِ فاکتور ۳ نزدِ ماست (۵٬۰۰۰) ولی سندی آن را ثبت نکرده.
    expect(rowOf(report, FixedAccount.CHEQUES).difference).toBe(-5_000);
    // فروشِ آن فاکتور هم در سندها غایب است.
    expect(rowOf(report, FixedAccount.SALES).difference).toBe(6_000);
    // همه‌ی سندهای باقی‌مانده همچنان موازنه‌اند — تقصیرِ پوشش است نه تراز.
    expect(report.journal.unbalanced).toBe(0);
  });

  it('ردیف‌های دستیِ دفتر (مانده‌ی اول دوره / اصلاح دستی) از تطبیق بیرون‌اند', async () => {
    // دیتابیسی که فقط ردیف‌های دستیِ دفتر دارد (بدون هیچ سندِ عملیاتی پول‌دار)
    // — این ردیف‌ها عمداً بی‌سندند و نباید اختلاف یا مشتریِ تطبیقی بسازند.
    const db = mockPrisma(Object.values(V));
    db.saleInvoice.findMany.mockResolvedValue([]);
    db.saleCorrection.findMany.mockResolvedValue([]);
    db.saleReturn.findMany.mockResolvedValue([]);
    db.purchaseInvoice.findMany.mockResolvedValue([]);
    db.customerPayout.findMany.mockResolvedValue([]);
    db.receiptPayment.findMany.mockResolvedValue([]);
    db.receipt.findMany.mockResolvedValue([]);
    db.paymentReversal.findMany.mockResolvedValue([]);
    db.cheque.findMany.mockResolvedValue([]);
    db.customerLedger.findMany.mockResolvedValue([
      {
        customerId: 'cust-opening',
        amount: 50_000,
        type: LedgerEntryType.OPENING,
      },
      {
        customerId: 'cust-adjust',
        amount: -7_000,
        type: LedgerEntryType.ADJUSTMENT,
      },
    ]);

    const service = await buildService(db);
    const report = await service.reconcile();

    expect(report.ok).toBe(true);
    expect(report.customers).toEqual([]);
    expect(report.journal).toEqual({ vouchers: 0, unbalanced: 0 });
  });
});
