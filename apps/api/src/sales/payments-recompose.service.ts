import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FixedAccount,
  InvoiceStatus,
  LedgerEntryType,
  PaymentMethod,
  Prisma,
  Role,
  VoucherSourceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PostingService } from '../vouchers/posting.service';
import { isTodayInTehran } from '../common/tehran-day';
import { LedgerService } from './ledger.service';
import { lockInvoice } from './line-lock';
import { RecomposePaymentsDto } from './dto/recompose-payments.dto';

/**
 * اصلاحِ **نحوهٔ پرداختِ** یک فاکتورِ ثبت‌شده.
 *
 * سناریوی واقعیِ پیشخوان: فاکتورِ ۱۰۰ میلیونی ثبت شده و همه‌اش «کارتخوان» زده
 * شده، ولی بعد معلوم می‌شود ۳۰ میلیون نقد بوده و ۷۰ میلیون نسیه. تا پیش از این
 * هیچ مسیری این را نمی‌پذیرفت: نه اصلاحیه (تغییرِ صفر رد می‌شد) و نه تسویهٔ
 * اختلاف (اختلافی وجود ندارد).
 *
 * کاری که این سرویس می‌کند «تسویهٔ از نو» است، نه ثبتِ اختلاف:
 *
 *   ۱. تفاضلِ تقسیمِ فعلی با تقسیمِ خواسته‌شده، **به‌ازای هر روش** حساب می‌شود.
 *      کارتِ ۱۰۰م که نباید باشد ⇒ ردیفِ منفیِ ۱۰۰م (خنثی‌سازی). نقدِ ۳۰م که
 *      واقعی است ⇒ ردیفِ مثبتِ ۳۰م.
 *   ۲. ردیف‌های مالی همه `Payment` می‌مانند — همان جدولی که گزارشِ نقد و
 *      کارتخوان و صورتحساب از آن می‌خوانند، پس همه‌ی جمع‌ها بی‌هیچ تغییرِ کدی
 *      درست می‌شوند (شکلِ همان «برگشتِ پرداخت»: ردیفِ منفی).
 *   ۳. کلِ عملیات **یک ردیفِ دفتر** و **یک سند خودکار** می‌گیرد با برچسبِ
 *      «اصلاح نحوهٔ پرداخت» و متنِ «قبل: … · بعد: …». اگر تقسیم فقط جای نقد و
 *      کارت را عوض کند (نسیه ثابت)، پولی در حساب‌ها جابه‌جا نشده و سندی ساخته
 *      نمی‌شود — سندِ بی‌محتوا، تاریخ را شلوغ می‌کند.
 *   ۴. اگر فاکتور **بدونِ مشتری** باشد و نسیه بخواهد، همان‌جا مشتری می‌گیرد و
 *      سررسیدش را از اعتبارِ همان مشتری می‌سازد (قاعدهٔ مسیرِ فروش).
 *
 * محدودیت‌های عمدی: چک (مسیرِ خودش را دارد)، فاکتوری که پولش از راه «دریافت»
 * خورده (تخصیصِ رسید بازنویسی‌شدنی نیست)، و فروشنده روی فاکتورهای گذشته (فقط
 * مدیر). دلیلِ همه‌شان در پیامِ فارسی به خودِ کاربر گفته می‌شود.
 */
