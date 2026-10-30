import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";

export async function GET(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت لجستیک الزامی است");
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const city = searchParams.get("city") || undefined;
  const q = searchParams.get("q")?.trim() || undefined;

  const whereClause: any = {};

  if (status && status !== "ALL") {
    whereClause.status = status;
  }
  if (city && city !== "ALL") {
    whereClause.destinationCity = city;
  }
  if (q) {
    whereClause.OR = [
      { waybillNumber: { contains: q, mode: "insensitive" } },
      { carrierName: { contains: q, mode: "insensitive" } },
      { order: { number: { contains: q, mode: "insensitive" } } },
      { order: { customer: { companyName: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const shipments = await prisma.shipment.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
    include: {
      order: {
        select: {
          id: true,
          number: true,
          status: true,
          total: true,
          items: {
            select: {
              id: true,
              name: true,
              sku: true,
              qty: true,
            },
          },
          customer: {
            select: {
              id: true,
              companyName: true,
              contactName: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  // آمار کلی لجستیک برای هدر پنل
  const [totalPreparing, totalShipped, totalDelivered] = await Promise.all([
    prisma.shipment.count({ where: { status: "PREPARING" } }),
    prisma.shipment.count({ where: { status: "HANDED_TO_CARRIER" } }),
    prisma.shipment.count({ where: { status: "DELIVERED" } }),
  ]);

  // همچنین لیست سفارش‌های تأییدشده‌ای که هنوز فاقد حواله ارسال هستند
  const pendingOrdersWithoutShipment = await prisma.order.findMany({
    where: {
      status: { in: ["PAID", "APPROVED_CREDIT"] },
      shipment: null,
    },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      createdAt: true,
      customer: {
        select: {
          id: true,
          companyName: true,
          phone: true,
          address: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    ok: true,
    stats: {
      totalPreparing,
      totalShipped,
      totalDelivered,
      pendingOrdersCount: pendingOrdersWithoutShipment.length,
    },
    pendingOrdersWithoutShipment: pendingOrdersWithoutShipment.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      total: Number(o.total),
      companyName: o.customer.companyName,
      phone: o.customer.phone,
      address: o.customer.address,
      createdAt: o.createdAt.toISOString(),
    })),
    shipments: shipments.map((s) => ({
      id: s.id,
      orderId: s.orderId,
      orderNumber: s.order.number,
      orderStatus: s.order.status,
      customerName: s.order.customer.companyName,
      customerContact: s.order.customer.contactName,
      customerPhone: s.order.customer.phone,
      itemCount: s.order.items.reduce((sum, it) => sum + it.qty, 0),
      itemsSummary: s.order.items.map((it) => `${it.name} (${it.qty})`).join("، "),
      carrierName: s.carrierName,
      carrierPhone: s.carrierPhone,
      waybillNumber: s.waybillNumber,
      destinationCity: s.destinationCity,
      destinationAddress: s.destinationAddress,
      receiverName: s.receiverName,
      receiverPhone: s.receiverPhone,
      freightPaymentType: s.freightPaymentType,
      freightCost: s.freightCost ? Number(s.freightCost) : null,
      status: s.status,
      shippedAt: s.shippedAt?.toISOString() || null,
      deliveredAt: s.deliveredAt?.toISOString() || null,
      adminNote: s.adminNote,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

const createShipmentSchema = z.object({
  orderId: z.string().min(1, "شناسه سفارش الزامی است"),
  carrierName: z.string().trim().min(2, "نام باربری یا حامل الزامی است"),
  carrierPhone: z.string().trim().optional(),
  waybillNumber: z.string().trim().optional(),
  destinationCity: z.string().trim().min(2, "شهر مقصد در استان کرمان الزامی است"),
  destinationAddress: z.string().trim().optional(),
  receiverName: z.string().trim().optional(),
  receiverPhone: z.string().trim().optional(),
  freightPaymentType: z.enum(["PAY_ON_DELIVERY", "PREPAID", "FREE_SHIPPING"]).default("PAY_ON_DELIVERY"),
  freightCost: z.number().nonnegative().optional(),
  adminNote: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت لجستیک الزامی است");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createShipmentSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی ناقص است");
  }

  const data = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: data.orderId },
    include: { shipment: true },
  });

  if (!order) {
    return apiError(404, "ORDER_NOT_FOUND", "سفارش مورد نظر یافت نشد");
  }

  if (order.shipment) {
    return apiError(400, "SHIPMENT_EXISTS", "برای این سفارش قبلاً حواله ارسال صادر شده است");
  }

  const shipment = await prisma.shipment.create({
    data: {
      orderId: order.id,
      carrierName: data.carrierName,
      carrierPhone: data.carrierPhone || null,
      waybillNumber: data.waybillNumber || null,
      destinationCity: data.destinationCity,
      destinationAddress: data.destinationAddress || null,
      receiverName: data.receiverName || null,
      receiverPhone: data.receiverPhone || null,
      freightPaymentType: data.freightPaymentType,
      freightCost: data.freightCost !== undefined ? data.freightCost : null,
      adminNote: data.adminNote || null,
      status: "PREPARING",
    },
  });

  return NextResponse.json({
    ok: true,
    shipment: {
      id: shipment.id,
      status: shipment.status,
      carrierName: shipment.carrierName,
      destinationCity: shipment.destinationCity,
    },
  });
}
