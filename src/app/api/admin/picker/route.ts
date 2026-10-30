import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی انبارداری و مدیریت الزامی است");
  }

  // یافتن انبار مرکزی کرمان
  const centralWarehouse = await prisma.warehouse.findFirst({
    where: { isCentral: true },
  });

  // یافتن سفارش‌هایی که پرداخت شده یا اعتبارشان تایید شده و در صف جمع‌آوری هستند
  const orders = await prisma.order.findMany({
    where: {
      status: { in: ["PAID", "APPROVED_CREDIT"] },
      shipment: {
        status: "PREPARING",
      },
    },
    include: {
      customer: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
          address: true,
        },
      },
      shipment: true,
      items: {
        include: {
          product: {
            include: {
              warehouseStocks: {
                where: centralWarehouse ? { warehouseId: centralWarehouse.id } : undefined,
                take: 1,
              },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const pickLists = orders.map((order) => {
    // مرتب‌سازی اقلام بر اساس لوکیشن قفسه برای پیمایش بهینه انباردار در راهروها
    const sortedItems = order.items.map((it) => {
      const stock = it.product?.warehouseStocks[0];
      const shelfBin = stock?.shelfLocation || "بدون لوکیشن";
      return {
        id: it.id,
        productId: it.productId,
        sku: it.sku,
        name: it.name,
        qty: it.qty,
        shelfLocation: shelfBin,
        barcode: it.product?.barcode || it.sku,
        partBrand: it.product?.partBrand || null,
        brand: it.product?.brand || "",
        model: it.product?.model || null,
      };
    });

    sortedItems.sort((a, b) => a.shelfLocation.localeCompare(b.shelfLocation));

    return {
      orderId: order.id,
      orderNumber: order.number,
      createdAt: order.createdAt.toISOString(),
      customerName: order.customer.companyName,
      customerCity: order.shipment?.destinationCity || "کرمان",
      carrierName: order.shipment?.carrierName || "باربری",
      itemCount: sortedItems.length,
      items: sortedItems,
    };
  });

  return NextResponse.json({
    ok: true,
    warehouseName: centralWarehouse?.name || "انبار مرکزی کرمان",
    pickLists,
  });
}
