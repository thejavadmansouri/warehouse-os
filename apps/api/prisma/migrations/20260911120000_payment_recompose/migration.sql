-- اصلاح نحوهٔ پرداخت یک فاکتور ثبت‌شده.
--
-- یک عملیات چند ردیفِ Payment می‌سازد: ردیف‌های منفی (خنثی‌سازی تقسیم اشتباه)
-- و ردیف‌های تازه (تقسیم درست). همه با یک «کلید عملیات» مهر می‌شوند تا یک‌جا
-- خوانده شوند و ارسالِ دوبارهٔ همان درخواست بی‌اثر بماند.
--
-- افزایشی و بی‌خطر: ستون اختیاری است و بک‌فیل نمی‌خواهد؛ نسخهٔ قدیمیِ برنامه
-- هم با بودنِ آن بدون مشکل کار می‌کند.

ALTER TABLE "Payment" ADD COLUMN "operationKey" TEXT;

CREATE INDEX "Payment_operationKey_idx" ON "Payment"("operationKey");

-- هر ADD VALUE باید دستورِ جدا باشد (قاعدهٔ Postgres).
ALTER TYPE "VoucherSourceType" ADD VALUE 'PAYMENT_RECOMPOSE';

-- نوعِ ردیفِ دفتر — عمداً نوعِ مستقل و نه ADJUSTMENT، چون ADJUSTMENT در گزارشِ
-- تطبیق از مقایسه بیرون است (سند ندارد) و این ردیف سند دارد و باید مقایسه شود.
ALTER TYPE "LedgerEntryType" ADD VALUE 'RECOMPOSE';
