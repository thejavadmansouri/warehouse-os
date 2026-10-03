-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "labelPrintedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LabelSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "columns" INTEGER NOT NULL DEFAULT 4,
    "widthMm" INTEGER NOT NULL DEFAULT 50,
    "heightMm" INTEGER NOT NULL DEFAULT 30,
    "gapMm" INTEGER NOT NULL DEFAULT 2,
    "showName" BOOLEAN NOT NULL DEFAULT true,
    "showBarcodeText" BOOLEAN NOT NULL DEFAULT true,
    "cropMarks" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_labelPrintedAt_idx" ON "Product"("labelPrintedAt");

