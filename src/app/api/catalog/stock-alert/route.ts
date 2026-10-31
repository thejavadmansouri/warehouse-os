import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

/*
 * ثبت یا لغو درخواست اطلاع‌رسانی موجود شدن کالا («موجود شد خبرم کن»)
 */
export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return apiError(401, "UNAUTHORIZED", "برای دریافت اعلان ابتدا باید وارد شوید");
  }

  try {
    const body = await req.json();
    const productId = String(body.productId ?? "").trim();

    if (!productId) {
      return apiError(400, "VALIDATION", "شناسه کالا الزامی است");
    }

    const customerId = user.customer.id;

    // بررسی کالا
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, stockQty: true },
    });

    if (!product) {
      return apiError(404, "NOT_FOUND", "کالا یافت نشد");
    }

    // ایجاد یا به‌روزرسانی اشتراک
    const alert = await prisma.stockAlert.upsert({
      where: {
        customerId_productId: { customerId, productId },
      },
      update: {
        notifiedAt: null, // ریست کردن جهت ارسال مجدد در صورت شارژ جدید
      },
      create: {
        customerId,
        productId,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `درخواست اطلاع‌رسانی برای قطعه «${product.name}» با موفقیت ثبت شد. به محض شارژ انبار از طریق پیامک و اعلان به شما اطلاع داده خواهد شد.`,
      subscribed: true,
    });
  } catch (err: any) {
    return apiError(500, "SERVER_ERROR", err.message);
  }
}

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return NextResponse.json({ ok: false, subscribed: false });
  }

  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ ok: false, subscribed: false });
  }

  const alert = await prisma.stockAlert.findUnique({
    where: {
      customerId_productId: {
        customerId: user.customer.id,
        productId,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    subscribed: Boolean(alert && alert.notifiedAt === null),
  });
}
