-- وضعیت سینک بین سایت و انبار.
-- هر دو ستون nullable و بدون پیش‌فرض‌اند: روی داده‌ی موجود یعنی «هنوز نرفته»،
-- که برای سفارش‌های قدیمی هم دقیقاً همان چیزی است که باید باشد.

ALTER TABLE "OnlineOrder"
  ADD COLUMN "pulledAt" TIMESTAMP(3),
  ADD COLUMN "syncedAt" TIMESTAMP(3);

CREATE INDEX "OnlineOrder_pulledAt_idx" ON "OnlineOrder"("pulledAt");
CREATE INDEX "OnlineOrder_syncedAt_idx" ON "OnlineOrder"("syncedAt");
