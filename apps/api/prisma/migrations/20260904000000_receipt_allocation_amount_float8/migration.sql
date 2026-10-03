-- بردِ مبلغ تخصیص (ReceiptAllocation.amount) از INT4 به float8
--
-- تکمیلِ migration قبلی (money_columns_to_float8): این ستون در آن جا افتاده
-- بود. این همان ستونی است که تخصیص FIFO پرداخت جزئی را نگه می‌دارد و با
-- سقف INT4 (۲۱۴ میلیون تومان) سندِ بزرگ را می‌شکست.
--
-- تبدیل INT4 → float8 بی‌ضرر است؛ هیچ مقدارِ موجودی از دست نمی‌رود.

ALTER TABLE "ReceiptAllocation" ALTER COLUMN "amount" TYPE DOUBLE PRECISION;