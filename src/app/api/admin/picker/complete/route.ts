import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { currentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { notifyBijakIssued } from "@/lib/notifications";

const schema = z.object({
  orderId: z.string().min(1),
  waybillNumber: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت الزامی است");
  }

  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION", "اطلاعات ارسالی ناقص است");
  }

  const { orderId, waybillNumber } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { shipment: true, customer: true },
  });

  if (!order || !order.shipment) {
    return apiError(404, "NOT_FOUND", "سفارش یا حواله ارسال یافت نشد");
  }

  const effectiveBijak =
    waybillNumber ||
    order.shipment.waybillNumber ||
    `BIJAK-${Math.floor(10000 + Math.random() * 90000)}-KERMAN`;

  const updatedShipment = await prisma.shipment.update({
    where: { id: order.shipment.id },
    data: {
      status: "HANDED_TO_CARRIER",
      waybillNumber: effectiveBijak,
      shippedAt: new Date(),
    },
  });

  // ارسال پیامک و نوتیفیکیشن به مشتری
  await notifyBijakIssued({
    customerId: order.customerId,
    orderNumber: order.number,
    carrierName: updatedShipment.carrierName,
    waybillNumber: effectiveBijak,
    destinationCity: updatedShipment.destinationCity,
  });

  return NextResponse.json({
    ok: true,
    waybillNumber: effectiveBijak,
    status: updatedShipment.status,
  });
}
