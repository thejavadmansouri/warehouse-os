-- Watermark + auto site publish settings on ShopSettings
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "watermarkEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "watermarkText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "watermarkOpacity" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "watermarkPosition" TEXT NOT NULL DEFAULT 'bottom-right';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "autoPublishOnline" BOOLEAN NOT NULL DEFAULT false;
