/*
  Warnings:

  - A unique constraint covering the columns `[internalBarcode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ItemReviewStatus" AS ENUM ('CONFIRMED', 'NEEDS_REVIEW', 'NEEDS_CORRECTION');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "reviewStatus" "ItemReviewStatus" NOT NULL DEFAULT 'CONFIRMED';

-- DropEnum
DROP TYPE "InventoryOperationSource";

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalBarcode_key" ON "Product"("internalBarcode");
