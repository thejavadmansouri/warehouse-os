-- برگشتِ پرداخت — سندِ خنثی‌سازیِ یک پرداخت (کارتخوان برگشت زد / بانک رد کرد).
-- Additive: هیچ داده‌ی موجودی تغییر نمی‌کند.

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'PAYMENT_REVERSED';

-- CreateTable
CREATE TABLE "PaymentReversal" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "userId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReversal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReversal_idempotencyKey_key" ON "PaymentReversal"("idempotencyKey");
CREATE INDEX "PaymentReversal_invoiceId_idx" ON "PaymentReversal"("invoiceId");

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SaleInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReversal" ADD CONSTRAINT "PaymentReversal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: ارجاعِ ردیفِ دفتر به سندِ برگشت
ALTER TABLE "CustomerLedger" ADD COLUMN "reversalId" TEXT;

-- CreateIndex
CREATE INDEX "CustomerLedger_reversalId_idx" ON "CustomerLedger"("reversalId");

-- AddForeignKey
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_reversalId_fkey" FOREIGN KEY ("reversalId") REFERENCES "PaymentReversal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
