-- CreateEnum
CREATE TYPE "ProductShortageStatus" AS ENUM ('OPEN', 'ORDERED', 'DISMISSED');

-- CreateTable
CREATE TABLE "ProductShortage" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "customerId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT,
    "note" TEXT,
    "status" "ProductShortageStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductShortage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductShortage_status_createdAt_idx" ON "ProductShortage"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductShortage_productId_idx" ON "ProductShortage"("productId");

-- AddForeignKey
ALTER TABLE "ProductShortage" ADD CONSTRAINT "ProductShortage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShortage" ADD CONSTRAINT "ProductShortage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShortage" ADD CONSTRAINT "ProductShortage_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShortage" ADD CONSTRAINT "ProductShortage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductShortage" ADD CONSTRAINT "ProductShortage_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
