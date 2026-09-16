import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  FixedAccount,
  LedgerEntryType,
  PaymentMethod,
  Prisma,
  VoucherSourceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { lockInvoice } from './line-lock';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { EventsGateway } from '../realtime/events.gateway';
import { PostingService } from '../vouchers/posting.service';

/**
 * برگشتِ پرداخت — خنثی‌سازیِ یک پرداختِ ثبت‌شده روی فاکتور.
 *
 * سناریو: جنس فروخته شد، «پرداخت کرده» زده شد، اما کارتخوان تراکنش را برگشت
 * می‌زند یا بانک رد می‌کند. فاکتور و کالا سرِ جایشان می‌مانند؛ فقط پول برگشته.
 * این سند سه کار می‌کند — همه داخل **یک تراکنش** و پشتِ قفلِ فاکتور:
 *
 *   ۱. ردیفِ Payment با مبلغِ **منفی** — همه‌ی جمع‌های مشتق (صورتحساب،
 *      گزارشِ نقدِ روزانه) بدون هیچ تغییرِ کد، عددِ درست می‌گیرند.
 *   ۲. مانده‌ی فاکتور برمی‌گردد: `paidAmount` کم، `dueAmount` زیاد — با
 *      نوشتنِ نسبی (`increment/decrement`) تا رسیدِ هم‌زمان پاک نشود.
 *   ۳. ردیفِ دفترِ PAYMENT_REVERSED (مثبت = بدهی زیاد) — «مانده = SUM»
 *      بی‌درنگ درست می‌ماند و مشتری در F3 بدهکار دیده می‌شود.
 *
 * تاریخچه حذف نمی‌شود؛ پرداختِ اصلی سرِ جایش می‌ماند و این سند آن را خنثی
 * می‌کند — مثل برگشتِ خورده‌ی حسابداری، نه پاک‌کردنِ سند.
 */
