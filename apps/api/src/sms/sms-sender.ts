import { Injectable, Logger } from '@nestjs/common';

/**
 * فرستنده‌ی پیامک.
 *
 * پشت یک interface نگه داشته شده چون امروز هیچ حساب پیامکی وجود ندارد و کدِ
 * ورود نباید منتظر آن بماند. تا وقتی `SMS_PROVIDER` ست نشده، کد در لاگ سرور
 * چاپ می‌شود و ورود روی همان سرور قابل تست است — بدون اینکه جای دیگری از کد
 * بداند پیامکی در کار نیست.
 *
 * ⚠️ حالت `console` فقط برای توسعه است. `storefront-auth.service` اجازه نمی‌دهد
 * سرور با این حالت روی اینترنت بالا بیاید.
 */
export interface SmsResult {
  ok: boolean;
  provider: string;
  detail?: string;
  /** شناسه‌ی پیام نزد پنل — برای پیگیریِ بعدیِ وضعیت. */
  providerId?: string;
}

@Injectable()
export class SmsSender {
  private readonly log = new Logger('SmsSender');

  /** `console` (پیش‌فرض) | `kavenegar` */
  get provider(): string {
    return (process.env.SMS_PROVIDER ?? 'console').trim().toLowerCase();
  }

  get isReal(): boolean {
    return this.provider !== 'console';
  }

  async sendOtp(phone: string, code: string): Promise<SmsResult> {
    const text = `کد ورود شما: ${code}`;

    if (!this.isReal) {
      // نه لاگِ اطلاعاتی: باید در خروجیِ شلوغِ سرور دیده شود.
      this.log.warn(`[SMS-CONSOLE] ${phone} → ${text}`);
      return { ok: true, provider: 'console' };
    }

    if (this.provider === 'kavenegar') {
      return this.sendKavenegar(phone, code, text);
    }

    this.log.error(`سرویس پیامکِ ناشناخته: ${this.provider}`);
    return { ok: false, provider: this.provider, detail: 'UNKNOWN_PROVIDER' };
  }


  /**
   * پیامکِ متنِ آزاد — برای اطلاع‌رسانی به مشتری.
   *
   * جدا از [sendOtp] است چون مسیرِ کاوه‌نگارشان فرق دارد: کدِ ورود از «لوکاپ»
   * (قالبِ ثبت‌شده) می‌رود که سریع رد می‌شود، و این از ارسالِ عادی.
   *
   * همان‌جا هم می‌شود قالب گرفت اگر روزی لازم شد؛ فعلاً متنِ نهایی از قالبِ
   * دیتابیس ساخته می‌شود و مدیر پیش از ارسال می‌بیندش.
   */
  async sendText(phone: string, text: string): Promise<SmsResult> {
    if (!this.isReal) {
      this.log.warn(`[SMS-CONSOLE] ${phone} → ${text}`);
      return { ok: true, provider: 'console' };
    }

    if (this.provider !== 'kavenegar') {
      this.log.error(`سرویس پیامکِ ناشناخته: ${this.provider}`);
      return { ok: false, provider: this.provider, detail: 'UNKNOWN_PROVIDER' };
    }

    const key = process.env.KAVENEGAR_API_KEY?.trim();
    if (!key) {
      this.log.error('KAVENEGAR_API_KEY تنظیم نشده — پیامک ارسال نشد');
      return { ok: false, provider: 'kavenegar', detail: 'NO_API_KEY' };
    }

    const url =
      `https://api.kavenegar.com/v1/${key}/sms/send.json` +
      `?receptor=${encodeURIComponent(phone)}` +
      `&message=${encodeURIComponent(text)}` +
      (process.env.KAVENEGAR_SENDER
        ? `&sender=${encodeURIComponent(process.env.KAVENEGAR_SENDER)}`
        : '');

    try {
      // مهلتِ بلندتر از OTP: اینجا کسی پشت صفحه منتظر نیست، صف است.
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
      });
      const body: any = await res.json().catch(() => null);
      const status = body?.return?.status;
      const messageId = body?.entries?.[0]?.messageid;

      if (res.ok && status === 200) {
        return {
          ok: true,
          provider: 'kavenegar',
          providerId: messageId != null ? String(messageId) : undefined,
        };
      }

      return {
        ok: false,
        provider: 'kavenegar',
        detail: `${status ?? res.status}: ${body?.return?.message ?? ''}`.trim(),
      };
    } catch (e: any) {
      this.log.error(`ارسال پیامک شکست خورد: ${e?.message ?? e}`);
      return { ok: false, provider: 'kavenegar', detail: 'NETWORK' };
    }
  }

  /**
   * کاوه‌نگار — مسیر «لوکاپ» (قالب تأییدشده)، نه ارسال متن آزاد.
   *
   * ارسال متن آزاد برای کد ورود در ایران معمولاً فیلتر یا کند می‌شود؛ قالبِ
   * ثبت‌شده در پنل کاوه‌نگار همان‌جا سریع رد می‌شود. نامِ قالب از تنظیمات
   * می‌آید چون هر مشتری قالب خودش را ثبت می‌کند.
   */
  private async sendKavenegar(
    phone: string,
    code: string,
    fallbackText: string,
  ): Promise<SmsResult> {
    const key = process.env.KAVENEGAR_API_KEY?.trim();
    const template = process.env.KAVENEGAR_OTP_TEMPLATE?.trim();

    if (!key) {
      this.log.error('KAVENEGAR_API_KEY تنظیم نشده — پیامک ارسال نشد');
      return { ok: false, provider: 'kavenegar', detail: 'NO_API_KEY' };
    }

    const url = template
      ? `https://api.kavenegar.com/v1/${key}/verify/lookup.json` +
        `?receptor=${encodeURIComponent(phone)}` +
        `&token=${encodeURIComponent(code)}` +
        `&template=${encodeURIComponent(template)}`
      : `https://api.kavenegar.com/v1/${key}/sms/send.json` +
        `?receptor=${encodeURIComponent(phone)}` +
        `&message=${encodeURIComponent(fallbackText)}` +
        (process.env.KAVENEGAR_SENDER
          ? `&sender=${encodeURIComponent(process.env.KAVENEGAR_SENDER)}`
          : '');

    try {
      // مهلت کوتاه: مشتری پشت صفحه‌ی «کد را بفرست» منتظر است، و پیامکی که
      // ۳۰ ثانیه طول بکشد عملاً نرسیده.
      const res = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(8_000),
      });
      const body: any = await res.json().catch(() => null);
      const status = body?.return?.status;

      if (res.ok && status === 200) {
        return { ok: true, provider: 'kavenegar' };
      }

      this.log.error(
        `کاوه‌نگار پیامک را نپذیرفت: status=${status} ${body?.return?.message ?? ''}`,
      );
      return {
        ok: false,
        provider: 'kavenegar',
        detail: String(status ?? res.status),
      };
    } catch (e: any) {
      this.log.error(`ارسال پیامک شکست خورد: ${e?.message ?? e}`);
      return { ok: false, provider: 'kavenegar', detail: 'NETWORK' };
    }
  }
}
