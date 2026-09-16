-- ترتیبِ قلم‌های برگه‌ی سفید.
--
-- بدون این ستون ترتیب نمایش/تبدیل تصادفی بود (`ORDER BY id` روی uuid)، در حالی
-- که برگه‌ی قیمت باید به همان ترتیبی خوانده شود که کارگر گفت یا نوشت. `createdAt`
-- هم به‌درد نمی‌خورد چون قلم‌های یک برگه در یک تراکنش ساخته می‌شوند و
-- `CURRENT_TIMESTAMP` تراکنشی برای همه یکی است.
--
-- افزودنی: ستون با پیش‌فرض ۰ اضافه می‌شود (برگه‌ای در دنیای واقعی وجود ندارد،
-- پس بک‌فیلِ معنادار لازم نیست) و ایندکسِ تک‌ستونی با ترکیبی جایگزین می‌شود.

ALTER TABLE "BlankQuotationLine" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

DROP INDEX "BlankQuotationLine_blankQuotationId_idx";
CREATE INDEX "BlankQuotationLine_blankQuotationId_position_idx"
  ON "BlankQuotationLine"("blankQuotationId", "position");
