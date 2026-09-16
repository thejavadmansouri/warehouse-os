/**
 * دیکشنری مالی — تنها منبعِ واژه‌ها و رنگ‌های «مانده» و «وضعیت پرداخت».
 *
 * تا حالا هر صفحه خودش تصمیم می‌گرفت: یک‌جا «بدهکار» کهربایی با کلاسِ
 * amber-600، جای دیگر text-warning؛ یک‌جا «تأییدشده» بدون فاصله، جای دیگر
 * «تأیید شده». از این پس همه‌ی صفحات (صندوق، فاکتورها، کارت حساب، حساب‌بازها)
 * فقط مصرف‌کننده‌ی همین فایل‌اند — تصمیمِ تأییدشده:
 *   واژگان: بدهکار / طلبکار — زبانِ بازار
 *   وضعیت پرداخت: پرداخت کامل (سبز) / نسیه (کهربایی) / معوق (قرمز)
 */

/** مانده‌ی مثبت = مشتری به ما بدهی دارد؛ منفی = ما طلبکاریم (پول مشتری نزد ماست). */
export const BALANCE = {
  debtor: { label: "بدهکار", text: "text-warning" },
  creditor: { label: "طلبکار", text: "text-success" },
  settled: { label: "تسویه", text: "text-muted-foreground" },
} as const;

export type BalanceKind = keyof typeof BALANCE;

export function balanceKind(amount: number | null | undefined): BalanceKind {
  if (!amount || amount === 0) return "settled";
  return amount > 0 ? "debtor" : "creditor";
}

/** کلاسِ نشانِ مانده — همان زبانِ رنگِ StatusBadge (outline + تُن). */
export const BALANCE_BADGE_CLASS: Record<BalanceKind, string> = {
  debtor: "border-warning/40 bg-warning/15 text-warning",
  creditor: "border-success/30 bg-success/10 text-success",
  settled: "border-border bg-muted text-muted-foreground",
};

export const PAY_STATUS = {
  paid: { label: "پرداخت کامل", cls: "border-success/30 bg-success/10 text-success" },
  credit: { label: "نسیه", cls: "border-warning/40 bg-warning/15 text-warning" },
  overdue: { label: "معوق", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
} as const;

export type PayStatusKey = keyof typeof PAY_STATUS;

export interface PayStatusInput {
  total?: number | null;
  dueAmount?: number | null;
  status?: string | null;
  dueDate?: string | null;
}

/** ابتدای امروز به وقت محلی — «معوق» یعنی سررسیدِ دیروز یا قبل، نه امروز. */
export function startOfToday(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * وضعیت پرداختِ یک فاکتور — تنها جایی که این تصمیم گرفته می‌شود:
 *   باطل            → void (نشانِ پرداخت نمی‌گیرد؛ نشانِ «باطل» کارِ StatusBadge است)
 *   مانده ≤ ۰      → پرداخت کامل
 *   سررسید گذشته   → معوق
 *   بقیه            → نسیه
 */
export function payStatus(inv: PayStatusInput, now: Date = new Date()): PayStatusKey | "void" {
  if (inv.status === "CANCELLED") return "void";
  const due = inv.dueAmount ?? 0;
  if (due <= 0) return "paid";
  if (inv.dueDate && new Date(inv.dueDate).getTime() < startOfToday(now).getTime()) {
    return "overdue";
  }
  return "credit";
}
