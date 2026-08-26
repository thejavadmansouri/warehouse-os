-- Carries the factory barcode the worker scanned into the product request, so
-- approval can attach it to the new product instead of throwing it away.
-- Nullable + no default: purely additive, safe on a live table.
ALTER TABLE "ProductCreationRequest" ADD COLUMN "productBarcode" TEXT;
