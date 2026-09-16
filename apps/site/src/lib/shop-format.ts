// قالب‌بندی مبلغ و برچسب‌ها برای فروشگاه اینترنتی.
//
// اعدادِ اینجا را سرور از قبل به واحدِ نمایشِ سایت (`settings.unit`) تبدیل کرده،
// پس برچسب واحد هم باید از همین settings بیاید — نه از `lib/currency` پنل
// که `panelUnit` را می‌گوید و ممکن است با سایت فرق کند.
import { toFa } from "./format";
import type { CurrencyUnit } from "./shop-types";

const UNIT_LABELS: Record<CurrencyUnit, string> = {
  RIAL: "ریال",
  TOMAN: "تومان",
};

/** عددِ به‌واحدِسایت + برچسب واحد، با جداکننده‌ی هزارگان فارسی. */
export function shopMoney(n: number | null | undefined, unit: CurrencyUnit): string {
  if (n === null || n === undefined) return "—";
  const digits = toFa(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬");
  return `${digits} ${UNIT_LABELS[unit]}`;
}

/** فقط ارقام (بدون واحد) — برای جاییکه ستون واحد دارد. */
export function shopMoneyOnly(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return toFa(Math.round(n).toLocaleString("en-US")).replace(/,/g, "٬");
}

export type ShopOrderStatus =
  | "PLACED"
  | "PREPARING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

export const SHOP_STATUS_LABELS: Record<ShopOrderStatus, string> = {
  PLACED: "ثبت سفارش",
  PREPARING: "در حال آماده‌سازی",
  SHIPPED: "ارسال شد",
  DELIVERED: "تحویل شد",
  CANCELLED: "لغو شده",
};

export const SHOP_STATUS_BADGE: Record<ShopOrderStatus, string> = {
  PLACED: "bg-sky-100 text-sky-700",
  PREPARING: "bg-amber-100 text-amber-700",
  SHIPPED: "bg-violet-100 text-violet-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-rose-100 text-rose-700",
};

export const SHOP_PAY_LABELS: Record<string, string> = {
  ON_DELIVERY: "پرداخت در محل",
  TRANSFER: "کارت‌به‌کارت",
  GATEWAY: "درگاه اینترنتی",
};

export const SHOP_PAY_CLASS: Record<string, string> = {
  ON_DELIVERY: "bg-slate-100 text-slate-700",
  TRANSFER: "bg-emerald-100 text-emerald-700",
  GATEWAY: "bg-violet-100 text-violet-700",
};

export const STOCK_LABELS: Record<string, { label: string; cls: string }> = {
  IN: { label: "موجود", cls: "bg-emerald-100 text-emerald-700" },
  LOW: { label: "موجودی محدود", cls: "bg-amber-100 text-amber-700" },
  OUT: { label: "ناموجود", cls: "bg-rose-100 text-rose-700" },
};