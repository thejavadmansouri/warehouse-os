-- CreateEnum
CREATE TYPE "WorkTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkTaskItemStatus" AS ENUM ('PENDING', 'DONE');

-- CreateTable
CREATE TABLE "WorkTask" (
    "id" TEXT NOT NULL,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'PENDING',
    "warehouseId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "quotationId" TEXT,
    "assignedToId" TEXT,
    "requestedById" TEXT,
    "note" TEXT,
    "idempotencyKey" TEXT,
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkTaskItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "WorkTaskItemStatus" NOT NULL DEFAULT 'PENDING',
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "clientMutationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkTask_idempotencyKey_key" ON "WorkTask"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkTask_warehouseId_status_createdAt_idx" ON "WorkTask"("warehouseId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkTask_assignedToId_status_idx" ON "WorkTask"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "WorkTask_invoiceId_idx" ON "WorkTask"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTaskItem_clientMutationId_key" ON "WorkTaskItem"("clientMutationId");

-- CreateIndex
CREATE INDEX "WorkTaskItem_taskId_status_idx" ON "WorkTaskItem"("taskId", "status");

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SaleInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskItem" ADD CONSTRAINT "WorkTaskItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskItem" ADD CONSTRAINT "WorkTaskItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskItem" ADD CONSTRAINT "WorkTaskItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskItem" ADD CONSTRAINT "WorkTaskItem_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
