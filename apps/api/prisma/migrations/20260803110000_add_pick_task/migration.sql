-- CreateEnum
CREATE TYPE "PickTaskStatus" AS ENUM ('PENDING', 'PICKED', 'CANCELLED');

-- CreateTable
CREATE TABLE "PickTask" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "PickTaskStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "invoiceId" TEXT,
    "requestedById" TEXT,
    "assignedToId" TEXT,
    "pickedById" TEXT,
    "pickedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PickTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PickTask_warehouseId_status_createdAt_idx" ON "PickTask"("warehouseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PickTask_assignedToId_status_idx" ON "PickTask"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "PickTask_invoiceId_idx" ON "PickTask"("invoiceId");

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTask" ADD CONSTRAINT "PickTask_pickedById_fkey" FOREIGN KEY ("pickedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

