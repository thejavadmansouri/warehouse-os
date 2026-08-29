import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * مهلتِ گرفتنِ تراکنش و مهلتِ اجرای آن.
 *
 * چرا پیش‌فرضِ Prisma کافی نیست: هر ثبتِ فاکتور یک تراکنشِ تعاملی می‌گیرد و تا
 * آخرین ردیف نگهش می‌دارد. با پیش‌فرضِ `maxWait = 2s` و استخرِ کوچکِ اتصال،
 * وقتی چند صندوق هم‌زمان می‌فروشند درخواست‌ها پشتِ استخر صف می‌کشند و آن‌هایی
 * که بیش از ۲ ثانیه صبر کنند با `P2028` می‌میرند — یعنی فروشنده دکمه را زده و
 * خطای نامفهوم گرفته، در حالی که هیچ ایرادی در خودِ فاکتور نبوده.
 *
 * اندازه‌گیریِ واقعی (apps/api/test/qa/breakpoint.qa.ts): در ۱۰۰ فروشِ هم‌زمان
 * p95 ≈ ۱۵۷۰ms بود — یعنی از قبل ~۷۸٪ از بودجه‌ی ۲ ثانیه مصرف شده و کوچک‌ترین
 * بارِ اضافه آن را می‌شکست (تا ۲۹٪ خطا زیر فشارِ ممتد).
 *
 * ⚠️ این عددها **صف را بلندتر می‌کنند، نه سریع‌تر**. کارِ واقعیِ کم‌کردنِ فشار
 * را `connection_limit` در `DATABASE_URL` انجام می‌دهد.
 */
const TX_MAX_WAIT = 15_000;
const TX_TIMEOUT = 20_000;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      transactionOptions: {
        maxWait: TX_MAX_WAIT,
        timeout: TX_TIMEOUT,
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
