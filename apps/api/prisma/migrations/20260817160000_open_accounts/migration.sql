-- حساب باز: فاکتور جاریِ مشتری که تا تسویه نهایی نمی‌شود.

-- CreateEnum
CREATE TYPE "OpenAccountStatus" AS ENUM ('OPEN', 'SETTLED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'OPEN';

-- CreateTable
CREATE TABLE "OpenAccount" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "OpenAccountStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpenAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SaleInvoice" ADD COLUMN     "accountId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OpenAccount_number_key" ON "OpenAccount"("number");

-- CreateIndex
CREATE INDEX "OpenAccount_status_idx" ON "OpenAccount"("status");

-- CreateIndex
CREATE INDEX "OpenAccount_customerId_idx" ON "OpenAccount"("customerId");

-- CreateIndex
CREATE INDEX "SaleInvoice_accountId_idx" ON "SaleInvoice"("accountId");

-- AddForeignKey
ALTER TABLE "OpenAccount" ADD CONSTRAINT "OpenAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleInvoice" ADD CONSTRAINT "SaleInvoice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "OpenAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
