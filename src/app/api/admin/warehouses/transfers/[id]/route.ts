import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

const updateTransferStatusSchema = z.object({
  status: z.enum(["DRAFT", "IN_TRANSIT", "RECEIVED", "CANCELLED"]),
  driverName: z.string().trim().optional(),
  driverPhone: z.string().trim().optional(),
  vehiclePlate: z.string().trim().optional(),
  note: z.string().trim().optional(),
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
  const parsed = updateTransferStatusSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی نامعتبر است");
  }

  const { status, driverName, driverPhone, vehiclePlate, note } = parsed.data;

  const transfer = await prisma.stockTransfer.findUnique({
    where: { id },
    include: { items: true },
  });

  if (!transfer) {
    return apiError(404, "NOT_FOUND", "حواله انتقال یافت نشد");
  }

  if (transfer.status === status) {
    return NextResponse.json({ ok: true, status });
  }

  // فرآیند انتقال اتمیک با دیتابیس تراکنشی
  await prisma.$transaction(async (tx) => {
    // الف) خروج بار از انبار مبدأ و حرکت جاده‌ای بین‌شهری
    if (status === "IN_TRANSIT" && transfer.status === "DRAFT") {
      for (const item of transfer.items) {
        const sourceStock = await tx.warehouseStock.findUnique({
          where: {
            warehouseId_productId: {
              warehouseId: transfer.fromWarehouseId,
              productId: item.productId,
            },
          },
        });

        if (!sourceStock || sourceStock.quantity < item.qty) {
          throw new Error(`موجودی کالا در انبار مبدأ جهت خروج کافی نیست.`);
        }

        await tx.warehouseStock.update({
          where: { id: sourceStock.id },
          data: { quantity: { decrement: item.qty } },
        });
      }

      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: "IN_TRANSIT",
          dispatchedAt: new Date(),
          driverName: driverName || transfer.driverName,
          driverPhone: driverPhone || transfer.driverPhone,
          vehiclePlate: vehiclePlate || transfer.vehiclePlate,
          note: note !== undefined ? note : transfer.note,
        },
      });
      return;
    }

    // ب) تخلیه، شمارش و ورود به موجودی انبار مقصد در شهرستان
    if (status === "RECEIVED" && transfer.status === "IN_TRANSIT") {
      for (const item of transfer.items) {
        await tx.warehouseStock.upsert({
          where: {
            warehouseId_productId: {
              warehouseId: transfer.toWarehouseId,
              productId: item.productId,
            },
          },
          create: {
            warehouseId: transfer.toWarehouseId,
            productId: item.productId,
            quantity: item.qty,
            shelfLocation: "قفسه ورودی جدید",
          },
          update: {
            quantity: { increment: item.qty },
          },
        });
      }

      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: "RECEIVED",
          receivedAt: new Date(),
          note: note !== undefined ? note : transfer.note,
        },
      });
      return;
    }

    // ج) لغو حواله
    if (status === "CANCELLED") {
      // اگر بار در حال حرکت بوده، باید موجودی به انبار مبدأ برگشت بخورد
      if (transfer.status === "IN_TRANSIT") {
        for (const item of transfer.items) {
          await tx.warehouseStock.update({
            where: {
              warehouseId_productId: {
                warehouseId: transfer.fromWarehouseId,
                productId: item.productId,
              },
            },
            data: { quantity: { increment: item.qty } },
          });
        }
      }

      await tx.stockTransfer.update({
        where: { id },
        data: {
          status: "CANCELLED",
          note: note !== undefined ? note : transfer.note,
        },
      });
      return;
    }

    throw new Error(`انتقال وضعیت از ${transfer.status} به ${status} مجاز نمی‌باشد.`);
  });

  return NextResponse.json({
    ok: true,
    status,
  });
}
