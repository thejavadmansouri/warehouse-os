import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { zarinpalVerify } from "@/lib/zarinpal";

/*
 * کال‌بک درگاه — همیشه با verify تأیید می‌شود؛ هرگز به پارامتر Status اعتماد نمی‌کنیم.
 * idempotent: پرداختِ PAID دوباره پردازش نمی‌شود.
 */
export async function GET(req: NextRequest) {
  const { searchParams, origin } = req.nextUrl;
  const pid = searchParams.get("pid") ?? "";
  const authority = searchParams.get("Authority") ?? "";
  const status = searchParams.get("Status") ?? "";

  const successRedirect = (id: string | null, kind: "order" | "wallet") =>
    NextResponse.redirect(`${origin}/pay/result?ok=1&kind=${kind}&id=${id ?? ""}`);

  const failRedirect = (msg: string) =>
    NextResponse.redirect(`${origin}/pay/result?ok=0&reason=${encodeURIComponent(msg)}`);

  const payment = await prisma.payment.findUnique({ where: { id: pid } });

  if (!payment) return failRedirect("پرداخت پیدا نشد");

  const kind = payment.purpose === "ORDER" ? "order" : "wallet";

  if (payment.status === "PAID") return successRedirect(payment.orderId, kind);

  if (status !== "OK" || !authority || authority !== payment.authority) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    return failRedirect("پرداخت لغو شد یا ناموفق بود");
  }

  const verify = await zarinpalVerify({
    amountToman: Number(payment.amount),
    authority,
  });

  if (!verify.ok) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    return failRedirect(verify.message);
  }

  await prisma.$transaction(async (tx) => {
    const fresh = await tx.payment.findUnique({ where: { id: payment.id } });

    if (!fresh || fresh.status === "PAID") return;

    await tx.payment.update({
      where: { id: fresh.id },
      data: { status: "PAID", refId: verify.refId, verifiedAt: new Date() },
    });

    if (fresh.purpose === "WALLET_TOPUP") {
      const existing = await tx.walletTransaction.findUnique({
        where: { idempotencyKey: `payment:${fresh.id}` },
      });

      if (!existing) {
        const agg = await tx.walletTransaction.aggregate({
          where: { customerId: fresh.customerId },
          _sum: { amount: true },
        });

        await tx.walletTransaction.create({
          data: {
            customerId: fresh.customerId,
            type: "TOPUP_ONLINE",
            amount: fresh.amount,
            balanceAfter: Number(agg._sum.amount ?? 0) + Number(fresh.amount),
            refType: "PAYMENT",
            refId: fresh.id,
            idempotencyKey: `payment:${fresh.id}`,
            note: "شارژ آنلاین کیف پول",
          },
        });
      }
    }

    if (fresh.purpose === "ORDER" && fresh.orderId) {
      const order = await tx.order.findUnique({ where: { id: fresh.orderId } });

      if (order) {
        const paidGateway = Number(order.paidGateway) + Number(fresh.amount);
        const total = Number(order.total);

        await tx.order.update({
          where: { id: order.id },
          data: {
            paidGateway,
            status: paidGateway + Number(order.paidWallet) >= total ? "PAID" : order.status,
          },
        });
      }
    }
  });

  return successRedirect(payment.orderId, kind);
}
