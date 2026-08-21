import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SmsStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { canReceiveSms } from '../common/phone.util';
import { SmsSender } from './sms-sender';
import { SMS_TEMPLATES, renderTemplate } from './sms-templates';

/**
 * پیامکِ مشتری — صف‌محور، دستی.
 *
 * سه قاعده که کلِ این سرویس رویشان بنا شده:
 *
 * ۱. **هیچ‌وقت درجا ارسال نمی‌شود.** پیام در `SmsMessage` با وضعیت `QUEUED`
 *    می‌نشیند و یک drain جدا می‌بردش. سرور روی LAN مغازه است و اینترنتش قطع و
 *    وصل می‌شود؛ اگر ثبت فاکتور منتظر کاوه‌نگار بماند، صندوق قفل می‌شود.
 *
 * ۲. **انصراف مشتری سمت سرور اعمال می‌شود، نه در UI.** `smsOptOut` تا امروز
 *    فیلدی بود که کسی نمی‌خواندش.
 *
 * ۳. **فقط موبایل.** شماره‌ی ثابت پیامک نمی‌گیرد و ارسال به آن بی‌صدا شکست
 *    می‌خورد — ولی پولش حساب می‌شود.
 */
@Injectable()
export class SmsService {
  private readonly log = new Logger('SmsService');

  constructor(
    private prisma: PrismaService,
    private sender: SmsSender,
  ) {}

  /** قالب‌ها را یک بار در دیتابیس می‌کارد. متنِ ویرایش‌شده دست‌نخورده می‌ماند. */
  async ensureTemplates() {
    for (const t of SMS_TEMPLATES) {
      await this.prisma.smsTemplate.upsert({
        where: { key: t.key },
        create: { key: t.key, title: t.title, body: t.body },
        // فقط عنوان به‌روز می‌شود؛ متن ممکن است مدیر عوضش کرده باشد.
        update: { title: t.title },
      });
    }
  }

  listTemplates() {
    return this.prisma.smsTemplate.findMany({ orderBy: { key: 'asc' } });
  }

