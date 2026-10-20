-- محتوای فروشگاه (مقاله + صفحه‌ی ثابت) و تاریخ وضعیت سفارش.
--
-- این migration دستی نوشته شد چون دیتابیسِ توسعه از `db push` ساخته شده و سه
-- ایندکس `InventoryLog.correctionId`، `SaleInvoice.accountId` و
-- `VoucherLine.voucherId` را که تاریخِ migration اعلام می‌کند اصلاً ندارد؛
-- `migrate dev` به همین drift می‌خواست کل دیتابیس را reset کند. آن سه خطِ اول
-- همان drift را می‌بندد (روی دیتابیسِ زنده no-op است، چون ایندکسی نیست) تا از
-- این به بعد تاریخ و اسکیما یکی باشند.

DROP INDEX IF EXISTS "InventoryLog_correctionId_idx";
DROP INDEX IF EXISTS "SaleInvoice_accountId_idx";
DROP INDEX IF EXISTS "VoucherLine_voucherId_idx";

-- CreateEnum
CREATE TYPE "ShopContentKind" AS ENUM ('ARTICLE', 'PAGE');
CREATE TYPE "ShopContentStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "ShopContent" (
    "id" TEXT NOT NULL,
    "kind" "ShopContentKind" NOT NULL DEFAULT 'ARTICLE',
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "coverImage" TEXT,
    "status" "ShopContentStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnlineOrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OnlineOrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnlineOrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopContent_slug_key" ON "ShopContent"("slug");
CREATE INDEX "ShopContent_kind_status_publishedAt_idx" ON "ShopContent"("kind", "status", "publishedAt");
CREATE INDEX "OnlineOrderEvent_orderId_createdAt_idx" ON "OnlineOrderEvent"("orderId", "createdAt");

-- AddForeignKey
ALTER TABLE "OnlineOrderEvent" ADD CONSTRAINT "OnlineOrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
