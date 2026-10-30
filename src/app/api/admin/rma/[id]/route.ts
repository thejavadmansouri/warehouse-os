import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

const updateRmaSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "RECEIVED", "REFUNDED", "REJECTED"]),
  adminNote: z.string().trim().optional(),
  refundAmountOverride: z.number().nonnegative().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت RMA الزامی است");
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateRmaSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی نامعتبر است");
  }

  const { status, adminNote, refundAmountOverride } = parsed.data;

  const rma = await prisma.rmaRequest.findUnique({
    where: { id },
    include: { product: true, customer: true },
  });

  if (!rma) {
    return apiError(404, "NOT_FOUND", "درخواست مرجوعی یافت نشد");
  }

  if (rma.status === "REFUNDED" && status !== "REFUNDED") {
    return apiError(400, "ALREADY_REFUNDED", "این درخواست قبلاً تسویه و عودت وجه شده و امکان تغییر وضعیت ندارد");
  }

  const refundAmount = refundAmountOverride !== undefined ? refundAmountOverride : Number(rma.refundAmount ?? 0);

  // در صورتی که تصمیم واحد گارانتی تسویه و عودت وجه به کیف پول باشد:
  if (status === "REFUNDED" && rma.status !== "REFUNDED") {
    await prisma.$transaction(async (tx) => {
      // ۱. محاسبه مانده فعلی کیف پول
      const lastTx = await tx.walletTransaction.findFirst({
        where: { customerId: rma.customerId },
        orderBy: { createdAt: "desc" },
      });
      const currentBalance = lastTx ? Number(lastTx.balanceAfter) : 0;
      const newBalance = currentBalance + refundAmount;

      // ۲. ایجاد تراکنش بستانکاری در کیف پول
      const walletTx = await tx.walletTransaction.create({
        data: {
          customerId: rma.customerId,
          type: "REFUND",
          amount: refundAmount,
          balanceAfter: newBalance,
          refType: "RMA",
          refId: rma.id,
          idempotencyKey: `rma-refund-${rma.id}`,
          note: `عودت وجه مرجوعی قطعه: ${rma.product.name} (شماره فرم: ${rma.number})`,
        },
      });

      // ۳. در صورتی که قطعه انصرافی/مازاد سالم بوده باشد، موجودی انبار احیا می‌شود
      if (rma.reason === "SURPLUS_ORDER") {
        await tx.product.update({
          where: { id: rma.productId },
          data: { stockQty: { increment: rma.qty } },
        });
      }

      // ۴. به‌روزرسانی نهایی درخواست مرجوعی
      await tx.rmaRequest.update({
        where: { id: rma.id },
        data: {
          status: "REFUNDED",
          refundAmount,
          refundWalletTxId: walletTx.id,
          adminNote: adminNote || rma.adminNote,
          resolvedAt: new Date(),
        },
      });
    });

    return NextResponse.json({
      ok: true,
      status: "REFUNDED",
      refundAmount,
    });
  }

  const updatePayload: any = {
    status,
    adminNote: adminNote !== undefined ? adminNote : rma.adminNote,
  };

  if (refundAmountOverride !== undefined) {
    updatePayload.refundAmount = refundAmountOverride;
  }
  if (status === "APPROVED" && !rma.approvedAt) {
    updatePayload.approvedAt = new Date();
  }
  if (status === "REJECTED") {
    updatePayload.resolvedAt = new Date();
  }

  const updated = await prisma.rmaRequest.update({
    where: { id },
    data: updatePayload,
  });

  return NextResponse.json({
    ok: true,
    status: updated.status,
    adminNote: updated.adminNote,
  });
}
