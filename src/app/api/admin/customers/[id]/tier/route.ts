import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

const assignTierSchema = z.object({
  tierId: z.string().nullable().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  creditLimitOverride: z.number().nonnegative().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت الزامی است");
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = assignTierSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات نامعتبر است");
  }

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) return apiError(404, "NOT_FOUND", "مشتری یافت نشد");

  const data = parsed.data;
  const updateData: any = {};

  if (data.tierId !== undefined) {
    updateData.tierId = data.tierId;
  }
  if (data.discountPercent !== undefined) {
    updateData.discountPercent = data.discountPercent;
  }
  if (data.creditLimitOverride !== undefined) {
    updateData.creditLimitOverride = data.creditLimitOverride;
  }

  const updated = await prisma.customer.update({
    where: { id },
    data: updateData,
    include: { tier: true },
  });

  return NextResponse.json({
    ok: true,
    customer: {
      id: updated.id,
      companyName: updated.companyName,
      tierId: updated.tierId,
      tierName: updated.tier?.name || "بدون سطح",
      discountPercent: Number(updated.discountPercent),
      creditLimitOverride: updated.creditLimitOverride ? Number(updated.creditLimitOverride) : null,
    },
  });
}
