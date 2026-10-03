-- علاقه‌مندی‌های مشتری سایت (Wishlist).
-- کلیدِ مرکب (siteCustomerId, productId) یعنی هر کالا فقط یک‌بار در لیستِ هر مشتری.

-- CreateTable
CREATE TABLE "Favorite" (
    "siteCustomerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("siteCustomerId","productId")
);

-- CreateIndex
CREATE INDEX "Favorite_productId_idx" ON "Favorite"("productId");

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_siteCustomerId_fkey" FOREIGN KEY ("siteCustomerId") REFERENCES "SiteCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
