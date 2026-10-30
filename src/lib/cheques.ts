import { prisma } from "@/lib/prisma";

export const CHEQUE_STATUS = {
  RECEIVED: {
    label: "دریافت‌شده (در صف بررسی)",
    tone: "amber",
    description: "چک تحویل یا ثبت شده و در نوبت بررسی کارشناس مالی است",
  },
  REGISTERED_SAYAD: {
    label: "تأیید صیاد (اعتبار فعال)",
    tone: "green",
    description: "ثبت چک در سامانه صیاد بانک مرکزی تأیید و خط اعتباری فعال شد",
  },
  CLEARED: {
    label: "وصول‌شده (پاس‌شده)",
    tone: "green",
    description: "مبلغ چک به حساب شرکت کاردو واریز و تسویه شد",
  },
  BOUNCED: {
    label: "برگشتی (نکول)",
    tone: "red",
    description: "چک به دلیل عدم موجودی برگشت خورد؛ حساب مشتری مسدود گردید",
  },
  REJECTED: {
    label: "رد شده",
    tone: "red",
    description: "مشخصات چک یا استعلام اهلیت صادرکننده مورد تأیید قرار نگرفت",
  },
} as const;

export type ChequeStatusKey = keyof typeof CHEQUE_STATUS;

/*
 * اعتبارسنجی فرمت شناسه ۱۶ رقمی صیاد بانک مرکزی
 */
export function isValidSayadId(raw: string): boolean {
  const clean = raw.replace(/\D/g, "");
  return clean.length === 16;
}

/*
 * لیست بانک‌های معتبر جهت انتخاب آسان کاربر
 */
export const IRANIAN_BANKS = [
  "بانک ملی ایران",
  "بانک ملت",
  "بانک صادرات ایران",
  "بانک تجارت",
  "بانک سپه",
  "بانک کشاورزی",
  "بانک مسکن",
  "بانک رفاه کارگران",
  "بانک پاسارگاد",
  "بانک پارسیان",
  "بانک سامان",
  "بانک اقتصاد نوین",
  "بانک آینده",
  "بانک شهر",
  "بانک دی",
  "بانک سینا",
  "بانک کارآفرین",
  "بانک خاورمیانه",
  "پست بانک ایران",
] as const;

/*
 * محاسبه مجموع مبالغ چک‌های معتبر فعال یک مشتری
 */
export async function getActiveChequesSummary(customerId: string) {
  const cheques = await prisma.cheque.findMany({
    where: { customerId },
    orderBy: { dueDate: "asc" },
  });

  const now = new Date();

  // چک‌هایی که در صیاد تایید شده‌اند و هنوز موعد سررسیدشان نگذشته یا تسویه نشده‌اند
  const activeRegisteredAmount = cheques
    .filter((c) => c.status === "REGISTERED_SAYAD")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const pendingAmount = cheques
    .filter((c) => c.status === "RECEIVED")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const clearedAmount = cheques
    .filter((c) => c.status === "CLEARED")
    .reduce((sum, c) => sum + Number(c.amount), 0);

  const hasBounced = cheques.some((c) => c.status === "BOUNCED");

  return {
    cheques,
    totalCount: cheques.length,
    activeRegisteredAmount,
    pendingAmount,
    clearedAmount,
    hasBounced,
  };
}
