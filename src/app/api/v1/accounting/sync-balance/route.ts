import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { validateApiKey } from "@/lib/api-key-auth";
import { walletBalance } from "@/lib/wallet";

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

    const currentBal = await walletBalance(customer.id);
    let finalBal = currentBal;

    if (typeof body.walletBalance === "number") {
      const diff = body.walletBalance - currentBal;
      if (diff !== 0) {
        finalBal = body.walletBalance;
        await prisma.walletTransaction.create({
          data: {
            customerId: customer.id,
            type: diff > 0 ? "TOPUP_MANUAL" : "ADJUST",
            amount: diff,
            balanceAfter: finalBal,
            refType: "ACCOUNTING_SYNC",
            idempotencyKey: `sync-${customer.id}-${Date.now()}`,
            note: `همگام‌سازی از نرم‌افزار حسابداری (${auth.apiKey?.system ?? "API"})`,
          },
        });
      }
    }

    let creditLimit = Number(customer.creditLimitOverride ?? 0);
    if (typeof body.creditLimit === "number" && body.creditLimit >= 0) {
      creditLimit = body.creditLimit;
      await prisma.customer.update({
        where: { id: customer.id },
        data: { creditLimitOverride: body.creditLimit },
      });
    }

    return NextResponse.json({
      ok: true,
      message: `مانده‌حساب همکار «${customer.companyName}» با موفقیت به‌روزرسانی شد.`,
      customer: {
        id: customer.id,
        companyName: customer.companyName,
        phone: customer.phone,
        walletBalance: finalBal,
        creditLimit: creditLimit,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
