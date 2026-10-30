import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";

/** ادمین: لیست محصولات (شامل غیرفعال) */
export async function GET(req: NextRequest) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const products = await prisma.product.findMany({
    orderBy: [{ brand: "asc" }, { name: "asc" }],
    include: { volumePrices: { orderBy: { qtyFrom: "asc" } } },
    take: 300,
  });

  return NextResponse.json({
    ok: true,
    products: products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      model: p.model,
      category: p.category,
      unit: p.unit,
      packSize: p.packSize,
      minQty: p.minQty,
      price: Number(p.price),
      stockQty: p.stockQty,
      isActive: p.isActive,
      volumePrices: p.volumePrices.map((v) => ({
        qtyFrom: v.qtyFrom,
        discountPercent: Number(v.discountPercent),
      })),
    })),
  });
}

/*
 * ادمین: ساخت محصول + پله‌های تخفیف.
 * قیمت به تومان و صحیح ذخیره می‌شود.
 */
const createSchema = z.object({
  sku: z.string().trim().min(1, "کد فنی الزامی است"),
  oemCode: z.string().trim().optional(),
  barcode: z.string().trim().optional(),
  name: z.string().trim().min(2, "نام قطعه الزامی است"),
  description: z.string().trim().optional(),
  brand: z.string().trim().min(1, "برند خودرو الزامی است"),
  model: z.string().trim().optional(),
  category: z.string().trim().min(1, "دسته الزامی است"),
  unit: z.string().trim().default("عدد"),
  packSize: z.number().int().min(1).default(1),
  minQty: z.number().int().min(1).default(1),
  price: z.number().int().min(1000, "قیمت نامعتبر"),
  stockQty: z.number().int().min(0).default(0),
  imageUrl: z.string().trim().optional(),
  volumePrices: z
    .array(z.object({ qtyFrom: z.number().int().min(2), discountPercent: z.number().min(0).max(80) }))
    .default([]),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);

  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی ادمین لازم است");
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده نامعتبر");
  }

  const input = parsed.data;

  if (await prisma.product.findUnique({ where: { sku: input.sku } })) {
    return apiError(409, "SKU_EXISTS", "این کد فنی قبلاً ثبت شده");
  }

  const product = await prisma.product.create({
    data: {
      sku: input.sku,
      oemCode: input.oemCode || null,
      barcode: input.barcode || null,
      name: input.name,
      description: input.description || null,
      brand: input.brand,
      model: input.model || null,
      category: input.category,
      unit: input.unit,
      packSize: input.packSize,
      minQty: input.minQty,
      price: input.price,
      stockQty: input.stockQty,
      imageUrl: input.imageUrl || null,
      volumePrices: {
        create: input.volumePrices
          .sort((a, b) => a.qtyFrom - b.qtyFrom)
          .map((v) => ({ qtyFrom: v.qtyFrom, discountPercent: v.discountPercent })),
      },
    },
  });

  return NextResponse.json({ ok: true, productId: product.id });
}
