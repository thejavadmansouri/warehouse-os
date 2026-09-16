-- نامِ نمایشیِ قابل‌ویرایشِ هر قلمِ پیش‌فاکتور (مثل محسن‌فاکتور).
-- خالی یعنی نامِ خودِ کالا چاپ شود.
ALTER TABLE "QuotationLine" ADD COLUMN "label" TEXT;

-- نامِ آزادِ مشتری که فروشنده مستقیم تایپ کرده.
-- اگر خالی باشد، نام مشتریِ پیوندی (customerId) نشان داده می‌شود.
ALTER TABLE "Quotation" ADD COLUMN "customerName" TEXT;