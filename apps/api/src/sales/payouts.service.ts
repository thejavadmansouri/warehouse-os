import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FixedAccount,
  PaymentMethod,
  Prisma,
  VoucherSourceType,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from './ledger.service';
import { EventsGateway } from '../realtime/events.gateway';
import { PostingService, VoucherLineInput } from '../vouchers/posting.service';

import { CreatePayoutDto } from './dto/create-payout.dto';

/** کلاینت تراکنشی — تا نوشتن همیشه داخل تراکنشِ صدازننده بماند. */
type Tx = Prisma.TransactionClient;

/**
 * پرداخت وجه به مشتری بستانکار — تسویه‌ی اعتبار او.
 *
 * قرینه‌ی ReceiptsService با جهتِ معکوس. منطقِ نرم‌افزارهای حسابداری
 * (QuickBooks/Odoo/Dynamics): اعتبارِ مشتری (Credit Note) و پرداختِ بازپرداخت
 * (Refund Payment) دو رویداد جدا هستند — اعتبار توسط مرجوعی/اصلاحیه/اصلاحِ
 * دستی در دفتر ساخته می‌شود (ردیف‌های منفی)، این سند آن اعتبار را مصرف می‌کند.
 *
 * قواعد:
 *   • مبلغ به‌طور پیش‌فرض فقط تا سقفِ بستانکاریِ فعلی (+ بازپرداختِ معوق).
 *     پرداختِ بیشتر یا به مشتریِ بدونِ بستانکاری فقط با `allowBeyondCredit`
 *     صریح ممکن است — آن وقت مازاد به بدهیِ مشتری اضافه می‌شود (پرداختِ آزاد،
 *     قرینه‌ی پیش‌دریافت در رسید).
 *   • روش فقط نقد/کارت/چک — نسیه یعنی «پولی جابه‌جا نشود» و اینجا بی‌معناست.
 *   • دلیلِ اجباری — سندی که بعداً قابل دفاع باشد.
 *   • مشتری قبل از خواندنِ مانده با `SELECT … FOR UPDATE` قفل می‌شود تا دو
 *     پرداختِ هم‌زمان هر دو همان اعتبار را مصرف نکنند.
 *   • `idempotencyKey` — ارسال دوباره (خطای شبکه/دوبارِ Enter) تکراری نمی‌سازد.
 *
 * موجودی و انبار اصلاً درگیر نمی‌شوند؛ این یک حرکت مالی است نه انبار.
 */
