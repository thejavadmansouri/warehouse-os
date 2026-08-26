import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { normalizePhone } from '../common/phone.util';

/**
 * اشتراکِ «موجود شد خبرم کن» (سمت مشتری، بدون نیاز به ورود — فقط شماره).
 *
 * ارسالِ خودِ پیامک اینجا نیست؛ آن کارِ سرور انبار است
 * (`StockNotifyAdminService`) که وقتی کالا شارژ شد، خبر می‌دهد.
 */
@Injectable()
export class StorefrontStockNotifyService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(productId: string, rawPhone: string) {
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      throw new BadRequestException({ error: 'BAD_PHONE', message: 'شماره معتبر نیست' });
    }

    const product = await this.prisma.product.findFirst({
      where: { id: productId, showOnline: true, isActive: true, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException({ error: 'NOT_FOUND', message: 'کالا یافت نشد' });

    // اشتراکِ دوباره = ریستِ notifiedAt، تا اگر بار قبل خبر رفته بود، این‌بار هم برود.
    await this.prisma.stockNotify.upsert({
      where: { productId_phone: { productId, phone } },
      update: { notifiedAt: null },
      create: { productId, phone },
    });

    return { ok: true, message: 'ثبت شد — به‌محضِ موجود شدن پیامک می‌کنیم' };
  }
}
