-- دفتر حساب مشتری + تنظیمات اعتبار حساب‌باز
--
-- افزایشی و بی‌خطر است: فقط ستون‌های با پیش‌فرض و یک جدول جدید اضافه می‌شود.
-- هیچ ستونی حذف یا تغییر نوع نمی‌دهد، پس روی دیتابیس در حال کارِ انبار بدون
-- توقف اجرا می‌شود.

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM (
  'OPENING',
  'INVOICE',
  'RECEIPT',
  'INVOICE_CANCELLED',
  'RETURN',
  'CHEQUE_BOUNCED',
  'ADJUSTMENT'
);

-- AlterTable: تنظیمات اعتبار روی مشتری
ALTER TABLE "Customer" ADD COLUMN "creditLimit" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN "creditDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: سررسید بخش نسیه‌ی فاکتور
ALTER TABLE "SaleInvoice" ADD COLUMN "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerLedger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "invoiceId" TEXT,
    "receiptId" TEXT,
    "note" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerLedger_customerId_createdAt_idx" ON "CustomerLedger"("customerId", "createdAt");
CREATE INDEX "CustomerLedger_invoiceId_idx" ON "CustomerLedger"("invoiceId");
CREATE INDEX "CustomerLedger_receiptId_idx" ON "CustomerLedger"("receiptId");
CREATE INDEX "SaleInvoice_dueDate_idx" ON "SaleInvoice"("dueDate");

-- AddForeignKey
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "SaleInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- بدهی‌های موجود را به دفتر منتقل کن.
--
-- بدون این، مانده‌ی هر مشتریِ فعلی از روز اول صفر می‌شد در حالی که فاکتور نسیه‌ی
-- باز دارد. مبلغ = مانده‌ی *فعلی* فاکتور (نه مبلغ اولیه‌اش)، چون دریافت‌های
-- قبلی همین حالا در dueAmount اعمال شده‌اند؛ آوردنِ رسیدهای گذشته به‌صورت ردیف
-- جدا باعث دوباره‌شماری می‌شد.
INSERT INTO "CustomerLedger" ("id", "customerId", "type", "amount", "invoiceId", "note", "createdAt")
SELECT
  gen_random_uuid()::text,
  "customerId",
  'INVOICE',
  "dueAmount",
  "id",
  'انتقال مانده‌ی باز هنگام راه‌اندازی دفتر حساب',
  "createdAt"
FROM "SaleInvoice"
WHERE "customerId" IS NOT NULL
  AND "status" = 'CONFIRMED'
  AND "dueAmount" > 0;
