import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PaymentMethod, LedgerEntryType } from '@prisma/client';

import { computeChequeCharge, MAX_CHARGE_RATIO } from '../common/cheque-charge';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { EventsGateway } from '../realtime/events.gateway';


/**
 * شکل ورودی از خودِ DTO می‌آید، نه از یک interface موازی.
 *
 * دو تعریف جدا یعنی تعریفی که `ValidationPipe` می‌بیند با تعریفی که سرویس
 * انتظار دارد می‌توانند از هم جدا بیفتند — و دقیقاً همین‌جا بود که اندپوینت
 * سال‌ها بدون هیچ اعتبارسنجی کار می‌کرد.
 */
export type CreateReceiptInput = CreateReceiptDto;


@Injectable()
export class ReceiptsService {

  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
  ) {}


  /**
   * ثبت دریافت وجه از مشتری بابت بدهی قبلی.
   *
   * پول به **قدیمی‌ترین فاکتور بدهکار اول** تخصیص داده می‌شود و تا جایی که
   * مبلغ برسد جلو می‌رود. هر تخصیص جداگانه ثبت می‌شود، پس بعداً می‌شود گفت
   * کدام بخش از پول بابت کدام فاکتور بوده — «مانده‌ی مشتری» عددی نیست که
   * کسی نتواند ازش دفاع کند.
   *
   * موجودی و لجر انبار اصلاً درگیر نمی‌شوند؛ این یک حرکت مالی است نه انبار.
   */
  async create(input: CreateReceiptInput, userId?: string) {

    /*
     * سطرهای پرداخت — تسویه‌ی ترکیبی (نقد + کارت + چک) در یک رسید.
     * شکلِ قدیمی (amount/method/cheque) همچنان پذیرفته می‌شود و به یک سطر
     * تبدیل می‌گردد تا کلاینت‌های قدیمی نشکنند.
     */
    const rows =
      input.payments && input.payments.length > 0
        ? input.payments
        : input.method && input.amount
          ? [{ method: input.method, amount: input.amount, cheque: input.cheque, note: undefined as string | undefined }]
          : [];

    if (rows.length === 0) {
      throw new BadRequestException({
        error: 'INVALID_AMOUNT',
        message: 'مبلغ دریافتی باید بزرگ‌تر از صفر باشد',
      });
    }

    rows.forEach((p, i) => {
      // نسیه یعنی «پول ندادم» — به‌عنوان روش دریافت بی‌معناست.
      if (p.method === PaymentMethod.CREDIT) {
        throw new BadRequestException({
          error: 'INVALID_METHOD',
          paymentIndex: i,
          message: 'نسیه روش دریافت وجه نیست',
        });
      }

      if (!p.amount || p.amount <= 0) {
        throw new BadRequestException({
          error: 'INVALID_AMOUNT',
          paymentIndex: i,
          message: 'مبلغ دریافتی باید بزرگ‌تر از صفر باشد',
        });
      }

      if (p.method === PaymentMethod.CHEQUE && !p.cheque) {
        throw new BadRequestException({
          error: 'CHEQUE_DETAILS_REQUIRED',
          paymentIndex: i,
          message: 'برای دریافت چکی، مشخصات چک الزامی است',
        });
      }
    });

    /*
     * ---- تفاوتِ فروشِ مدت‌دار (سودِ چک) ----
     *
     * همان قرارداد مسیرِ فاکتور: `amount` هر سطر **پایه** است (چقدر از بدهی را
     * می‌پوشاند)، و مبلغی که روی کاغذِ چک نوشته می‌شود پایه + سود است.
     */
    const priced = rows.map((p) => {
      const c = p.cheque;
      if (p.method !== PaymentMethod.CHEQUE || !c) {
        return { ...p, charge: 0, rateBp: 0, months: 0 };
      }

      const rateBp = c.rateBp ?? 0;
      const months = c.months ?? 0;
      const computed = computeChequeCharge({
        base: p.amount,
        rateBp,
        months,
        mode: c.rateMode ?? 'MONTHLY',
      });
      const charge = Math.min(c.charge ?? computed, p.amount * MAX_CHARGE_RATIO);

      return { ...p, charge, rateBp, months, amount: p.amount + charge };
    });

    const financeCharge = priced.reduce((sum, p) => sum + p.charge, 0);
    const amount = priced.reduce((sum, p) => sum + p.amount, 0);

    if (input.idempotencyKey) {
      const existing = await this.prisma.receipt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return this.findOne(existing.id);
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
    });

    if (!customer) {
      throw new NotFoundException({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'مشتری پیدا نشد',
      });
    }

    const receiptId = await this.prisma.$transaction(async (tx) => {

      // قدیمی‌ترین اول — همان چیزی که در مغازه اتفاق می‌افتد.
      const debts = await tx.saleInvoice.findMany({
        where: {
          customerId: input.customerId,
          /*
           * فاکتورِ جاریِ حساب باز هم باید پول بگیرد. وگرنه مشتری‌ای که فقط تب
           * دارد، از صفحه‌ی «دریافت» پولش در دفتر می‌نشست ولی هیچ فاکتوری
           * تسویه نمی‌شد — و مانده‌ی فاکتورها با مانده‌ی دفتر از هم می‌افتاد.
           */
          status: { not: 'CANCELLED' },
          dueAmount: { gt: 0 },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true, dueAmount: true, paidAmount: true },
      });

      /*
       * بدهیِ واقعی از **دفتر** می‌آید، نه از جمعِ فاکتورهای باز.
       *
       * قبلاً اینجا `dueAmount` فاکتورها جمع می‌شد. یعنی مشتری‌ای که بدهی‌اش
       * مانده‌ی اول دوره بود و هیچ فاکتور بازی نداشت، اصلاً نمی‌توانست پول
       * بدهد — «این مشتری بدهی ثبت‌شده‌ای ندارد» می‌گرفت، در حالی که صفحه‌ی
       * خودش بالای همان فرم می‌نوشت چند میلیون بدهکار است.
       *
       * تخصیص به فاکتورها سرِ جایش می‌ماند (تا بدانیم پول بابت کدام فاکتور
       * بوده)، ولی «چقدر بدهکار است» فقط یک منبع دارد.
       */
      /*
       * سود **قبل** از خواندنِ بدهی در دفتر می‌نشیند — ترتیبش اجباری است.
       *
       * مشتری ۱۰۰ میلیون بدهکار است و چکِ ۱۰۶ میلیونی می‌دهد. اگر اول رسید ثبت
       * شود، مبلغ از بدهی بیشتر است و یا `AMOUNT_EXCEEDS_DEBT` می‌خورد یا با
       * `allowOverpayment` مشتری را ۶ میلیون بستانکار می‌کند. با ثبتِ سود، بدهی
       * اول ۱۰۶ می‌شود و بعد رسیدِ ۱۰۶ آن را صاف می‌کند.
       */
      if (financeCharge > 0) {
        await this.ledger.record(tx, {
          customerId: input.customerId,
          type: LedgerEntryType.FINANCE_CHARGE,
          amount: financeCharge,
          userId: userId ?? null,
          note: 'تفاوت فروش مدت‌دار (چک)',
        });
      }

      const totalDebt = await this.ledger.balance(input.customerId, tx);

      if (totalDebt <= 0) {
        throw new BadRequestException({
          error: 'NO_DEBT',
          message:
            totalDebt < 0
              ? 'این مشتری بستانکار است و بدهی ندارد'
              : 'این مشتری بدهی ثبت‌شده‌ای ندارد',
        });
      }

      /*
       * پیش‌دریافت: مازاد رد نمی‌شود، ولی بی‌صدا هم ثبت نمی‌شود.
       *
       * مشتری واقعاً علی‌الحساب می‌دهد («این را بگیر، بقیه‌اش بماند»). قبلاً کل
       * رسید رد می‌شد و فروشنده مجبور بود عدد را دستکاری کند. حالا کلاینت باید
       * صراحتاً `allowOverpayment` بفرستد؛ بدون آن همان خطای قبلی می‌آید تا
       * مبلغِ اشتباهِ تایپی بی‌سروصدا به بستانکاری تبدیل نشود.
       */
      const overpayment = Math.max(0, amount - totalDebt);

      if (overpayment > 0 && !input.allowOverpayment) {
        throw new BadRequestException({
          error: 'AMOUNT_EXCEEDS_DEBT',
          amount,
          totalDebt,
          overpayment,
          message: `مبلغ دریافتی از کل بدهی مشتری بیشتر است (بدهی: ${totalDebt})`,
        });
      }

      const receipt = await tx.receipt.create({
        data: {
          customerId: input.customerId,
          userId: userId ?? null,
          amount,
          // روشِ نخستین سطر — برای سازگاریِ گزارش‌های قدیمی؛ تفکیک در ReceiptPayment.
          method: priced[0].method,
          note: input.note ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });

      /*
       * سطرهای پرداخت — همان الگوی Payment روی فاکتور. هر سطر چک، چکِ خودش را
       * می‌سازد تا گزارش چک‌ها و «در جریان وصول» درست بمانند.
       */
      for (const p of priced) {
        const payment = await tx.receiptPayment.create({
          data: {
            receiptId: receipt.id,
            method: p.method,
            amount: p.amount,
            note: p.note ?? null,
          },
        });

        if (p.method === PaymentMethod.CHEQUE && p.cheque) {
          await tx.cheque.create({
            data: {
              receiptPaymentId: payment.id,
              number: p.cheque.number,
              bankName: p.cheque.bankName ?? null,
              branch: p.cheque.branch ?? null,
              holderName: p.cheque.holderName ?? null,
              dueDate: new Date(p.cheque.dueDate),
              charge: p.charge,
              rateBp: p.rateBp,
              months: p.months,
            },
          });
        }
      }

      /*
       * مازادِ پیش‌دریافت به هیچ فاکتوری تخصیص نمی‌یابد و همین درست است: بابت
       * چیزی که هنوز خریده نشده، فاکتوری وجود ندارد. حلقه وقتی فاکتورها تمام
       * شوند خودش می‌ایستد و مازاد فقط در دفتر می‌ماند.
       */
      let remaining = amount;

      for (const debt of debts) {
        if (remaining <= 0) break;

        const applied = Math.min(remaining, debt.dueAmount);
        if (applied <= 0) continue;

        /*
         * نوشتنِ شرطی و نسبی، نه مقدار مطلق.
         *
         * قبلاً اینجا `paidAmount: debt.paidAmount + applied` نوشته می‌شد — یعنی
         * عددی که از یک خواندنِ قبل از تراکنش آمده بود. دو رسیدِ هم‌زمان برای یک
         * مشتری (یا رسید و مرجوعی روی یک فاکتور) هر دو همان مانده را می‌خواندند و
         * دومی نوشته‌ی اولی را پاک می‌کرد: پول گرفته شده بود ولی مانده‌ی فاکتور
         * برنگشته بود. دفتر درست می‌ماند و dueAmount غلط — دقیقاً همان اختلافی که
         * تفکیک سنیِ بدهکاران را بی‌اعتبار می‌کند.
         *
         * شرطِ `dueAmount >= applied` در لحظه‌ی نوشتن دوباره ارزیابی می‌شود. اگر
         * رسیدِ هم‌زمانی این فاکتور را زودتر تسویه کرده باشد count صفر می‌شود،
         * این فاکتور رد می‌شود و پول برای فاکتور بعدیِ صف می‌ماند.
         */
        const claimed = await tx.saleInvoice.updateMany({
          where: { id: debt.id, dueAmount: { gte: applied } },
          data: {
            paidAmount: { increment: applied },
            dueAmount: { decrement: applied },
          },
        });

        if (claimed.count === 0) continue;

        // تخصیص فقط بعد از کسرِ موفق ثبت می‌شود، وگرنه سندی می‌ماند که پشتش
        // هیچ کاهشی در مانده‌ی فاکتور نیست.
        await tx.receiptAllocation.create({
          data: { receiptId: receipt.id, invoiceId: debt.id, amount: applied },
        });

        remaining -= applied;
      }

      /*
       * کاهش بدهی در دفتر — در همان تراکنشِ رسید.
       *
       * مبلغِ کاملِ رسید ثبت می‌شود، نه جمعِ تخصیص‌ها. این دو همیشه برابرند
       * (بیش از بدهی پذیرفته نمی‌شود)، ولی اگر روزی پیش‌دریافت اضافه شد، پولی
       * که واقعاً گرفته‌ایم باید در حساب مشتری دیده شود حتی اگر هنوز به فاکتوری
       * نچسبیده باشد.
       */
      await this.ledger.record(tx, {
        customerId: input.customerId,
        type: LedgerEntryType.RECEIPT,
        amount: -amount,
        receiptId: receipt.id,
        userId: userId ?? null,
        note: [
          `رسید ${receipt.number}`,
          rows.some((p) => p.method === PaymentMethod.CHEQUE)
            ? 'چک، تا وصول در جریان است'
            : '',
          // پیش‌دریافت باید در گردش حساب دیده شود، وگرنه ماه بعد کسی نمی‌فهمد
          // چرا مانده منفی است.
          overpayment > 0 ? `شامل ${overpayment} پیش‌دریافت` : '',
        ]
          .filter(Boolean)
          .join(' — '),
      });

      return receipt.id;
    });

    // رسید ثبت شد → مانده‌ی حساب مشتری عوض شد؛ همان لحظه اعلان کن.
    this.realtime.broadcast({
      type: 'receipt.created',
      customerId: input.customerId,
    });

    return this.findOne(receiptId);
  }


  async findOne(id: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, fullName: true } },
        payments: {
          include: { cheque: true },
        },
        allocations: {
          include: { invoice: { select: { id: true, number: true, total: true } } },
        },
      },
    });

    if (!receipt) {
      throw new NotFoundException({
        error: 'RECEIPT_NOT_FOUND',
        message: 'رسید پیدا نشد',
      });
    }

    return {
      ...receipt,
      customerName: [receipt.customer.firstName, receipt.customer.lastName]
        .filter(Boolean)
        .join(' '),
    };
  }


  async findAll(q: { customerId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));

    const where = q.customerId ? { customerId: q.customerId } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.receipt.findMany({
        where,
      include: {
        customer: { select: { firstName: true, lastName: true } },
        user: { select: { fullName: true } },
        payments: {
          include: {
            cheque: { select: { number: true, dueDate: true, status: true } },
          },
        },
      },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.receipt.count({ where }),
    ]);

    return {
      data: data.map((r) => ({
        ...r,
        customerName: [r.customer.firstName, r.customer.lastName]
          .filter(Boolean)
          .join(' '),
      })),
      meta: { total, page, limit, lastPage: Math.max(1, Math.ceil(total / limit)) },
    };
  }
}
