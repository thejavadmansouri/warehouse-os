/**
 * مرزهای روزِ مغازه.
 *
 * چرا لازم است: «امروز» در سرور چیزی به‌نام ندارد. تایم‌استمپ‌ها UTC ذخیره
 * می‌شوند، ولی مغازه در تهران است و شبِ کاری‌اش با نیمه‌شبِ تهران تمام می‌شود،
 * نه با نیمه‌شبِ گرینویچ. اگر «امروز» را از UTC بگیریم، فروشندهٔ شیفتِ شب
 * (بین ۲۰:۳۰ و ۲۴:۰۰) فاکتورِ ساعتِ ۱۱ شبِ خودش را «دیروز» می‌بیند.
 *
 * ساعتِ ایران از ۱۴۰۱ ساعتِ تابستانی ندارد و همیشه +۳:۳۰ است؛ پس تبدیل ساده و
 * قطعی است و به کتابخانهٔ منطقهٔ زمانی نیاز نیست.
 */

/** فاصلهٔ ساعتِ ایران از UTC به میلی‌ثانیه (+۳:۳۰). */
const TEHRAN_OFFSET_MS = 3.5 * 60 * 60 * 1000;

/** روزِ تقویمیِ تهران به‌صورت `YYYY-MM-DD`. */
export function tehranDateKey(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** لحظهٔ ۰۰:۰۰ تهرانِ همان روزی که `at` در آن است (به‌صورت UTC). */
export function startOfTehranDay(at: Date = new Date()): Date {
  const [y, m, d] = tehranDateKey(at).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) - TEHRAN_OFFSET_MS);
}

/** آیا `at` در همین روزِ کاریِ تهران است؟ */
export function isTodayInTehran(at: Date, now: Date = new Date()): boolean {
  return at.getTime() >= startOfTehranDay(now).getTime();
}
