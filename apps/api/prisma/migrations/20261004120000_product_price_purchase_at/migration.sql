-- تاریخ اثر قیمت خرید روی هر ردیف تاریخچهٔ ProductPrice
ALTER TABLE "ProductPrice" ADD COLUMN IF NOT EXISTS "purchasePriceAt" TIMESTAMP(3);

-- ردیف‌هایی که قیمت خرید دارند ولی تاریخ ندارند: تاریخ ثبت ردیف را پر کن
UPDATE "ProductPrice"
SET "purchasePriceAt" = "createdAt"
WHERE "purchasePrice" IS NOT NULL AND "purchasePriceAt" IS NULL;
