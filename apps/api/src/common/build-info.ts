import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * مهر بیلد — «کدام نسخه روی این سرور بالا آمده؟»
 *
 * HEALTH فقط می‌تواند بگوید «زنده‌ام». بعد از هر به‌روزرسانی، سؤالِ واقعی این
 * است که *کدام* بیلد بالا آمده: آپدیت نصفه، جایگزینی فایلِ اشتباه، یا سرویسی
 * که ری‌استارت نشده، همه یک پاسخِ سالمِ یکسان می‌دهند. این ماژول همان یک عدد
 * را می‌خواند که `scripts/write-build-info.cjs` سرِ بیلد می‌نویسد.
 *
 *   dist/build-info.json
 *     { "version": "0.5.0", "builtAt": "2026-09-15T20:22:10.000Z", "node": "v24..." }
 *
 * کیتِ به‌روزرسانی همان فایل را دوباره مهر می‌زند و دو فیلد اضافه می‌کند
 * (`kit` و `packagedAt`) — پس روی مغازه، همین دو مقدار است که می‌گوید کدام
 * بستهٔ تحویل بالا آمده. مقایسه‌اش با `kit-contents.txt` همان بسته، اثبات است.
 *
 * مقدارها فقط «نسخه + زمان + نام بسته»اند: نه رمز، نه مسیر، نه شمارشِ رکورد.
 * نسخه‌ی نرم‌افزار روی سرورِ مغازه راز نیست، ولی نسخه‌ی دقیقِ کتابخانه‌ها یا
 * نقشهٔ دیتابیس می‌توانست باشد — آن‌ها اینجا نیستند.
 */
export type BuildStamp = {
  /** نسخه‌ی محصول، از فایلِ VERSION در ریشه — 'unknown' اگر هیچ‌جا نبود. */
  version: string;
  /** لحظه‌ی پایان بیلد API (ISO، UTC) — null در اجرای مستقیم با ts-node. */
  builtAt: string | null;
  /** نام کیتِ به‌روزرسانی، اگر این بیلد از یک کیت نصب شده باشد. */
  kit: string | null;
  /** لحظه‌ی بسته‌بندی همان کیت. */
  packagedAt: string | null;
};

/**
 * مسیرِ پیش‌فرض مهر.
 *
 * `__dirname` در dist برابر `apps/api/dist/src/common` است و دو پله بالاتر
 * می‌شود `apps/api/dist/build-info.json` — همان جایی که write-build-info.cjs
 * می‌نویسد. در اجرای مستقیم با ts-node هم همین نسبت درست است
 * (`apps/api/src/common` → `apps/api/build-info.json` که وجود ندارد و یعنی
 * «مهر نشده»).
 */
export const defaultStampFile = join(__dirname, '..', '..', 'build-info.json');

function readJsonObject(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    // فایلِ نبوده/خراب هرگز نباید سلامت‌سنج را بیندازد: بی‌مهر یعنی «dev».
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * نسخه‌ی package.json اپ — پشتیبان، نه منبع.
 *
 * در نصبِ مغازه `apps/api/package.json` هست (۰.۰.۱ و بی‌معنا) ولی در کیت فقط
 * `dist` و `prisma` می‌روند؛ پس آنجا جواب فقط از خودِ مهر می‌آید.
 *
 * چرا بالا رفتن تا پیدا شدن: عمقِ نسبی در دو حالت فرق می‌کند — در dist مسیر
 * `apps/api/dist/src/common` است و در اجرای مستقیم `apps/api/src/common`؛
 * پس `../../package.json` یکی از آن دو را به ریشهٔ مخزن می‌برد. اولین
 * package.json ای که `version` دارد همان package.json خودِ API است (ریشهٔ
 * مخزن `version` ندارد و هیچ‌وقت برنده نمی‌شود).
 */
function packageVersion(): string {
  let dir = __dirname;
  for (let i = 0; i < 4; i++) {
    const pkg = readJsonObject(join(dir, 'package.json'));
    const version = text(pkg?.version);
    if (version) return version;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return 'unknown';
}

/**
 * مهر را می‌خواند و همیشه یک شکلِ یکسان برمی‌گرداند (فیلدهای نبوده = null).
 *
 * @param file مسیرِ دلخواه یا `WAREHOUSE_BUILD_INFO` — برای تست و عیب‌یابی.
 */
export function readBuildStamp(
  file: string = process.env.WAREHOUSE_BUILD_INFO || defaultStampFile,
): BuildStamp {
  const stamp = readJsonObject(file);
  return {
    version: text(stamp?.version) ?? packageVersion(),
    builtAt: text(stamp?.builtAt),
    kit: text(stamp?.kit),
    packagedAt: text(stamp?.packagedAt),
  };
}
