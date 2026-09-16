import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { readBuildStamp } from './common/build-info';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * سلامت‌سنج — بدون احراز هویت، سبک و بی‌خطر.
   *
   * مصرف‌کننده‌ها: سرویسِ ویندوز (بعد از `sc start`)، مانیتورینگِ نصب، و خودِ
   * ما هنگام عیب‌یابی از راه دور. این‌ها را می‌گوید:
   *
   *   status  — ok / degraded
   *   db      — up / down + تأخیرِ پینگ
   *   uptime  — چند ثانیه از بالا آمدن گذشته
   *   version — نسخه‌ی محصول از فایلِ VERSION (مهرِ بیلد، نه package.json)
   *   builtAt — لحظه‌ی پایان بیلد API
   *   kit     — نام کیتِ به‌روزرسانی، اگر از یک کیت نصب شده باشد
   *
   * چرا نسخه اینجاست؟ چون «زنده‌ام» به‌تنهایی جوابِ سؤالِ روزِ به‌روزرسانی
   * نیست: آپدیتٍ نصفه، جایگزینیِ فایلِ اشتباه و سرویسِ ری‌استارت‌نشده هر سه
   * یک `"ok"` یکسان می‌دهند. با این چهار فیلد، خروجیِ همین مسیر با
   * `kit-contents.txt` همان بسته مقایسه می‌شود و می‌شود گفت «این بسته بالا
   * آمده» یا «نه». (بیشتر از این نه: نسخه‌ی کتابخانه‌ها و شکلِ دیتابیس اینجا
   * نمی‌آید.)
   *
   * ⚠️ هیچ چیزِ داخلی‌ای درز نمی‌کند: نه URL دیتابیس، نه شمارشِ رکوردها، نه
   * نسخه‌ی ماژول‌ها. هرچه بیشتر باشد، سطحِ حمله برای کسی که اینترنتش را
   * پیدا کند بیشتر است — سلامت‌سنج باید «زنده است یا نه» را بگوید، نه نقشه.
   *
   * وقتی دیتابیس پایین است، همان بدنه با **۵۰۳** برمی‌گردد تا هر مانیتوری که
   * فقط کدِ وضعیت را می‌بیند هم بفهمد «اپ زنده است ولی دیتابیس نه» — دقیقاً
   * همان تفکیکی که در نصبِ مغازه دو علتِ متفاوت دارد.
   */
  async health() {
    const started = Date.now();
    let dbUp = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbUp = true;
    } catch {
      // عمداً بی‌صدا: جزئیاتِ خطا فقط در لاگِ سرور معنا دارد نه در پاسخِ عمومی.
      dbUp = false;
    }
    const dbLatencyMs = Date.now() - started;

    const stamp = readBuildStamp();

    const body = {
      status: dbUp ? 'ok' : 'degraded',
      db: dbUp ? 'up' : 'down',
      dbLatencyMs,
      uptimeSec: Math.floor(process.uptime()),
      version: stamp.version,
      builtAt: stamp.builtAt,
      kit: stamp.kit,
      packagedAt: stamp.packagedAt,
      timestamp: new Date().toISOString(),
    };

    if (!dbUp) {
      throw new ServiceUnavailableException(body);
    }
    return body;
  }
}
