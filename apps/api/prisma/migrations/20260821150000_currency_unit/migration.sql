-- واحد پول: یک واقعیت (storedUnit) و دو انتخاب نمایشی (panelUnit، siteUnit).
--
-- هیچ عددی جابه‌جا نمی‌شود. مقادیر پیش‌فرض عمداً وضع امروز را ثبت می‌کنند:
-- داده و پنل ریال‌اند، سایت تومان. اگر اینجا سایت را هم ریال بگذاریم، اولین
-- بازدیدکننده قیمت ریالی می‌بیند و ده برابر تصور می‌کند.

-- CreateEnum
CREATE TYPE "CurrencyUnit" AS ENUM ('RIAL', 'TOMAN');

-- AlterTable
ALTER TABLE "ShopSettings"
  ADD COLUMN "storedUnit" "CurrencyUnit" NOT NULL DEFAULT 'RIAL',
  ADD COLUMN "panelUnit"  "CurrencyUnit" NOT NULL DEFAULT 'RIAL',
  ADD COLUMN "siteUnit"   "CurrencyUnit" NOT NULL DEFAULT 'TOMAN';
