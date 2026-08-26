import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { SmsSender } from '../sms/sms-sender';

/**
 * ارسالِ خبرِ «موجود شد» به منتظران — **فقط سرور سایت** (`APP_ROLE=site`).
 *
 * اشتراک‌ها در دیتابیسِ سایت‌اند و موجودیِ تازه هم با سینکِ کاتالوگ به سایت
 * می‌رسد، پس سایت هم می‌داند کِی خبر بدهد و هم شماره‌ها را دارد.
 *
 * تصمیم: ماشه دستیِ فروشنده است، نه خودکار. وقتی کالا شارژ شد، فروشنده در پنل
 * می‌بیند «۷ نفر منتظرِ لنت پراید» و دکمه‌ی «خبر بده» را می‌زند. ماشه‌ی خودکار
 * روی سینک، مرحله‌ی بعد است (در گزارش یادداشت شده).
 */
@Injectable()
export class StockNotifyAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsSender,
  ) {}

  /** کالاهایی که کسی منتظرِ موجود شدنشان است، پرتقاضاترین اول. */
  async listPending() {
    const rows = await this.prisma.stockNotify.groupBy({
      by: ['productId'],
      where: { notifiedAt: null },
      _count: { _all: true },
    });
    if (!rows.length) return [];

    const products = await this.prisma.product.findMany({
      where: { id: { in: rows.map((r) => r.productId) } },
      select: { id: true, name: true, sku: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    return rows
      .map((r) => ({
        productId: r.productId,
        name: byId.get(r.productId)?.name ?? '—',
        sku: byId.get(r.productId)?.sku ?? '',
        waiting: r._count._all,
      }))
      .sort((a, b) => b.waiting - a.waiting);
  }

  /** به همه‌ی منتظرانِ یک کالا پیامک بزن و علامتِ خبرداده‌شده بگذار. */
  async send(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException({ error: 'NOT_FOUND', message: 'کالا یافت نشد' });

    const subs = await this.prisma.stockNotify.findMany({
      where: { productId, notifiedAt: null },
      select: { id: true, phone: true },
    });
    if (!subs.length) return { ok: true, sent: 0 };

    const text = `کالای «${product.name}» موجود شد. برای خرید به فروشگاه اینترنتی مراجعه کنید.`;
    for (const s of subs) {
      // سیستمِ پیامک صف می‌کند و خودش drain؛ اینجا منتظرِ تحویل نمی‌مانیم.
      await this.sms.sendText(s.phone, text);
    }

    // همه به «خبرداده‌شده» می‌روند تا اجرای دوباره دوبار پیامک نزند.
    await this.prisma.stockNotify.updateMany({
      where: { productId, notifiedAt: null },
      data: { notifiedAt: new Date() },
    });

    return { ok: true, sent: subs.length };
  }
}
