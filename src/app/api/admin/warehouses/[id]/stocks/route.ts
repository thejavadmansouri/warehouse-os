import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

const stockAdjustSchema = z.object({
  productId: z.string().min(1, "شناسه کالا الزامی است"),
  quantity: z.number().int().nonnegative("موجودی نمی‌تواند منفی باشد"),
  shelfLocation: z.string().trim().optional(),
  minAlertQty: z.number().int().nonnegative().optional(),
});

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  const { id: warehouseId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = stockAdjustSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی نامعتبر است");
  }

  const { productId, quantity, shelfLocation, minAlertQty } = parsed.data;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id: warehouseId },
  });
  if (!warehouse) return apiError(404, "NOT_FOUND", "انبار یافت نشد");

  const product = await prisma.product.findUnique({
    where: { id: productId },
  });
  if (!product) return apiError(404, "PRODUCT_NOT_FOUND", "کالا یافت نشد");

  const stock = await prisma.$transaction(async (tx) => {
    const updatedStock = await tx.warehouseStock.upsert({
      where: {
        warehouseId_productId: {
          warehouseId,
          productId,
        },
      },
      create: {
        warehouseId,
        productId,
        quantity,
        shelfLocation: shelfLocation || "قفسه ورودی",
        minAlertQty: minAlertQty || 5,
      },
      update: {
        quantity,
        shelfLocation: shelfLocation !== undefined ? shelfLocation : undefined,
        minAlertQty: minAlertQty !== undefined ? minAlertQty : undefined,
      },
    });

    // محاسبه مجموع کل موجودی کالا در تمام انبارها جهت به‌روزرسانی فیلد اصلی محصول
    const allWarehouseStocks = await tx.warehouseStock.findMany({
      where: { productId },
      select: { quantity: true },
    });
    const totalQty = allWarehouseStocks.reduce((sum, s) => sum + s.quantity, 0);

    await tx.product.update({
      where: { id: productId },
      data: { stockQty: totalQty },
    });

    return updatedStock;
  });

  return NextResponse.json({
    ok: true,
    stock: {
      id: stock.id,
      warehouseId: stock.warehouseId,
      productId: stock.productId,
      quantity: stock.quantity,
      shelfLocation: stock.shelfLocation,
    },
  });
}
