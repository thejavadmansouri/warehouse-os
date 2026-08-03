/**
 * کپی دارایی‌ها به خروجی standalone.
 *
 * Next با `output: "standalone"` عمداً `.next/static` و `public` را داخل
 * پوشه‌ی standalone نمی‌گذارد؛ باید دستی کپی شوند وگرنه برنامه بالا می‌آید
 * ولی بدون CSS و تصویر.
 *
 * قبلاً با `cp -r` انجام می‌شد که روی ویندوز وجود ندارد — و سرور on-prem
 * ویندوزی است. ضمناً مقصد هم اشتباه بود: در monorepo، برنامه داخل
 * `.next/standalone/<repo>/apps/web/` می‌نشیند نه ریشه‌ی standalone.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findAppDir } from './standalone-path.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const standalone = join(root, '.next', 'standalone');

const appDir = findAppDir(standalone);

if (!appDir) {
  console.error(
    'server.js داخل .next/standalone پیدا نشد. آیا next build اجرا شده و output: "standalone" تنظیم است؟',
  );
  process.exit(1);
}

const copies = [
  [join(root, '.next', 'static'), join(appDir, '.next', 'static')],
  [join(root, 'public'), join(appDir, 'public')],
];

for (const [from, to] of copies) {
  if (!existsSync(from)) {
    console.warn(`رد شد (وجود ندارد): ${from}`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log(`کپی شد → ${to}`);
}

console.log(`خروجی standalone آماده است: ${appDir}`);
