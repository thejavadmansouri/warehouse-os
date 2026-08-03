// ابزارهای قالب‌بندی عدد و تاریخ (تاریخ جلالی با Intl خود مرورگر)

export function formatNumber(n?: number | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US");
}

export function formatPrice(n?: number | null): string {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString("en-US");
}

export function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "مدیر کل",
  MANAGER: "مدیر",
  STAFF: "کاربر",
  SALES: "فروشنده",
};

export const ACTION_LABELS: Record<string, string> = {
  IN: "ورود",
  OUT: "خروج",
  TRANSFER: "انتقال",
  ADJUST: "تعدیل",
  SALE: "فروش",
  RETURN: "مرجوع",
  COUNT: "شمارش",
};

export const ACTION_BADGE_CLASS: Record<string, string> = {
  IN: "bg-emerald-100 text-emerald-700",
  OUT: "bg-rose-100 text-rose-700",
  TRANSFER: "bg-sky-100 text-sky-700",
  ADJUST: "bg-amber-100 text-amber-700",
  SALE: "bg-violet-100 text-violet-700",
  RETURN: "bg-teal-100 text-teal-700",
  COUNT: "bg-slate-100 text-slate-700",
};

// =====================================================
// ارقام فارسی و پول (تومان) — طبق docs/DESIGN_SYSTEM.md
// =====================================================

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** ارقام انگلیسی → فارسی، فقط برای نمایش. */
export function toFa(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "—";
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/**
 * ارقام فارسی/عربی → انگلیسی، و حذف جداکننده‌ها.
 * ورودی کاربر باید هم فارسی هم انگلیسی را قبول کند.
 */
export function faToEn(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** رشته‌ی تایپ‌شده‌ی کاربر → عدد. هر جداکننده و رقم فارسی را می‌پذیرد. */
export function parseNum(input: string): number {
  const cleaned = faToEn(input).replace(/[^\d-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * مبلغ با جداکننده‌ی هزارگان و ارقام فارسی — بدون کلمه‌ی واحد.
 * جداکننده باید «٬» فارسی باشد؛ کاماست انگلیسی کنار ارقام فارسی بد می‌نشیند.
 */
export function money(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  return toFa(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬");
}

/** مبلغ کامل با واحد. واحد پول کل سیستم تومان است. */
export function toman(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${money(n)} تومان`;
}

/** تعداد با ارقام فارسی. */
export function qty(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  return toFa(n.toLocaleString("en-US")).replace(/,/g, "٬");
}

/** تاریخ شمسی کوتاه با ارقام فارسی: ۱۴۰۵/۰۵/۱۲ */
export function faDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-nu-arabext", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: "نقد",
  CARD: "کارتخوان",
  CHEQUE: "چک",
  CREDIT: "نسیه",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  CONFIRMED: "تأیید شده",
  CANCELLED: "باطل شده",
};
