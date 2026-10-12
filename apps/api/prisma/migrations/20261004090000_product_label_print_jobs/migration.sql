-- AlterTable PrintJob: track source of product-label queue rows
ALTER TABLE "PrintJob" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- AlterTable PrintJobItem: product labels with copies
ALTER TABLE "PrintJobItem" ADD COLUMN IF NOT EXISTS "productId" TEXT;
ALTER TABLE "PrintJobItem" ADD COLUMN IF NOT EXISTS "copies" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PrintJobItem" ADD COLUMN IF NOT EXISTS "pendingOperationId" TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS "PrintJob_status_type_createdAt_idx" ON "PrintJob"("status", "type", "createdAt");
CREATE INDEX IF NOT EXISTS "PrintJobItem_productId_idx" ON "PrintJobItem"("productId");
CREATE INDEX IF NOT EXISTS "PrintJobItem_pendingOperationId_idx" ON "PrintJobItem"("pendingOperationId");

-- Foreign keys (idempotent-ish: ignore if already present via DO block)
DO $$ BEGIN
  ALTER TABLE "PrintJobItem"
    ADD CONSTRAINT "PrintJobItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "PrintJobItem"
    ADD CONSTRAINT "PrintJobItem_pendingOperationId_fkey"
    FOREIGN KEY ("pendingOperationId") REFERENCES "PendingOperation"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cascade delete items when job is removed (replace prior FK if needed)
DO $$ BEGIN
  ALTER TABLE "PrintJobItem" DROP CONSTRAINT IF EXISTS "PrintJobItem_jobId_fkey";
  ALTER TABLE "PrintJobItem"
    ADD CONSTRAINT "PrintJobItem_jobId_fkey"
    FOREIGN KEY ("jobId") REFERENCES "PrintJob"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN others THEN NULL;
END $$;
