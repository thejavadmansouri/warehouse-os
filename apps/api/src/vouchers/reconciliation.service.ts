import { Injectable } from '@nestjs/common';
import {
  FixedAccount,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  PurchaseStatus,
  VoucherSourceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ACCOUNT_LABELS, SOURCE_LABELS } from './labels';

/** تلرانسِ ریال — اعدادِ صحیحِ ریال داخل float8 دقیق‌اند، ولی جمعِ دورِ سنگین ممکن است گرد بخورد. */
const EPS = 0.5;

/**
 * ردیفِ یک حساب در گزارشِ تطبیق.
 *
 * `kind`:
 *   - `operational` — مانده‌ی سند با یک «مدلِ عملیاتی» واقعی مقایسه می‌شود
 *     (دفترِ مشتری، فاکتورهای خرید، وضعیتِ چک‌ها، اسنادِ فروش…). صفرِ اختلاف
 *     شرطِ سبزبودن است.
 *   - `informational` — حسابِ جریان/داخلیِ سند (صندوق، بانک، بهای تمام‌شده…)
 *     مدلِ عملیاتیِ مستقل ندارد؛ فقط مانده‌ی سند گزارش می‌شود و در «سبز/قرمز»
 *     نقشی ندارد.
 */
export interface AccountBalanceRow {
  account: FixedAccount;
  label: string;
  kind: 'operational' | 'informational';
  fromVouchers: number;
  /** مانده‌ی مشتق‌شده از مدلِ عملیاتی — برای informational صفر/null. */
  fromOperations: number | null;
  difference: number | null;
  note: string | null;
}

export interface CustomerBalanceRow {
  customerId: string;
  fromVouchers: number;
  fromOperations: number;
  difference: number;
}

export interface CoverageRow {
  sourceType: VoucherSourceType;
  label: string;
  /** چند سندِ عملیاتی باید سندِ مالی داشته باشند. */
  documents: number;
  /** چند سندِ مالی واقعاً ثبت شده. */
  vouchers: number;
  ok: boolean;
}

export interface ReconciliationReport {
  ok: boolean;
  generatedAt: Date;
  journal: {
    /** کلِ سندهای مالی ثبت‌شده. */
    vouchers: number;
    /** سندهایی که جمعِ خطوطشان صفر نیست — هرگز نباید باشد. */
    unbalanced: number;
  };
  accounts: AccountBalanceRow[];
  customers: CustomerBalanceRow[];
  coverage: CoverageRow[];
}

/**
 * تستِ تطبیقِ سندری — «سندها با واقعیت می‌خوانند یا نه».
 *
 * دو ستونِ مستقل از دو منبعِ جدا می‌آیند:
 *   - «از سندها» = جمعِ مبلغِ خطوطِ VoucherLine به تفکیکِ هر حسابِ ثابت.
 *   - «از مدلِ عملیاتی» = همان مانده، ولی از جدول‌های واقعیِ دخل:
 *       CUSTOMERS      ← CustomerLedger (به‌تفکیکِ مشتری)
 *       SUPPLIERS      ← PurchaseInvoice (confirmed − cancelled)
 *       CHEQUES        ← چک‌های دریافتیِ دستِ‌ما (IN_HAND) منهای چکِ پرداختی به مشتری
 *       SALES          ← −جمعِ مبلغِ فاکتورهای فروشِ باطل‌نشده − جمعِ اصلاحیه‌ها
 *       DISCOUNT       ← تخفیفِ فاکتورهای باطل‌نشده (ردیفی + سرِ فاکتور)
 *       FINANCE_CHARGE ← −درآمدِ تفاوتِ مدت‌دارِ فاکتورها − سودِ چک‌های رسیدها
 *       SALES_RETURN   ← جمعِ مبلغِ مرجوعی‌ها
 *
 * این دو ستون از مسیرهای کدِ جدا می‌آیند (سرویس‌های پستینگ در برابر همین
 * جدول‌های عملیاتی)؛ اگر روزی پستینگِ یک اکشن از فرمولش جدا بیفتد یا اکشنی
 * سند نگیرد، همین‌جا اختلافِ غیرصفر ظاهر می‌شود و گزارش قرمز می‌شود.
 *
 * دو چیز دیگر همیشه چک می‌شوند:
 *   - موازنه‌ی هر سند (جمعِ خطوط = صفر) — باید همیشه برقرار باشد.
 *   - پوششِ سند: هر سندِ عملیاتیِ پول‌دار (فاکتور، رسید، مرجوعی، اصلاحیه،
 *     پرداخت، برگشت، خرید) باید سندِ مالیِ خودش را داشته باشد.
 *
 * محدودیتِ آگاهانه: حساب‌های CASH/BANK/REFUND_PAYABLE/COGS/INVENTORY مدلِ
 * عملیاتیِ مستقل ندارند (صندوق فیزیکی است، بانک از رویدادِ سپردنِ چک تعریف
 * می‌شود و بهای تمام‌شده به تاریخچه‌ی قیمت خرید وابسته است)؛ این‌ها در گزارش
 * informational می‌آیند و با «پوششِ سند» و بقیه‌ی حساب‌ها به‌طور غیرمستقیم
 * پاسداری می‌شوند.
 */
