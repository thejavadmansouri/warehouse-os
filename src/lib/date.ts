/*
 * تاریخ شمسی — با ICU خود Node (بدون وابستگی).
 * همه‌جا از همین دو تابع استفاده می‌شود تا فرمت یکسان بماند.
 */
const faDateFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const faTimeFmt = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
  hour: "2-digit",
  minute: "2-digit",
});

export function faDate(date: Date | string): string {
  return faDateFmt.format(new Date(date));
}

export function faDateTime(date: Date | string): string {
  const d = new Date(date);
  return `${faDateFmt.format(d)} — ${faTimeFmt.format(d)}`;
}

/** کلید شماره‌گذاری سالانه: 1405 */
export function shamsiYear(date = new Date()): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric" })
    .format(date)
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}
