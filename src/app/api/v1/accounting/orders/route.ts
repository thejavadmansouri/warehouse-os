import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/api-key-auth";

/*
 * وب‌سرویس دریافت سفارش‌ها برای نرم‌افزارهای حسابداری (پارسیان، هلو، سپیدار و...)
 * متد: GET /api/v1/accounting/orders
 * هدر: x-api-key: <کلید اتصال>
 */
export async function GET(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // PAID, APPROVED_CREDIT, PROFORMA, all
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 50)));

  const where: any = {};
  if (status && status !== "all") {
    where.status = status;
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      customer: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
          nationalId: true,
          address: true,
          tier: { select: { name: true } },
        },
      },
      items: {
        include: {
          product: {
            select: {
              sku: true,
              oemCode: true,
              name: true,
              unit: true,
            },
          },
        },
      },
      shipping: true,
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const formatted = orders.map((o) => ({
    orderId: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    createdAt: o.createdAt.toISOString(),
    customer: {
      id: o.customer.id,
      companyName: o.customer.companyName,
      contactName: o.customer.contactName,
      phone: o.customer.phone,
      nationalId: o.customer.nationalId,
      address: o.customer.address,
      tier: o.customer.tier?.name,
    },
    paymentMethod: o.paymentMethod,
    totals: {
      subtotal: Number(o.subtotal),
      discount: Number(o.discount),
      shippingCost: Number(o.shippingCost),
      finalAmount: Number(o.total),
    },
    items: o.items.map((item) => ({
      sku: item.product.sku,
      oemCode: item.product.oemCode,
      name: item.product.name,
      unit: item.product.unit,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      totalPrice: Number(item.totalPrice),
    })),
  }));

  return NextResponse.json({
    ok: true,
    system: auth.apiKey?.system ?? "ACCOUNTING",
    totalCount: formatted.length,
    orders: formatted,
  });
}
