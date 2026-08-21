import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';
import { SmsSender } from '../sms/sms-sender';
import { CustomerTokenService } from './customer-token';

/** کد ۵ رقمی: ۴ رقم برای حدس‌زدن کوتاه است، ۶ رقم بی‌دلیل برای تایپ طولانی. */
const CODE_DIGITS = 5;
const CODE_TTL_MS = 3 * 60_000;
/** بعد از ۵ حدسِ غلط همان کد می‌سوزد — نه فقط شمارش، ابطال. */
const MAX_ATTEMPTS = 5;
/** فاصله‌ی اجباری بین دو درخواستِ کد برای یک شماره. */
const RESEND_COOLDOWN_MS = 60_000;

@Injectable()
export class StorefrontAuthService {
  private readonly log = new Logger('StorefrontAuth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsSender,
    private readonly tokens: CustomerTokenService,
  ) {}

  /** کدِ خام هرگز ذخیره نمی‌شود — دیتابیسی که لو برود نباید کدِ در جریان بدهد. */
  private hash(phone: string, code: string): string {
    return createHash('sha256').update(`${phone}:${code}`).digest('hex');
  }

  private requireMobile(input: string): string {
    const phone = normalizePhone(input);
    // فقط موبایل: پیامک به تلفن ثابت نمی‌رسد و کاربر تا ابد منتظر می‌ماند.
    if (!phone || !/^09\d{9}$/.test(phone)) {
      throw new BadRequestException({
        error: 'BAD_PHONE',
        message: 'شماره موبایل معتبر نیست',
      });
    }
    return phone;
  }

  /**
   * درخواست کد ورود.
   *
   * پاسخ عمداً نمی‌گوید این شماره مشتری هست یا نه — وگرنه سایت به یک ابزارِ
   * رایگانِ «آیا این شماره مشتریِ این مغازه است؟» تبدیل می‌شود.
   */
  async requestOtp(rawPhone: string) {
    const phone = this.requireMobile(rawPhone);

    /*
     * حالتِ لاگ‌کنسول روی اینترنت یعنی «هر کسی با هر شماره‌ای وارد می‌شود»،
     * چون کد فقط در لاگ سرور است و صاحبِ شماره آن را نمی‌بیند. سرورِ عمومی
     * بدون سرویس پیامک نباید ورود بدهد.
     */
    if (!this.sms.isReal && process.env.NODE_ENV === 'production') {
      this.log.error('ورود مشتری در حالت production بدون سرویس پیامک غیرفعال است');
      throw new BadRequestException({
        error: 'SMS_NOT_CONFIGURED',
        message: 'ورود موقتاً در دسترس نیست — با فروشگاه تماس بگیرید',
      });
    }

    const recent = await this.prisma.customerOtp.findFirst({
      where: { phone, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    if (recent) {
      const wait = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000,
      );
      throw new BadRequestException({
        error: 'TOO_SOON',
        message: `${wait} ثانیه دیگر دوباره تلاش کنید`,
        retryAfter: wait,
      });
    }

    // کدِ قبلیِ همین شماره باطل می‌شود: دو کدِ همزمان یعنی دو برابر شانسِ حدس.
    await this.prisma.customerOtp.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const code = String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0');

    await this.prisma.customerOtp.create({
      data: {
        phone,
        codeHash: this.hash(phone, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });

    const sent = await this.sms.sendOtp(phone, code);

    if (!sent.ok) {
      throw new BadRequestException({
        error: 'SMS_FAILED',
        message: 'ارسال پیامک ناموفق بود — چند لحظه بعد دوباره تلاش کنید',
      });
    }

    return {
      sent: true,
      expiresInSeconds: CODE_TTL_MS / 1000,
      // فقط در حالت توسعه، تا تست دستی بدون پنل پیامک ممکن باشد.
      ...(this.sms.isReal ? {} : { devCode: code }),
    };
  }

  /**
   * تأیید کد و ورود.
   *
   * شماره‌ای که مشتری نیست، همین‌جا مشتری می‌شود — مغازه‌دار نباید برای هر
   * بازدیدکننده‌ی سایت دستی مشتری بسازد. رکورد ساخته‌شده همان `Customer`
   * معمولی است، پس اگر بعداً حضوری خرید کرد پرونده‌اش یکی است.
   */
  async verifyOtp(rawPhone: string, rawCode: string, name?: string) {
    const phone = this.requireMobile(rawPhone);
    const code = (rawCode ?? '').replace(/\D/g, '');

    const otp = await this.prisma.customerOtp.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) {
      throw new UnauthorizedException({
        error: 'CODE_EXPIRED',
        message: 'کد منقضی شده — دوباره درخواست کنید',
      });
    }

    if (otp.attempts + 1 >= MAX_ATTEMPTS && otp.codeHash !== this.hash(phone, code)) {
      await this.prisma.customerOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 }, consumedAt: new Date() },
      });
      throw new UnauthorizedException({
        error: 'TOO_MANY_ATTEMPTS',
        message: 'تعداد تلاش زیاد بود — کد تازه بگیرید',
      });
    }

    if (otp.codeHash !== this.hash(phone, code)) {
      await this.prisma.customerOtp.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException({
        error: 'BAD_CODE',
        message: 'کد اشتباه است',
      });
    }

    await this.prisma.customerOtp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    const customer = await this.findOrCreateSiteCustomer(phone, name);

    return {
      token: this.tokens.sign(customer.id, phone),
      customer: {
        id: customer.id,
        firstName: customer.firstName,
        lastName: customer.lastName,
        phone,
      },
    };
  }

  /**
   * مشتریِ سایت — نه مشتریِ مغازه.
   *
   * ⚠️ عمداً به `Customer` دست نمی‌زند. کسی که از سایت وارد می‌شود یک
   * بازدیدکننده است؛ تا وقتی فاکتوری صادر نشده هیچ کاری در دفتر مغازه ندارد.
   * پلِ بین این دو فقط هنگام صدور فاکتور زده می‌شود.
   */
  private async findOrCreateSiteCustomer(phone: string, name?: string) {
    const existing = await this.prisma.siteCustomer.findUnique({
      where: { phone },
      select: { id: true, firstName: true, lastName: true },
    });
    if (existing) return existing;

    const trimmed = (name ?? '').trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);

    return this.prisma.siteCustomer.create({
      data: {
        phone,
        // بدون نام هم باید بشود وارد شد؛ شماره تنها چیزی است که واقعاً لازم است.
        firstName: parts[0] || 'مشتری',
        lastName: parts.slice(1).join(' ') || null,
      },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  /** پروفایل خودِ مشتریِ سایت. */
  async me(siteCustomerId: string) {
    const c = await this.prisma.siteCustomer.findUnique({
      where: { id: siteCustomerId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        addresses: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });

    if (!c) {
      throw new UnauthorizedException({
        error: 'CUSTOMER_GONE',
        message: 'حساب پیدا نشد',
      });
    }
    return c;
  }
}