@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  async reconcile(): Promise<ReconciliationReport> {
    // ۱۲ کوئریِ دسته‌ای — همه‌ی جدول‌های مالی در یک گام.
    const [
      vouchers,
      lines,
      ledgerRows,
      invoices,
      corrections,
      returns,
      purchases,
      inHandCheques,
      payouts,
      receiptChequeRows,
      receipts,
      reversals,
    ] = await Promise.all([
      this.prisma.voucher.findMany({
        select: { sourceType: true },
      }),
      this.prisma.voucherLine.findMany({
        select: {
          account: true,
          amount: true,
          customerId: true,
          voucherId: true,
        },
      }),
      this.prisma.customerLedger.findMany({
        select: { customerId: true, amount: true, type: true },
      }),
      this.prisma.saleInvoice.findMany({
        select: {
          status: true,
          subtotal: true,
          discount: true,
          financeCharge: true,
          lines: {
            where: { action: 'SALE' },
            select: { lineDiscount: true },
          },
        },
      }),
      this.prisma.saleCorrection.findMany({
        select: { amountAdjust: true },
      }),
      this.prisma.saleReturn.findMany({
        select: { refundAmount: true },
      }),
      this.prisma.purchaseInvoice.findMany({
        select: { status: true, total: true },
      }),
      this.prisma.cheque.findMany({
        where: { status: 'IN_HAND' },
        select: {
          payment: { select: { amount: true } },
          receiptPayment: { select: { amount: true } },
        },
      }),
      this.prisma.customerPayout.findMany({
        select: { method: true, amount: true },
      }),
      this.prisma.receiptPayment.findMany({
        where: { method: PaymentMethod.CHEQUE },
        select: { cheque: { select: { charge: true } } },
      }),
      this.prisma.receipt.findMany({ select: { id: true } }),
      this.prisma.paymentReversal.findMany({ select: { id: true } }),
    ]);

    // ─── سمتِ اول: مانده از سندها ───────────────────────────────────────────
    const accountFromVouchers = new Map<FixedAccount, number>();
    const customerFromVouchers = new Map<string, number>();
    const perVoucherSum = new Map<string, number>();

    for (const l of lines) {
      accountFromVouchers.set(
        l.account,
        (accountFromVouchers.get(l.account) ?? 0) + l.amount,
      );
      if (l.account === FixedAccount.CUSTOMERS && l.customerId) {
        customerFromVouchers.set(
          l.customerId,
          (customerFromVouchers.get(l.customerId) ?? 0) + l.amount,
        );
      }
      perVoucherSum.set(
        l.voucherId,
        (perVoucherSum.get(l.voucherId) ?? 0) + l.amount,
      );
    }

    let unbalanced = 0;
    for (const sum of perVoucherSum.values()) {
      if (Math.abs(sum) > EPS) unbalanced += 1;
    }

    // ─── سمتِ دوم: مانده از مدلِ عملیاتی ────────────────────────────────────
    // CUSTOMERS — دفترِ مشتری تنها مرجعِ مانده است. ردیف‌های دستی (مانده‌ی اول
    // دوره / اصلاح دستی) عمداً سند ندارند، پس از مقایسه بیرون‌اند.
    const customerFromOps = new Map<string, number>();
    for (const r of ledgerRows) {
      if (r.type === LedgerEntryType.OPENING) continue;
      if (r.type === LedgerEntryType.ADJUSTMENT) continue;
      customerFromOps.set(
        r.customerId,
        (customerFromOps.get(r.customerId) ?? 0) + r.amount,
      );
    }

    // SUPPLIERS — هر فاکتور خریدِ confirmed بدهیِ منفی ساخته و ابطالش برگردانده.
    let supplierDebt = 0; // confirmed → −total
    let supplierReversed = 0; // cancelled → +total
    for (const p of purchases) {
      if (p.status === PurchaseStatus.CANCELLED) supplierReversed += p.total;
      else supplierDebt += p.total;
    }
    const suppliersFromOps = supplierReversed - supplierDebt;

    // CHEQUES — چک‌های دریافتیِ هنوز نزدِ ما؛ چکِ پرداختی به مشتری از کشو بیرون رفته.
    let chequesInHand = 0;
    for (const c of inHandCheques) {
      chequesInHand += c.payment?.amount ?? c.receiptPayment?.amount ?? 0;
    }
    let chequesIssued = 0;
    for (const p of payouts) {
      if (p.method === PaymentMethod.CHEQUE) chequesIssued += p.amount;
    }
    const chequesFromOps = chequesInHand - chequesIssued;

    // SALES / DISCOUNT / FINANCE_CHARGE — از خودِ فاکتورهای باطل‌نشده.
    // ابطال، اثرِ فاکتور را در سندها خنثی می‌کند (فروش +gross در برابر −grossِ
    // سندِ فروش) پس فاکتورِ باطل‌شده در این سمت نمی‌آید.
    let salesGross = 0;
    let discounts = 0;
    let financeCharges = 0;
    for (const inv of invoices) {
      if (inv.status === InvoiceStatus.CANCELLED) continue;
      const lineDiscounts = inv.lines.reduce(
        (s, l) => s + (l.lineDiscount ?? 0),
        0,
      );
      // فروشِ ناخالص = subtotal + تخفیفِ ردیف‌ها (همان شکل‌دهیِ سندِ فروش).
      salesGross += inv.subtotal + lineDiscounts;
      discounts += lineDiscounts + inv.discount;
      financeCharges += inv.financeCharge ?? 0;
    }
    let correctionsTotal = 0;
    for (const c of corrections) correctionsTotal += c.amountAdjust;
    // اصلاحیه همیشه فروش را جابه‌جا می‌کند (مثبت = فروشِ بیشتر = بستانکارِ بیشتر).
    const salesFromOps = -salesGross - correctionsTotal;

    let returnTotal = 0;
    for (const r of returns) returnTotal += r.refundAmount;

    // سودِ تفاوتِ مدت‌دارِ چکِ رسیدها — در سندِ رسید به‌جای کسرِ بدهیِ کامل،
    // جدا بستانکارِ FINANCE_CHARGE می‌شود.
    let receiptChargeTotal = 0;
    for (const r of receiptChequeRows) {
      receiptChargeTotal += r.cheque?.charge ?? 0;
    }
    const financeFromOps = -financeCharges - receiptChargeTotal;

    const operational = new Map<FixedAccount, number>([
      [
        FixedAccount.CUSTOMERS,
        [...customerFromOps.values()].reduce((a, b) => a + b, 0),
      ],
      [FixedAccount.SUPPLIERS, suppliersFromOps],
      [FixedAccount.CHEQUES, chequesFromOps],
      [FixedAccount.SALES, salesFromOps],
      [FixedAccount.DISCOUNT, discounts],
      [FixedAccount.FINANCE_CHARGE, financeFromOps],
      [FixedAccount.SALES_RETURN, returnTotal],
    ]);

    // حساب‌هایی که مدلِ عملیاتیِ مستقل ندارند — فقط گزارشِ مانده‌ی سند.
    const infoNotes: Partial<Record<FixedAccount, string>> = {
      CASH: 'صندوق فیزیکی است؛ حرکتش از سندِ فروش/رسید/مرجوعی/پرداخت ساخته می‌شود',
      BANK: 'از رویدادِ سپردن/برگشتِ چک تعریف می‌شود — تاریخچه‌ی مستقل ندارد',
      REFUND_PAYABLE:
        'حسابِ داخلیِ سندها — ابطال بستانکارش کرد، پرداختِ بازپرداخت بدهکارش می‌کند',
      INVENTORY:
        'بهای تمام‌شده به تاریخچه‌ی قیمتِ خرید وابسته است — پوششِ سند پاسدارش است',
      COGS: 'بهای تمام‌شده به تاریخچه‌ی قیمتِ خرید وابسته است — پوششِ سند پاسدارش است',
    };

    const accounts: AccountBalanceRow[] = (
      Object.keys(FixedAccount) as FixedAccount[]
    )
      .map((account) => {
        const fromVouchers = accountFromVouchers.get(account) ?? 0;
        const ops = operational.get(account);
        if (ops === undefined) {
          return {
            account,
            label: ACCOUNT_LABELS[account] ?? account,
            kind: 'informational' as const,
            fromVouchers,
            fromOperations: null,
            difference: null,
            note: infoNotes[account] ?? null,
          };
        }
        return {
          account,
          label: ACCOUNT_LABELS[account] ?? account,
          kind: 'operational' as const,
          fromVouchers,
          fromOperations: ops,
          difference: fromVouchers - ops,
          note: null,
        };
      })
      // ترتیبِ ثابت: سمتِ دارایی/بدهی اول، بعد حساب‌های عملیاتی.
      .sort((a, b) =>
        a.kind === b.kind ? 0 : a.kind === 'operational' ? -1 : 1,
      );

    // ─── مشتری‌ها ───────────────────────────────────────────────────────────
    const customerIds = new Set([
      ...customerFromVouchers.keys(),
      ...customerFromOps.keys(),
    ]);
    const customers: CustomerBalanceRow[] = [...customerIds]
      .map((customerId) => {
        const v = customerFromVouchers.get(customerId) ?? 0;
        const o = customerFromOps.get(customerId) ?? 0;
        return {
          customerId,
          fromVouchers: v,
          fromOperations: o,
          difference: v - o,
        };
      })
      .sort((a, b) => a.customerId.localeCompare(b.customerId));

    // ─── پوششِ سند: هر سندِ عملیاتی سندِ مالیِ خودش را داشته باشد ───────────
    const countByType = new Map<VoucherSourceType, number>();
    for (const v of vouchers) {
      countByType.set(v.sourceType, (countByType.get(v.sourceType) ?? 0) + 1);
    }

    const cancelledInvoices = invoices.filter(
      (i) => i.status === InvoiceStatus.CANCELLED,
    ).length;
    const cancelledPurchases = purchases.filter(
      (p) => p.status === PurchaseStatus.CANCELLED,
    ).length;
    // اصلاحیه‌ی بی‌اثر (مبلغ صفر و بی‌تغییرِ تعداد) عمداً سند ندارد.
    const effectfulCorrections = corrections.filter(
      (c) => c.amountAdjust !== 0,
    ).length;

    const coveragePlan: [VoucherSourceType, number][] = [
      [VoucherSourceType.SALE_INVOICE, invoices.length],
      [VoucherSourceType.SALE_CANCEL, cancelledInvoices],
      [VoucherSourceType.RECEIPT, receipts.length],
      [VoucherSourceType.SALE_RETURN, returns.length],
      [VoucherSourceType.SALE_CORRECTION, effectfulCorrections],
      [VoucherSourceType.PURCHASE_INVOICE, purchases.length],
      [VoucherSourceType.PURCHASE_CANCEL, cancelledPurchases],
      [VoucherSourceType.CUSTOMER_PAYOUT, payouts.length],
      [VoucherSourceType.PAYMENT_REVERSAL, reversals.length],
    ];
    const coverage: CoverageRow[] = coveragePlan.map(
      ([sourceType, documents]) => {
        const vouchersCount = countByType.get(sourceType) ?? 0;
        return {
          sourceType,
          label: SOURCE_LABELS[sourceType] ?? sourceType,
          documents,
          vouchers: vouchersCount,
          ok: documents === vouchersCount,
        };
      },
    );

    const operationalDiffers = accounts.some(
      (r) => r.kind === 'operational' && Math.abs(r.difference ?? 0) > EPS,
    );
    const customerDiffers = customers.some((c) => Math.abs(c.difference) > EPS);
    const coverageOk = coverage.every((c) => c.ok);

    return {
      ok:
        !operationalDiffers &&
        !customerDiffers &&
        unbalanced === 0 &&
        coverageOk,
      generatedAt: new Date(),
      journal: { vouchers: vouchers.length, unbalanced },
      accounts,
      customers,
      coverage,
    };
  }
}
