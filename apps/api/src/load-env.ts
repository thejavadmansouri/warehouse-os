/**
 * بارگذاری `.env` — **باید اولین import در `main.ts` باشد**.
 *
 * تا پیش از این، اپ هیچ‌جا `.env` را نمی‌خواند و `DATABASE_URL` فقط به‌طور
 * تصادفی کار می‌کرد، چون خودِ Prisma هنگام ساختن کلاینت فایل را می‌خواند. هر
 * متغیر دیگری (مثل JWT_SECRET) که پیش از آن لحظه لازم شود، خالی می‌ماند.
 *
 * از `process.loadEnvFile` نودی استفاده می‌شود نه `dotenv`، چون dotenv فقط
 * وابستگیِ تراگذریِ Prisma است و با یک ارتقا ممکن است ناپدید شود.
 *
 * نبودِ فایل خطا نیست: در نصب ویندوز، سرویس‌ها معمولاً متغیرها را مستقیم از
 * محیط می‌گیرند نه از فایل.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';

const envPath = resolve(process.cwd(), '.env');

if (existsSync(envPath) && typeof process.loadEnvFile === 'function') {
  // مقادیری که از قبل در محیط هستند برنده‌اند — تنظیمات سرویس بر فایل مقدم است.
  process.loadEnvFile(envPath);
}
