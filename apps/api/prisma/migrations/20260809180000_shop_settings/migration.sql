-- مشخصات مغازه برای سربرگ برگه‌های چاپی.
-- تک‌ردیفی و کاملاً افزایشی؛ هیچ داده‌ای را دست نمی‌زند.
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "name" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "cardNumber" TEXT NOT NULL DEFAULT '',
    "cardHolder" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- ردیف پیش‌فرض، تا خواندن هیچ‌وقت خالی برنگردد.
INSERT INTO "ShopSettings" ("id", "updatedAt") VALUES ('singleton', CURRENT_TIMESTAMP);
