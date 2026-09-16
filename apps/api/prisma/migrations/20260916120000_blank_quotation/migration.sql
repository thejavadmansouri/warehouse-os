-- پیش‌فاکتور سفید — برگه‌ی قیمتِ متنی که از گوشی ساخته می‌شود و مدیر قیمتش را می‌گذارد.
--
-- عمداً دو جدولِ تازه است و هیچ ستونی از Quotation/QuotationLine دست نمی‌خورد:
-- مسیر موجود پیش‌فاکتور، تبدیل، چاپ و گزارش‌ها روی رابطه‌ی ردیف↔کالا بنا شده و
-- سفید باید بتواند قلمِ «بدون کالا» داشته باشد. مهاجرت کاملاً افزودنی است، پس
-- بک‌فیل لازم ندارد.

CREATE TYPE "BlankQuotationStatus" AS ENUM ('OPEN', 'PRICED', 'CANCELLED', 'CONVERTED');

CREATE TABLE "BlankQuotation" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "idempotencyKey" TEXT,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT,
    "customerName" TEXT,
    "note" TEXT,
    "status" "BlankQuotationStatus" NOT NULL DEFAULT 'OPEN',
    "validUntil" TIMESTAMP(3),
    "convertedInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlankQuotation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlankQuotationLine" (
    "id" TEXT NOT NULL,
    "blankQuotationId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "suggestedPrice" DOUBLE PRECISION,
    "finalPrice" DOUBLE PRECISION,
    "pricedAt" TIMESTAMP(3),
    "productId" TEXT,
    "locationId" TEXT,

    CONSTRAINT "BlankQuotationLine_pkey" PRIMARY KEY ("id")
);

-- شماره‌ی خوانا برای کاربر و کلید یکتای کلاینت: تکرارِ ارسال (صف آفلاین گوشی)
-- نباید برگه‌ی دوم بسازد.
CREATE UNIQUE INDEX "BlankQuotation_number_key" ON "BlankQuotation"("number");
CREATE UNIQUE INDEX "BlankQuotation_idempotencyKey_key" ON "BlankQuotation"("idempotencyKey");
-- یک برگه فقط یک بار تبدیل می‌شود؛ این قید همان گاردِ دیتابیسی است.
CREATE UNIQUE INDEX "BlankQuotation_convertedInvoiceId_key" ON "BlankQuotation"("convertedInvoiceId");
CREATE INDEX "BlankQuotation_warehouseId_createdAt_idx" ON "BlankQuotation"("warehouseId", "createdAt");
CREATE INDEX "BlankQuotation_status_idx" ON "BlankQuotation"("status");
CREATE INDEX "BlankQuotationLine_blankQuotationId_idx" ON "BlankQuotationLine"("blankQuotationId");

ALTER TABLE "BlankQuotation" ADD CONSTRAINT "BlankQuotation_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlankQuotation" ADD CONSTRAINT "BlankQuotation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- حذف برگه، قلم‌هایش را هم می‌برد (مثل QuotationLine).
ALTER TABLE "BlankQuotationLine" ADD CONSTRAINT "BlankQuotationLine_blankQuotationId_fkey"
  FOREIGN KEY ("blankQuotationId") REFERENCES "BlankQuotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