@Injectable()
export class PaymentReversalsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
    private posting: PostingService,
  ) {}

  /** یک برگشت با جزئیاتش — صدا‌زده هم از `reverse` هم از مسیرِ idempotent. */
  private async findOne(id: string) {
    const reversal = await this.prisma.paymentReversal.findUnique({
      where: { id },
      include: {
        invoice: { select: { number: true, customerId: true } },
        user: { select: { username: true } },
      },
    });
    if (!reversal) {
      throw new NotFoundException({
        error: 'REVERSAL_NOT_FOUND',
        message: 'سند برگشت پرداخت پیدا نشد',
      });
    }
    return reversal;
  }

  async reverse(invoiceId: string, dto: ReversePaymentDto, userId?: string) {
    /* دلیلِ برگشت اختیاری است — خنثی‌سازی نباید به تایپِ دلیل گره بخورد. */
    const reason = dto.reason?.trim() ?? '';

    if (dto.idempotencyKey) {
      const existing = await this.prisma.paymentReversal.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      // retry با همان کلید = همان سند، بدون اثرِ اضافه.
      if (existing) return this.findOne(existing.id);
    }

    if (dto.method === PaymentMethod.CREDIT) {
      throw new BadRequestException({
        error: 'INVALID_METHOD',
        message:
          'نسیه روشِ برگشتِ وجه نیست — برگشتِ نسیه یعنی هیچ پولی برگشته نیست',
      });
    }

    const invoice = await this.prisma.saleInvoice.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        paidAmount: true,
        dueAmount: true,
        customerId: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException({
        error: 'INVOICE_NOT_FOUND',
        message: 'فاکتور پیدا نشد',
      });
    }
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException({
        error: 'INVOICE_CANCELLED',
        message: 'فاکتورِ باطل‌شده پرداختی برای برگشت‌زدن ندارد',
      });
    }
    if (!invoice.customerId) {
      throw new BadRequestException({
        error: 'CUSTOMER_REQUIRED',
        message:
          'این فاکتور مشتری ندارد و دفتری نیست که بدهی رویش بنشیند — وجه را دستی از صندوق برگردانید',
      });
    }
    if (invoice.paidAmount <= 0) {
      throw new BadRequestException({
        error: 'NOTHING_PAID',
        message: 'روی این فاکتور پرداختی ثبت نشده که برگشت بخورد',
      });
    }
    if (dto.amount > invoice.paidAmount) {
      throw new BadRequestException({
        error: 'REVERSAL_EXCEEDS_PAID',
        amount: dto.amount,
        paidAmount: invoice.paidAmount,
        message: `برگشت از پرداخت‌شده‌ی فاکتور بیشتر است (پرداخت‌شده: ${invoice.paidAmount})`,
      });
    }

    const customerId = invoice.customerId;

    const reversalId = await this.prisma.$transaction(async (tx) => {
      /*
       * قفلِ فاکتور قبل از خواندنِ دوباره — همان قاعده‌ی مرجوعی/اصلاحیه:
       * رسیدِ هم‌زمان یا برگشتِ هم‌زمانِ دیگری باید صبر کند، وگرنه سقفِ
       * «پرداخت‌شده» که بیرونِ تراکنش خوانده شد تا لحظه‌ی نوشتن کهنه می‌شود.
       */
      const fresh = await lockInvoice(tx, invoiceId);
      if (!fresh || fresh.status === 'CANCELLED') {
        throw new BadRequestException({
          error: 'INVOICE_CANCELLED',
          message: 'وضعیت فاکتور در همین لحظه عوض شد — دوباره تلاش کنید',
        });
      }
      if (!fresh.customerId) {
        throw new BadRequestException({
          error: 'CUSTOMER_REQUIRED',
          message:
            'فاکتور مشتری ندارد — برگشتِ پرداخت فقط روی فاکتورِ مشتری‌دار معنا دارد',
        });
      }
      if (dto.amount > fresh.paidAmount) {
        throw new BadRequestException({
          error: 'REVERSAL_EXCEEDS_PAID',
          amount: dto.amount,
          paidAmount: fresh.paidAmount,
          message: `برگشت از پرداخت‌شده‌ی فاکتور بیشتر است (پرداخت‌شده: ${fresh.paidAmount})`,
        });
      }

      const reversal = await tx.paymentReversal.create({
        data: {
          invoiceId,
          method: dto.method,
          amount: dto.amount,
          reason,
          userId: userId ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
        },
      });

      /*
       * ردیفِ پرداختِ منفی — قلبِ خنثی‌سازی. جمعِ Paymentهای فاکتور یعنی
       * «پولِ واقعاً در صندوق»؛ منفی‌شدنش یعنی پول برگشته، بی‌آنکه سطرِ اصلی
       * پاک شود تا ردِ تاریخچه باقی بماند.
       */
      await tx.payment.create({
        data: {
          invoiceId,
          method: dto.method,
          amount: -dto.amount,
          note: reason ? `برگشت پرداخت — ${reason}` : 'برگشت پرداخت',
        },
      });

      // مانده‌ی فاکتور به بدهی برمی‌گردد — نوشتنِ نسبی، نه مطلق.
      await tx.saleInvoice.update({
        where: { id: invoiceId },
        data: {
          paidAmount: { decrement: dto.amount },
          dueAmount: { increment: dto.amount },
        },
      });

      /*
       * دفتر — تنها منبعِ «چقدر بدهکار است». مثبت = بدهی زیاد، همان امضای
       * بقیه‌ی ردیف‌های بدهکار. با سندِ برگشت وصل می‌شود تا گردشِ حساب قابل
       * ردیابی باشد.
       */
      await this.ledger.record(tx, {
        customerId,
        type: LedgerEntryType.PAYMENT_REVERSED,
        amount: dto.amount,
        invoiceId,
        reversalId: reversal.id,
        note: reason ? `برگشت پرداخت — ${reason}` : 'برگشت پرداخت',
        userId: userId ?? null,
      });

      /*
       * سندِ خودکار: پرداختِ منفی‌شده — پول برمی‌گردد به جایی که آمده بود
       * (صندوق/چکِ دریافتی) و بدهیِ مشتری دوباره می‌نشیند. قرینه‌ی سندِ فروش،
       * ولی بدون دست‌زدن به سندِ قبلی: این یک سندِ تازه است که پرداختِ قبلی
       * را خنثی می‌کند.
       */
      await this.posting.post(tx, {
        sourceType: VoucherSourceType.PAYMENT_REVERSAL,
        sourceId: reversal.id,
        idempotencyKey: `payment-reversal:${reversal.id}`,
        lines: [
          {
            account: FixedAccount.CUSTOMERS,
            amount: dto.amount,
            customerId,
            note: 'بدهیِ برگشت‌خورده',
          },
          {
            account:
              dto.method === PaymentMethod.CHEQUE
                ? FixedAccount.CHEQUES
                : FixedAccount.CASH,
            amount: -dto.amount,
            note: 'برگشتِ پرداخت',
          },
        ],
        note: reason ? `برگشت پرداخت — ${reason}` : 'برگشت پرداخت',
        userId: userId ?? null,
      });

      return reversal.id;
    });

    // مانده‌ی مشتری عوض شد → پنل‌های باز همان لحظه تازه شوند.
    this.realtime.broadcast({
      type: 'payment.reversed',
      customerId,
      invoiceId,
    });

    return this.findOne(reversalId);
  }

  /** سندهای برگشتِ یک فاکتور — برای نمایش در صفحه‌ی فاکتور و دفتر. */
  async listByInvoice(invoiceId: string) {
    return this.prisma.paymentReversal.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { username: true } } },
    });
  }
}

/** نوعِ خروجیِ سبک برای کلاینت — شکلِ includeهای بالا. */
export type PaymentReversalWithInvoice = Prisma.PromiseReturnType<
  PaymentReversalsService['findOne']
>;
