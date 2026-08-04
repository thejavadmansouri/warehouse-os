-- بارکد کارخانه‌ایِ خامِ اکسل، تا هنگام تأیید ایمپورت به ProductBarcode برود.
-- بدون این، بارکدهای کارخانه هیچ‌وقت ذخیره نمی‌شدند و اسکنر فروشنده آن‌ها را
-- پیدا نمی‌کرد (جدول ProductBarcode خالی می‌ماند).
ALTER TABLE "ImportRow" ADD COLUMN "factoryBarcode" TEXT;
