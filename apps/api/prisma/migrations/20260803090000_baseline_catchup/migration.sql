-- Catch-up baseline: reconciles migration history with the dev DB state that was
-- applied via `db push` / raw SQL (see docs/NEXT_TASK.md §8). Marked as already
-- applied on the dev DB via `prisma migrate resolve --applied`; it runs for real
-- only on a fresh database (e.g. the on-prem Windows deploy).

-- Required by the product search ranker (similarity()); Prisma does not manage
-- extensions, so it must be declared explicitly here.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterEnum
ALTER TYPE "public"."Role" ADD VALUE 'SALES';

-- AlterTable
ALTER TABLE "public"."Asset" ADD COLUMN     "bytes" INTEGER,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "pendingOperationId" TEXT,
ADD COLUMN     "sha256" TEXT,
ADD COLUMN     "thumbnailPath" TEXT,
ADD COLUMN     "width" INTEGER;

-- AlterTable
ALTER TABLE "public"."InventoryLog" ADD COLUMN     "unitPrice" INTEGER;

-- AlterTable
ALTER TABLE "public"."Location" ADD COLUMN     "depth" INTEGER NOT NULL,
ADD COLUMN     "path" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."LocationType" DROP COLUMN "level",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "depth" INTEGER NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "warehouseId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Product" ADD COLUMN     "searchTokens" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- DropEnum
DROP TYPE "public"."LocationLevel";

-- CreateTable
CREATE TABLE "public"."PendingOperation" (
    "id" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "type" TEXT NOT NULL DEFAULT 'IN',
    "locationBarcode" TEXT NOT NULL,
    "voiceText" TEXT,
    "parsed" JSONB,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "productId" TEXT,
    "workerId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "committedLogId" TEXT,
    "deviceCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PrintJob" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "printedItems" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PrintJobItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrintJobItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductCreationRequest" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "name" TEXT NOT NULL,
    "brandName" TEXT,
    "categoryId" TEXT,
    "vehicles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'عدد',
    "notes" TEXT,
    "voiceText" TEXT,
    "locationBarcode" TEXT,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "sessionId" TEXT,
    "workerId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCreationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProductVehicle" (
    "productId" TEXT NOT NULL,
    "vehicleModelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductVehicle_pkey" PRIMARY KEY ("productId","vehicleModelId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingOperation_clientRequestId_key" ON "public"."PendingOperation"("clientRequestId" ASC);

-- CreateIndex
CREATE INDEX "PendingOperation_status_idx" ON "public"."PendingOperation"("status" ASC);

-- CreateIndex
CREATE INDEX "PendingOperation_warehouseId_status_idx" ON "public"."PendingOperation"("warehouseId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "ProductCreationRequest_status_idx" ON "public"."ProductCreationRequest"("status" ASC);

-- CreateIndex
CREATE INDEX "ProductCreationRequest_warehouseId_status_idx" ON "public"."ProductCreationRequest"("warehouseId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "ProductVehicle_vehicleModelId_idx" ON "public"."ProductVehicle"("vehicleModelId" ASC);

-- CreateIndex
CREATE INDEX "Asset_pendingOperationId_idx" ON "public"."Asset"("pendingOperationId" ASC);

-- CreateIndex
CREATE INDEX "Location_parentId_idx" ON "public"."Location"("parentId" ASC);

-- CreateIndex
CREATE INDEX "Location_path_idx" ON "public"."Location"("path" ASC);

-- CreateIndex
CREATE INDEX "Location_typeId_idx" ON "public"."Location"("typeId" ASC);

-- CreateIndex
CREATE INDEX "Location_warehouseId_idx" ON "public"."Location"("warehouseId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LocationType_warehouseId_depth_key" ON "public"."LocationType"("warehouseId" ASC, "depth" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LocationType_warehouseId_name_key" ON "public"."LocationType"("warehouseId" ASC, "name" ASC);

-- CreateIndex
-- GIN does not accept ASC/DESC; Prisma's diff emits it, so it is stripped here.
CREATE INDEX "Product_searchTokens_idx" ON "public"."Product" USING GIN ("searchTokens" array_ops);

-- AddForeignKey
ALTER TABLE "public"."Asset" ADD CONSTRAINT "Asset_pendingOperationId_fkey" FOREIGN KEY ("pendingOperationId") REFERENCES "public"."PendingOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LocationType" ADD CONSTRAINT "LocationType_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "public"."Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PendingOperation" ADD CONSTRAINT "PendingOperation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PendingOperation" ADD CONSTRAINT "PendingOperation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PendingOperation" ADD CONSTRAINT "PendingOperation_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PendingOperation" ADD CONSTRAINT "PendingOperation_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrintJob" ADD CONSTRAINT "PrintJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrintJobItem" ADD CONSTRAINT "PrintJobItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."PrintJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PrintJobItem" ADD CONSTRAINT "PrintJobItem_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCreationRequest" ADD CONSTRAINT "ProductCreationRequest_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCreationRequest" ADD CONSTRAINT "ProductCreationRequest_createdProductId_fkey" FOREIGN KEY ("createdProductId") REFERENCES "public"."Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCreationRequest" ADD CONSTRAINT "ProductCreationRequest_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "public"."Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCreationRequest" ADD CONSTRAINT "ProductCreationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductCreationRequest" ADD CONSTRAINT "ProductCreationRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductVehicle" ADD CONSTRAINT "ProductVehicle_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProductVehicle" ADD CONSTRAINT "ProductVehicle_vehicleModelId_fkey" FOREIGN KEY ("vehicleModelId") REFERENCES "public"."VehicleModel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

