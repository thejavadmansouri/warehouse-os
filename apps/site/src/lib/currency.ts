/**
 * واحد پولِ نمایش در پنل.
 *
 * دو عدد در بازی‌اند و قاطی‌کردنشان گران تمام می‌شود:
 *
 *   • `stored` — عددهای داخل دیتابیس به این واحدند. یک **واقعیت** است.
 *   • `panel`  — کاربر می‌خواهد چه ببیند. یک **انتخاب** است.
 *
 * تبدیل فقط در لبه‌ی نمایش انجام می‌شود؛ هرچه به سرور می‌رود همیشه به `stored`
 * برمی‌گردد. برای همین `toDisplay` و `fromDisplay` جفت‌اند و هرجا یکی استفاده
 * شد، آن‌طرفِ همان مسیر باید دیگری را داشته باشد.
 *
 * چرا ماژول‌سطح و نه context: `money()` یک تابع ساده است که در ده‌ها جای
 * غیرکامپوننتی (فرمت‌کردن داخل map، ساخت رشته‌ی چاپ) صدا زده می‌شود. تبدیلش به
 * hook یعنی بازنویسی همه‌ی آن‌ها. کلِ پنل client-render است، پس این متغیر در
 * هر تب مرورگر مستقل است و نشتِ بین‌درخواستیِ SSR موضوعیت ندارد.
 */

export type CurrencyUnit = "RIAL" | "TOMAN";

const LABELS: Record<CurrencyUnit, string> = {
  RIAL: "ریال",
  TOMAN: "تومان",
};

/**
 * پیش‌فرض عمداً «هر دو ریال» است، یعنی «تبدیل نکن».
 *
 * تا وقتی تنظیمات از سرور نرسیده، بدترین حالتِ ممکن باید «همان رفتار قبلی»
 * باشد نه یک عددِ ده‌برابرشده روی صفحه.
 */
let config: { stored: CurrencyUnit; panel: CurrencyUnit } = {
  stored: "RIAL",
  panel: "RIAL",
};

/** یک بار موقع بالا آمدن پنل، از `/shop-settings`. */
export function setCurrencyConfig(next: {
  stored: CurrencyUnit;
  panel: CurrencyUnit;
}) {
  config = next;
}

export function currencyConfig() {
  return config;
}

/** برچسبی که کنار عدد چاپ می‌شود — «ریال» یا «تومان». */
export function unitLabel(unit: CurrencyUnit = config.panel): string {
  return LABELS[unit];
}

/**
 * تبدیل بین دو واحد. رابطه ثابت است: ۱ تومان = ۱۰ ریال.
 *
 * ⚠️ ریال → تومان رقم آخر را از دست می‌دهد. برای اینکه ستون فاکتور جمع بخورد،
 * قاعده این است: **اول هر ردیف تبدیل شود، بعد جمع زده شود**.
 */
export function convert(
  value: number,
  from: CurrencyUnit,
  to: CurrencyUnit,
): number {
  if (from === to) return value;
  return from === "RIAL" ? Math.round(value / 10) : value * 10;
}

/** عددِ دیتابیس → عددی که به کاربر نشان داده می‌شود. */
export function toDisplay(value: number): number {
  return convert(value, config.stored, config.panel);
}

/** عددی که کاربر تایپ کرده → عددی که به سرور می‌رود. */
export function fromDisplay(value: number): number {
  return convert(value, config.panel, config.stored);
}
