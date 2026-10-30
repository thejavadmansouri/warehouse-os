import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { nextRmaNumber } from "@/lib/numbering";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return apiError(401, "UNAUTHORIZED", "ابتدا وارد حساب همکار شوید");
  }

  const rmas = await prisma.rmaRequest.findMany({
    where: { customerId: user.customer.id },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          brand: true,
          partBrand: true,
          unit: true,
        },
      },
      order: {
        select: {
          id: true,
          number: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    rmas: rmas.map((r) => ({
      id: r.id,
      number: r.number,
      orderNumber: r.order.number,
      orderId: r.order.id,
      productName: r.product.name,
      sku: r.product.sku,
      brand: r.product.brand,
      partBrand: r.product.partBrand,
      qty: r.qty,
      unit: r.product.unit,
      reason: r.reason,
      customerNote: r.customerNote,
      adminNote: r.adminNote,
      status: r.status,
      refundAmount: r.refundAmount ? Number(r.refundAmount) : null,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: r.resolvedAt?.toISOString() || null,
    })),
  });
}

const rmaCreateSchema = z.object({
  orderId: z.string().min(1, "شناسه فاکتور الزامی است"),
  productId: z.string().min(1, "شناسه قطعه الزامی است"),
  qty: z.number().int().positive("تعداد قطعه مرجوعی باید بزرگتر از صفر باشد"),
  reason: z.enum(["DEFECTIVE", "WRONG_ITEM", "DAMAGED_IN_SHIPPING", "SURPLUS_ORDER"]),
  customerNote: z.string().trim().min(5, "لطفاً شرح کامل علت مرجوعی و وضعیت قطعه را قید فرمایید"),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "customer") {
    return apiError(401, "UNAUTHORIZED", "ابتدا وارد حساب همکار شوید");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = rmaCreateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی ناقص است");
  }

  const { orderId, productId, qty, reason, customerNote } = parsed.data;

  // بررسی تطابق سفارش با مشتری جاری
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!order || order.customerId !== user.customer.id) {
    return apiError(404, "ORDER_NOT_FOUND", "فاکتور مربوطه یافت نشد یا متعلق به شما نیست");
  }

  // بررسی وجود قلم کالا در سفارش
  const orderItem = order.items.find((it) => it.productId === productId);
  if (!orderItem) {
    return apiError(400, "ITEM_NOT_IN_ORDER", "این قطعه در ردیف‌های این فاکتور وجود ندارد");
  }

  if (qty > orderItem.qty) {
    return apiError(400, "QTY_EXCEEDED", `تعداد مرجوعی نمی‌تواند بیش از تعداد خریداری‌شده (${orderItem.qty}) باشد`);
  }

  const number = await nextRmaNumber();

  const rma = await prisma.rmaRequest.create({
    data: {
      number,
      orderId,
      customerId: user.customer.id,
      productId,
      qty,
      reason,
      customerNote,
      refundAmount: Number(orderItem.unitPrice) * qty,
      status: "PENDING",
    },
    include: {
      product: {
        select: {
          sku: true,
          name: true,
        },
      },
    },
  });

  return NextResponse.json({
    ok: true,
    rma: {
      id: rma.id,
      number: rma.number,
      status: rma.status,
      productName: rma.product.name,
      sku: rma.product.sku,
      qty: rma.qty,
    },
  });
}
