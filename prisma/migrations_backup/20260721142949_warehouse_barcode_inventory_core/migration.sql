/*
  Warnings:

  - A unique constraint covering the columns `[internalBarcode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[factoryBarcode]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `action` to the `InventoryLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `internalBarcode` to the `Product` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Product` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "InventoryAction" AS ENUM ('IN', 'OUT', 'TRANSFER', 'ADJUST');

-- AlterTable
ALTER TABLE "InventoryLog" ADD COLUMN     "action" "InventoryAction" NOT NULL,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "parentId" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "factoryBarcode" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "internalBarcode" TEXT NOT NULL,
ADD COLUMN     "partNumber" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Product_internalBarcode_key" ON "Product"("internalBarcode");

-- CreateIndex
CREATE UNIQUE INDEX "Product_factoryBarcode_key" ON "Product"("factoryBarcode");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
