-- کلیدِ گروه‌بندیِ عملیات یکپارچه (adjust): وقتی مرجوعی و اصلاحیه در یک تراکنشِ
-- واحد ثبت می‌شوند، هر دو سند همین کلید را می‌گیرند تا در UI به‌عنوان یک
-- عملیات دیده و پیگیری شوند. افزودنی و nullable — هیچ ردیفِ موجودی دست نمی‌خورد.
ALTER TABLE "SaleReturn" ADD COLUMN "operationKey" TEXT;
ALTER TABLE "SaleCorrection" ADD COLUMN "operationKey" TEXT;

CREATE INDEX "SaleReturn_operationKey_idx" ON "SaleReturn"("operationKey");
CREATE INDEX "SaleCorrection_operationKey_idx" ON "SaleCorrection"("operationKey");
