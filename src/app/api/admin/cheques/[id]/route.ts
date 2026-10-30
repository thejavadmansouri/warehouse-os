import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/current-user";
import { apiError } from "@/lib/api";
import { notifyChequeStatus } from "@/lib/notifications";

const updateChequeSchema = z.object({
  status: z.enum(["RECEIVED", "REGISTERED_SAYAD", "CLEARED", "BOUNCED", "REJECTED"]),
  adminNote: z.string().trim().optional(),
  sayadVerified: z.boolean().optional(),
  expandCredit: z.boolean().optional(), // آیا سقف اعتبار مشتری معادل این چک افزایش یابد؟
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await currentUser(req);
  if (!user || user.role !== "admin") {
    return apiError(403, "FORBIDDEN", "دسترسی مدیریت سامانه الزامی است");
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = updateChequeSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", parsed.error.issues[0]?.message || "داده‌های ارسالی نامعتبر است");
  }

  const { status, adminNote, sayadVerified, expandCredit } = parsed.data;

  const cheque = await prisma.cheque.findUnique({
    where: { id },
    include: { customer: true },
  });

  if (!cheque) {
    return apiError(404, "NOT_FOUND", "چک مورد نظر یافت نشد");
  }

  const now = new Date();
  const updateData: any = {
    status,
    adminNote: adminNote !== undefined ? adminNote : cheque.adminNote,
    sayadVerified: sayadVerified !== undefined ? sayadVerified : cheque.sayadVerified,
  };

  if (status === "CLEARED") {
    updateData.clearedAt = now;
  } else if (status === "BOUNCED") {
    updateData.bouncedAt = now;
  }

  // اجرای تراکنش به‌روزرسانی چک و تنظیم اعتبار مشتری
  const updatedCheque = await prisma.$transaction(async (tx) => {
    const updated = await tx.cheque.update({
      where: { id },
      data: updateData,
    });

    // اگر چک تأیید صیاد شد و ادمین گزینه افزایش سقف اعتبار را تیک زده باشد:
    if (status === "REGISTERED_SAYAD" && expandCredit) {
      const currentLimit = Number(cheque.customer.creditLimitOverride ?? 0);
      const newLimit = currentLimit + Number(cheque.amount);
      await tx.customer.update({
        where: { id: cheque.customerId },
        data: { creditLimitOverride: newLimit },
      });
    }

    // اگر چک برگشت خورد (نکول شد): وضعیت مشتری مسدود می‌شود
    if (status === "BOUNCED") {
      await tx.customer.update({
        where: { id: cheque.customerId },
        data: { status: "BLOCKED" },
      });
    }

    return updated;
  });

  try {
    if (status === "REGISTERED_SAYAD" || status === "CLEARED") {
      await notifyChequeStatus({
        customerId: cheque.customerId,
        sayadId: cheque.sayadId,
        status: "PASSED",
        amountToman: Number(cheque.amount),
      });
    } else if (status === "BOUNCED") {
      await notifyChequeStatus({
        customerId: cheque.customerId,
        sayadId: cheque.sayadId,
        status: "BOUNCED",
        amountToman: Number(cheque.amount),
      });
    }
  } catch {
    // نادیده گرفتن خطا در ارسال نوتیفیکیشن
  }

  return NextResponse.json({
    ok: true,
    cheque: {
      id: updatedCheque.id,
      status: updatedCheque.status,
      adminNote: updatedCheque.adminNote,
      sayadVerified: updatedCheque.sayadVerified,
      clearedAt: updatedCheque.clearedAt?.toISOString() || null,
      bouncedAt: updatedCheque.bouncedAt?.toISOString() || null,
    },
  });
}
