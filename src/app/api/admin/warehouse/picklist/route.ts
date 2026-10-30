import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  // یافتن تمام سفارش‌هایی که تسویه شده یا اعتبار تأیید شده‌اند و هنوز تحویل باربری نشده‌اند
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PAID", "APPROVED_CREDIT"] },
      OR: [
        { shipment: null },
        { shipment: { status: "PREPARING" } },
      ],
    },
    include: {
      customer: {
        select: {
          companyName: true,
          phone: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              sku: true,
              oemCode: true,
              brand: true,
              category: true,
              partBrand: true,
              stockQty: true,
              unit: true,
            },
          },
        },
      },
      shipment: {
        select: {
          destinationCity: true,
          carrierName: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  // تجمیع اقلام بر اساس کد فنی (SKU) برای برگه بارگیری کلی انبار
  const aggregatedMap = new Map<
    string,
    {
      sku: string;
      name: string;
      oemCode: string | null;
      brand: string;
      category: string;
      partBrand: string | null;
      unit: string;
      stockQty: number;
      totalNeeded: number;
      orderAllocations: {
        orderNumber: string;
        customerName: string;
        city: string;
        qty: number;
      }[];
    }
  >();

  for (const order of orders) {
    const city = order.shipment?.destinationCity || "کرمان (نامشخص)";
    for (const item of order.items) {
      const existing = aggregatedMap.get(item.sku);
      if (existing) {
        existing.totalNeeded += item.qty;
        existing.orderAllocations.push({
          orderNumber: order.number,
          customerName: order.customer.companyName,
          city,
          qty: item.qty,
        });
      } else {
        aggregatedMap.set(item.sku, {
          sku: item.sku,
          name: item.name,
          oemCode: item.product?.oemCode || null,
          brand: item.product?.brand || "عمومی",
          category: item.product?.category || "قطعات",
          partBrand: item.product?.partBrand || null,
          unit: item.unit,
          stockQty: item.product?.stockQty ?? 0,
          totalNeeded: item.qty,
          orderAllocations: [
            {
              orderNumber: order.number,
              customerName: order.customer.companyName,
              city,
              qty: item.qty,
            },
          ],
        });
      }
    }
  }

  const pickList = Array.from(aggregatedMap.values()).sort((a, b) =>
    a.category.localeCompare(b.category, "fa")
  );

  return NextResponse.json({
    ok: true,
    ordersCount: orders.length,
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      customerName: o.customer.companyName,
      customerPhone: o.customer.phone,
      city: o.shipment?.destinationCity || "کرمان",
      carrierName: o.shipment?.carrierName || "تعیین‌نشده",
      totalItems: o.items.reduce((s, it) => s + it.qty, 0),
    })),
    pickList,
  });
}
