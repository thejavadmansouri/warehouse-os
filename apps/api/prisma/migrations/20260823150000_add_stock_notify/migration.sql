-- اشتراکِ «موجود شد خبرم کن» روی کالا.

-- CreateTable
CREATE TABLE "StockNotify" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "StockNotify_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockNotify_productId_notifiedAt_idx" ON "StockNotify"("productId", "notifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockNotify_productId_phone_key" ON "StockNotify"("productId", "phone");

-- AddForeignKey
ALTER TABLE "StockNotify" ADD CONSTRAINT "StockNotify_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
