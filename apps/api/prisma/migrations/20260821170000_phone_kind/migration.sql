-- CreateEnum
CREATE TYPE "PhoneKind" AS ENUM ('MOBILE', 'LANDLINE', 'OTHER');

-- AlterTable
ALTER TABLE "CustomerPhone" ADD COLUMN "kind" "PhoneKind" NOT NULL DEFAULT 'OTHER';

-- شماره‌های موجود بر اساس خودِ شماره دسته‌بندی می‌شوند، نه برچسبی که کاربر زده.
-- همان قواعدی که normalizePhone() اعمال می‌کند و شماره‌ها با آن ذخیره شده‌اند:
-- موبایل ۱۱ رقمی با 09، ثابت با صفر و کد شهر، بقیه OTHER.
UPDATE "CustomerPhone" SET "kind" = 'MOBILE'   WHERE "phone" ~ '^09[0-9]{9}$';
UPDATE "CustomerPhone" SET "kind" = 'LANDLINE' WHERE "phone" ~ '^0[0-9]{2,10}$' AND "kind" <> 'MOBILE';

-- CreateIndex
-- «هر مشتری که موبایل دارد» — کوئریِ هر ارسال گروهی.
CREATE INDEX "CustomerPhone_kind_idx" ON "CustomerPhone"("kind");
