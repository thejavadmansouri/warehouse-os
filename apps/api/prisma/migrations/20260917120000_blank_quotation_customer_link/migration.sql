-- پیوند اختیاری برگه‌ی سفید به پرونده‌ی مشتری.
-- «نام آزاد» دست‌نخورده می‌ماند؛ این ستون فقط وقتی پر می‌شود که مدیر نام را
-- به مشتریِ موجود وصل کرده باشد.

ALTER TABLE "BlankQuotation" ADD COLUMN "customerId" TEXT;

CREATE INDEX "BlankQuotation_customerId_idx" ON "BlankQuotation"("customerId");

ALTER TABLE "BlankQuotation" ADD CONSTRAINT "BlankQuotation_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
