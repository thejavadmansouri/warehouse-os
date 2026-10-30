/**
 * تبدیل ارقام لاتین به ارقام فارسی — برای نمایش قیمت، شماره سفارش و …
 * داده ذخیره‌شده همیشه لاتین می‌ماند؛ این فقط لایه نمایش است.
 */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** هر چیزی که به عدد/رشته تبدیل‌شدنی است — شامل Decimal پریزما */
export type NumericLike = number | string | { toString(): string };

/** جداکننده هزارگان + ارقام فارسی: 1250000 → ۱٬۲۵۰٬۰۰۰ */
export function formatToman(input: NumericLike): string {
  const raw = typeof input === "number" ? input : Number(input.toString());
  if (!Number.isFinite(raw)) return toFaDigits(input.toString());
  return toFaDigits(raw.toLocaleString("fa-IR"));
}

const ONES = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const TEENS = [
  "ده",
  "یازده",
  "دوازده",
  "سیزده",
  "چهارده",
  "پانزده",
  "شانزده",
  "هفده",
  "هجده",
  "نوزده",
];
const TENS = ["", "", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const HUNDREDS = [
  "",
  "یکصد",
  "دویست",
  "سیصد",
  "چهارصد",
  "پانصد",
  "ششصد",
  "هفتصد",
  "هشتصد",
  "نهصد",
];
const SCALES = ["", "هزار", "میلیون", "میلیارد", "تریلیون"];

function threeDigitsToWords(n: number): string {
  if (n === 0) return "";
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);

  if (rem >= 10 && rem <= 19) {
    parts.push(TEENS[rem - 10]);
  } else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t > 0) parts.push(TENS[t]);
    if (o > 0) parts.push(ONES[o]);
  }
  return parts.join(" و ");
}

export function numberToFaWords(input: NumericLike): string {
  const raw = typeof input === "number" ? input : Math.round(Number(input.toString()));
  if (!Number.isFinite(raw) || raw === 0) return "صفر";
  let n = Math.abs(raw);
  const chunks: string[] = [];
  let scaleIdx = 0;

  while (n > 0) {
    const chunk = n % 1000;
    if (chunk > 0) {
      const words = threeDigitsToWords(chunk);
      const scale = SCALES[scaleIdx] ? ` ${SCALES[scaleIdx]}` : "";
      chunks.unshift(words + scale);
    }
    n = Math.floor(n / 100);
    scaleIdx++;
  }

  return (raw < 0 ? "منفی " : "") + chunks.join(" و ");
}
