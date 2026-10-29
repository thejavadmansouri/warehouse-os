/**
 * تبدیل ارقام لاتین به ارقام فارسی — برای نمایش قیمت، شماره سفارش و …
 * داده ذخیره‌شده همیشه لاتین می‌ماند؛ این فقط لایه نمایش است.
 */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export function toFaDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** جداکننده هزارگان + ارقام فارسی: 1250000 → ۱٬۲۵۰٬۰۰۰ */
export function formatToman(input: number | string): string {
  const n = typeof input === "string" ? Number(input) : input;
  if (!Number.isFinite(n)) return toFaDigits(input);
  return toFaDigits(n.toLocaleString("fa-IR"));
}
