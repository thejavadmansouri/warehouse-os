import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { nextTransferNumber } from "@/lib/numbering";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;

  const whereClause: any = {};
  if (status && status !== "ALL") whereClause.status = status;

  const transfers = await prisma.stockTransfer.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      fromWarehouse: { select: { id: true, name: true, city: true, code: true } },
      toWarehouse: { select: { id: true, name: true, city: true, code: true } },
      items: {
        include: {
          product: {
            select: { id: true, sku: true, name: true, unit: true, brand: true },
          },
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    transfers: transfers.map((t) => ({
      id: t.id,
      number: t.number,
      fromWarehouse: t.fromWarehouse,
      toWarehouse: t.toWarehouse,
      status: t.status,
      driverName: t.driverName,
      driverPhone: t.driverPhone,
      vehiclePlate: t.vehiclePlate,
      dispatchedAt: t.dispatchedAt?.toISOString() || null,
      receivedAt: t.receivedAt?.toISOString() || null,
      note: t.note,
      createdAt: t.createdAt.toISOString(),
      itemCount: t.items.reduce((s, it) => s + it.qty, 0),
      items: t.items.map((it) => ({
        id: it.id,
        productId: it.productId,
        sku: it.product.sku,
        name: it.product.name,
        brand: it.product.brand,
        unit: it.product.unit,
        qty: it.qty,
      })),
    })),
  });
}

const createTransferSchema = z.object({
  fromWarehouseId: z.string().min(1, "انبار مبدأ الزامی است"),
  toWarehouseId: z.string().min(1, "انبار مقصد الزامی است"),
  driverName: z.string().trim().optional(),
  driverPhone: z.string().trim().optional(),
  vehiclePlate: z.string().trim().optional(),
  note: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        qty: z.number().int().positive("تعداد باید بزرگتر از صفر باشد"),
      })
    )
    .min(1, "حداقل یک قلم کالا برای انتقال الزامی است"),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت انبار الزامی است");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createTransferSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی نامعتبر است");
  }

  const data = parsed.data;
  if (data.fromWarehouseId === data.toWarehouseId) {
    return apiError(400, "SAME_WAREHOUSE", "انبار مبدأ و مقصد نمی‌توانند یکسان باشند");
  }

  // بررسی موجودی اقلام در انبار مبدأ
  for (const it of data.items) {
    const stock = await prisma.warehouseStock.findUnique({
      where: {
        warehouseId_productId: {
          warehouseId: data.fromWarehouseId,
          productId: it.productId,
        },
      },
    });

    if (!stock || stock.quantity < it.qty) {
      const prod = await prisma.product.findUnique({ where: { id: it.productId } });
      return apiError(
        400,
        "INSUFFICIENT_STOCK",
        `موجودی کالای "${prod?.name || it.productId}" در انبار مبدأ کافی نیست (موجودی: ${stock?.quantity || 0}، درخواستی: ${it.qty})`
      );
    }
  }

  const number = await nextTransferNumber();

  const transfer = await prisma.stockTransfer.create({
    data: {
      number,
      fromWarehouseId: data.fromWarehouseId,
      toWarehouseId: data.toWarehouseId,
      driverName: data.driverName || null,
      driverPhone: data.driverPhone || null,
      vehiclePlate: data.vehiclePlate || null,
      note: data.note || null,
      status: "DRAFT",
      items: {
        create: data.items.map((it) => ({
          productId: it.productId,
          qty: it.qty,
        })),
      },
    },
    include: {
      items: true,
    },
  });

  return NextResponse.json({
    ok: true,
    transfer: {
      id: transfer.id,
      number: transfer.number,
      status: transfer.status,
    },
  });
}
