import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";

/** دریافت اطلاعات محصول برای ویرایش توسط ادمین */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const { id } = await ctx.params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      volumePrices: { orderBy: { qtyFrom: "asc" } },
      warehouseStocks: { include: { warehouse: true } },
    },
  });

  if (!product) return apiError(404, "NOT_FOUND", "محصول پیدا نشد");

  return NextResponse.json({
    ok: true,
    product: {
      ...product,
      price: Number(product.price),
      volumePrices: product.volumePrices.map((v) => ({
        id: v.id,
        qtyFrom: v.qtyFrom,
        discountPercent: Number(v.discountPercent),
      })),
    },
  });
}

/** ادمین: ویرایش جامع مشخصات، تصویر، قیمت و موجودی محصول */
const patchSchema = z.object({
  name: z.string().trim().min(2).optional(),
  sku: z.string().trim().min(1).optional(),
  oemCode: z.string().trim().nullable().optional(),
  barcode: z.string().trim().nullable().optional(),
  brand: z.string().trim().optional(),
  model: z.string().trim().nullable().optional(),
  category: z.string().trim().optional(),
  partBrand: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  imageUrl: z.string().trim().nullable().optional(),
  unit: z.string().trim().optional(),
  packSize: z.number().int().min(1).optional(),
  minQty: z.number().int().min(1).optional(),
  price: z.number().int().min(1000).optional(),
  stockQty: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
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
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده نامعتبر");
  }

  const updateData: any = { ...parsed.data };
  // تبدیل مقادیر خالی به null جهت پاکسازی فیلدهای متنی اختیاری
  if (updateData.imageUrl === "") updateData.imageUrl = null;
  if (updateData.description === "") updateData.description = null;
  if (updateData.oemCode === "") updateData.oemCode = null;
  if (updateData.barcode === "") updateData.barcode = null;
  if (updateData.model === "") updateData.model = null;
  if (updateData.partBrand === "") updateData.partBrand = null;

  const product = await prisma.product
    .update({ where: { id }, data: updateData })
    .catch((err) => {
      console.error("Error updating product:", err);
      return null;
    });

  if (!product) return apiError(404, "NOT_FOUND", "محصول پیدا نشد یا خطا در ذخیره رخ داد");

  return NextResponse.json({ ok: true, product });
}
