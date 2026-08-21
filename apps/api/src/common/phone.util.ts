import { normalizePersian } from '../engine/utils/persian-normalize';


/**
 * نرمال‌سازی شماره تلفن ایرانی به یک فرم قطعی.
 *
 * بدون این، «۰۹۱۲۱۱۱۲۲۳۳» و «0912-111-2233» و «+989121112233» سه مشتری جدا
 * می‌سازند: پروفایل مشتری تکه‌تکه می‌شود و یک نفر چند بار پیامک می‌گیرد.
 *
 * خروجی:
 *   موبایل → 09121112233
 *   ثابت با کد → 02133445566
 *   ورودی نامعتبر → null (شماره‌ی خراب ذخیره نمی‌شود)
 *
 * idempotent است: normalizePhone(normalizePhone(x)) === normalizePhone(x)
 */
export function normalizePhone(input?: string | null): string | null {

  if (!input) return null;

  // ارقام فارسی/عربی → انگلیسی (از همان نرمال‌سازی مرجع پروژه)
  let t = normalizePersian(input);

  // هر چیزی جز رقم و + دور ریخته می‌شود: فاصله، خط تیره، پرانتز، نیم‌فاصله
  t = t.replace(/[^\d+]/g, '');

  if (!t) return null;

  // پیش‌شماره‌ی کشور → 0
  t = t
    .replace(/^\+98/, '0')
    .replace(/^0098/, '0')
    .replace(/^98(?=9\d{9}$)/, '0'); // 989121112233 → 09121112233

  // موبایلی که بدون صفر وارد شده: 9121112233 → 09121112233
  if (/^9\d{9}$/.test(t)) t = '0' + t;

  // موبایل معتبر
  if (/^09\d{9}$/.test(t)) return t;

  // تلفن ثابت با کد شهر (۳ تا ۱۱ رقم بعد از صفر)
  if (/^0\d{2,10}$/.test(t)) return t;

  // شماره‌ی داخلی/کوتاه بدون صفر — همان‌طور نگه می‌داریم اگر فقط رقم است
  if (/^\d{4,11}$/.test(t)) return t;

  return null;
}


/**
 * نوعِ یک شماره‌ی **نرمال‌شده**.
 *
 * از روی خودِ شماره تصمیم می‌گیرد، نه از روی برچسبی که کاربر انتخاب کرده —
 * کسی که برچسب «موبایل» را روی تلفن مغازه گذاشته باعث نشود پیامک به آن برود.
 *
 * ورودی باید از `normalizePhone` آمده باشد؛ روی متنِ خام جواب درست نمی‌دهد.
 */
export function phoneKind(phone?: string | null): 'MOBILE' | 'LANDLINE' | 'OTHER' {
  if (!phone) return 'OTHER';
  if (/^09\d{9}$/.test(phone)) return 'MOBILE';
  if (/^0\d{2,10}$/.test(phone)) return 'LANDLINE';
  return 'OTHER';
}


/** آیا این شماره پیامک می‌گیرد. تنها معیارِ مجاز برای صفِ ارسال. */
export function canReceiveSms(phone?: string | null): boolean {
  return phoneKind(phone) === 'MOBILE';
}


/** فقط برای نمایش: 09121112233 → 0912 111 2233 */
export function formatPhone(phone?: string | null): string {
  if (!phone) return '';
  if (/^09\d{9}$/.test(phone)) {
    return `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}`;
  }
  return phone;
}


/** آیا این شماره موبایل است؟ فقط به موبایل می‌شود پیامک زد. */
export function isMobile(phone?: string | null): boolean {
  return !!phone && /^09\d{9}$/.test(phone);
}