@Injectable()
export class PaymentsRecomposeService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
    private posting: PostingService,
  ) {}

  // ---------- خواندن ----------

  /**
   * وضعیتِ تسویهٔ یک فاکتور — خوراکِ پنلِ اصلاح.
   *
   * `blockedReason` عمداً پیامِ آمادهٔ فارسی است، نه کدِ خطا: همین متن روی پنل
   * به فروشنده نشان داده می‌شود و باید خودش توضیح بدهد چرا نمی‌شود.
   */
  async settlement(invoiceId: string, role?: Role) {
    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        paidAmount: true,
        dueAmount: true,
        dueDate: true,
        createdAt: true,
        customerId: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
        payments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            method: true,
            amount: true,
            note: true,
            createdAt: true,
            cheque: { select: { id: true } },
          },
        },
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        error: 'INVOICE_NOT_FOUND',
        message: 'فاکتور پیدا نشد',
      });
    }

    /*
     * مبلغِ فاکتور، خودِ `total` است.
     *
     * مرجوعیِ اعتباری و اصلاحیه از قبل داخل `total` نشسته‌اند (returns.service
     * و corrections.service)؛ پیش‌تر همین‌جا دلتای مرجوعی به `total` اضافه
     * می‌شد و فاکتورِ ۲۰ میلیونی «۴۰» نشان می‌داد. حالا فیلد خودش درست است و
     * هیچ جبرانی لازم نیست.
     */
    const total = invoice.total;

    const byMethod = new Map<PaymentMethod, number>();
    for (const p of invoice.payments) addTo(byMethod, p.method, p.amount);

    const hasCheque = invoice.payments.some((p) => !!p.cheque);
    const allocations = await this.prisma.receiptAllocation.count({
      where: { invoiceId },
    });

    const blockedReason = this.blockedReason({
      status: invoice.status,
      paidAmount: invoice.paidAmount,
      paidFromRows: nonCreditTotal(byMethod),
      hasCheque,
      hasAllocations: allocations > 0,
      createdAt: invoice.createdAt,
      role,
    });

    return {
      invoice: {
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        total,
        paidAmount: invoice.paidAmount,
        dueAmount: invoice.dueAmount,
        dueDate: invoice.dueDate,
        customerId: invoice.customerId,
        customer: invoice.customer
          ? {
              ...invoice.customer,
              fullName: [invoice.customer.firstName, invoice.customer.lastName]
                .filter(Boolean)
                .join(' '),
            }
          : null,
      },
      /** ردیف‌های خامِ پرداخت — منفی‌ها هم دیده می‌شوند (تاریخچه پاک نمی‌شود). */
      payments: invoice.payments.map((p) => ({
        id: p.id,
        method: p.method,
        amount: p.amount,
        note: p.note,
        createdAt: p.createdAt,
      })),
      /** جمعِ خالصِ هر روش — همان چیزی که پنل باید از آن شروع کند. */
      byMethod: RECOMPOSE_METHODS.map((method) => ({
        method,
        amount: byMethod.get(method) ?? 0,
      })),
      /** نقدی که واقعاً گرفته شده (نقد + کارت) — پایه‌ی محاسبه‌ی نسیه. */
      received: nonCreditTotal(byMethod),
      credit: byMethod.get(PaymentMethod.CREDIT) ?? 0,
      canRecompose: !blockedReason,
      blockedReason,
      /** فاکتور مشتری ندارد؛ برای نسیه‌کردن باید همین‌جا مشتری انتخاب شود. */
      needsCustomer: !invoice.customerId,
      editableMethods: RECOMPOSE_METHODS,
    };
  }

  // ---------- نوشتن ----------

  async recompose(
    invoiceId: string,
    dto: RecomposePaymentsDto,
    userId?: string,
    role?: Role,
  ) {
    const reason = dto.reason?.trim() ?? '';

    /* تقسیمِ خواسته‌شده، جمع‌شده به‌ازای هر روش. */
    const wanted = new Map<PaymentMethod, number>();
    for (const row of dto.payments) {
      if (row.method === PaymentMethod.CHEQUE) {
        throw new BadRequestException({
          error: 'CHEQUE_NOT_EDITABLE',
          message: 'چک از این مسیر اصلاح نمی‌شود — چک مسیر خودش را دارد',
        });
      }
      if (row.amount <= 0) continue;
      addTo(wanted, row.method, row.amount);
    }

    const replayed = await this.prisma.$transaction(async (tx) => {
      const invoice = await lockInvoice(tx, invoiceId);
      if (!invoice) {
        throw new NotFoundException({
          error: 'INVOICE_NOT_FOUND',
          message: 'فاکتور پیدا نشد',
        });
      }
      if (invoice.status === InvoiceStatus.CANCELLED) {
        throw new ConflictException({
          error: 'INVOICE_NOT_CORRECTABLE',
          message: 'فاکتور باطل‌شده قابل اصلاح نیست',
        });
      }

      /*
       * retry شبکه با همان کلید ⇒ همان نتیجه. ردیف‌های پرداختِ این عملیات با
       * کلیدِ عملیات مهر شده‌اند، پس وجودِ حتی یک‌شان یعنی این درخواست قبلاً
       * ثبت شده است.
       */
      const already = await tx.payment.findFirst({
        where: { invoiceId, operationKey: dto.idempotencyKey },
        select: { id: true },
      });
      if (already) return true;

      if (
        role === Role.SALES &&
        invoice.status !== InvoiceStatus.OPEN &&
        !isTodayInTehran(invoice.createdAt)
      ) {
        throw new ForbiddenException({
          error: 'RECOMPOSE_REQUIRES_MANAGER',
          message: 'اصلاح فاکتورهای گذشته را فقط مدیر می‌تواند ثبت کند',
        });
      }

      const rows = await tx.payment.findMany({
        where: { invoiceId },
        select: {
          method: true,
          amount: true,
          cheque: { select: { id: true } },
        },
      });
      if (rows.some((r) => !!r.cheque)) {
        throw new BadRequestException({
          error: 'CHEQUE_NOT_EDITABLE',
          message: 'این فاکتور با چک پرداخت شده — چک مسیر خودش را دارد',
        });
      }

      const oldByMethod = new Map<PaymentMethod, number>();
      for (const r of rows) addTo(oldByMethod, r.method, r.amount);
      const oldPaid = nonCreditTotal(oldByMethod);

      /*
       * پولِ آمده از «دریافت/تسویه» پرداختِ روی فاکتور نمی‌سازد؛ فقط تخصیص
       * (ReceiptAllocation) و `paidAmount` را عوض می‌کند. بازنویسیِ تقسیم آنجا
       * یعنی به‌هم‌ریختنِ تخصیصِ رسید بین چند فاکتور — پس اینجا بسته است و
       * کاربر به صفحهٔ دریافت هدایت می‌شود. شرطِ دوم نگهبانِ دومِ همان حالت است:
       * اگر جمعِ ردیف‌ها با `paidAmount` نخواند، پولی از جای دیگری آمده.
       */
      const allocations = await tx.receiptAllocation.count({
        where: { invoiceId },
      });
      if (allocations > 0 || oldPaid !== invoice.paidAmount) {
        throw new BadRequestException({
          error: 'PAYMENT_FROM_RECEIPT',
          message:
            'پول این فاکتور از راه «دریافت/تسویه» خورده — اصلاحش از صفحهٔ دریافت انجام می‌شود',
        });
      }

      /* ---- مشتری: فقط فاکتورِ بدونِ مشتری مشتری می‌گیرد. ---- */
      if (
        dto.customerId &&
        invoice.customerId &&
        dto.customerId !== invoice.customerId
      ) {
        throw new ConflictException({
          error: 'CUSTOMER_ALREADY_SET',
          message:
            'این فاکتور از قبل مشتری دارد — مشتری‌اش از اینجا عوض نمی‌شود',
        });
      }
      const customerId = invoice.customerId ?? dto.customerId ?? null;
      if (!invoice.customerId && dto.customerId) {
        // قبل از هر ردیفِ مالی: سندِ بدهی باید جایی برای نشستن داشته باشد.
        await tx.saleInvoice.update({
          where: { id: invoiceId },
          data: { customerId: dto.customerId },
        });
      }

      /* ---- عددها ----
       *
       * پایه، خودِ `total` فاکتور است؛ مرجوعیِ اعتباری و اصلاحیه از قبل
       * داخلش نشسته‌اند.
       *
       * سقفِ پرداخت عمداً `max(total, پرداختِ فعلی)` است: فاکتوری که بعدش
       * مرجوعیِ اعتباری خورده و پولش قبلاً گرفته شده، پرداختِ ثبت‌شده‌اش از
       * `total` بیشتر است و باید بتوان تقسیمش را اصلاح کرد، نه اینکه قفل شود.
       */
      const total = invoice.total;
      const newPaid = nonCreditTotal(wanted);
      const ceiling = Math.max(total, oldPaid);
      if (newPaid > ceiling) {
        throw new BadRequestException({
          error: 'OVERPAYMENT',
          message: 'مجموعِ پرداخت‌ها از مبلغ فاکتور بیشتر است',
        });
      }
      const debtAfter = Math.max(0, total - newPaid);
      const creditUsed = wanted.get(PaymentMethod.CREDIT) ?? 0;
      if (creditUsed > debtAfter) {
        throw new BadRequestException({
          error: 'CREDIT_EXCEEDS_REMAINDER',
          message: 'مبلغِ نسیه از باقی‌ماندهٔ فاکتور بیشتر است',
        });
      }
      if (debtAfter > 0 && !customerId) {
        throw new BadRequestException({
          error: 'CUSTOMER_REQUIRED_FOR_CREDIT',
          message: 'برای نسیه‌کردنِ این مبلغ، مشتری لازم است',
        });
      }

      /* ---- تفاضل: خنثی‌سازیِ تقسیمِ قبلی و ثبتِ تقسیمِ تازه ---- */
      let changed = false;
      const methods = new Set<PaymentMethod>([
        ...oldByMethod.keys(),
        ...wanted.keys(),
      ]);

      for (const method of methods) {
        // نسیه پول نیست؛ ردیفش فقط برای خواناییِ خودِ فاکتور است و
        // `paidAmount`/`dueAmount` از آن حساب نمی‌شوند.
        if (method === PaymentMethod.CREDIT) continue;

        const delta =
          (wanted.get(method) ?? 0) - (oldByMethod.get(method) ?? 0);
        if (delta === 0) continue;
        changed = true;

        await tx.payment.create({
          data: {
            invoiceId,
            method,
            amount: delta,
            operationKey: dto.idempotencyKey,
            note:
              delta < 0
                ? `اصلاح نحوهٔ پرداخت — برداشتنِ ${METHOD_FA[method]} ${money(-delta)}`
                : `اصلاح نحوهٔ پرداخت — ${METHOD_FA[method]} ${money(delta)}`,
          },
        });

        await tx.saleInvoice.update({
          where: { id: invoiceId },
          data: {
            paidAmount: { increment: delta },
            dueAmount: { decrement: delta },
          },
        });
      }

      const oldCredit = oldByMethod.get(PaymentMethod.CREDIT) ?? 0;
      if (creditUsed !== oldCredit) {
        changed = true;
        await tx.payment.create({
          data: {
            invoiceId,
            method: PaymentMethod.CREDIT,
            amount: creditUsed - oldCredit,
            operationKey: dto.idempotencyKey,
            note: 'اصلاح نحوهٔ پرداخت — بخشِ نسیه',
          },
        });
      }

      const attachedCustomer = !invoice.customerId && !!dto.customerId;
      if (!changed && !attachedCustomer) {
        throw new BadRequestException({
          error: 'NO_CHANGE',
          message: 'تقسیمِ پرداخت تغییری نکرده — چیزی برای ثبت نیست',
        });
      }

      /* ---- سررسید: نسیه سررسید می‌خواهد، تسویه‌شده نباید سررسید داشته باشد. ---- */
      if (debtAfter > 0 && customerId && !invoice.dueDate) {
        await tx.saleInvoice.update({
          where: { id: invoiceId },
          data: { dueDate: await this.dueDateFor(tx, customerId) },
        });
      } else if (debtAfter === 0 && invoice.dueDate) {
        await tx.saleInvoice.update({
          where: { id: invoiceId },
          data: { dueDate: null },
        });
      }

      /*
       * ---- اثرِ مالی: یک ردیفِ دفتر و یک سند برای کلِ عملیات ----
       *
       * `debtDelta` همان تفاضلِ بدهیِ مشتری است. اگر تقسیم فقط جای نقد و کارت
       * را عوض کرده باشد صفر می‌شود و هیچ سندی ساخته نمی‌شود: پولی جابه‌جا نشده
       * و هر دو روش هم به حسابِ «صندوق» می‌روند. سندِ صفر، فقط تاریخ را شلوغ
       * می‌کند.
       */
      const debtDelta = invoice.paidAmount - newPaid;
      const splitNote =
        `اصلاح نحوهٔ پرداخت فاکتور ${invoice.number} — قبل: ` +
        `${describeSplit(oldByMethod)} · بعد: ${describeSplit(wanted)}` +
        (reason ? `: ${reason}` : '');

      if (debtDelta !== 0 && customerId) {
        await this.ledger.record(tx, {
          customerId,
          type: LedgerEntryType.RECOMPOSE,
          amount: debtDelta,
          invoiceId,
          note: splitNote,
          userId: userId ?? null,
        });

        await this.posting.post(tx, {
          sourceType: VoucherSourceType.PAYMENT_RECOMPOSE,
          sourceId: invoiceId,
          idempotencyKey: `payment-recompose:${dto.idempotencyKey}`,
          lines: [
            {
              account: FixedAccount.CUSTOMERS,
              amount: debtDelta,
              customerId,
              note: 'اصلاح نحوهٔ پرداخت',
            },
            {
              account: FixedAccount.CASH,
              amount: -debtDelta,
              note: 'اصلاح نحوهٔ پرداخت',
            },
          ],
          note: splitNote,
          userId: userId ?? null,
        });
      }

      /*
       * خودبررسی: فاکتور باید دقیقاً با تقسیمِ خواسته‌شده بخواند. اگر نخواند،
       * یعنی جایی از تاریخچه (رسیدِ نادیده، ردیفِ گم‌شده) با تصورِ ما نمی‌خواند
       * و بهتر است کلِ عملیات برگردد تا فاکتوری با عددِ نیمه‌درست نماند.
       */
      const after = await tx.saleInvoice.findUnique({
        where: { id: invoiceId },
        select: { paidAmount: true, dueAmount: true },
      });
      if (
        !after ||
        after.paidAmount !== newPaid ||
        after.dueAmount !== debtAfter
      ) {
        throw new ConflictException({
          error: 'RECOMPOSE_STATE_MISMATCH',
          message:
            'وضعیتِ پرداختِ فاکتور با تقسیمِ خواسته‌شده نمی‌خواند — فاکتور را دوباره باز کنید',
        });
      }

      return false;
    });

    if (!replayed) {
      this.realtime.broadcast({ type: 'payment.recomposed', invoiceId });
    }

    return this.settlement(invoiceId, role);
  }

  // ---------- کمکی ----------

  /** دلیلِ خاموش‌بودنِ اصلاح — به زبانِ کاربر، نه کدِ خطا. */
  private blockedReason(input: {
    status: InvoiceStatus;
    paidAmount: number;
    paidFromRows: number;
    hasCheque: boolean;
    hasAllocations: boolean;
    createdAt: Date;
    role?: Role;
  }): string | null {
    if (input.status === InvoiceStatus.CANCELLED) {
      return 'فاکتور باطل‌شده قابل اصلاح نیست';
    }
    if (input.hasCheque) {
      return 'این فاکتور با چک پرداخت شده — چک مسیر خودش را دارد و از اینجا اصلاح نمی‌شود';
    }
    if (input.hasAllocations || input.paidFromRows !== input.paidAmount) {
      return 'پول این فاکتور از راه «دریافت/تسویه» خورده — اصلاحش از صفحهٔ دریافت انجام می‌شود';
    }
    if (
      input.role === Role.SALES &&
      input.status !== InvoiceStatus.OPEN &&
      !isTodayInTehran(input.createdAt)
    ) {
      return 'اصلاح فاکتورهای گذشته را فقط مدیر می‌تواند ثبت کند';
    }
    return null;
  }

  /** سررسیدِ بخشِ نسیه — همان قاعدهٔ مسیرِ فروش: امروز + اعتبارِ مشتری، پایانِ روز. */
  private async dueDateFor(
    tx: Prisma.TransactionClient,
    customerId: string,
  ): Promise<Date> {
    const customer = await tx.customer.findUnique({
      where: { id: customerId },
      select: { creditDays: true },
    });

    const due = new Date();
    due.setDate(due.getDate() + (customer?.creditDays ?? 0));
    due.setHours(23, 59, 59, 999);
    return due;
  }
}

