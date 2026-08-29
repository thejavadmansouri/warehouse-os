-- افزودنِ قلمِ تازه به فاکتورِ ثبت‌شده، از راهِ اصلاحیه.
--
-- ستون افزودنی و پیش‌فرض‌دار است: ردیف‌های موجودِ اصلاحیه همه «تصحیح» بوده‌اند،
-- پس false برایشان درست است و هیچ داده‌ای بازنویسی نمی‌شود.
ALTER TABLE "SaleCorrectionLine"
  ADD COLUMN "isNewLine" BOOLEAN NOT NULL DEFAULT false;
