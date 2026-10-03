/**
 * تفاوتِ فروشِ مدت‌دار روی یک چک — نسخه‌ی کلاینت.
 *
 * **سرور مرجع است.** این تابع فقط برای پیش‌نمایش است تا فروشنده پیش از ثبت،
 * عدد را ببیند؛ چیزی که ذخیره می‌شود خروجیِ همان تابع در سرور است
 * (`apps/api/src/common/cheque-charge.ts`). هر دو یک فرمول و یک قاعده‌ی
 * گردکردن دارند و هر دو تست دارند، تا عددِ روی صفحه با عددِ روی فاکتور یکی باشد.
 *
 * نرخ به پایه‌ی هزارم است نه اعشار: ۲.۵٪ می‌شود ۲۵۰. سود ساده است نه مرکب.
 */

export type ChequeRateMode = "FLAT" | "MONTHLY";

/** یک ماهِ قراردادی — ماهِ شمسی ۲۹ تا ۳۱ روز است. */
export const DAYS_PER_MONTH = 30;

/** سقفِ سود: بیشتر از خودِ مبلغِ پایه نمی‌شود. جلوی نرخِ اشتباه‌تایپ‌شده را می‌گیرد. */
export const MAX_CHARGE_RATIO = 1;

export function computeChequeCharge(input: {
  base: number;
  rateBp: number;
  months: number;
  mode: ChequeRateMode;
}): number {
  const { base, rateBp, mode } = input;
  if (base <= 0 || rateBp <= 0) return 0;

  const months = mode === "MONTHLY" ? Math.max(0, input.months) : 1;
  if (months === 0) return 0;

  const charge = Math.round((base * rateBp * months) / 10_000);
  return Math.min(charge, base * MAX_CHARGE_RATIO);
}

/**
 * تعدادِ ماهِ پیشنهادی از سررسید — فقط پیشنهاد.
 * فروشنده می‌گوید «سه‌ماهه»، نه «هشتاد و نه روزه»، پس قابلِ ویرایش است.
 */
export function suggestMonths(dueDate: string, from: Date = new Date()): number {
  const days = Math.ceil(
    (new Date(dueDate).getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return 0;
  return Math.max(1, Math.round(days / DAYS_PER_MONTH));
}

/** نرخ به درصدِ خوانا، برای نمایش. ۲۵۰ → «۲.۵» */
export function bpToPercent(bp: number): string {
  return String(bp / 100);
}

/** درصدِ تایپ‌شده → پایه‌ی هزارم. «۲.۵» → ۲۵۰ */
export function percentToBp(percent: string | number): number {
  const n = typeof percent === "number" ? percent : Number(percent);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
