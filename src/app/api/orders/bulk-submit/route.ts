import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { createProforma, sweepExpired, OrderError } from "@/lib/orders";
import { createNotification } from "@/lib/notifications";

const schema = z.object({
  items: z
    .array(z.object({ productId: z.string().min(1), qty: z.number().int().positive() }))
    .min(1, "حداقل یک قلم کالا الزامی است"),
  shippingId: z.string().min(1, "روش ارسال باربری را انتخاب کنید"),
  note: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user) return apiError(401, "ANON", "لطفاً ابتدا وارد حساب کاربری شوید");

  if (user.role === "admin") {
    return apiError(403, "ADMIN", "ثبت سفارش فقط مخصوص مشتریان تجاری است");
  }

  const { customer } = user;
  if (customer.status !== "ACTIVE") {
    return apiError(403, "NOT_ACTIVE", "حساب همکار شما هنوز تأیید نگردیده است");
  }

  await sweepExpired(customer.id);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده‌های ورودی نامعتبرند");
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
      note: parsed.data.note ? `[سفارش اکسل/دسته‌جمعی] ${parsed.data.note}` : "[سفارش اکسل/دسته‌جمعی]",
    });

    // ثبت اعلان درون‌برنامه‌ای و پیامک
    await createNotification({
      customerId: customer.id,
      type: "ORDER_STATUS",
      title: `پیش‌فاکتور دسته‌جمعی ${order.number} صادر شد`,
      message: `سفارش دسته‌جمعی شما با شماره ${order.number} به مبلغ ${Number(order.total).toLocaleString("fa-IR")} تومان ثبت و موجودی اقلام رزرو گردید.`,
      link: `/orders/${order.id}`,
      sendSms: true,
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
  } catch (e: any) {
    if (e instanceof OrderError) return apiError(e.status, e.code, e.message);
    return apiError(500, "SERVER_ERROR", e?.message || "خطا در ثبت سفارش دسته‌جمعی");
  }
}