/**
 * روش‌هایی که در بازنویسیِ تقسیم جا دارند: نقد، کارتخوان، نسیه.
 *
 * چک عمداً نیست. `PaymentMethod.CHEQUE` فقط در ورودیِ DTO رد می‌شود تا
 * خواننده بفهمد چرا غایب است.
 */
const RECOMPOSE_METHODS: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CARD,
  PaymentMethod.CREDIT,
];

/** برچسبِ فارسیِ روش‌ها — برای متنِ یادداشت‌هایی که کاربر می‌خواند. */
const METHOD_FA: Record<PaymentMethod, string> = {
  CASH: 'نقد',
  CARD: 'کارتخوان',
  CHEQUE: 'چک',
  CREDIT: 'نسیه',
};

const faNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 0 });

function money(amount: number): string {
  return faNumber.format(amount);
}

function addTo(
  map: Map<PaymentMethod, number>,
  method: PaymentMethod,
  amount: number,
): void {
  map.set(method, (map.get(method) ?? 0) + amount);
}

/**
 * جمعِ پرداخت‌های نقدی (هر چیزی جز نسیه).
 *
 * همان تعریفی که `SaleInvoice.paidAmount` دارد — همین یکی‌بودن است که تضمین
 * می‌کند `paidAmount` فاکتور و جمعِ ردیف‌های پرداخت هیچ‌وقت از هم جدا نشوند.
 */
function nonCreditTotal(byMethod: Map<PaymentMethod, number>): number {
  let sum = 0;
  for (const [method, amount] of byMethod) {
    if (method !== PaymentMethod.CREDIT) sum += amount;
  }
  return sum;
}

/** توصیفِ خوانای یک تقسیم — «نقد ۳۰٬۰۰۰٬۰۰۰ + نسیه ۷۰٬۰۰۰٬۰۰۰». */
function describeSplit(byMethod: Map<PaymentMethod, number>): string {
  const parts: string[] = [];
  for (const method of [
    PaymentMethod.CASH,
    PaymentMethod.CARD,
    PaymentMethod.CHEQUE,
    PaymentMethod.CREDIT,
  ]) {
    const amount = byMethod.get(method) ?? 0;
    if (amount !== 0) parts.push(`${METHOD_FA[method]} ${money(amount)}`);
  }
  return parts.length ? parts.join(' + ') : 'بدونِ پرداخت';
}
