-- تخفیف ردیف فاکتور، روی همان رکورد دفتر موجودی که ردیف فاکتور است.
-- افزایشی و nullable: ردیف‌های قبلی دست نمی‌خورند و کد قدیمی هم با این ستون کار می‌کند.
ALTER TABLE "InventoryLog" ADD COLUMN "lineDiscount" INTEGER;
