-- مشتریِ سایت جدا از مشتریِ مغازه، و چرخه‌ی عمرِ «تحویل» به‌جای «تأیید».
--
-- بازنویسیِ enum و ستونِ NOT NULLِ تازه فقط به این دلیل بی‌خطر است که
-- «OnlineOrder» هنوز هیچ ردیفی ندارد (فروشگاه اینترنتی هرگز زنده نبوده).
-- اگر روزی این فایل روی دیتابیسی با سفارشِ واقعی اجرا شود، ستونِ
-- «siteCustomerId» می‌ترکد — که بهتر از ساکت‌خراب‌شدنِ داده است.

-- ─── مشتری سایت ───
CREATE TABLE "SiteCustomer" (
    "id"        TEXT NOT NULL,
    "phone"     TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteCustomer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SiteCustomer_phone_key" ON "SiteCustomer"("phone");
CREATE INDEX "SiteCustomer_createdAt_idx" ON "SiteCustomer"("createdAt");

CREATE TABLE "SiteAddress" (
    "id"             TEXT NOT NULL,
    "siteCustomerId" TEXT NOT NULL,
    "title"          TEXT,
    "receiverName"   TEXT NOT NULL,
    "receiverPhone"  TEXT NOT NULL,
    "province"       TEXT,
    "city"           TEXT,
    "postalCode"     TEXT,
    "line"           TEXT NOT NULL,
    "isDefault"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SiteAddress_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SiteAddress_siteCustomerId_idx" ON "SiteAddress"("siteCustomerId");
ALTER TABLE "SiteAddress" ADD CONSTRAINT "SiteAddress_siteCustomerId_fkey"
  FOREIGN KEY ("siteCustomerId") REFERENCES "SiteCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── چرخه‌ی عمر: «منتظر تأیید» حذف می‌شود ───
--
-- ⚠️ نوعِ قدیمی را نمی‌شود مستقیم DROP کرد، چون ستونِ «status» هنوز به آن
-- وابسته است و پستگرس اجازه نمی‌دهد. الگوی درست: تغییرِ نام بده، نوعِ تازه
-- بساز، ستون را منتقل کن، بعد نوعِ قدیمی را که دیگر کسی استفاده نمی‌کند بردار.
ALTER TYPE "OnlineOrderStatus" RENAME TO "OnlineOrderStatus_old";

CREATE TYPE "OnlineOrderStatus" AS ENUM ('PLACED', 'PREPARING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

ALTER TABLE "OnlineOrder" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "OnlineOrder"
  ALTER COLUMN "status" TYPE "OnlineOrderStatus" USING ('PLACED'::"OnlineOrderStatus");
ALTER TABLE "OnlineOrder" ALTER COLUMN "status" SET DEFAULT 'PLACED';

DROP TYPE "OnlineOrderStatus_old";

-- ─── سفارش به مشتریِ سایت وصل می‌شود؛ مشتریِ مغازه اختیاری می‌شود ───
ALTER TABLE "OnlineOrder" DROP CONSTRAINT IF EXISTS "OnlineOrder_customerId_fkey";
ALTER TABLE "OnlineOrder"
  ADD COLUMN "siteCustomerId" TEXT NOT NULL,
  ADD COLUMN "stockAppliedAt" TIMESTAMP(3),
  ALTER COLUMN "customerId" DROP NOT NULL;

ALTER TABLE "OnlineOrder" ADD CONSTRAINT "OnlineOrder_siteCustomerId_fkey"
  FOREIGN KEY ("siteCustomerId") REFERENCES "SiteCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OnlineOrder" ADD CONSTRAINT "OnlineOrder_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OnlineOrder_siteCustomerId_createdAt_idx" ON "OnlineOrder"("siteCustomerId", "createdAt");
CREATE INDEX "OnlineOrder_stockAppliedAt_idx" ON "OnlineOrder"("stockAppliedAt");
