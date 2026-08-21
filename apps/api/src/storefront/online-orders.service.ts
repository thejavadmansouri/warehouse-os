import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnlineOrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';

/**
 * سفارش‌های سایت، از دید مغازه.
 *
 * ⚠️ اینجا **تأییدی وجود ندارد**. سفارش پیش از رسیدن به اینجا قطعی شده و
 * فاکتورش هم موقع پایین‌آمدن خودکار صادر شده (`SyncAgentService.landOrder`).
 * کارِ این سرویس فقط جلوبردنِ مراحلِ تحویل است: آماده‌سازی → ارسال → تحویل.
 *
 * تنها استثنا `cancel` است: وقتی موقع جمع‌کردن معلوم شود جنس واقعاً نیست.
 * آن هم «رد کردن سفارش» نیست، «لغو یک فروشِ انجام‌شده» است و برای همین
 * فاکتورش هم باید باطل شود.
 */
@Injectable()
export class OnlineOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsGateway,
  ) {}

  async list(status?: OnlineOrderStatus) {
    const where: Prisma.OnlineOrderWhereInput = status ? { status } : {};

    const rows = await this.prisma.onlineOrder.findMany({
      where,
      // تازه‌ترین اول — این صفحه یک صفِ کاری است.
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        payMethod: true,
        receiverName: true,
        receiverPhone: true,
        address: true,
        createdAt: true,
        invoiceId: true,
        _count: { select: { lines: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      total: r.total,
      payMethod: r.payMethod,
      receiverName: r.receiverName,
      receiverPhone: r.receiverPhone,
      address: r.address,
      createdAt: r.createdAt,
      invoiceId: r.invoiceId,
      lineCount: r._count.lines,
    }));
  }

  async detail(id: string) {
    const o = await this.prisma.onlineOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        subtotal: true,
        shippingFee: true,
        total: true,
        payMethod: true,
        receiverName: true,
        receiverPhone: true,
        address: true,
        note: true,
        rejectReason: true,
        createdAt: true,
        decidedAt: true,
        invoiceId: true,
        warehouseId: true,
        /*
         * مشتریِ مغازه فقط وقتی وجود دارد که فاکتور صادر شده باشد. مشتریِ
         * سایت عمداً اینجا نمی‌آید — نامش و شماره‌اش روی خودِ سفارش کپی شده
         * و همان چیزی است که فروشنده برای تماس لازم دارد.
         */
        customerId: true,
        lines: {
          select: {
            productId: true,
            productName: true,
            unit: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
        },
      },
    });

    if (!o) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'سفارش پیدا نشد',
      });
    }
    return o;
  }

  /**
   * جلوبردنِ یک مرحله.
   *
   * مسیر یک‌طرفه است: ثبت‌شده → آماده‌سازی → ارسال → تحویل. برگشتن به عقب
   * مجاز نیست چون هر مرحله یک کارِ فیزیکیِ انجام‌شده است؛ «برگرداندن» یعنی
   * لغو، که مسیر خودش را دارد.
   */
  private static readonly NEXT: Record<string, OnlineOrderStatus | undefined> = {
    [OnlineOrderStatus.PLACED]: OnlineOrderStatus.PREPARING,
    [OnlineOrderStatus.PREPARING]: OnlineOrderStatus.SHIPPED,
    [OnlineOrderStatus.SHIPPED]: OnlineOrderStatus.DELIVERED,
  };

  async advance(id: string, userId: string) {
    const order = await this.prisma.onlineOrder.findUnique({
      where: { id },
      select: { id: true, status: true, warehouseId: true },
    });

    if (!order) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'سفارش پیدا نشد',
      });
    }

    const next = OnlineOrdersService.NEXT[order.status];
    if (!next) {
      throw new BadRequestException({
        error: 'NO_NEXT_STEP',
        message: 'این سفارش مرحله‌ی بعدی ندارد',
      });
    }

    await this.prisma.onlineOrder.update({
      where: { id },
      data: {
        status: next,
        decidedAt: new Date(),
        decidedById: userId,
        // وضعیتِ تازه باید دوباره به سایت برود.
        syncedAt: null,
      },
    });

    this.events.broadcast({
      type: 'online-order.decided',
      orderId: id,
      warehouseId: order.warehouseId,
    });

    return this.detail(id);
  }

  /**
   * لغو — وقتی جنس واقعاً نبود یا مشتری پشیمان شد.
   *
   * ⚠️ فاکتورِ این سفارش **خودکار باطل نمی‌شود**. ابطال فاکتور موجودی را
   * برمی‌گرداند و در دفتر مشتری اثر می‌گذارد؛ آن کار مسیر و مجوز خودش را دارد
   * و از اینجا انجام نمی‌شود. شماره‌ی فاکتور در پاسخ برمی‌گردد تا فروشنده
   * بداند کدام را باید باطل کند.
   */
  async cancel(id: string, userId: string, reason?: string) {
    const order = await this.prisma.onlineOrder.findUnique({
      where: { id },
      select: { id: true, status: true, invoiceId: true, warehouseId: true },
    });

    if (!order) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'سفارش پیدا نشد',
      });
    }

    if (order.status === OnlineOrderStatus.DELIVERED) {
      throw new BadRequestException({
        error: 'ALREADY_DELIVERED',
        message: 'سفارشِ تحویل‌شده لغو نمی‌شود — از مسیر مرجوعی اقدام کنید',
      });
    }

    await this.prisma.onlineOrder.update({
      where: { id },
      data: {
        status: OnlineOrderStatus.CANCELLED,
        rejectReason: reason?.trim() || null,
        decidedAt: new Date(),
        decidedById: userId,
        syncedAt: null,
      },
    });

    this.events.broadcast({
      type: 'online-order.decided',
      orderId: id,
      warehouseId: order.warehouseId,
    });

    return {
      ...(await this.detail(id)),
      /** اگر پر باشد، این فاکتور هنوز باز است و باید دستی باطل شود. */
      invoiceToCancel: order.invoiceId,
    };
  }
}
