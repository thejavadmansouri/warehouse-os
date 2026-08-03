-- AlterTable
ALTER TABLE "SaleInvoice" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SaleInvoice_idempotencyKey_key" ON "SaleInvoice"("idempotencyKey");

