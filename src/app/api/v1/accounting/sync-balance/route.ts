import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/api-key-auth";

/*
 * وب‌سرویس به‌روزرسانی مانده‌حساب دفتری و سقف اعتبار مشتری از نرم‌افزار حسابداری
 * متد: POST /api/v1/accounting/sync-balance
 * هدر: x-api-key: <کلید اتصال>
 * بادی: { phone: "09121111111", walletBalance: 50000000, creditLimit: 200000000 }
 */
export async function POST(req: NextRequest) {
  const auth = await validateApiKey(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });
  }

  try {
    const body = await req.json();
    const phone = String(body?.phone ?? "").trim();
    const nationalId = String(body?.nationalId ?? "").trim();

    if (!phone && !nationalId) {
      return NextResponse.json(
        { ok: false, error: "شماره موبایل یا کد ملی مشتری الزامی است" },
        { status: 400 }
      );
    }

    const customer = await prisma.customer.findFirst({
      where: {
        OR: [
          ...(phone ? [{ phone }] : []),
          ...(nationalId ? [{ nationalId }] : []),
        ],
      },
    });

    if (!customer) {
      return NextResponse.json({ ok: false, error: "مشتری در سامانه کاردو یافت نشد" }, { status: 404 });
    }

    const updateData: any = {};
    if (typeof body.walletBalance === "number") {
      updateData.walletBalance = body.walletBalance;
    }
    if (typeof body.creditLimit === "number" && body.creditLimit >= 0) {
      updateData.creditLimit = body.creditLimit;
    }

    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: updateData,
      select: {
        id: true,
        companyName: true,
        phone: true,
        walletBalance: true,
        creditLimit: true,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `مانده‌حساب همکار «${updated.companyName}» با موفقیت به‌روزرسانی شد.`,
      customer: {
        ...updated,
        walletBalance: Number(updated.walletBalance),
        creditLimit: Number(updated.creditLimit),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
