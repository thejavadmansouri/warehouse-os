import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { notifyBijakIssued } from "@/lib/notifications";

const updateShipmentSchema = z.object({
  status: z.enum(["PREPARING", "HANDED_TO_CARRIER", "DELIVERED", "CANCELLED"]).optional(),
  carrierName: z.string().trim().min(2).optional(),
  carrierPhone: z.string().trim().optional(),
  waybillNumber: z.string().trim().optional(),
  destinationCity: z.string().trim().optional(),
  destinationAddress: z.string().trim().optional(),
  freightCost: z.number().nonnegative().optional(),
  adminNote: z.string().trim().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت الزامی است");
  }

  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateShipmentSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "اطلاعات ارسالی نامعتبر است");
  }

  const data = parsed.data;
  const shipment = await prisma.shipment.findUnique({
    where: { id },
  });

  if (!shipment) {
    return apiError(404, "NOT_FOUND", "حواله ارسال یافت نشد");
  }

  const updatePayload: any = {
    ...data,
  };

  if (data.status === "HANDED_TO_CARRIER" && shipment.status !== "HANDED_TO_CARRIER") {
    updatePayload.shippedAt = new Date();
  } else if (data.status === "DELIVERED" && shipment.status !== "DELIVERED") {
    updatePayload.deliveredAt = new Date();
  }

  const updated = await prisma.shipment.update({
    where: { id },
    data: updatePayload,
  });

  if (
    (data.status === "HANDED_TO_CARRIER" || data.waybillNumber) &&
    updated.waybillNumber
  ) {
    try {
      const fullOrder = await prisma.order.findUnique({
        where: { id: updated.orderId },
        select: { customerId: true, number: true },
      });
      if (fullOrder) {
        await notifyBijakIssued({
          customerId: fullOrder.customerId,
          orderNumber: fullOrder.number,
          carrierName: updated.carrierName,
          waybillNumber: updated.waybillNumber,
          destinationCity: updated.destinationCity,
        });
      }
    } catch {
      // نادیده گرفتن خطای ثانویه نوتیفیکیشن
    }
  }

  return NextResponse.json({
    ok: true,
    shipment: {
      id: updated.id,
      status: updated.status,
      carrierName: updated.carrierName,
      waybillNumber: updated.waybillNumber,
      shippedAt: updated.shippedAt?.toISOString() || null,
      deliveredAt: updated.deliveredAt?.toISOString() || null,
    },
  });
}
