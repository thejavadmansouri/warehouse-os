// =============================================================
// تبدیل تاریخ شمسی (جلالی) ↔ میلادی — پیاده‌سازی مستقل، بدون وابستگی
//
// الگوریتم استاندارد jalaali-js (تبدیل از طریق Julian Day Number) است؛
// از Intl استفاده نمی‌شود تا خروجی در همه‌ی مرورگرها و محیط‌ها یکسان باشد.
// تمام محاسبات در timezone محلی انجام می‌شود و ساعت همواره روی ۰۰:۰۰:۰۰
// نرمال می‌شود تا مرز روز جابه‌جا نشود.
// =============================================================

/** تاریخ جلالی: سال، ماه (۱ تا ۱۲) و روز (۱ تا ۲۹/۳۰/۳۱). */
export interface JalaliDate {
  jy: number; // سال جلالی
  jm: number; // ماه جلالی
  jd: number; // روز جلالی
}

/** کوچک‌ترین و بزرگ‌ترین سال پشتیبانی‌شده (همان محدوده‌ی jalaali-js). */
export const JALALI_MIN_YEAR = -61;
export const JALALI_MAX_YEAR = 3177;

/** سال‌های آغازِ دوره‌های ۳۳ ساله در گاهشمار جلالی (جدول استاندارد jalaali-js). */
const BREAKS: readonly number[] = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
  2192, 2262, 2324, 2394, 2456, 3178,
];

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

/** تقسیم صحیح (برش به سمت صفر) — برای اعداد منفی نیز درست کار می‌کند. */
function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** باقی‌مانده‌ی غیرمنفی — با تقسیم صحیحِ بالا سازگار است. */
function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

/** ارقام فارسی/عربی → انگلیسی (تا ورودی کاربر هر دو شکل را بپذیرد). */
export function faToEn(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

/** ارقام انگلیسی → فارسی، فقط برای نمایش. */
export function toFaDigits(input: string): string {
  return input.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** تاریخ میلادی → Julian Day Number (الگوریتم استاندارد). */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** Julian Day Number → تاریخ میلادی (الگوریتم استاندارد). */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** اطلاعات سال جلالی: کبیسه بودن، سال میلادیِ آغاز و روزِ اولِ فروردین. */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;

  if (jy < jp || jy >= BREAKS[bl - 1]) {
    throw new RangeError(`Invalid Jalaali year ${jy}`);
  }

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }

  let n = jy - jp;

  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) {
    leapJ += 1;
  }

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) {
    n = n - jump + div(jump + 4, 33) * 33;
  }
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) {
    leap = 4;
  }

  return { leap, gy, march };
}

/** آیا سال جلالی کبیسه است؟ */
export function isLeapJalaliYear(jy: number): boolean {
  return jalCal(jy).leap === 0;
}

/** تعداد روزهای یک ماه جلالی (۱ تا ۶ → ۳۱، ۷ تا ۱۱ → ۳۰، اسفند → ۲۹ یا ۳۰). */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

/** آیا تاریخ جلالی معتبر است؟ (محدوده‌ی سال، ماه ۱ تا ۱۲ و روز در حد همان ماه) */
export function isValidJalali(jy: number, jm: number, jd: number): boolean {
  return (
    jy >= JALALI_MIN_YEAR &&
    jy <= JALALI_MAX_YEAR &&
    jm >= 1 &&
    jm <= 12 &&
    jd >= 1 &&
    jd <= jalaliMonthLength(jy, jm)
  );
}

/** تاریخ جلالی → Julian Day Number. */
function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

/** Julian Day Number → تاریخ جلالی. */
function d2j(jdn: number): JalaliDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) {
      k += 1;
    }
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

/** تاریخ میلادی → جلالی. ساعتِ روز نادیده گرفته می‌شود و روی ۰۰:۰۰:۰۰ نرمال می‌گردد. */
export function toJalali(date: Date): JalaliDate {
  // کپی می‌گیریم تا ورودیِ caller تغییر نکند و ساعت روی نیمه‌شبِ محلی بنشیند؛
  // به این ترتیب مرزِ روز به ساعتِ پاره‌ای (مثلاً ۲۳:۵۹) وابسته نمی‌شود.
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d2j(g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()));
}

/** تاریخ جلالی → میلادی. خروجی دقیقاً نیمه‌شبِ محلیِ همان روز میلادی است. */
export function toGregorian(jy: number, jm: number, jd: number): Date {
  if (!isValidJalali(jy, jm, jd)) {
    throw new RangeError(`Invalid Jalaali date ${jy}/${jm}/${jd}`);
  }
  const { gy, gm, gd } = d2g(j2d(jy, jm, jd));
  // سازنده‌ی محلیِ Date → ۰۰:۰۰:۰۰ همان روز (بدون وابستگی به UTC).
  return new Date(gy, gm - 1, gd);
}

/** قالب‌بندی تاریخ جلالی با ارقام فارسی: «۱۴۰۴/۰۵/۱۲». */
export function formatJalali(date: Date): string {
  const { jy, jm, jd } = toJalali(date);
  const year =
    jy < 0 ? `-${String(-jy).padStart(4, "0")}` : String(jy).padStart(4, "0");
  return toFaDigits(
    `${year}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`,
  );
}
