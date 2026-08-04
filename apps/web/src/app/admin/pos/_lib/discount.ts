/**
 * ریاضیِ تخفیف صندوق فروش.
 *
 * ترتیب محاسبه **عمداً** با سرور یکی است (`sales.service.ts` و
 * `quotations.service.ts`)، وگرنه عددی که فروشنده روی صفحه می‌بیند با عددی که
 * روی فاکتور ثبت می‌شود فرق می‌کند:
 *
 *   جمع هر ردیف = تعداد × قیمت واحد − تخفیف ردیف
 *   جمع اقلام   = Σ جمع ردیف‌ها          ← سرور اسمش را subtotal گذاشته
 *   مبلغ نهایی  = جمع اقلام − تخفیف کل فاکتور
 *
 * درصد فقط در رابط کاربری وجود دارد؛ سرور همیشه عدد تومانی می‌گیرد. آنچه ذخیره
 * می‌کنیم «ورودیِ فروشنده + حالتش» است نه عدد نهایی، تا اگر تعداد یا قیمت عوض
 * شد، درصد خودش دوباره اعمال شود — این همان چیزی است که فروشنده انتظار دارد.
 */

export type DiscountMode = "amount" | "percent";

export interface DiscountInput {
  /** عددی که فروشنده تایپ کرده — بسته به mode، تومان است یا درصد. */
  value: number;
  mode: DiscountMode;
}

export const NO_DISCOUNT: DiscountInput = { value: 0, mode: "amount" };

/** سقف درصد. بیشتر از ۱۰۰٪ یعنی فروشنده به مشتری پول بدهد. */
export const MAX_PERCENT = 100;

/**
 * ورودی تخفیف را به تومان تبدیل می‌کند و به `base` محدودش می‌کند.
 *
 * محدودکردن اینجا لازم است چون سرور تخفیف بیشتر از مبلغ را با
 * DISCOUNT_EXCEEDS_TOTAL رد می‌کند؛ بهتر است فروشنده همان لحظه ببیند تا اینکه
 * سرِ ثبت خطا بخورد.
 */
export function discountToToman(input: DiscountInput, base: number): number {
  if (base <= 0) return 0;
  const raw =
    input.mode === "percent"
      ? Math.round((base * clamp(input.value, 0, MAX_PERCENT)) / 100)
      : Math.round(input.value);
  return clamp(raw, 0, base);
}

/** درصدِ معادلِ یک تخفیف تومانی — برای نمایش کنار مبلغ. */
export function tomanToPercent(amount: number, base: number): number {
  if (base <= 0) return 0;
  return Math.round((amount / base) * 1000) / 10; // یک رقم اعشار
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}
