import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OnlineOrderStatus, OnlinePayMethod } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../realtime/events.gateway';
import { StorefrontCatalogService } from './storefront-catalog.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { convertMoney } from '../common/money';
import { normalizePhone } from '../common/phone.util';

/**
 * سفارش‌های سایت.
 *
 * ⚠️ قاعده‌ی حاکم: **سفارش همان لحظه‌ی ثبت قطعی است.** هیچ آدمی تأییدش نمی‌کند.
 * مشتری ساعت ۴ صبح سفارش می‌دهد، شماره می‌گیرد و کارش تمام است؛ اگر قرار بود
 * منتظرِ فروشنده بماند، یعنی فروشگاه فقط در ساعات کاری باز است.
 *
 * موجودی: سایت جدول موجودیِ خودش را **کم نمی‌کند** (آن عدد را انبار می‌فرستد و
 * هر سینک بازنویسی می‌شود). به‌جایش، تعدادِ سفارش‌هایی که مغازه هنوز فاکتورشان
 * را نزده از موجودیِ نمایشی کسر می‌شود — همان چیزی که `reserved()` حساب می‌کند.
 * این‌طور بین دو سینک هم بیش از موجودی فروخته نمی‌شود.
 */
@Injectable()
export class StorefrontOrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: StorefrontCatalogService,
    private readonly events: EventsGateway,
  ) {}

  /**
   * انبارِ سفارش‌های سایت.
   *
   * سایت انبار را از کاربر نمی‌پرسد — کاتالوگ هم موجودی را روی همه‌ی انبارها
   * جمع می‌زند. تا وقتی نصب تک‌انباری است (حالت امروز) این درست است؛ روزی که
   * چند انبارِ فروشنده داشته باشیم، اینجا باید یک تنظیمِ صریح بشود نه حدس.
   */
  private async defaultWarehouseId(): Promise<string> {
    const w = await this.prisma.warehouse.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (!w) {
      throw new BadRequestException({
        error: 'NO_WAREHOUSE',
        message: 'هنوز انباری تعریف نشده است',
      });
    }
    return w.id;
  }

  /**
   * تعدادی که «فروخته شده ولی مغازه هنوز از موجودیِ خودش کم نکرده».
   *
   * `Inventory.quantity` روی سایت عکسِ آخرین سینک است. سفارشی که بعد از آن
   * سینک ثبت شده هنوز در آن عدد دیده نمی‌شود، پس اگر کسر نشود همان کالا
   * می‌تواند چند بار فروخته شود.
   *
   * ملاک `stockAppliedAt` است: به‌محض اینکه مغازه فاکتور زد و موجودیِ واقعی‌اش
   * کم شد، این رزرو برداشته می‌شود — وگرنه یک کالا دو بار کسر می‌شد.
   */
  private async reserved(productIds: string[]): Promise<Map<string, number>> {
    if (!productIds.length) return new Map();

    const rows = await this.prisma.onlineOrderLine.groupBy({
      by: ['productId'],
      where: {
        productId: { in: productIds },
        order: {
          stockAppliedAt: null,
          status: { notIn: [OnlineOrderStatus.CANCELLED] },
        },
      },
      _sum: { quantity: true },
    });

    return new Map(rows.map((r) => [r.productId, r._sum.quantity ?? 0]));
  }

  async create(siteCustomerId: string, dto: CreateOrderDto) {
    const shop = await this.catalog.assertOnline();

    /*
     * تکراری‌بودن پیش از هر کار دیگری بررسی می‌شود و همان سفارشِ قبلی برمی‌گردد
     * — نه خطا. برای کلاینت این یعنی retryِ بی‌خطر: پاسخِ گم‌شده را دوباره
     * می‌گیرد بی‌آنکه مشتری دو بار سفارش داده باشد.
     */
    if (dto.idempotencyKey) {
      const existing = await this.prisma.onlineOrder.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        select: { id: true, siteCustomerId: true },
      });
      if (existing) {
        if (existing.siteCustomerId !== siteCustomerId) {
          throw new BadRequestException({
            error: 'KEY_TAKEN',
            message: 'این درخواست قبلاً ثبت شده است',
          });
        }
        return this.myOrder(siteCustomerId, existing.id);
      }
    }

    // یک کالا دو بار در سبد = یک ردیف با تعداد جمع‌شده.
    const wanted = new Map<string, number>();
    for (const l of dto.lines) {
      wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity);
    }

    const products = await this.prisma.product.findMany({
      where: {
        id: { in: [...wanted.keys()] },
        showOnline: true,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        unit: true,
        prices: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { salePrice: true },
        },
        inventories: { select: { quantity: true } },
      },
    });

    const byId = new Map(products.map((p) => [p.id, p]));
    const reserved = await this.reserved([...wanted.keys()]);

    const lines: {
      productId: string;
      productName: string;
      unit: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
    }[] = [];

    for (const [productId, quantity] of wanted) {
      const p = byId.get(productId);

      // کالایی که مدیر از سایت برداشته یا حذف کرده، انگار هیچ‌وقت نبوده.
      if (!p) {
        throw new BadRequestException({
          error: 'PRODUCT_UNAVAILABLE',
          message: 'یکی از کالاهای سبد دیگر در فروشگاه موجود نیست',
        });
      }

      const raw = p.prices[0]?.salePrice ?? null;
      if (raw == null || raw <= 0) {
        throw new BadRequestException({
          error: 'PRODUCT_UNPRICED',
          message: `قیمت «${p.name}» مشخص نیست — لطفاً تماس بگیرید`,
        });
      }

      const onHand = p.inventories.reduce((s, i) => s + i.quantity, 0);
      const available = onHand - (reserved.get(productId) ?? 0);
      if (available < quantity) {
        throw new BadRequestException({
          error: 'INSUFFICIENT_STOCK',
          message: `موجودی «${p.name}» کافی نیست`,
        });
      }

      /*
       * قیمت از دیتابیس می‌آید، نه از کلاینت — و در همان لحظه به واحد سایت
       * تبدیل می‌شود. تبدیلِ هر ردیف پیش از جمع انجام می‌شود تا ستونِ فاکتور
       * با عددِ پایینش بخواند (همان قاعده‌ی `convertMoney`).
       */
      const unitPrice = convertMoney(raw, shop.storedUnit, shop.unit);

      lines.push({
        productId,
        productName: p.name,
        unit: p.unit,
        quantity,
        unitPrice,
        lineTotal: unitPrice * quantity,
      });
    }

    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

    /*
     * ارسال رایگان بالای سقف. `freeShipOver === 0` یعنی قاعده خاموش است، نه
     * «همه‌چیز رایگان» — این تفاوت را اگر جا بیندازیم هر سفارشی رایگان می‌شود.
     */
    const freeShip = shop.freeShipOver > 0 && subtotal >= shop.freeShipOver;
    const shippingFee = freeShip ? 0 : shop.shippingFee;

    const phone = normalizePhone(dto.receiverPhone);
    if (!phone) {
      throw new BadRequestException({
        error: 'BAD_PHONE',
        message: 'شماره گیرنده معتبر نیست',
      });
    }

    const warehouseId = await this.defaultWarehouseId();

    const order = await this.prisma.onlineOrder.create({
      data: {
        idempotencyKey: dto.idempotencyKey ?? null,
        siteCustomerId,
        warehouseId,
        // بدون «منتظر تأیید» — سفارش همان لحظه قطعی است.
        status: OnlineOrderStatus.PLACED,
        subtotal,
        shippingFee,
        total: subtotal + shippingFee,
        payMethod: dto.payMethod ?? OnlinePayMethod.ON_DELIVERY,
        receiverName: dto.receiverName.trim(),
        receiverPhone: phone,
        address: dto.address.trim(),
        note: dto.note?.trim() || null,
        lines: { create: lines },
      },
      select: { id: true, number: true },
    });

    // پنل باید سفارش تازه را بدون رفرش ببیند؛ خودِ سفارش از REST گرفته می‌شود.
    this.events.broadcast({
      type: 'online-order.created',
      orderId: order.id,
      warehouseId,
    });

    return this.myOrder(siteCustomerId, order.id);
  }

  /** فهرست سفارش‌های خودِ مشتری. */
  async myOrders(siteCustomerId: string) {
    const rows = await this.prisma.onlineOrder.findMany({
      where: { siteCustomerId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        payMethod: true,
        createdAt: true,
        _count: { select: { lines: true } },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      total: r.total,
      payMethod: r.payMethod,
      createdAt: r.createdAt,
      lineCount: r._count.lines,
    }));
  }

  /**
   * یک سفارش — فقط اگر مالِ همین مشتری باشد.
   *
   * شرطِ `customerId` داخل `where` است نه یک `if` بعد از خواندن: سفارشِ کسِ
   * دیگر باید ۴۰۴ بدهد، نه ۴۰۳ — وگرنه شماره‌ی سفارش‌های موجود قابل شمارش است.
   */
  async myOrder(siteCustomerId: string, id: string) {
    const o = await this.prisma.onlineOrder.findFirst({
      where: { id, siteCustomerId },
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
   * لغو توسط خودِ مشتری — فقط تا پیش از تصمیمِ فروشنده.
   *
   * بعد از تأیید، سفارش دیگر فاکتور دارد و لغوش یعنی ابطال فاکتور؛ آن کار
   * مسیر خودش را دارد و از سایت انجام نمی‌شود.
   */
  async cancel(siteCustomerId: string, id: string) {
    const done = await this.prisma.onlineOrder.updateMany({
      where: { id, siteCustomerId, status: OnlineOrderStatus.PLACED },
      data: {
        status: OnlineOrderStatus.CANCELLED,
        decidedAt: new Date(),
      },
    });

    if (done.count === 0) {
      throw new BadRequestException({
        error: 'NOT_CANCELLABLE',
        message: 'این سفارش دیگر قابل لغو نیست',
      });
    }

    this.events.broadcast({
      type: 'online-order.decided',
      orderId: id,
    });

    return this.myOrder(siteCustomerId, id);
  }
}
