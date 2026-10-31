import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { NotificationType } from "@prisma/client";

/*
 * ارسال نوتیفیکیشن توسط مدیر برای کاربران و همکاران
 * امکان ارسال برای: همه کاربران، مشتری خاص، یا تایر خاص (طلایی، نقره‌ای، ...)
 * و قابلیت تبدیل به بنر سراسری بالای سایت
 */
export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مخصوص مدیر ارشد است");
  }

  try {
    const body = await req.json();
    const title = String(body.title ?? "").trim();
    const message = String(body.message ?? "").trim();
    const type = (body.type ?? "SYSTEM") as NotificationType;
    const target = body.target ?? "ALL"; // ALL, TIER, CUSTOMER
    const targetCustomerId = body.customerId;
    const targetTierId = body.tierId;
    const link = body.link ? String(body.link).trim() : null;
    const makeBanner = Boolean(body.makeBanner);
    const bannerLevel = body.bannerLevel ?? "WARNING"; // INFO, WARNING, SUCCESS, URGENT

    if (!title || !message) {
      return apiError(400, "VALIDATION", "عنوان و متن پیام الزامی است");
    }

    let customerIds: string[] = [];

    if (target === "CUSTOMER" && targetCustomerId) {
      customerIds = [targetCustomerId];
    } else if (target === "TIER" && targetTierId) {
      const customers = await prisma.customer.findMany({
        where: { tierId: targetTierId, status: "ACTIVE" },
        select: { id: true },
      });
      customerIds = customers.map((c) => c.id);
    } else {
      // ALL
      const customers = await prisma.customer.findMany({
        where: { status: "ACTIVE" },
        select: { id: true },
      });
      customerIds = customers.map((c) => c.id);
    }

    // ۱. ثبت اعلان در صندوق پیام تک‌تک مشتریان
    if (customerIds.length > 0) {
      await prisma.notification.createMany({
        data: customerIds.map((cid) => ({
          customerId: cid,
          title,
          message,
          type,
          link,
          read: false,
          smsSent: false,
        })),
      });
    }

    // ۲. در صورت انتخاب مدیر، ایجاد بنر سراسری بالای صفحات
    let bannerCreated = null;
    if (makeBanner) {
      bannerCreated = await prisma.announcement.create({
        data: {
          title,
          message,
          level: bannerLevel,
          target: "CUSTOMER",
          link,
          isActive: true,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      message: `اعلان برای ${customerIds.length} همکار ارسال شد.${makeBanner ? " بنر بالای سایت نیز فعال گردید." : ""}`,
      sentCount: customerIds.length,
      bannerId: bannerCreated?.id,
    });
  } catch (err: any) {
    return apiError(500, "SERVER_ERROR", err.message);
  }
}
