import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { zarinpalRequest } from "@/lib/zarinpal";
import { randomBytes } from "crypto";

/*
 * شروع پرداخت آنلاین — دو کاربرد:
 *   ۱) شارژ کیف پول  → { purpose: "WALLET_TOPUP", amount }
 *   ۲) پرداخت سفارش   → { purpose: "ORDER", orderId }  (کل باقی‌مانده)
 */
const bodySchema = z.discriminatedUnion("purpose", [
  z.object({
    purpose: z.literal("WALLET_TOPUP"),
    amount: z.number().int().min(50_000, "حداقل شارژ ۵۰٬۰۰۰ تومان").max(500_000_000),
  }),
  z.object({
    purpose: z.literal("ORDER"),
    orderId: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  const user = await currentUser(req);

  if (!user || user.role !== "customer") {
    return apiError(403, "FORBIDDEN", "دسترسی ندارید");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده نامعتبر");
  }

  const { customer } = user;
  const origin = req.nextUrl.origin;

  const description =
    parsed.data.purpose === "WALLET_TOPUP"
      ? "شارژ کیف پول — کاردو B2B"
      : "پرداخت پیش‌فاکتور — کاردو B2B";

  let amount: number;
  let orderId: string | null = null;

  if (parsed.data.purpose === "WALLET_TOPUP") {
    amount = parsed.data.amount;
  } else {
    const order = await prisma.order.findUnique({ where: { id: parsed.data.orderId } });

    if (!order || order.customerId !== customer.id) {
      return apiError(404, "NOT_FOUND", "سند پیدا نشد");
    }

    if (order.status !== "PROFORMA") {
      return apiError(409, "BAD_STATUS", "این سند قابل پرداخت نیست");
    }

    amount = Number(order.total) - Number(order.paidWallet) - Number(order.paidGateway);
    orderId = order.id;

    if (amount <= 0) return apiError(409, "PAID", "این سند پرداخت شده است");
  }

  const payment = await prisma.payment.create({
    data: {
      customerId: customer.id,
      orderId,
      purpose: parsed.data.purpose,
      amount,
      status: "PENDING",
      idempotencyKey: `${parsed.data.purpose}:${customer.id}:${randomBytes(8).toString("hex")}`,
    },
  });

  const result = await zarinpalRequest({
    amountToman: amount,
    description,
    callbackUrl: `${origin}/api/payments/callback?pid=${payment.id}`,
    mobile: customer.phone,
  });

  if (!result.ok) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    return apiError(502, "GATEWAY", result.message);
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { authority: result.authority },
  });

  return NextResponse.json({ ok: true, redirect: result.url, paymentId: payment.id });
}
