-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PREPARING', 'HANDED_TO_CARRIER', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FreightPaymentType" AS ENUM ('PAY_ON_DELIVERY', 'PREPAID', 'FREE_SHIPPING');

-- CreateEnum
CREATE TYPE "RmaStatus" AS ENUM ('PENDING', 'APPROVED', 'RECEIVED', 'REFUNDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RmaReason" AS ENUM ('DEFECTIVE', 'WRONG_ITEM', 'DAMAGED_IN_SHIPPING', 'SURPLUS_ORDER');

-- CreateTable
CREATE TABLE "shipments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "carrierPhone" TEXT,
    "waybillNumber" TEXT,
    "destinationCity" TEXT NOT NULL,
    "destinationAddress" TEXT,
    "receiverName" TEXT,
    "receiverPhone" TEXT,
    "freightPaymentType" "FreightPaymentType" NOT NULL DEFAULT 'PAY_ON_DELIVERY',
    "freightCost" DECIMAL(18,0),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARING',
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rma_requests" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "reason" "RmaReason" NOT NULL,
    "customerNote" TEXT NOT NULL,
    "adminNote" TEXT,
    "status" "RmaStatus" NOT NULL DEFAULT 'PENDING',
    "refundAmount" DECIMAL(18,0),
    "refundWalletTxId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rma_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipments_orderId_key" ON "shipments"("orderId");

-- CreateIndex
CREATE INDEX "shipments_status_idx" ON "shipments"("status");

-- CreateIndex
CREATE INDEX "shipments_destinationCity_idx" ON "shipments"("destinationCity");

-- CreateIndex
CREATE INDEX "shipments_waybillNumber_idx" ON "shipments"("waybillNumber");

-- CreateIndex
CREATE UNIQUE INDEX "rma_requests_number_key" ON "rma_requests"("number");

-- CreateIndex
CREATE INDEX "rma_requests_customerId_status_idx" ON "rma_requests"("customerId", "status");

-- CreateIndex
CREATE INDEX "rma_requests_orderId_idx" ON "rma_requests"("orderId");

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rma_requests" ADD CONSTRAINT "rma_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rma_requests" ADD CONSTRAINT "rma_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rma_requests" ADD CONSTRAINT "rma_requests_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
