import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { walletBalance, walletMove } from "@/lib/wallet";
import { zarinpalRequest } from "@/lib/zarinpal";
import { randomBytes } from "crypto";

/*
 * پرداخت سند:
 *   wallet  — کل باقی‌مانده از کیف پول
 *   gateway — کل باقی‌مانده با درگاه
 *   split   — بخشی کیف پول، بقیه درگاه (مبلغ کیف پول از سمت سرور محدود می‌شود)
 *   credit  — درخواست خرید اعتباری (تأیید ادمین)
 */
const bodySchema = z.object({
  method: z.enum(["wallet", "gateway", "split", "credit"]),
  walletAmount: z.number().int().nonnegative().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);

  if (!user || user.role !== "customer") {
    return apiError(403, "FORBIDDEN", "دسترسی ندارید");
  }

  const { customer } = user;

  if (customer.status !== "ACTIVE") {
    return apiError(403, "NOT_ACTIVE", "حساب شما تأیید نشده است");
  }

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) return apiError(400, "VALIDATION", "درخواست نامعتبر");

  const order = await prisma.order.findUnique({ where: { id } });

  if (!order || order.customerId !== customer.id) {
    return apiError(404, "NOT_FOUND", "سند پیدا نشد");
  }

  if (order.status !== "PROFORMA") {
    return apiError(409, "BAD_STATUS", "این سند قابل پرداخت نیست");
  }

  if (order.expiresAt && order.expiresAt < new Date()) {
    return apiError(409, "EXPIRED", "مهلت پرداخت پیش‌فاکتور گذشته است");
  }

  const remaining = Number(order.total) - Number(order.paidWallet) - Number(order.paidGateway);

  if (remaining <= 0) {
    return apiError(409, "PAID", "این سند قبلاً پرداخت شده است");
  }

  const origin = req.nextUrl.origin;

  // ---------- کیف پول ----------
  if (parsed.data.method === "wallet") {
    const balance = await walletBalance(customer.id);

    if (balance < remaining) {
      return apiError(
        400,
        "WALLET_SHORT",
        `موجودی کیف پول کافی نیست — کسری: ${(remaining - balance).toLocaleString("fa-IR")} تومان`,
        { balance, remaining },
      );
    }

    await walletMove({
      customerId: customer.id,
      type: "PURCHASE",
      amount: -remaining,
      refType: "ORDER",
      refId: order.id,
      idempotencyKey: `order:${order.id}:wallet`,
      note: `پرداخت پیش‌فاکتور ${order.number}`,
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { paidWallet: { increment: remaining }, status: "PAID" },
    });

    return NextResponse.json({ ok: true, status: updated.status, paid: "wallet" });
  }

  // ---------- اعتباری ----------
  if (parsed.data.method === "credit") {
    const openCredit = await prisma.order.aggregate({
      where: { customerId: customer.id, status: "APPROVED_CREDIT" },
      _sum: { creditAmount: true },
    });

    const available =
      customer.creditLimit - Number(openCredit._sum.creditAmount ?? 0);

    if (available < remaining) {
      return apiError(
        400,
        "CREDIT_SHORT",
        `سقف اعتبار کافی نیست — قابل استفاده: ${available.toLocaleString("fa-IR")} تومان`,
      );
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { status: "AWAITING_CREDIT_APPROVAL", creditAmount: remaining },
    });

    return NextResponse.json({ ok: true, status: updated.status });
  }

  // ---------- کیف پول + درگاه ----------
  let walletPart = 0;

  if (parsed.data.method === "split") {
    const balance = await walletBalance(customer.id);
    walletPart = Math.min(balance, parsed.data.walletAmount ?? balance, remaining);
    walletPart = Math.max(0, Math.floor(walletPart));
  }

  const gatewayPart = remaining - walletPart;

  if (gatewayPart <= 0) {
    // تمام مبلغ از کیف پول پوشش داده شد — بدون درگاه
    await walletMove({
      customerId: customer.id,
      type: "PURCHASE",
      amount: -remaining,
      refType: "ORDER",
      refId: order.id,
      idempotencyKey: `order:${order.id}:wallet`,
      note: `پرداخت پیش‌فاکتور ${order.number}`,
    });

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { paidWallet: { increment: remaining }, status: "PAID" },
    });

    return NextResponse.json({ ok: true, status: updated.status, paid: "wallet" });
  }

  const payment = await prisma.payment.create({
    data: {
      customerId: customer.id,
      orderId: order.id,
      purpose: "ORDER",
      amount: gatewayPart,
      status: "PENDING",
      idempotencyKey: `order:${order.id}:gw:${randomBytes(6).toString("hex")}`,
    },
  });

  const result = await zarinpalRequest({
    amountToman: gatewayPart,
    description: `پرداخت پیش‌فاکتور ${order.number}`,
    callbackUrl: `${origin}/api/payments/callback?pid=${payment.id}`,
    mobile: customer.phone,
  });

  if (!result.ok) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });

    return apiError(502, "GATEWAY", result.message);
  }

  await prisma.payment.update({
    where: { id: payment.id },
    data: { authority: result.authority },
  });

  // اگر بخشی از کیف پول کم شد، همین‌جا کم کن
  if (walletPart > 0) {
    await walletMove({
      customerId: customer.id,
      type: "PURCHASE",
      amount: -walletPart,
      refType: "ORDER",
      refId: order.id,
      idempotencyKey: `order:${order.id}:wallet:${payment.id}`,
      note: `بخشی از پرداخت پیش‌فاکتور ${order.number}`,
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { paidWallet: { increment: walletPart } },
    });
  }

  return NextResponse.json({ ok: true, redirect: result.url, paymentId: payment.id });
}
