-- رول مغازه همیشه ۱۰ سانتی است؛ برچسب پیش‌فرض ۳ تایی روی همان رول.
ALTER TABLE "LabelSettings" ALTER COLUMN "widthMm" SET DEFAULT 33;
ALTER TABLE "LabelSettings" ALTER COLUMN "heightMm" SET DEFAULT 25;
ALTER TABLE "LabelSettings" ALTER COLUMN "mediaWidthMm" SET DEFAULT 100;

UPDATE "LabelSettings"
SET "mediaWidthMm" = 100
WHERE "mediaWidthMm" IS NULL;
