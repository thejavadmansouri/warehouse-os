import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PrismaService } from '../prisma/prisma.service';

/**
 * تازه‌نگه‌داشتنِ سیگنالِ «چقدر واقعاً فروخته می‌شود» برای رتبه‌بندیِ جستجو.
 *
 * چرا زمان‌بندی‌شده و نه لحظه‌ای: این عدد یک سیگنالِ رتبه‌بندی است، نه یک عددِ
 * مالی. اگر نیم‌ساعت عقب باشد هیچ‌کس متوجه نمی‌شود؛ ولی اگر سرِ هر فروش
 * به‌روز می‌شد، هر فاکتور یک نوشتنِ اضافه روی مسیرِ داغِ فروش می‌گذاشت.
 *
 * `CONCURRENTLY` یعنی جستجو حین ری‌فرش قفل نمی‌شود — بدون آن، هر نیم‌ساعت
 * صندوق برای چند ثانیه هنگ می‌کرد. شرطش ایندکسِ یکتاست که در migration ساخته شده.
 */
@Injectable()
export class ProductPopularityService {
  private readonly logger = new Logger(ProductPopularityService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 */30 * * * *')
  async refresh(): Promise<void> {
    try {
      // بیرون از تراکنش — پستگرس اجازه‌ی CONCURRENTLY داخل تراکنش نمی‌دهد.
      await this.prisma.$executeRawUnsafe(
        'REFRESH MATERIALIZED VIEW CONCURRENTLY "ProductPopularity"',
      );
    } catch (err) {
      /*
       * شکستِ ری‌فرش نباید هیچ‌چیز را بخواباند: جستجو با LEFT JOIN نوشته شده،
       * پس با دادهٔ کهنه (یا حتی خالی) دقیقاً مثل قبل کار می‌کند — فقط بدون
       * سیگنالِ پرفروشی. این عمدی است: رتبه‌بندی نباید بتواند جستجو را بشکند.
       */
      this.logger.warn(`refresh of ProductPopularity failed: ${err}`);
    }
  }
}
