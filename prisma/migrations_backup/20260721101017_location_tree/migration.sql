/*
  Warnings:

  - You are about to drop the column `shelfId` on the `InventoryLog` table. All the data in the column will be lost.
  - You are about to drop the `Floor` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Shelf` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Warehouse` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Zone` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `locationId` to the `InventoryLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Floor" DROP CONSTRAINT "Floor_warehouseId_fkey";

-- DropForeignKey
ALTER TABLE "InventoryLog" DROP CONSTRAINT "InventoryLog_shelfId_fkey";

-- DropForeignKey
ALTER TABLE "Shelf" DROP CONSTRAINT "Shelf_zoneId_fkey";

-- DropForeignKey
ALTER TABLE "Zone" DROP CONSTRAINT "Zone_floorId_fkey";

-- DropIndex
DROP INDEX "InventoryLog_shelfId_idx";

-- AlterTable
ALTER TABLE "InventoryLog" DROP COLUMN "shelfId",
ADD COLUMN     "locationId" TEXT NOT NULL;

-- DropTable
DROP TABLE "Floor";

-- DropTable
DROP TABLE "Shelf";

-- DropTable
DROP TABLE "Warehouse";

-- DropTable
DROP TABLE "Zone";

-- CreateTable
CREATE TABLE "LocationType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LocationType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LocationType_name_key" ON "LocationType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Location_barcode_key" ON "Location"("barcode");

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "Location"("parentId");

-- CreateIndex
CREATE INDEX "Location_typeId_idx" ON "Location"("typeId");

-- CreateIndex
CREATE INDEX "InventoryLog_locationId_idx" ON "InventoryLog"("locationId");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "LocationType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLog" ADD CONSTRAINT "InventoryLog_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;
