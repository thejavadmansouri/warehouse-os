import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";

/*
 * ادمین و انباردار: مدیریت پیشرفت سند و ارسال
 *   approve_credit — تأیید خرید اعتباری
 *   reject         — رد درخواست
 *   set_preparing  — ۵۰٪ شروع جمع‌آوری در انبار مرکزی کرمان
 *   set_shipped    — ۸۰٪ تحویل به باربری و ثبت بیجک
 *   set_delivered  — ۱۰۰٪ تحویل قطعی به مشتری
 */
const bodySchema = z.object({
  action: z.enum([
    "approve_credit",
    "reject",
    "set_preparing",
    "set_shipped",
    "set_delivered",
  ]),
  carrierName: z.string().optional(),
  waybillNumber: z.string().optional(),
  adminNote: z.string().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین یا پرسنل انبار لازم است");
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) return apiError(400, "VALIDATION", "اکشن نامعتبر");

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, shipment: true, customer: true },
  });

  if (!order) return apiError(404, "NOT_FOUND", "سند پیدا نشد");

  const { action, carrierName, waybillNumber, adminNote } = parsed.data;

  // ۱. تأیید خرید اعتباری (۲۰٪)
  if (action === "approve_credit") {
    if (order.status !== "AWAITING_CREDIT_APPROVAL") {
      return apiError(409, "BAD_STATUS", "این سند در انتظار تأیید اعتباری نیست");
    }

    const updated = await prisma.order.update({
      where: { id },
      data: {
        status: "APPROVED_CREDIT",
        approvedById: user.admin.id,
        creditDueAt: new Date(Date.now() + 30 * 86400_000),
      },
    });

    // ثبت نوتیفیکیشن برای همکار
    await prisma.notification.create({
      data: {
        customerId: order.customerId,
        type: "ORDER_STATUS",
        title: `سفارش اعتباری ${order.number} تأیید شد`,
        message: `درخواست خرید اعتباری شما برای سند ${order.number} تأیید گردید و در نوبت پردازش انبار قرار گرفت.`,
        link: `/orders/${order.id}`,
      },
    });

    return NextResponse.json({ ok: true, status: updated.status });
  }

  // ۲. شروع جمع‌آوری در انبار مرکزی کرمان (۵۰٪)
  if (action === "set_preparing") {
    if (order.shipment) {
      await prisma.shipment.update({
        where: { id: order.shipment.id },
        data: {
          status: "PREPARING",
          adminNote: adminNote ?? order.shipment.adminNote,
        },
      });
    } else {
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          status: "PREPARING",
          carrierName: carrierName || "انبار مرکزی کرمان",
          destinationCity: "کرمان",
          adminNote: adminNote ?? null,
        },
      });
    }

    // ارسال نوتیفیکیشن به خریدار
    await prisma.notification.create({
      data: {
        customerId: order.customerId,
        type: "ORDER_STATUS",
        title: `سفارش ${order.number} در حال جمع‌آوری است 📦`,
        message: `انباردار در حال تجمیع، اسکن بارکد و بسته‌بندی اقلام سفارش شما در انبار مرکزی کرمان است (۵۰٪ پیشرفت).`,
        link: `/orders/${order.id}`,
      },
    });

    return NextResponse.json({ ok: true, progress: 50, message: "وضعیت به در حال جمع‌آوری در انبار تغییر یافت." });
  }

  // ۳. تحویل به باربری و ثبت بیجک (۸۰٪)
  if (action === "set_shipped") {
    const shippedNow = new Date();
    if (order.shipment) {
      await prisma.shipment.update({
        where: { id: order.shipment.id },
        data: {
          status: "HANDED_TO_CARRIER",
          carrierName: carrierName || order.shipment.carrierName || "باربری کرمان",
          waybillNumber: waybillNumber || order.shipment.waybillNumber || "ثبت در باربری",
          shippedAt: shippedNow,
          adminNote: adminNote ?? order.shipment.adminNote,
        },
      });
    } else {
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          status: "HANDED_TO_CARRIER",
          carrierName: carrierName || "باربری کرمان",
          waybillNumber: waybillNumber || "ثبت در باربری",
          destinationCity: "کرمان",
          shippedAt: shippedNow,
          adminNote: adminNote ?? null,
        },
      });
    }

    // ارسال نوتیفیکیشن بیجک به مشتری
    await prisma.notification.create({
      data: {
        customerId: order.customerId,
        type: "BIJAK_ISSUED",
        title: `سفارش ${order.number} به باربری تحویل شد 🚚`,
        message: `بار شما تحویل ${carrierName || "باربری"} گردید. شماره بیجک / بارنامه: ${waybillNumber || "ثبت‌شده"}. (۸۰٪ پیشرفت)`,
        link: `/orders/${order.id}`,
      },
    });

    return NextResponse.json({ ok: true, progress: 80, message: "بارنامه باربری ثبت و کالا ارسال گردید." });
  }

  // ۴. ثبت تحویل نهایی به مشتری (۱۰۰٪)
  if (action === "set_delivered") {
    const deliveredNow = new Date();
    if (order.shipment) {
      await prisma.shipment.update({
        where: { id: order.shipment.id },
        data: {
          status: "DELIVERED",
          deliveredAt: deliveredNow,
          adminNote: adminNote ?? order.shipment.adminNote,
        },
      });
    } else {
      await prisma.shipment.create({
        data: {
          orderId: order.id,
          status: "DELIVERED",
          carrierName: "تحویل مستقیم کاردو",
          destinationCity: "کرمان",
          shippedAt: deliveredNow,
          deliveredAt: deliveredNow,
          adminNote: adminNote ?? null,
        },
      });
    }

    // ارسال نوتیفیکیشن تحویل به مشتری
    await prisma.notification.create({
      data: {
        customerId: order.customerId,
        type: "ORDER_STATUS",
        title: `سفارش ${order.number} تحویل داده شد ✅`,
        message: `سفارش شما با موفقیت تحویل فروشگاه گردید. از خرید شما از کاردو B2B سپاسگزاریم. (۱۰۰٪ تکمیل)`,
        link: `/orders/${order.id}`,
      },
    });

    return NextResponse.json({ ok: true, progress: 100, message: "تحویل سفارش به همکار ثبت قطعی شد." });
  }

  // ۵. رد سفارش و آزادسازی موجودی رزرو شده
  if (action === "reject") {
    if (order.status !== "AWAITING_CREDIT_APPROVAL" && order.status !== "PROFORMA") {
      return apiError(409, "BAD_STATUS", "این سند قابل رد نیست");
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { id, status: order.status },
        data: { status: "CANCELLED" },
      });

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockQty: { increment: item.qty },
          },
        });
      }
    });

    return NextResponse.json({ ok: true, status: "CANCELLED" });
  }

  return apiError(400, "BAD_ACTION", "عملیات ناشناخته است");
}
