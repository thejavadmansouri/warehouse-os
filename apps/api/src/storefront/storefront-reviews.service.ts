import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

/**
 * نظر و امتیازِ مشتری روی کالا.
 *
 * فقط نظرِ APPROVED به سایت می‌رسد. خریدارِ واقعی (کسی که این کالا را سفارش
 * داده) خودکار APPROVED و «خرید تأییدشده» می‌شود؛ بقیه PENDING می‌مانند تا
 * مدیر تأیید کند — وگرنه سایت پر می‌شد از نظرِ اسپم و رقیب.
 *
 * ⚠️ این سرویس در `StorefrontModule` است و روی VPS هم بالا می‌آید؛ پس هیچ
 * متدِ مدیریتی (تأیید/رد) اینجا نیست — آن در `OnlineOrdersModule`ِ انبار است.
 */
@Injectable()
export class StorefrontReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** فقط نامِ کوچک + حرفِ اولِ نام خانوادگی — نامِ کامل روی اینترنت لازم نیست. */
  private maskName(firstName: string, lastName: string | null): string {
    const f = (firstName ?? '').trim();
    const l = (lastName ?? '').trim();
    if (!f && !l) return 'کاربر';
    if (l) return `${f} ${l.charAt(0)}.`.trim();
    return f || 'کاربر';
  }

  /** نظرهای تأییدشده + میانگین و تعداد، برای صفحه‌ی کالا. */
  async forProduct(productId: string) {
    const [items, agg] = await Promise.all([
      this.prisma.productReview.findMany({
        where: { productId, status: 'APPROVED' },
        orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
        take: 50,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          verified: true,
          createdAt: true,
          siteCustomer: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.productReview.aggregate({
        where: { productId, status: 'APPROVED' },
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    return {
      average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : 0,
      count: agg._count._all,
      items: items.map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verified: r.verified,
        createdAt: r.createdAt,
        author: this.maskName(
          r.siteCustomer.firstName,
          r.siteCustomer.lastName,
        ),
      })),
    };
  }

  /**
   * ثبت یا ویرایشِ نظرِ همین مشتری روی همین کالا (یکی بیشتر مجاز نیست).
   * ویرایش دوباره به PENDING برمی‌گردد مگر خریدار تأییدشده باشد.
   */
  async create(
    siteCustomerId: string,
    productId: string,
    dto: CreateReviewDto,
  ) {
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

    const bought = await this.prisma.onlineOrderLine.count({
      where: { productId, order: { siteCustomerId } },
    });
    const verified = bought > 0;
    const status = verified ? 'APPROVED' : 'PENDING';

    const review = await this.prisma.productReview.upsert({
      where: { productId_siteCustomerId: { productId, siteCustomerId } },
      update: {
        rating: dto.rating,
        title: dto.title ?? null,
        body: dto.body,
        status,
        verified,
      },
      create: {
        productId,
        siteCustomerId,
        rating: dto.rating,
        title: dto.title ?? null,
        body: dto.body,
        status,
        verified,
      },
      select: { status: true, verified: true },
    });

    return {
      ok: true,
      status: review.status,
      verified: review.verified,
      message: verified
        ? 'نظر شما ثبت و منتشر شد.'
        : 'نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود.',
    };
  }
}
