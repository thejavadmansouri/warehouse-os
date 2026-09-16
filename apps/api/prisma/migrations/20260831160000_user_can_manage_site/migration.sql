-- دسترسی به بخش «فروشگاه اینترنتی» — مستقل از نقش، per-user
-- پیش‌فرض false است تا هیچ نقشِ صندوق (SALES/STAFF) به‌صورت تصادفی سایت را نبیند؛
-- ولی مدیرانِ موجود (ADMIN/MANAGER) باید همان تجربه‌ی قبلی‌شان را داشته باشند،
-- پس فقط آن‌ها باگ‌فیل می‌شوند.
ALTER TABLE "User" ADD COLUMN "canManageSite" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "canManageSite" = true WHERE "role" IN ('ADMIN', 'MANAGER');