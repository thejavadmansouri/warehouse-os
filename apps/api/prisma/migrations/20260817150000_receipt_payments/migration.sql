-- رسیدِ چندروشه: سطرهای پرداختِ هر رسید — مثل Payment روی فاکتور.
-- قبلاً هر رسید فقط یک method داشت؛ حالا نقد+کارت+چک در یک رسید ممکن است.

-- CreateTable
CREATE TABLE "ReceiptPayment" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReceiptPayment_pkey" PRIMARY KEY ("id")
);

-- چک‌ها به سطر پرداختِ رسید وصل می‌شوند، وگرنه هر رسید فقط یک چک می‌توانست داشته باشد.
ALTER TABLE "Cheque" ADD COLUMN "receiptPaymentId" TEXT;

-- انتقال چک‌های موجود: برای هر چکِ رسید، یک سطر پرداخت CHEQUE به مبلغِ همان رسید
INSERT INTO "ReceiptPayment" ("id", "receiptId", "method", "amount", "createdAt")
SELECT gen_random_uuid(), c."receiptId", 'CHEQUE', r."amount", r."createdAt"
FROM "Cheque" c
JOIN "Receipt" r ON r."id" = c."receiptId"
WHERE c."receiptId" IS NOT NULL;

-- هر چکِ قدیمی به سطر پرداختِ تازه‌ساخته‌شده‌ی همان رسید وصل شود.
UPDATE "Cheque" c
SET "receiptPaymentId" = rp."id"
FROM "ReceiptPayment" rp
WHERE rp."receiptId" = c."receiptId" AND c."receiptId" IS NOT NULL;

-- رابطه و ستونِ قدیمیِ چک حذف می‌شود (داده منتقل شده است).
ALTER TABLE "Cheque" DROP CONSTRAINT "Cheque_receiptId_fkey";
DROP INDEX "Cheque_receiptId_key";
ALTER TABLE "Cheque" DROP COLUMN "receiptId";

-- CreateIndex
CREATE INDEX "ReceiptPayment_receiptId_idx" ON "ReceiptPayment"("receiptId");

-- CreateIndex
CREATE INDEX "ReceiptPayment_method_idx" ON "ReceiptPayment"("method");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_receiptPaymentId_key" ON "Cheque"("receiptPaymentId");

-- AddForeignKey
ALTER TABLE "ReceiptPayment" ADD CONSTRAINT "ReceiptPayment_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_receiptPaymentId_fkey" FOREIGN KEY ("receiptPaymentId") REFERENCES "ReceiptPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
