import { randomUUID } from 'crypto';

/**
 * بارکدِ داخلی باید بینِ دو ساختِ هم‌زمان هم یکتا بماند.
 *
 * ستون `Product.internalBarcode` در دیتابیس `@unique` است، پس برخوردِ دو
 * بارکد به یک خطای خامِ P2002 تبدیل می‌شود که هیچ‌جا گرفته نمی‌شود — کاربر
 * فقط «خطای ناشناخته» می‌بیند و کالایش ساخته نمی‌شود.
 *
 * فرمولِ قبلی `WOS${Date.now()}` بود: برای یک نفر که فرم را پر می‌کند کافی
 * به‌نظر می‌رسد، ولی هر ساختِ برنامه‌ای — تأیید گروهی، اسکریپت، دو تبِ باز —
 * می‌تواند دو بار در یک میلی‌ثانیه صدا بزند.
 */

/** همان فرمولی که `products.service.ts` استفاده می‌کند. */
function internalBarcode(): string {
  return `WOS${randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}

/** فرمولِ قدیمی، فقط برای اینکه تفاوت را ثابت کند. */
function timeBased(): string {
  return `WOS${Date.now()}`;
}

describe('بارکد داخلی', () => {
  it('ده هزار بار پشت‌سرهم، هیچ تکراری', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(internalBarcode());

    expect(seen.size).toBe(10_000);
  });

  it('فرمولِ زمان‌محور در یک حلقه‌ی تنگ برخورد می‌کند', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1_000; i++) seen.add(timeBased());

    // این تست نمی‌گوید «قدیمی بد بود»؛ می‌گوید چرا عوض شد. هزار فراخوانی در
    // چند میلی‌ثانیه اجرا می‌شود و همان چند مقدار را برمی‌گرداند.
    expect(seen.size).toBeLessThan(1_000);
  });

  it('پیشوند و طول ثابت است — برچسب‌های چاپ‌شده هم‌شکل بمانند', () => {
    const code = internalBarcode();

    expect(code).toMatch(/^WOS[0-9A-F]{12}$/);
    expect(code).toHaveLength(15);
  });
});
