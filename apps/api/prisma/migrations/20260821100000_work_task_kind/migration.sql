-- CreateEnum
CREATE TYPE "WorkTaskKind" AS ENUM ('PICK', 'PUTAWAY');

-- AlterTable
-- پیش‌فرض PICK است تا هر Taskِ موجود دقیقاً همان بماند که بود.
ALTER TABLE "WorkTask" ADD COLUMN "kind" "WorkTaskKind" NOT NULL DEFAULT 'PICK';

-- CreateIndex
-- صفِ کارگر و صفحه‌ی مدیر هر دو با نوع فیلتر می‌شوند.
CREATE INDEX "WorkTask_kind_status_idx" ON "WorkTask"("kind", "status");
