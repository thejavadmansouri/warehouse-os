-- قیمتِ پیش از تخفیف، و نمایشِ کالای بی‌قیمت روی سایت.
--
-- هر دو افزودنیِ خالص‌اند: هیچ ستونی حذف یا بازنویسی نمی‌شود و هیچ ردیفی
-- تغییر نمی‌کند. `compareAtPrice` خالی یعنی «تخفیفی در کار نیست».

-- AlterTable
ALTER TABLE "ProductPrice" ADD COLUMN "compareAtPrice" INTEGER;

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN "showUnpriced" BOOLEAN NOT NULL DEFAULT true;
