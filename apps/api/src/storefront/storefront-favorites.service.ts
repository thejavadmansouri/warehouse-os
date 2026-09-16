import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { StorefrontCatalogService } from './storefront-catalog.service';

/**
 * علاقه‌مندی‌های مشتری سایت (Wishlist).
 *
 * افزودن فقط برای کالایی مجاز است که واقعاً روی سایت دیده می‌شود — وگرنه یک
 * اسکریپت می‌توانست با حدسِ id، وجود/عدمِ کالاهای آفلاین را استخراج کند.
 * لیست از `catalog.listByIds` می‌آید تا همان کارتِ امنِ کاتالوگ برگردد.
 */
@Injectable()
export class StorefrontFavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: StorefrontCatalogService,
  ) {}

  async add(siteCustomerId: string, productId: string) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        showOnline: true,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!product)
      throw new NotFoundException({
        error: 'NOT_FOUND',
        message: 'کالا یافت نشد',
      });

    // upsert: افزودنِ دوباره بی‌اثر است، نه خطا.
    await this.prisma.favorite.upsert({
      where: { siteCustomerId_productId: { siteCustomerId, productId } },
      update: {},
      create: { siteCustomerId, productId },
    });
    return { ok: true, favorited: true };
  }

  async remove(siteCustomerId: string, productId: string) {
    await this.prisma.favorite.deleteMany({
      where: { siteCustomerId, productId },
    });
    return { ok: true, favorited: false };
  }

  /** فقط شناسه‌ها — برای رنگ‌کردنِ آیکنِ قلب روی کارت‌ها بدون گرفتنِ کل کارت. */
  async ids(siteCustomerId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { siteCustomerId },
      select: { productId: true },
    });
    return { ids: rows.map((r) => r.productId) };
  }

  /** کارت‌های کاملِ کالاهای علاقه‌مندی، تازه‌ترین اول. */
  async list(siteCustomerId: string) {
    const rows = await this.prisma.favorite.findMany({
      where: { siteCustomerId },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    const items = await this.catalog.listByIds(rows.map((r) => r.productId));
    return { items };
  }
}
