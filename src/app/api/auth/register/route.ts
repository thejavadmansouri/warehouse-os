import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api";
import { normalizePhone } from "@/lib/phone";

/*
 * ثبت‌نام شرکت جدید — حسابی با وضعیت PENDING می‌سازد؛
 * قیمت‌ها فقط بعد از تأیید دستی ادمین فعال می‌شوند (فاز ۱ = تأیید دستی).
 */
const bodySchema = z.object({
  companyName: z.string().trim().min(3, "نام شرکت/فروشگاه الزامی است"),
  contactName: z.string().trim().min(3, "نام نماینده الزامی است"),
  phone: z.string().min(10, "شماره موبایل الزامی است"),
  nationalId: z.string().trim().optional(),
  address: z.string().trim().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "داده نامعتبر");
  }

  const phone = normalizePhone(parsed.data.phone);

  if (!phone) {
    return apiError(400, "INVALID_PHONE", "شماره موبایل نامعتبر است (مثال: ۰۹۱۲۳۴۵۶۷۸۹)");
  }

  const exists = await prisma.customer.findUnique({ where: { phone } });

  if (exists) {
    return apiError(
      409,
      "PHONE_EXISTS",
      "این شماره قبلاً ثبت شده — ثبت‌نام جدید لازم نیست، از فرم ورود ادامه دهید.",
    );
  }

  // کد ملی می‌تواند یکتا نباشد ولی اگر داد، یا خالی یا ۱۰ رقم
  if (parsed.data.nationalId && !/^\d{10}$/.test(parsed.data.nationalId)) {
    return apiError(400, "INVALID_NATIONAL_ID", "کد ملی باید ۱۰ رقم باشد");
  }

  const customer = await prisma.customer.create({
    data: {
      companyName: parsed.data.companyName,
      contactName: parsed.data.contactName,
      phone,
      nationalId: parsed.data.nationalId || null,
      address: parsed.data.address || null,
      status: "PENDING",
    },
  });

  return NextResponse.json({
    ok: true,
    customerId: customer.id,
    message: "ثبت‌نام انجام شد. حساب شما در انتظار تأیید ادمین است.",
  });
}
