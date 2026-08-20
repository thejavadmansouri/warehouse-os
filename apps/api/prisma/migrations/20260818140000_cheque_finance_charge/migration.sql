-- تفاوتِ فروشِ مدت‌دار (سودِ چک).
--
-- اصلِ طراحی: مبلغِ روی کاغذِ چک دست نمی‌خورد — بانک دقیقاً همان را پاس می‌کند.
-- این ستون‌ها فقط می‌گویند چه سهمی از آن مبلغ بابتِ مدت بوده، تا گزارشِ سود
-- حاشیه‌ی کالا را با درآمدِ مدت قاطی نکند.
--
-- نرخ به پایه‌ی هزارم (bp) ذخیره می‌شود نه اعشار: ۲۵۰ یعنی ۲.۵٪. عددِ نهایی هم
-- ذخیره می‌شود نه فقط فرمول، تا تغییرِ بعدیِ قاعده‌ی گردکردن تاریخ را عوض نکند.

-- CreateEnum
CREATE TYPE "ChequeRateMode" AS ENUM ('FLAT', 'MONTHLY');

-- AlterEnum
ALTER TYPE "LedgerEntryType" ADD VALUE 'FINANCE_CHARGE';

-- AlterTable
ALTER TABLE "Customer"
  ADD COLUMN "chequeRateBp"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "chequeRateMode" "ChequeRateMode" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "ShopSettings"
  ADD COLUMN "chequeRateBp"   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "chequeRateMode" "ChequeRateMode" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "Cheque"
  ADD COLUMN "charge" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rateBp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "months" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleInvoice"
  ADD COLUMN "financeCharge" INTEGER NOT NULL DEFAULT 0;
