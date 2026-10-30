import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";

/** ادمین: ویرایش محصول (قیمت، موجودی، فعال/غیرفعال) */
const patchSchema = z.object({
  price: z.number().int().min(1000).optional(),
  stockQty: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  name: z.string().trim().min(2).optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) return apiError(400, "VALIDATION", "داده نامعتبر");

  const product = await prisma.product
    .update({ where: { id }, data: parsed.data })
    .catch(() => null);

  if (!product) return apiError(404, "NOT_FOUND", "محصول پیدا نشد");

  return NextResponse.json({ ok: true });
}
