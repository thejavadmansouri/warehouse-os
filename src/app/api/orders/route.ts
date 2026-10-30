import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { createProforma, sweepExpired, OrderError } from "@/lib/orders";
import { prisma } from "@/lib/prisma";

/*
 * ساخت پیش‌فاکتور — قلب جریان خرید.
 * قیمت سمت سرور حساب می‌شود؛ کلاینت فقط productId و qty می‌فرستد.
 */
const bodySchema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().positive() }))
    .min(1, "سبد خالی است"),
  shippingId: z.string().min(1, "روش ارسال را انتخاب کنید"),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);

  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");

  if (user.role === "admin") {
    return apiError(403, "ADMIN", "ثبت سفارش مخصوص مشتریان است");
  }

  const { customer } = user;

  if (customer.status !== "ACTIVE") {
    return apiError(403, "NOT_ACTIVE", "حساب شما هنوز تأیید نشده — امکان خرید ندارید");
  }

  // سفارش‌های قدیمی‌ترِ منقضی را همان‌جا آزاد کن
  await sweepExpired(customer.id);

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده نامعتبر");
  }

  try {
    const order = await createProforma({
      ctx: {
        customerId: customer.id,
        tierDiscountPercent: customer.tierDiscount,
        customerDiscountPercent: customer.customerDiscount,
      },
      items: parsed.data.items,
      shippingId: parsed.data.shippingId,
      note: parsed.data.note,
    });

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        number: order.number,
        total: Number(order.total),
        status: order.status,
        expiresAt: order.expiresAt,
      },
    });
  } catch (e) {
    if (e instanceof OrderError) return apiError(e.status, e.code, e.message);
    throw e;
  }
}

/** لیست سفارش‌های من */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);

  if (!user) return apiError(401, "ANON", "وارد نشده‌اید");
  if (user.role === "admin") return apiError(403, "ADMIN", "این مسیر مخصوص مشتری است");

  await sweepExpired(user.customer.id);

  const orders = await prisma.order.findMany({
    where: { customerId: user.customer.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      createdAt: true,
      expiresAt: true,
      _count: { select: { items: true } },
    },
    take: 50,
  });

  return NextResponse.json({
    ok: true,
    orders: orders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      total: Number(o.total),
      createdAt: o.createdAt,
      expiresAt: o.expiresAt,
      itemCount: o._count.items,
    })),
  });
}
