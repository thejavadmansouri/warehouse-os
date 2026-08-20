-- اصلاحیه‌ی فاکتور — سندِ جدا با شماره‌ی خودش. فاکتور اصلی دست نمی‌خورد.

-- CreateTable
CREATE TABLE "SaleCorrection" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "idempotencyKey" TEXT,
    "invoiceId" TEXT NOT NULL,
    "customerId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT,
    "amountAdjust" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaleCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleCorrectionLine" (
    "id" TEXT NOT NULL,
    "correctionId" TEXT NOT NULL,
    "saleLogId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "oldQuantity" INTEGER NOT NULL,
    "newQuantity" INTEGER NOT NULL,
    "oldUnitPrice" INTEGER NOT NULL,
    "newUnitPrice" INTEGER NOT NULL,
    "lineAdjust" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleCorrectionLine_pkey" PRIMARY KEY ("id")
);

-- برای ردیف لجرِ اصلاحیه و حرکت‌های جبرانی انبار
ALTER TABLE "CustomerLedger" ADD COLUMN "correctionId" TEXT;
ALTER TABLE "InventoryLog" ADD COLUMN "correctionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SaleCorrection_number_key" ON "SaleCorrection"("number");
CREATE UNIQUE INDEX "SaleCorrection_idempotencyKey_key" ON "SaleCorrection"("idempotencyKey");
CREATE INDEX "SaleCorrection_invoiceId_idx" ON "SaleCorrection"("invoiceId");
CREATE INDEX "SaleCorrection_customerId_createdAt_idx" ON "SaleCorrection"("customerId", "createdAt");
CREATE INDEX "SaleCorrection_warehouseId_createdAt_idx" ON "SaleCorrection"("warehouseId", "createdAt");
CREATE INDEX "SaleCorrectionLine_correctionId_idx" ON "SaleCorrectionLine"("correctionId");
CREATE INDEX "SaleCorrectionLine_saleLogId_idx" ON "SaleCorrectionLine"("saleLogId");
CREATE INDEX "CustomerLedger_correctionId_idx" ON "CustomerLedger"("correctionId");
CREATE INDEX "InventoryLog_correctionId_idx" ON "InventoryLog"("correctionId");

-- AddForeignKey
ALTER TABLE "SaleCorrection" ADD CONSTRAINT "SaleCorrection_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SaleInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleCorrection" ADD CONSTRAINT "SaleCorrection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleCorrection" ADD CONSTRAINT "SaleCorrection_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleCorrection" ADD CONSTRAINT "SaleCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SaleCorrectionLine" ADD CONSTRAINT "SaleCorrectionLine_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "SaleCorrection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleCorrectionLine" ADD CONSTRAINT "SaleCorrectionLine_saleLogId_fkey" FOREIGN KEY ("saleLogId") REFERENCES "InventoryLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleCorrectionLine" ADD CONSTRAINT "SaleCorrectionLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleCorrectionLine" ADD CONSTRAINT "SaleCorrectionLine_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "SaleCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_correctionId_fkey" FOREIGN KEY ("correctionId") REFERENCES "SaleCorrection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- LedgerEntryType.CORRECTION — enum را گسترش بده
ALTER TYPE "LedgerEntryType" ADD VALUE 'CORRECTION';