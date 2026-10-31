import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

/*
 * سفارش مجدد هوشمند (Smart Re-order)
 * تحلیل سوابق خرید مشتری و پیشنهاد اقلام پرتکرار با مقادیر بهینه
 */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return apiError(401, "UNAUTHORIZED", "وارد نشده‌اید");
  }

  const customerId = user.customer.id;

  // واکشی اقلام سفارش‌های قبلی تایید شده یا پرداخت‌شده
  const pastItems = await prisma.orderItem.findMany({
    where: {
      order: {
        customerId,
        status: { in: ["PAID", "APPROVED_CREDIT", "AWAITING_CREDIT_APPROVAL", "PROFORMA"] },
      },
    },
    include: {
      product: {
        include: {
          volumePrices: { orderBy: { qtyFrom: "asc" } },
        },
      },
      order: {
        select: { createdAt: true },
      },
    },
    orderBy: { order: { createdAt: "desc" } },
    take: 150,
  });

  if (pastItems.length === 0) {
    return NextResponse.json({ ok: true, items: [] });
  }

  // تجمیع بر اساس محصول: فرکانس خرید و آخرین تعداد
  const itemMap = new Map<string, { product: any; count: number; totalQty: number; lastQty: number }>();

  for (const item of pastItems) {
    if (!item.product || !item.product.isActive) continue;
    const pid = item.productId;
    const existing = itemMap.get(pid);

    if (existing) {
      existing.count += 1;
      existing.totalQty += item.qty;
    } else {
      itemMap.set(pid, {
        product: item.product,
        count: 1,
        totalQty: item.qty,
        lastQty: item.qty,
      });
    }
  }

  const totalDiscount = (user.customer.tierDiscount || 0) + (user.customer.customerDiscount || 0);

  const sorted = Array.from(itemMap.values())
    .sort((a, b) => b.count - a.count || b.totalQty - a.totalQty)
    .slice(0, 8)
    .map(({ product, count, lastQty }) => {
      const basePrice = Number(product.price);
      const discountMultiplier = Math.max(0, 1 - totalDiscount / 100);
      const finalPrice = Math.round(basePrice * discountMultiplier);

      return {
        id: product.id,
        sku: product.sku,
        name: product.name,
        brand: product.brand,
        model: product.model,
        unit: product.unit,
        packSize: product.packSize,
        minQty: product.minQty,
        stockQty: product.stockQty,
        basePrice,
        finalPrice,
        orderFrequency: count,
        suggestedQty: Math.max(product.minQty, lastQty),
      };
    });

  return NextResponse.json({ ok: true, items: sorted });
}
