import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() || undefined;

  const warehouse = await prisma.warehouse.findUnique({
    where: { id },
  });

  if (!warehouse) {
    return apiError(404, "NOT_FOUND", "انبار مورد نظر یافت نشد");
  }

  const stockWhere: any = { warehouseId: id };
  if (q) {
    stockWhere.product = {
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { shelfLocation: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const stocks = await prisma.warehouseStock.findMany({
    where: stockWhere,
    orderBy: { updatedAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          brand: true,
          category: true,
          partBrand: true,
          unit: true,
          price: true,
        },
      },
    },
    take: 100,
  });

  return NextResponse.json({
    ok: true,
    warehouse,
    stocks: stocks.map((s) => ({
      id: s.id,
      productId: s.productId,
      sku: s.product.sku,
      name: s.product.name,
      brand: s.product.brand,
      category: s.product.category,
      partBrand: s.product.partBrand,
      unit: s.product.unit,
      price: Number(s.product.price),
      quantity: s.quantity,
      reservedQty: s.reservedQty,
      availableQty: s.quantity - s.reservedQty,
      shelfLocation: s.shelfLocation || "نامشخص",
      minAlertQty: s.minAlertQty,
      updatedAt: s.updatedAt.toISOString(),
    })),
  });
}

const updateWarehouseSchema = z.object({
  name: z.string().trim().min(2).optional(),
  city: z.string().trim().min(2).optional(),
  address: z.string().trim().min(5).optional(),
  phone: z.string().trim().optional(),
  managerName: z.string().trim().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateWarehouseSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات نامعتبر است");
  }

  const updated = await prisma.warehouse.update({
    where: { id },
    data: parsed.data,
  });

  return NextResponse.json({
    ok: true,
    warehouse: updated,
  });
}
