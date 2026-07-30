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
