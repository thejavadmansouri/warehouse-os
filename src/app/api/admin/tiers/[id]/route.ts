import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

const updateTierSchema = z.object({
  name: z.string().trim().min(2).optional(),
  creditLimit: z.number().nonnegative().optional(),
  baseDiscount: z.number().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
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
  const parsed = updateTierSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات نامعتبر است");
  }

  const tier = await prisma.tier.findUnique({ where: { id } });
  if (!tier) return apiError(404, "NOT_FOUND", "سطح همکاری یافت نشد");

  const updated = await prisma.tier.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({
    ok: true,
    tier: {
      id: updated.id,
      name: updated.name,
      creditLimit: Number(updated.creditLimit),
      baseDiscount: Number(updated.baseDiscount),
      sortOrder: updated.sortOrder,
    },
  });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت الزامی است");
  }

  const { id } = await ctx.params;

  const count = await prisma.customer.count({
    where: { tierId: id },
  });

  if (count > 0) {
    return apiError(400, "TIER_IN_USE", `امکان حذف این سطح وجود ندارد؛ ${count} همکار در این سطح عضو هستند.`);
  }

  await prisma.tier.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
