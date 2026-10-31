import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

/*
 * دریافت سریع مشخصات و اقلام فاکتور برای مودال نمایش سریع
 * دسترسی: مشتری صاحب فاکتور یا هر ادمینی
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);
  if (!user) {
    return apiError(401, "UNAUTHORIZED", "ابتدا وارد سامانه شوید");
  }

  const { id } = await ctx.params;

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              oemCode: true,
              brand: true,
              partBrand: true,
              imageUrl: true,
              unit: true,
            },
          },
        },
      },
      shipping: true,
      shipment: true,
      customer: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          phone: true,
          address: true,
        },
      },
    },
  });

  if (!order) {
    return apiError(404, "NOT_FOUND", "فاکتور یافت نشد");
  }

  // بررسی امنیت دسترسی
  if (user.role === "customer" && order.customerId !== user.customer.id) {
    return apiError(403, "FORBIDDEN", "شما مجاز به مشاهده این فاکتور نیستید");
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      number: order.number,
      publicToken: order.publicToken,
      status: order.status,
      createdAt: order.createdAt,
      paidAt: (order.status === "PAID" || order.status === "APPROVED_CREDIT") ? order.updatedAt : null,
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal || 0),
      shippingCost: Number(order.shippingCost || 0),
      total: Number(order.total),
      paidWallet: Number(order.paidWallet || 0),
      paidGateway: Number(order.paidGateway || 0),
      creditAmount: Number(order.creditAmount || 0),
      customer: order.customer,
      shipping: order.shipping,
      shipment: order.shipment
        ? {
            id: order.shipment.id,
            status: order.shipment.status,
            carrierName: order.shipment.carrierName,
            carrierPhone: order.shipment.carrierPhone,
            waybillNumber: order.shipment.waybillNumber,
            shippedAt: order.shipment.shippedAt,
            deliveredAt: order.shipment.deliveredAt,
            adminNote: order.shipment.adminNote,
          }
        : null,
      items: order.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        name: it.product?.name || it.name,
        sku: it.product?.sku || it.sku,
        oemCode: it.product?.oemCode || null,
        brand: it.product?.brand || null,
        partBrand: it.product?.partBrand || null,
        imageUrl: it.product?.imageUrl || null,
        unit: it.unit,
        qty: it.qty,
        unitPrice: Number(it.unitPrice),
        discountPercent: Number(it.discountPercent || 0),
        lineTotal: Number(it.lineTotal),
      })),
    },
  });
}
