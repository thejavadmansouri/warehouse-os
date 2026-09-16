-- فاز ۲: انواع سندِ جدید — چرخهٔ چک، پرداخت به مشتری، برگشت پرداخت.
-- هر ADD VALUE باید دستورِ جدا باشد (قاعدهٔ Postgres).

ALTER TYPE "VoucherSourceType" ADD VALUE 'CHEQUE_DEPOSIT';
ALTER TYPE "VoucherSourceType" ADD VALUE 'CHEQUE_BOUNCED';
ALTER TYPE "VoucherSourceType" ADD VALUE 'CHEQUE_CASHED';
ALTER TYPE "VoucherSourceType" ADD VALUE 'CUSTOMER_PAYOUT';
ALTER TYPE "VoucherSourceType" ADD VALUE 'PAYMENT_REVERSAL';