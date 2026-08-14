-- CreateTable
CREATE TABLE "CustomerCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerCategory_pkey" PRIMARY KEY ("id")
);

-- داده‌ی فعلی: دسته‌های یکتایی که مشتری‌ها دارند به دسته‌ی واقعی تبدیل می‌شوند.
INSERT INTO "CustomerCategory" ("id", "name", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "category", '#64748b', 0, true, now(), now()
FROM "Customer"
WHERE "category" IS NOT NULL
GROUP BY "category";

-- دسته‌ی پیش‌فرض «سایر» — برای هر مشتریِ بدون دسته‌ی مشخص و انتخاب‌های بعدی.
INSERT INTO "CustomerCategory" ("id", "name", "color", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'سایر', '#64748b', 999, true, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "CustomerCategory" WHERE "name" = 'سایر');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "categoryId" TEXT;

-- پیوند مشتری‌های دارای دسته به دسته‌ی هم‌نامشان
UPDATE "Customer" c
SET "categoryId" = cc."id"
FROM "CustomerCategory" cc
WHERE c."category" IS NOT NULL AND cc."name" = c."category";

-- باقی‌مانده‌ی بدون دسته → «سایر»
UPDATE "Customer" c
SET "categoryId" = (SELECT "id" FROM "CustomerCategory" WHERE "name" = 'سایر')
WHERE c."categoryId" IS NULL AND c."category" IS NOT NULL;

-- DropIndex
DROP INDEX "Customer_category_idx";

-- DropColumn
ALTER TABLE "Customer" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "CustomerCategory_isActive_idx" ON "CustomerCategory"("isActive");
CREATE INDEX "CustomerCategory_sortOrder_idx" ON "CustomerCategory"("sortOrder");
CREATE INDEX "Customer_categoryId_idx" ON "Customer"("categoryId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_categoryId_fkey"
FOREIGN KEY ("categoryId") REFERENCES "CustomerCategory"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
