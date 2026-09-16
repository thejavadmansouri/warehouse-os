-- هسته‌ی سند خودکار (Voucher) — فاز ۱ نقشه راه
--
-- Additive-only: فقط دو جدول جدید و دو enum؛ هیچ جدول/ستونِ موجودی دست نمی‌خورد.
--
-- قراردادِ مبلغ هر خط: مثبت = بدهکار، منفی = بستانکار (همان CustomerLedger)؛
-- جمعِ مبلغ‌های هر سند = صفر (موازنه‌ی اجباری در PostingService).

CREATE TYPE "FixedAccount" AS ENUM (
  'CASH',          -- صندوق (نقد + کارت‌خوانِ همان لحظه)
  'BANK',          -- بانک — فعلاً خالی؛ سپرده/وصول در فاز ۲
  'CHEQUES',       -- چک‌های دریافتی (در جریان وصول)
  'CUSTOMERS',     -- حساب مشتریان (تفصیلی با customerId روی خط)
  'SUPPLIERS',     -- حساب تأمین‌کنندگان
  'SALES',         -- فروش
  'SALES_RETURN',  -- برگشت از فروش
  'DISCOUNT',      -- تخفیف فروش
  'INVENTORY',     -- موجودی انبار (به بهای خرید)
  'COGS',          -- بهای تمام‌شده
  'FINANCE_CHARGE' -- درآمدِ تفاوتِ فروشِ مدت‌دار
);

CREATE TYPE "VoucherSourceType" AS ENUM (
  'SALE_INVOICE',
  'SALE_CANCEL',
  'RECEIPT',
  'SALE_RETURN',
  'SALE_CORRECTION',
  'PURCHASE_INVOICE',
  'PURCHASE_CANCEL'
);

CREATE TABLE "Voucher" (
  "id"                TEXT              NOT NULL,
  "number"            SERIAL,
  "sourceType"        "VoucherSourceType" NOT NULL,
  "sourceId"          TEXT              NOT NULL,
  "idempotencyKey"    TEXT              NOT NULL,
  "note"              TEXT,
  "userId"            TEXT,
  "reversesVoucherId" TEXT,
  "createdAt"         TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoucherLine" (
  "id"         TEXT          NOT NULL,
  "voucherId"  TEXT          NOT NULL,
  "account"    "FixedAccount" NOT NULL,
  "amount"     DOUBLE PRECISION NOT NULL,
  "customerId" TEXT,
  "note"       TEXT,

  CONSTRAINT "VoucherLine_pkey" PRIMARY KEY ("id")
);

-- ایندکس‌های یکتا و جستجو
CREATE UNIQUE INDEX "Voucher_idempotencyKey_key" ON "Voucher"("idempotencyKey");
CREATE UNIQUE INDEX "Voucher_reversesVoucherId_key" ON "Voucher"("reversesVoucherId");
CREATE INDEX "Voucher_sourceType_sourceId_idx" ON "Voucher"("sourceType", "sourceId");
CREATE INDEX "Voucher_createdAt_idx" ON "Voucher"("createdAt");
CREATE INDEX "Voucher_userId_idx" ON "Voucher"("userId");
CREATE INDEX "VoucherLine_voucherId_idx" ON "VoucherLine"("voucherId");
CREATE INDEX "VoucherLine_account_idx" ON "VoucherLine"("account");
CREATE INDEX "VoucherLine_customerId_idx" ON "VoucherLine"("customerId");

-- روابط (بدون onDelete روی Voucher؛ سندها تغییرناپذیرند — حذف نمی‌شوند)
ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_reversesVoucherId_fkey"
  FOREIGN KEY ("reversesVoucherId") REFERENCES "Voucher"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VoucherLine" ADD CONSTRAINT "VoucherLine_voucherId_fkey"
  FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- سطرِ عددِ بعدیِ هر سند (SERIAL روی جدول جدید)
SELECT setval(pg_get_serial_sequence('"Voucher"', 'number'), 1, false);