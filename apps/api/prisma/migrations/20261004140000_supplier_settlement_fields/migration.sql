-- مشخصات و نحوهٔ تسویه تأمین‌کننده + سررسید/روش پرداخت روی فاکتور خرید

ALTER TABLE "Supplier"
  ADD COLUMN IF NOT EXISTS "contactName" TEXT,
  ADD COLUMN IF NOT EXISTS "note" TEXT,
  ADD COLUMN IF NOT EXISTS "creditDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "preferredPayMethod" "PaymentMethod",
  ADD COLUMN IF NOT EXISTS "bankName" TEXT,
  ADD COLUMN IF NOT EXISTS "bankAccount" TEXT,
  ADD COLUMN IF NOT EXISTS "iban" TEXT;

ALTER TABLE "PurchaseInvoice"
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "payMethod" "PaymentMethod";