  /**
   * شماره‌ای که پیامکِ این مشتری باید به آن برود.
   *
   * «اصلی» کافی نیست: شماره‌ی اصلیِ یک مغازه‌دار معمولاً تلفن مغازه است. اولین
   * موبایل برنده است، و بینِ موبایل‌ها آن که اصلی است.
   */
  async smsPhoneFor(customerId: string): Promise<string | null> {
    const phones = await this.prisma.customerPhone.findMany({
      where: { customerId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { phone: true },
    });
    return phones.map(p => p.phone).find(canReceiveSms) ?? null;
  }

  /**
   * متنِ نهاییِ یک قالب برای یک مشتری — **بدون ارسال**.
   *
   * پیش‌نمایش اختیاری نیست: پیامک برگشت‌ناپذیر است و پول دارد. مدیر باید همان
   * چیزی را ببیند که مشتری می‌بیند، نه قالبِ خام را.
   */
  async preview(customerId: string, templateKey: string, extra: Record<string, string> = {}) {
    const [customer, template] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { id: true, firstName: true, lastName: true, smsOptOut: true },
      }),
      this.prisma.smsTemplate.findUnique({ where: { key: templateKey } }),
    ]);

    if (!customer) {
      throw new NotFoundException({ error: 'CUSTOMER_NOT_FOUND', message: 'مشتری پیدا نشد' });
    }
    if (!template) {
      throw new NotFoundException({ error: 'TEMPLATE_NOT_FOUND', message: 'قالب پیدا نشد' });
    }

    const phone = await this.smsPhoneFor(customerId);
    const shopName = await this.shopName();

    const body = renderTemplate(template.body, {
      customer: `${customer.firstName} ${customer.lastName ?? ''}`.trim(),
      shop: shopName,
      ...extra,
    });

    return {
      body,
      phone,
      templateTitle: template.title,
      isActive: template.isActive,
      optedOut: customer.smsOptOut,
      /** پرشدنی نبودنِ متغیرها در متن دیده می‌شود؛ این فقط خلاصه‌اش می‌کند. */
      missingVars: [...body.matchAll(/\{(\w+)\}/g)].map(m => m[1]),
    };
  }

  /**
   * پیام را در صف می‌گذارد.
   *
   * هر ردِ ممکن **پیش از** ساختِ ردیف بررسی می‌شود، نه بعدش: ردیفی که هیچ‌وقت
   * ارسال‌شدنی نیست فقط تاریخچه را شلوغ می‌کند و شمارنده‌ی سقف را می‌سوزاند.
   */
  async queue(input: {
    customerId: string;
    templateKey: string;
    /** متنِ نهایی که مدیر دیده و تأیید کرده. */
    body: string;
    userId?: string;
  }) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, smsOptOut: true },
    });
    if (!customer) {
      throw new NotFoundException({ error: 'CUSTOMER_NOT_FOUND', message: 'مشتری پیدا نشد' });
    }

    if (customer.smsOptOut) {
      throw new BadRequestException({
        error: 'CUSTOMER_OPTED_OUT',
        message: 'این مشتری پیامک نمی‌خواهد',
      });
    }

    const phone = await this.smsPhoneFor(input.customerId);
    if (!phone) {
      throw new BadRequestException({
        error: 'NO_MOBILE',
        message: 'این مشتری شماره موبایل ندارد — پیامک فقط به موبایل می‌رود',
      });
    }

    const template = await this.prisma.smsTemplate.findUnique({
      where: { key: input.templateKey },
      select: { id: true, isActive: true },
    });
    if (!template?.isActive) {
      throw new BadRequestException({
        error: 'TEMPLATE_INACTIVE',
        message: 'این قالب غیرفعال است',
      });
    }

    const body = input.body.trim();
    if (body.length < 5) {
      throw new BadRequestException({ error: 'EMPTY_BODY', message: 'متن پیامک خالی است' });
    }

    await this.assertUnderDailyCap();

    return this.prisma.smsMessage.create({
      data: {
        customerId: input.customerId,
        templateId: template.id,
        phone,
        body,
        status: SmsStatus.QUEUED,
      },
    });
  }

  /**
   * سقف روزانه.
   *
   * بدون این، یک حلقه‌ی اشتباه در یک شب کل اعتبار پنل را می‌سوزاند — و تا صبح
   * هیچ‌کس نمی‌فهمد. عدد از تنظیمات می‌آید تا بالا بردنش نیاز به دیپلوی نداشته
   * باشد.
   */
  private async assertUnderDailyCap() {
    const cap = Number(process.env.SMS_DAILY_CAP ?? 200);
    if (!Number.isFinite(cap) || cap <= 0) return;

    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const sentToday = await this.prisma.smsMessage.count({
      where: { createdAt: { gte: since } },
    });

    if (sentToday >= cap) {
      throw new BadRequestException({
        error: 'DAILY_CAP_REACHED',
        cap,
        message: `سقف روزانه‌ی پیامک (${cap}) پر شده است`,
      });
    }
  }

  /**
   * صف را خالی می‌کند.
   *
   * تک‌تک و پشت‌سرهم، نه موازی: پنل پیامک نرخ دارد و صفِ ما هیچ‌وقت آن‌قدر بلند
   * نیست که ارزشِ ریسکِ محدودشدن را داشته باشد.
   */
  async drain(limit = 20) {
    const pending = await this.prisma.smsMessage.findMany({
      where: { status: SmsStatus.QUEUED },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    let sent = 0;
    let failed = 0;

    for (const msg of pending) {
      const result = await this.sender.sendText(msg.phone, msg.body);

      await this.prisma.smsMessage.update({
        where: { id: msg.id },
        data: result.ok
          ? {
              status: SmsStatus.SENT,
              provider: result.provider,
              providerId: result.providerId ?? null,
              sentAt: new Date(),
              error: null,
            }
          : {
              status: SmsStatus.FAILED,
              provider: result.provider,
              error: result.detail ?? 'ارسال ناموفق',
            },
      });

      if (result.ok) sent++;
      else failed++;
    }

    if (sent || failed) {
      this.log.log(`پیامک: ${sent} ارسال، ${failed} ناموفق`);
    }
    return { sent, failed };
  }

  /** تاریخچه‌ی پیامکِ یک مشتری — تا کسی یک یادآوری را دو بار نفرستد. */
  history(customerId: string) {
    return this.prisma.smsMessage.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { template: { select: { key: true, title: true } } },
    });
  }

  /** ارسالِ دوباره‌ی یک پیامِ ناموفق. */
  async retry(id: string) {
    const msg = await this.prisma.smsMessage.findUnique({ where: { id } });
    if (!msg) {
      throw new NotFoundException({ error: 'SMS_NOT_FOUND', message: 'پیامک پیدا نشد' });
    }
    if (msg.status !== SmsStatus.FAILED) {
      throw new BadRequestException({
        error: 'NOT_FAILED',
        message: 'فقط پیامک ناموفق دوباره فرستاده می‌شود',
      });
    }
    return this.prisma.smsMessage.update({
      where: { id },
      data: { status: SmsStatus.QUEUED, error: null },
    });
  }

  private async shopName(): Promise<string> {
    const shop = await this.prisma.shopSettings
      .findFirst({ select: { name: true } })
      .catch(() => null);
    return shop?.name?.trim() || '';
  }
}
