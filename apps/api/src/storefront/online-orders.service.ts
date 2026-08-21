import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnlineOrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { SalesService } from '../sales/sales.service';
import { convertMoney } from '../common/money';

/**
 * صفِ سفارش‌های سایت، از دید فروشنده.
 *
 * اینجا همان مرزی است که در `StorefrontOrderService` قول داده شد: **تنها جایی
 * که سفارشِ سایت به فاکتور تبدیل می‌شود و کالا واقعاً از انبار کم می‌شود.**
 * تا پیش از `confirm`، سفارش فقط یک درخواست است.
 */
@Injectable()
export class OnlineOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sales: SalesService,
    private readonly events: EventsGateway,
  ) {}

  async list(status?: OnlineOrderStatus) {
    const where: Prisma.OnlineOrderWhereInput = status ? { status } : {};

    const rows = await this.prisma.onlineOrder.findMany({
      where,
      // «در انتظار»ها اول — این صفحه یک صفِ کاری است، نه یک آرشیو.
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
        createdAt: true,
        invoiceId: true,
        customer: { select: { id: true, firstName: true, lastName: true } },
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
      createdAt: r.createdAt,
      invoiceId: r.invoiceId,
      customerId: r.customer.id,
      customerName: [r.customer.firstName, r.customer.lastName]
        .filter(Boolean)
        .join(' '),
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
        customer: {
          select: { id: true, firstName: true, lastName: true },
        },
        decidedBy: { select: { id: true, username: true } },
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
   * تأیید سفارش و ساختِ فاکتور.
   *
   * ⚠️ اینجاست که موجودی کم می‌شود. سه نکته‌ای که اگر رعایت نشوند خرابی مالی
   * می‌سازند:
   *
   *   ۱. **واحد پول برمی‌گردد.** ردیف‌های سفارش به واحدِ *سایت* ذخیره شده‌اند
   *      (چون همان عددی است که مشتری دید و پذیرفت)، ولی `SaleInvoice` به واحدِ
   *      *دیتابیس* است. بدون این تبدیل، با نمایشِ تومانی هر فاکتور یک‌دهمِ
   *      مبلغ واقعی ثبت می‌شد.
   *   ۲. **کلید تکرارناپذیری از روی شناسه‌ی سفارش ساخته می‌شود**، پس دوبار
   *      زدنِ «تأیید» دو فاکتور نمی‌سازد.
   *   ۳. **پرداختی ثبت نمی‌شود.** پول هنوز نیامده؛ فروشنده بعداً از مسیر عادیِ
   *      رسید دریافتش می‌کند. اختراعِ یک پرداختِ فرضی یعنی صندوقی که نمی‌خواند.
   */
  async confirm(id: string, userId: string) {
    const order = await this.prisma.onlineOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        customerId: true,
        warehouseId: true,
        note: true,
        number: true,
        lines: { select: { productId: true, quantity: true, unitPrice: true } },
      },
    });

    if (!order) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: 'سفارش پیدا نشد',
      });
    }

    if (order.status !== OnlineOrderStatus.PENDING) {
      throw new BadRequestException({
        error: 'ALREADY_DECIDED',
        message: 'این سفارش قبلاً تعیین تکلیف شده است',
      });
    }

    const shop = await this.prisma.shopSettings.findUnique({
      where: { id: 'singleton' },
      select: { storedUnit: true, siteUnit: true },
    });
    const storedUnit = shop?.storedUnit ?? 'RIAL';
    const siteUnit = shop?.siteUnit ?? 'TOMAN';

    const invoice = await this.sales.createInvoice(
      {
        idempotencyKey: `online-order:${order.id}`,
        warehouseId: order.warehouseId,
        customerId: order.customerId,
        note: `سفارش سایت #${order.number}${order.note ? ` — ${order.note}` : ''}`,
        lines: order.lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          // واحدِ سایت → واحدِ دیتابیس (نکته‌ی ۱ بالا)
          unitPrice: convertMoney(l.unitPrice, siteUnit, storedUnit),
        })),
      },
      userId,
    );

    const invoiceId = (invoice as { id: string }).id;

    await this.prisma.onlineOrder.update({
      where: { id: order.id },
      data: {
        status: OnlineOrderStatus.CONFIRMED,
        invoiceId,
        decidedAt: new Date(),
        decidedById: userId,
      },
    });

    this.events.broadcast({
      type: 'online-order.decided',
      orderId: order.id,
      customerId: order.customerId,
      invoiceId,
      warehouseId: order.warehouseId,
    });

    return this.detail(order.id);
  }

  /** رد سفارش — ناموجود بودن، تماس بی‌پاسخ، آدرس خارج از محدوده. */
  async reject(id: string, userId: string, reason?: string) {
    const done = await this.prisma.onlineOrder.updateMany({
      where: { id, status: OnlineOrderStatus.PENDING },
      data: {
        status: OnlineOrderStatus.REJECTED,
        rejectReason: reason?.trim() || null,
        decidedAt: new Date(),
        decidedById: userId,
      },
    });

    if (done.count === 0) {
      throw new BadRequestException({
        error: 'ALREADY_DECIDED',
        message: 'این سفارش قبلاً تعیین تکلیف شده است',
      });
    }

    this.events.broadcast({ type: 'online-order.decided', orderId: id });

    return this.detail(id);
  }
}
