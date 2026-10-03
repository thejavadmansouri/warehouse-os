import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * مهر بیلد — «کدام نسخه روی این سرور بالا آمده؟»
 *
 * سلامت‌سنج فقط می‌تواند بگوید «زنده‌ام». بعد از هر به‌روزرسانی، سؤالِ واقعی این
 * است که *کدام* بیلد بالا آمده: آپدیت نصفه، جایگزینی فایلِ اشتباه، یا سرویسی که
 * ری‌استارت نشده، همه یک پاسخِ سالمِ یکسان می‌دهند. این ماژول همان یک عدد را
 * می‌خواند که `scripts/write-build-info.cjs` سرِ بیلد می‌نویسد.
 *
 *   apps/api/dist/build-info.json
 *     { "version": "0.5.0", "builtAt": "2026-09-16T03:48:45.494Z" }
 *
 * کیتِ به‌روزرسانی همان فایل را دوباره مهر می‌زند و دو فیلد اضافه می‌کند
 * (`kit` و `packagedAt`) — پس روی مغازه، همین دو مقدار است که می‌گوید کدام
 * بستهٔ تحویل بالا آمده. مقایسه‌اش با `kit-contents.txt` همان بسته، اثبات است.
 */
export type BuildStamp = {
  /** نسخه‌ی محصول از فایلِ VERSION در ریشه — 'unknown' اگر مهری نبود. */
  version: string;
  /** لحظه‌ی پایان بیلد API (ISO، UTC) — null در اجرای بدون مهر. */
  builtAt: string | null;
  /** نام کیتِ به‌روزرسانی، اگر این بیلد از یک کیت نصب شده باشد. */
  kit: string | null;
  /** لحظه‌ی بسته‌بندی همان کیت. */
  packagedAt: string | null;
};

/**
 * مسیرِ مهر: `apps/api/dist/build-info.json`.
 *
 * `__dirname` در dist برابر `apps/api/dist/src/common` است و دو پله بالاتر
 * می‌شود `dist/` — همان جایی که write-build-info.cjs می‌نویسد. در اجرای مستقیم
 * با ts-node هم همین نسبت به `apps/api/build-info.json` می‌رسد که وجود ندارد،
 * یعنی «مهر نشده».
 */
const stampFile = join(__dirname, '..', '..', 'build-info.json');

function readJsonObject(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // فایلِ نبوده یا خراب هرگز نباید سلامت‌سنج را بیندازد: بی‌مهر یعنی «dev».
  }
  return null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * مهر را می‌خواند و همیشه یک شکلِ یکسان برمی‌گرداند (فیلدهای نبوده = null).
 *
 * بی‌مهر یعنی «unknown»، عمداً نه نسخه‌ی package.json: آن ۰.۰.۱ است و هیچ‌وقت
 * نسخه‌ای نبوده که کسی منتشر کرده باشد. عددِ غلط از ندانستن بدتر است — کسی که
 * ۰.۰.۱ را روی مغازه ببیند فکر می‌کند به‌روزرسانی نرسیده و دنبال علتِ اشتباه
 * می‌رود.
 *
 * @param file مسیرِ دلخواه — برای تست.
 */
export function readBuildStamp(file: string = stampFile): BuildStamp {
  const stamp = readJsonObject(file);
  return {
    version: text(stamp?.version) ?? 'unknown',
    builtAt: text(stamp?.builtAt),
    kit: text(stamp?.kit),
    packagedAt: text(stamp?.packagedAt),
  };
}
