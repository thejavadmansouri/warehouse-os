-- ایندکس‌های سرعت — افزایشی و امن (بدون تغییر داده).
--
-- جدول‌ها در این استقرار ~۳۳٫۵ هزار ردیف‌اند، پس CREATE INDEX معمولی زیر یک
-- ثانیه طول می‌کشد و قفلِ کوتاهش قابل‌قبول است (نیازی به CONCURRENTLY نیست؛ آن
-- برای جدول‌های میلیونی است). نام‌ها عمداً همان قرارداد پیش‌فرض Prisma هستند تا
-- schema و دیتابیس drift نکنند.

-- «آخرین قیمتِ هر محصول» که در هر لیست/جستجو/جزئیات include می‌شود:
--   where productId = ? order by createdAt desc limit 1
CREATE INDEX IF NOT EXISTS "ProductPrice_productId_createdAt_idx"
  ON "ProductPrice" ("productId", "createdAt");

-- مرحله‌ی ۱ جستجو (کدِ دقیق) که در هر کیبورد-استروک اجرا می‌شود:
--   where sku = ? OR "partNumber" = ? OR barcode = ?
-- sku و barcode یکتا-ایندکس دارند؛ فقط partNumber جا مانده بود و همان OR را به
-- seq scan می‌برد.
CREATE INDEX IF NOT EXISTS "Product_partNumber_idx"
  ON "Product" ("partNumber");
