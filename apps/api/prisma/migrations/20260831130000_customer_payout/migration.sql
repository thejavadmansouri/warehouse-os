/*
 * پرداخت وجه به مشتری بستانکار (تسویه اعتبار).
 * Additive است: هیچ ستونی حذف یا تغییر نمی‌کند، داده‌ی موجود دست نمی‌خورد.
 */

-- نوعِ جدیدِ دفتر مشتری
ALTER TYPE "LedgerEntryType" ADD VALUE 'PAYOUT';

-- دنباله‌ی شماره‌ی سند — هم‌الگو با Receipt.number_seq
CREATE SEQUENCE "CustomerPayout_number_seq";

-- CreateTable
CREATE TABLE "CustomerPayout" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL DEFAULT nextval('"CustomerPayout_number_seq"'),
    "customerId" TEXT NOT NULL,
    "userId" TEXT,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "chequeNumber" TEXT,
    "bankName" TEXT,
    "chequeDueDate" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPayout_number_key" ON "CustomerPayout"("number");
CREATE UNIQUE INDEX "CustomerPayout_idempotencyKey_key" ON "CustomerPayout"("idempotencyKey");
CREATE INDEX "CustomerPayout_customerId_createdAt_idx" ON "CustomerPayout"("customerId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerPayout" ADD CONSTRAINT "CustomerPayout_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerPayout" ADD CONSTRAINT "CustomerPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- پیوندِ ردیفِ دفتر به سندِ پرداخت
ALTER TABLE "CustomerLedger" ADD COLUMN "payoutId" TEXT;
CREATE INDEX "CustomerLedger_payoutId_idx" ON "CustomerLedger"("payoutId");
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "CustomerPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
