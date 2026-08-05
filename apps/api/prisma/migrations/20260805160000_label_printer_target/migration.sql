-- مقصد پرینتر لیبل حرارتی. افزایشی و nullable — تا وقتی پر نشود، چاپ مستقیم
-- خطای «پرینتر تنظیم نشده» می‌دهد و بقیه‌ی سیستم دست‌نخورده کار می‌کند.
ALTER TABLE "LabelSettings" ADD COLUMN "printerName" TEXT;
ALTER TABLE "LabelSettings" ADD COLUMN "printerHost" TEXT;
ALTER TABLE "LabelSettings" ADD COLUMN "printerPort" INTEGER DEFAULT 9100;
