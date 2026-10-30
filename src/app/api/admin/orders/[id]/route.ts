import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";

/*
 * ادمین: تصمیم روی سند
 *   approve_credit — تأیید خرید اعتباری (۳۰ روز مهلت)
 *   reject         — رد درخواست و آزادسازی موجودی
 */
const bodySchema = z.object({ action: z.enum(["approve_credit", "reject"]) });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { id } = await ctx.params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) return apiError(400, "VALIDATION", "اکشن نامعتبر");

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!order) return apiError(404, "NOT_FOUND", "سند پیدا نشد");

  if (parsed.data.action === "approve_credit") {
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

    return NextResponse.json({ ok: true, status: updated.status });
  }

  if (order.status !== "AWAITING_CREDIT_APPROVAL" && order.status !== "PROFORMA") {
    return apiError(409, "BAD_STATUS", "این سند قابل رد نیست");
  }

  await prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: { id, status: order.status },
      data: { status: "CANCELLED" },
    });

    if (updated.count === 0) return;

    for (const line of order.items) {
      await tx.product.update({
        where: { id: line.productId },
        data: { stockQty: { increment: line.qty } },
      });
    }
  });

  return NextResponse.json({ ok: true, status: "CANCELLED" });
}
