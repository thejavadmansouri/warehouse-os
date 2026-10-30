import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { cancelOrder, OrderError } from "@/lib/orders";
import { z } from "zod";

/** جزئیات یک سند — فقط صاحب سند یا ادمین */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);

  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");

  const { id } = await ctx.params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: true,
      shipping: true,
      customer: { select: { companyName: true, phone: true, contactName: true } },
    },
  });

  if (!order) return apiError(404, "NOT_FOUND", "سند پیدا نشد");

  if (user.role === "customer" && order.customerId !== user.customer.id) {
    return apiError(403, "FORBIDDEN", "دسترسی ندارید");
  }

  return NextResponse.json({
    ok: true,
    order: {
      id: order.id,
      number: order.number,
      status: order.status,
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal),
      shippingCost: Number(order.shippingCost),
      total: Number(order.total),
      paidWallet: Number(order.paidWallet),
      paidGateway: Number(order.paidGateway),
      creditAmount: Number(order.creditAmount),
      note: order.note,
      expiresAt: order.expiresAt,
      createdAt: order.createdAt,
      publicToken: order.publicToken,
      shippingName: order.shipping?.name ?? null,
      companyName: order.customer.companyName,
      phone: order.customer.phone,
      items: order.items.map((i) => ({
        id: i.id,
        name: i.name,
        sku: i.sku,
        unit: i.unit,
        qty: i.qty,
        unitPrice: Number(i.unitPrice),
        discountPercent: Number(i.discountPercent),
        lineTotal: Number(i.lineTotal),
      })),
    },
  });
}

const cancelSchema = z.object({ action: z.literal("cancel") });

/** لغو پیش‌فاکتور توسط مشتری — موجودی آزاد می‌شود */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);

  if (!user || user.role !== "customer") {
    return apiError(403, "FORBIDDEN", "دسترسی ندارید");
  }

  const { id } = await ctx.params;
  const parsed = cancelSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) return apiError(400, "VALIDATION", "درخواست نامعتبر");

  try {
    await cancelOrder(id, user.customer.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof OrderError) return apiError(e.status, e.code, e.message);
    throw e;
  }
}
