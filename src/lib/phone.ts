/*
 * نرمال‌سازی شماره موبایل ایران:
 * ۰۹۱۲۳۴۵۶۷۸۹ (ارقام فارسی/انگلیسی/جداشده/فضا) → 09123456789
 */
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";

export function normalizePhone(input: string): string | null {
  let s = String(input).trim();

  s = s.replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)));
  s = s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
  s = s.replace(/[^\d]/g, "");

  if (s.startsWith("0098")) s = s.slice(4);
  if (s.startsWith("98") && s.length === 12) s = s.slice(2);
  if (s.length === 10 && s.startsWith("9")) s = "0" + s;

  if (!/^09\d{9}$/.test(s)) return null;

  return s;
}
