import { Injectable, NotFoundException } from '@nestjs/common';
import { OnlineOrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/**
 * پنلِ مدیرِ **سایت** — روی VPS.
 *
 * چیزی که اینجا هست و چیزی که نیست، هر دو عمدی‌اند:
 *
 *   هست: مشتریانِ سایت، سفارش‌های سایت، کالاهای آنلاین (فقط خواندن).
 *   نیست: انبار، قفسه، فاکتور، دفتر مشتری، گزارش سود، بکاپ.
 *
 * دلیل: این ماشین روی اینترنت است. هر چیزی که به آن اضافه شود، سطحِ حمله را
 * بزرگ می‌کند. کاتالوگ اینجا **فقط خواندنی** است چون منبعِ حقیقتش انبار است و
 * ویرایشش اینجا با سینکِ بعدی پاک می‌شود.
 */
@Injectable()
export class SiteAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** یک نگاه: امروز چه خبر است. */
  async overview() {
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    const [today, open, customers, online] = await Promise.all([
      this.prisma.onlineOrder.aggregate({
        where: { createdAt: { gte: since }, status: { not: OnlineOrderStatus.CANCELLED } },
        _count: true,
        _sum: { total: true },
      }),
      this.prisma.onlineOrder.count({
        where: { status: { in: [OnlineOrderStatus.PLACED, OnlineOrderStatus.PREPARING] } },
      }),
      this.prisma.siteCustomer.count(),
      this.prisma.product.count({ where: { showOnline: true, isActive: true } }),
    ]);

    return {
      ordersToday: today._count,
      salesToday: today._sum.total ?? 0,
      /** سفارش‌هایی که هنوز به دست مشتری نرسیده‌اند. */
      inFlight: open,
      customers,
      onlineProducts: online,
    };
  }

  async orders(params: { status?: OnlineOrderStatus; q?: string; page?: number }) {
    const pageSize = 30;
    const page = Math.max(params.page ?? 1, 1);

    const where: Prisma.OnlineOrderWhereInput = {};
    if (params.status) where.status = params.status;

    if (params.q?.trim()) {
      const q = params.q.trim();
      const asNumber = Number(q.replace(/\D/g, ''));
      where.OR = [
        { receiverName: { contains: q, mode: 'insensitive' } },
        { receiverPhone: { contains: q } },
        ...(Number.isFinite(asNumber) && asNumber > 0 ? [{ number: asNumber }] : []),
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.onlineOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, number: true, status: true, total: true, payMethod: true,
          receiverName: true, receiverPhone: true, createdAt: true,
          // آیا مغازه گرفته‌اش؟ برای مدیرِ سایت مهم‌ترین ستون است.
          pulledAt: true,
          _count: { select: { lines: true } },
        },
      }),
      this.prisma.onlineOrder.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        id: r.id, number: r.number, status: r.status, total: r.total,
        payMethod: r.payMethod, receiverName: r.receiverName,
        receiverPhone: r.receiverPhone, createdAt: r.createdAt,
        deliveredToShop: r.pulledAt != null,
        lineCount: r._count.lines,
      })),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async order(id: string) {
    const o = await this.prisma.onlineOrder.findUnique({
      where: { id },
      select: {
        id: true, number: true, status: true, subtotal: true, shippingFee: true,
        total: true, payMethod: true, receiverName: true, receiverPhone: true,
        address: true, note: true, rejectReason: true, createdAt: true,
        decidedAt: true, pulledAt: true,
        siteCustomer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        lines: {
          select: {
            productName: true, unit: true, quantity: true,
            unitPrice: true, lineTotal: true,
          },
        },
      },
    });

    if (!o) {
      throw new NotFoundException({ error: 'ORDER_NOT_FOUND', message: 'سفارش پیدا نشد' });
    }
    return o;
  }

  /** مشتریانِ سایت — عمداً هیچ ربطی به فهرست مشتریان مغازه ندارد. */
  async customers(params: { q?: string; page?: number }) {
    const pageSize = 30;
    const page = Math.max(params.page ?? 1, 1);

    const where: Prisma.SiteCustomerWhereInput = {};
    if (params.q?.trim()) {
      const q = params.q.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.siteCustomer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, firstName: true, lastName: true, phone: true, createdAt: true,
          orders: {
            where: { status: { not: OnlineOrderStatus.CANCELLED } },
            select: { total: true },
          },
        },
      }),
      this.prisma.siteCustomer.count({ where }),
    ]);

    return {
      items: rows.map((c) => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(' '),
        phone: c.phone,
        createdAt: c.createdAt,
        orderCount: c.orders.length,
        totalSpent: c.orders.reduce((s, o) => s + o.total, 0),
      })),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /**
   * کالاهای روی سایت — **فقط خواندنی**.
   *
   * تغییرِ قیمت یا موجودی از اینجا ممکن نیست و نباید باشد: منبعِ حقیقت انبار
   * است و سینکِ بعدی هر تغییرِ محلی را پاک می‌کند. اگر مدیر بخواهد کالایی از
   * سایت برداشته شود، `showOnline` را در پنلِ انبار خاموش می‌کند.
   */
  async products(params: { q?: string; page?: number }) {
    const pageSize = 30;
    const page = Math.max(params.page ?? 1, 1);

    const where: Prisma.ProductWhereInput = { showOnline: true, isActive: true };
    if (params.q?.trim()) {
      where.name = { contains: params.q.trim(), mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true, name: true, sku: true, unit: true,
          brand: { select: { name: true } },
          prices: { orderBy: { createdAt: 'desc' }, take: 1, select: { salePrice: true } },
          inventories: { select: { quantity: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      items: rows.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        unit: p.unit,
        brand: p.brand?.name ?? null,
        price: p.prices[0]?.salePrice ?? null,
        stock: p.inventories.reduce((s, i) => s + i.quantity, 0),
      })),
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  /** آخرین باری که ایجنتِ انبار چیزی فرستاد — «سینک زنده است؟» */
  async syncHealth() {
    const [lastPulled, stuck] = await Promise.all([
      this.prisma.onlineOrder.findFirst({
        where: { pulledAt: { not: null } },
        orderBy: { pulledAt: 'desc' },
        select: { pulledAt: true },
      }),
      this.prisma.onlineOrder.count({ where: { pulledAt: null } }),
    ]);

    return {
      lastPullAt: lastPulled?.pulledAt ?? null,
      /** سفارش‌هایی که هنوز مغازه برنداشته — اگر بالا رفت یعنی سینک خوابیده. */
      waitingForShop: stuck,
    };
  }
}
