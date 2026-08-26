import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

/**
 * تأیید/ردِ نظرهای مشتریان — **فقط روی سرور سایت** (`APP_ROLE=site`).
 *
 * نظر محتوای سایت است و در دیتابیسِ سایت نوشته می‌شود؛ تأییدش روی سرور انبار
 * یعنی تغییرِ ردیفی که هرگز به سایت نمی‌رسد. نظرِ خریدارِ واقعی خودکار تأیید شده و اینجا
 * نمی‌آید؛ فقط PENDINGها (نظرِ غیرخریدار) صف می‌شوند.
 */
@Injectable()
export class ReviewModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending() {
    return this.prisma.productReview.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 200,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
        product: { select: { id: true, name: true, sku: true } },
        siteCustomer: { select: { firstName: true, lastName: true, phone: true } },
      },
    });
  }

  async approve(id: string) {
    return this.setStatus(id, 'APPROVED');
  }

  async reject(id: string) {
    return this.setStatus(id, 'REJECTED');
  }

  private async setStatus(id: string, status: 'APPROVED' | 'REJECTED') {
    const found = await this.prisma.productReview.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException({ error: 'NOT_FOUND', message: 'نظر یافت نشد' });
    await this.prisma.productReview.update({ where: { id }, data: { status } });
    return { ok: true, status };
  }
}
