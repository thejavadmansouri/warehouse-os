-- فاکتور خرید + سابقه‌ی بازیابی بک‌آپ
--
-- کاملاً افزایشی است: فقط enum، جدول و ستونِ nullable تازه اضافه می‌شود. هیچ
-- ستونی حذف یا تغییر نوع نمی‌دهد و هیچ ردیفی دست نمی‌خورد، پس روی دیتابیسِ در
-- حال کارِ انبار بدون توقف اجرا می‌شود.

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RestoreStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- AlterTable: ردیف‌های فاکتور خرید همین رکوردهای لجرند، نه جدول جدا.
ALTER TABLE "InventoryLog" ADD COLUMN "purchaseId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseInvoice" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "idempotencyKey" TEXT,
    "supplierId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT,
    "supplierRef" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "subtotal" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'CONFIRMED',
    "note" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RestoreRun" (
    "id" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "preRestoreFile" TEXT,
    "status" "RestoreStatus" NOT NULL DEFAULT 'RUNNING',
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "startedById" TEXT,

    CONSTRAINT "RestoreRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_number_key" ON "PurchaseInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseInvoice_idempotencyKey_key" ON "PurchaseInvoice"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_warehouseId_createdAt_idx" ON "PurchaseInvoice"("warehouseId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_supplierId_idx" ON "PurchaseInvoice"("supplierId");

-- CreateIndex
CREATE INDEX "PurchaseInvoice_status_idx" ON "PurchaseInvoice"("status");

-- CreateIndex
CREATE INDEX "RestoreRun_startedAt_idx" ON "RestoreRun"("startedAt");

-- CreateIndex
CREATE INDEX "InventoryLog_purchaseId_idx" ON "InventoryLog"("purchaseId");

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseInvoice" ADD CONSTRAINT "PurchaseInvoice_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
