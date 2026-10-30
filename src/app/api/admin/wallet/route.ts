import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { walletMove, walletBalance } from "@/lib/wallet";
import { randomBytes } from "crypto";

/*
 * ادمین: شارژ دستی کیف پول مشتری (تسویه نقدی/چک).
 * مبلغ می‌تواند مثبت (شارژ) یا منفی (اصلاح) باشد؛ دفتر کل تغییرناپذیر است.
 */
const bodySchema = z.object({
  customerId: z.string().min(1),
  amount: z.number().int().refine((v) => v !== 0, "مبلغ صفر مجاز نیست"),
  note: z.string().trim().max(300).optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده نامعتبر");
  }

  const customer = await prisma.customer.findUnique({ where: { id: parsed.data.customerId } });

  if (!customer) return apiError(404, "NOT_FOUND", "مشتری پیدا نشد");

  try {
    const balance = await walletMove({
      customerId: customer.id,
      type: parsed.data.amount > 0 ? "TOPUP_MANUAL" : "ADJUST",
      amount: parsed.data.amount,
      refType: "MANUAL",
      idempotencyKey: `manual:${randomBytes(10).toString("hex")}`,
      note: parsed.data.note ?? `شارژ دستی توسط ${user.admin.username}`,
    });

    return NextResponse.json({ ok: true, balance });
  } catch {
    return apiError(400, "WALLET_ERROR", "موجودی برای این اصلاح کافی نیست");
  }
}

/** ادمین: موجودی کیف پول یک مشتری */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get("customerId") ?? "";

  if (!customerId) return apiError(400, "VALIDATION", "customerId لازم است");

  return NextResponse.json({ ok: true, balance: await walletBalance(customerId) });
}
