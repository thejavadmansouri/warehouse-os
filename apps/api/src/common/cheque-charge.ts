/**
 * تفاوتِ فروشِ مدت‌دار روی یک چک.
 *
 * چند تصمیم که عمدی‌اند:
 *
 * **نرخ در پایه‌ی هزارم (bp)، نه اعشار.** ۲.۵٪ می‌شود ۲۵۰. عددِ اعشاری در پول
 * یعنی اختلافِ یک‌ریالی که هیچ‌وقت جمع نمی‌شود و سرِ ماه کسی نمی‌فهمد از کجاست.
 *
 * **ساده، نه مرکب.** برای چکِ سه تا شش ماهه، `اصل × نرخ × ماه` همان چیزی است که
 * مغازه‌دار در ذهنش حساب می‌کند. مرکب فقط عددی می‌سازد که نمی‌تواند توضیحش دهد.
 *
 * **یک نقطه‌ی گردکردن.** خروجی همیشه ریالِ صحیح است و همین‌جا گرد می‌شود. هر جای
 * دیگری که دوباره گرد کند، دو عدد می‌سازد.
 *
 * سرور مرجع است: کلاینت همین حساب را برای پیش‌نمایش تکرار می‌کند، ولی چیزی که
 * ذخیره می‌شود خروجیِ همین تابع است.
 */

export type ChequeRateMode = 'FLAT' | 'MONTHLY';

export interface ChequeChargeInput {
  /** مبلغِ پایه به ریال — آنچه بابتِ خودِ کالا/بدهی است، بدونِ سود. */
  base: number;
  /** نرخ به پایه‌ی هزارم. ۲۵۰ = ۲.۵٪ */
  rateBp: number;
  /** تعدادِ ماه. در حالتِ FLAT نادیده گرفته می‌شود. */
  months: number;
  mode: ChequeRateMode;
}

/** یک ماهِ قراردادی برای تبدیلِ روز به ماه — ماهِ شمسی ۲۹ تا ۳۱ روز است. */
export const DAYS_PER_MONTH = 30;

/**
 * سقفِ سود: بیشتر از خودِ مبلغِ پایه نمی‌شود.
 *
 * نه به‌خاطر قانون، به‌خاطر تایپ. نرخِ اشتباه (مثلاً ۲۵۰۰۰ به‌جای ۲۵۰) عددی
 * می‌سازد که هم فاکتور را می‌ترکاند هم تا لحظه‌ی چاپ دیده نمی‌شود.
 */
export const MAX_CHARGE_RATIO = 1;

export function computeChequeCharge(input: ChequeChargeInput): number {
  const { base, rateBp, mode } = input;
  if (base <= 0 || rateBp <= 0) return 0;

  const months = mode === 'MONTHLY' ? Math.max(0, input.months) : 1;
  if (months === 0) return 0;

  const charge = Math.round((base * rateBp * months) / 10_000);
  return Math.min(charge, base * MAX_CHARGE_RATIO);
}

/**
 * تعدادِ ماهِ پیشنهادی از سررسید.
 *
 * فقط پیشنهاد است و فروشنده می‌تواند عوضش کند — چون او می‌گوید «سه‌ماهه»، نه
 * «هشتاد و نه روزه». هرچه انتخاب شد ذخیره می‌شود، تا بعداً بشود عدد را توضیح داد.
 */
export function suggestMonths(dueDate: Date, from: Date = new Date()): number {
  const days = Math.ceil(
    (dueDate.getTime() - from.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (days <= 0) return 0;
  return Math.max(1, Math.round(days / DAYS_PER_MONTH));
}