@Injectable()
export class PayoutsService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private realtime: EventsGateway,
    private posting: PostingService,
  ) {}

  async create(input: CreatePayoutDto, userId?: string) {
    this.validate(input);

    if (input.idempotencyKey) {
      const existing = await this.prisma.customerPayout.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return this.findOne(existing.id);
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'مشتری پیدا نشد',
      });
    }

    const { payoutId } = await this.prisma.$transaction(async (tx) =>
      this.createPayoutInTx(tx, input, userId),
    );

    // مانده‌ی حساب مشتری عوض شد → همان لحظه اعلان کن (مثل receipt.created).
    this.realtime.broadcast({
      type: 'payout.created',
      customerId: input.customerId,
    });

    return this.findOne(payoutId);
  }

  private validate(input: CreatePayoutDto) {
    if (!input.amount || input.amount <= 0) {
      throw new BadRequestException({
        error: 'INVALID_AMOUNT',
        message: 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد',
      });
    }

    // نسیه یعنی «پولی جابه‌جا نشود» — پرداختِ به‌مشتری پولِ واقعی است.
    if (input.method === PaymentMethod.CREDIT) {
      throw new BadRequestException({
        error: 'INVALID_METHOD',
        message: 'نسیه روش پرداخت به مشتری نیست',
      });
    }

    /* دلیلِ پرداخت اختیاری است — ردیف‌های شرح هم بدونِ دلیل معنا دارند. */
    const reason = input.reason?.trim() ?? '';
    (input as { reason?: string }).reason = reason || undefined;

    if (input.method === PaymentMethod.CHEQUE && !input.cheque) {
      throw new BadRequestException({
        error: 'CHEQUE_DETAILS_REQUIRED',
        message: 'برای پرداخت چکی، مشخصات چک الزامی است',
      });
    }
  }

  /**
   * بدنه‌ی تراکنشی — جدا از `create` تا اگر بعداً عملیاتی بخواهد پرداخت را
   * داخل تراکنشِ خودش صدا بزند، بدون تراکنشِ تودرتو ممکن باشد (همان الگوی
   * `createReceiptInTx`).
   */
  async createPayoutInTx(
    tx: Tx,
    input: CreatePayoutDto,
    userId?: string,
  ): Promise<{ payoutId: string; number: number; amount: number }> {
    this.validate(input);

    /*
     * قفلِ مشتری — دو پرداختِ هم‌زمان برای یک مشتری سریال می‌شوند تا هر دو
     * همان اعتبار را نبینند و هر دو رد شوند یا هر دو قبول.
     */
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "Customer" WHERE id = ${input.customerId} FOR UPDATE
    `;
    if (!locked.length) {
      throw new NotFoundException({
        error: 'CUSTOMER_NOT_FOUND',
        message: 'مشتری پیدا نشد',
      });
    }

    const balance = await this.ledger.balance(input.customerId, tx);

    /*
     * بازپرداختِ فاکتورِ باطل‌شده (REFUND_PAYABLE) یک «بستانکاری» جدا از دفترِ
     * مشتری است: موقعِ ابطال، بدهیِ فاکتور از دفترِ مشتری کم شد ولی وجهِ
     * گرفته‌شده در حسابِ «بازپرداخت مشتری» نشست. پرداختِ به‌مشتری می‌تواند
     * هر دو را مصرف کند — اول بازپرداختِ معوق، بعد بقیه از بستانکاریِ دفتر.
     *
     * مانده‌ی بازپرداختِ معوق از خودِ سندها خوانده می‌شود: خطِ ابطال منفی
     * (بستانکار) است و خطِ صاف‌کردنِ پرداخت‌ها مثبت — مجموعِ قرینه‌ی آن‌ها
     * یعنی «چه مقدار بازپرداخت هنوز صاف نشده».
     */
    const refundLines = await tx.voucherLine.findMany({
      where: {
        account: FixedAccount.REFUND_PAYABLE,
        customerId: input.customerId,
      },
      select: { amount: true },
    });
    const refundPayable = -refundLines.reduce((s, l) => s + l.amount, 0);

    const credit = Math.max(0, -balance);
    if (balance >= 0 && refundPayable <= 0 && !input.allowBeyondCredit) {
      throw new BadRequestException({
        error: 'NO_CREDIT',
        balance,
        message:
          balance > 0
            ? 'این مشتری بدهکار است و بستانکاری‌ای برای تسویه ندارد'
            : 'حساب این مشتری تسویه است — چیزی برای پرداخت ندارد',
      });
    }

    const available = credit + refundPayable;
    if (input.amount > available && !input.allowBeyondCredit) {
      throw new BadRequestException({
        error: 'EXCEEDS_CREDIT',
        amount: input.amount,
        credit,
        available,
        message:
          `مبلغ پرداخت از بستانکاری مشتری بیشتر است (بستانکاری: ${credit}` +
          (refundPayable > 0 ? ` + بازپرداختِ معوق: ${refundPayable}` : '') +
          ')',
      });
    }

    /*
     * پرداختِ آزاد (allowBeyondCredit): سقفِ اعتبار کنار می‌رود ولی اثر مالی
     * همان می‌ماند — هرچه از بستانکاری/بازپرداختِ معوق بگذرد، بدهیِ مشتری
     * بیشتر می‌شود (پولِ داده‌شده باید برگردد). این قرینه‌ی «پیش‌دریافت» در
     * رسید است: پولِ جابه‌جا می‌شود، فقط جهتِ مانده عوض می‌شود.
     */

    /* چه مقدار از این پرداخت، حسابِ «بازپرداخت مشتری» را صاف می‌کند. */
    const cleared = Math.min(input.amount, refundPayable);
    const fromCredit = input.amount - cleared;

    const payout = await tx.customerPayout.create({
      data: {
        customerId: input.customerId,
        userId: userId ?? null,
        amount: input.amount,
        method: input.method,
        reason: input.reason ?? '',
        note: input.note ?? null,
        chequeNumber: input.cheque?.number ?? null,
        bankName: input.cheque?.bankName ?? null,
        chequeDueDate: input.cheque ? new Date(input.cheque.dueDate) : null,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    /*
     * اثر در دفتر فقط برای بخشی که از بستانکاریِ خودِ مشتری صاف می‌شود:
     * مثبت = بدهیِ مشتری زیاد می‌شود = اعتبارِ ما نزدِ او کم می‌شود. مانده از
     * −بستانکاری به سمتِ صفر می‌رود — دقیقاً همان چیزی که «تسویه» یعنی.
     * بخشِ بازپرداختِ معوق ردیفِ دفتری نمی‌خواهد؛ مانده‌ی مشتری موقعِ ابطالِ
     * فاکتور صفر شده بود و این پول در حسابِ «بازپرداخت مشتری» نشسته بود.
     * هیچ فاکتوری دست نمی‌خورد؛ اعتبار به فاکتور وصل نیست.
     */
    if (fromCredit > 0) {
      /*
       * از این مبلغ چه اندازه «اعتبارِ واقعی» را مصرف کرد و چه اندازه مازادِ
       * آزاد بود (فقط با allowBeyondCredit ممکن) که به بدهیِ مشتری اضافه شد —
       * شرحِ دفتر باید همین را بگوید.
       */
      const consumedCredit = Math.min(fromCredit, credit);
      const beyond = Math.max(0, fromCredit - credit);
      const parts: string[] = [];
      if (consumedCredit > 0)
        parts.push(`بستانکاری ${consumedCredit} تسویه شد`);
      if (beyond > 0) {
        parts.push(`مازاد ${beyond} به بدهیِ مشتری افزوده شد (پرداختِ آزاد)`);
      }
      await this.ledger.record(tx, {
        customerId: input.customerId,
        type: 'PAYOUT',
        amount: fromCredit,
        payoutId: payout.id,
        userId: userId ?? null,
        note:
          `پرداخت ${payout.number} — ${parts.join(' و ')}` +
          (input.reason ? ` (${input.reason})` : ''),
      });
    }

    /*
     * سندِ خودکار: وجهِ پرداخت‌شده (صندوق/چک — بستانکار) در برابرِ «حساب
     * مشتریان» و «بازپرداخت مشتری» (بدهکار). همین سند است که حسابِ بازپرداختِ
     * فاکتورِ باطل‌شده را صاف می‌کند: «سندِ ابطال آن را بستانکار کرده بود؛
     * این سند همان را می‌بندد» — سندها با هم داستانِ کاملِ پول را می‌گویند.
     */
    const lines: VoucherLineInput[] = [];
    if (cleared > 0) {
      lines.push({
        account: FixedAccount.REFUND_PAYABLE,
        amount: cleared,
        customerId: input.customerId,
        note: 'صاف‌کردن بازپرداختِ فاکتورِ باطل‌شده',
      });
    }
    if (fromCredit > 0) {
      lines.push({
        account: FixedAccount.CUSTOMERS,
        amount: fromCredit,
        customerId: input.customerId,
        note:
          fromCredit > credit
            ? 'پرداخت به مشتری (بستانکاری + مازادِ آزاد)'
            : 'تسویه‌ی بستانکاری',
      });
    }
    lines.push({
      account:
        input.method === PaymentMethod.CHEQUE
          ? FixedAccount.CHEQUES
          : FixedAccount.CASH,
      amount: -input.amount,
      note:
        input.method === PaymentMethod.CHEQUE
          ? 'پرداخت چکی به مشتری'
          : 'پرداخت وجه به مشتری',
    });

    await this.posting.post(tx, {
      sourceType: VoucherSourceType.CUSTOMER_PAYOUT,
      sourceId: payout.id,
      idempotencyKey: `payout:${payout.id}`,
      lines,
      note:
        `پرداخت ${payout.number} به مشتری` +
        (input.reason ? ` — ${input.reason}` : ''),
      userId: userId ?? null,
    });

    return {
      payoutId: payout.id,
      number: payout.number,
      amount: payout.amount,
    };
  }

  async findOne(id: string) {
    const payout = await this.prisma.customerPayout.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, fullName: true } },
      },
    });

    if (!payout) {
      throw new NotFoundException({
        error: 'PAYOUT_NOT_FOUND',
        message: 'سند پرداخت پیدا نشد',
      });
    }

    return {
      ...payout,
      customerName: [payout.customer.firstName, payout.customer.lastName]
        .filter(Boolean)
        .join(' '),
    };
  }

  async findAll(q: { customerId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 20));

    const where = q.customerId ? { customerId: q.customerId } : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customerPayout.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          user: { select: { fullName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customerPayout.count({ where }),
    ]);

    return {
      data: data.map((p) => ({
        ...p,
        customerName: [p.customer.firstName, p.customer.lastName]
          .filter(Boolean)
          .join(' '),
      })),
      meta: {
        total,
        page,
        limit,
        lastPage: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }
}
