import { prisma } from "@/lib/prisma";
import { priceLine } from "@/lib/pricing";
import { nextOrderNumber } from "@/lib/numbering";
import { randomBytes } from "crypto";

/*
 * سرویس سفارش — همه‌ی مسیرهای خرید از همین‌جا می‌گذرند:
 *  - قیمت همیشه سمت سرور حساب می‌شود (کلاینت قیمت نمی‌فرستد)
 *  - موجودی هنگام ساخت پیش‌فاکتور رزرو و در صورت انقضا/لغو آزاد می‌شود
 *  - شماره سند از شمارنده سالانه شمسی می‌آید
 */

export type OrderLineInput = { productId: string; qty: number };

export type OrderContext = {
  customerId: string;
  tierDiscountPercent: number;
  customerDiscountPercent: number;
};

export class OrderError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const RESERVE_HOURS = 24;

export async function createProforma(params: {
  ctx: OrderContext;
  items: OrderLineInput[];
  shippingId: string;
  note?: string;
}) {
  const { ctx, items, shippingId, note } = params;

  if (!items.length) throw new OrderError("EMPTY", "سبد خالی است");

  // محصولات را یک‌جا بخوان تا N+1 نسازیم
  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) }, isActive: true },
    include: { volumePrices: true },
  });

  const byId = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  let discountTotal = 0;

  const lines = items.map((item) => {
    const product = byId.get(item.productId);

    if (!product) throw new OrderError("PRODUCT_NOT_FOUND", "یکی از قطعات یافت نشد");

    const qty = Math.floor(item.qty);

    if (qty < product.minQty) {
      throw new OrderError(
        "MIN_QTY",
        `حداقل سفارش «${product.name}» ${product.minQty} ${product.unit} است`,
      );
    }

    if (product.packSize > 1 && qty % product.packSize !== 0) {
      throw new OrderError(
        "PACK_SIZE",
        `«${product.name}» فقط در بسته‌های ${product.packSize} ${product.unit}ی قابل سفارش است`,
      );
    }

    if (product.stockQty < qty) {
      throw new OrderError(
        "NO_STOCK",
        `موجودی «${product.name}» کافی نیست (${product.stockQty} ${product.unit})`,
      );
    }

    const priced = priceLine(
      {
        price: Number(product.price),
        volumePrices: product.volumePrices.map((v) => ({
          qtyFrom: v.qtyFrom,
          discountPercent: Number(v.discountPercent),
        })),
      },
      qty,
      {
        tierDiscountPercent: ctx.tierDiscountPercent,
        customerDiscountPercent: ctx.customerDiscountPercent,
      },
    );

    subtotal += Number(product.price) * qty;
    discountTotal += Number(product.price) * qty - priced.lineTotal;

    return {
      productId: product.id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      qty,
      unitPrice: priced.unitPrice,
      discountPercent: priced.discountPercent,
      lineTotal: priced.lineTotal,
    };
  });

  const shipping = await prisma.shippingMethod.findUnique({ where: { id: shippingId } });

  if (!shipping || !shipping.isActive) {
    throw new OrderError("SHIPPING", "روش ارسال نامعتبر است");
  }

  const itemsTotal = lines.reduce((s, l) => s + l.lineTotal, 0);
  const shippingCost =
    shipping.freeAbove && itemsTotal >= Number(shipping.freeAbove) ? 0 : Number(shipping.cost);

  const total = itemsTotal + shippingCost;
  const number = await nextOrderNumber();

  const order = await prisma.$transaction(async (tx) => {
    // رزرو اتمی موجودی — اگر همزمان کسی خرید، این‌جا شکست می‌خورد
    for (const line of lines) {
      const updated = await tx.product.updateMany({
        where: { id: line.productId, stockQty: { gte: line.qty } },
        data: { stockQty: { decrement: line.qty } },
      });

      if (updated.count === 0) {
        throw new OrderError("NO_STOCK", `موجودی «${line.name}» همین لحظه تمام شد`);
      }
    }

    return tx.order.create({
      data: {
        number,
        customerId: ctx.customerId,
        status: "PROFORMA",
        shippingId: shipping.id,
        shippingCost,
        subtotal,
        discountTotal,
        total,
        note,
        publicToken: randomBytes(12).toString("base64url"),
        expiresAt: new Date(Date.now() + RESERVE_HOURS * 3600_000),
        items: { create: lines },
      },
      include: { items: true, shipping: true },
    });
  });

  return order;
}

/** پیش‌فاکتورهای منقضی را باطل و موجودی را آزاد می‌کند (lazy sweep). */
export async function sweepExpired(customerId?: string) {
  const expired = await prisma.order.findMany({
    where: {
      status: "PROFORMA",
      expiresAt: { lt: new Date() },
      ...(customerId ? { customerId } : {}),
    },
    include: { items: true },
  });

  for (const order of expired) {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: "PROFORMA" },
        data: { status: "EXPIRED" },
      });

      if (updated.count === 0) return; // کس دیگری زودتر بسته است

      for (const line of order.items) {
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: { increment: line.qty } },
        });
      }
    });
  }

  return expired.length;
}

/** لغو دستی پیش‌فاکتور + آزادسازی موجودی */
export async function cancelOrder(orderId: string, customerId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order) throw new OrderError("NOT_FOUND", "سفارش پیدا نشد", 404);
  if (customerId && order.customerId !== customerId) {
    throw new OrderError("FORBIDDEN", "دسترسی ندارید", 403);
  }

  if (!["PROFORMA", "AWAITING_CREDIT_APPROVAL"].includes(order.status)) {
    throw new OrderError("BAD_STATUS", "این سند در وضعیتی نیست که قابل لغو باشد");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id: order.id, status: order.status },
      data: { status: "CANCELLED" },
    });

    if (updated.count === 0) throw new OrderError("BAD_STATUS", "وضعیت تغییر کرده بود");

    for (const line of order.items) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stockQty: { increment: line.qty } },
      });
    }
  });
}
