/*
 * اصلاح: دنباله‌ی شماره‌ی سندِ پرداخت جا مانده بود.
 *
 * مایگریشنِ ساختِ جدول، ستونِ number را بدون DEFAULT ساخت — در حالی که در
 * Prisma به‌صورت @default(autoincrement()) تعریف شده بود. نتیجه: هر ثبتِ
 * پرداخت با «Null constraint violation on (number)» می‌شکست. تستِ دودِ
 * پرداخت (smoke-payout.ts) این را گرفت.
 *
 * هم‌الگو با Receipt.number_seq.
 */

CREATE SEQUENCE IF NOT EXISTS "CustomerPayout_number_seq";

ALTER TABLE "CustomerPayout"
  ALTER COLUMN "number" SET DEFAULT nextval('"CustomerPayout_number_seq"');
