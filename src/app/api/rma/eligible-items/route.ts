import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return apiError(401, "UNAUTHORIZED", "ابتدا وارد حساب همکار شوید");
  }

  // یافتن تمام اقلام فاکتورهای تسویه‌شده یا اعتباری تأییدشده
  const settledOrders = await prisma.order.findMany({
    where: {
      customerId: user.customer.id,
      status: { in: ["PAID", "APPROVED_CREDIT"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          name: true,
          sku: true,
          unit: true,
          qty: true,
          unitPrice: true,
        },
      },
    },
    take: 30,
  });

  const eligibleItems = settledOrders.flatMap((order) =>
    order.items.map((it) => ({
      orderId: order.id,
      orderNumber: order.number,
      orderDate: order.createdAt.toISOString(),
      productId: it.productId,
      name: it.name,
      sku: it.sku,
      unit: it.unit,
      qty: it.qty,
      unitPrice: Number(it.unitPrice),
    }))
  );

  return NextResponse.json({
    ok: true,
    items: eligibleItems,
  });
}
