-- ایندکس‌های مسیرهای داغ.
--
-- CONCURRENTLY عمداً استفاده نشده: باید بیرون از تراکنش اجرا شود و
-- `prisma migrate` هر مایگریشن را داخل تراکنش می‌برد. جدول‌ها هنگام نصب کوچک‌اند
-- و قفلِ کوتاهِ ساخت ایندکس روی سرورِ محلی مسئله‌ای نیست.

-- CreateIndex
CREATE INDEX "InventoryLog_productId_createdAt_idx" ON "InventoryLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "InventoryLog_createdAt_idx" ON "InventoryLog"("createdAt");

-- CreateIndex
CREATE INDEX "InventoryLog_locationId_idx" ON "InventoryLog"("locationId");

-- CreateIndex
CREATE INDEX "Inventory_locationId_idx" ON "Inventory"("locationId");
