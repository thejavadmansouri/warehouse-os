-- CreateEnum
CREATE TYPE "WorkTaskPriority" AS ENUM ('NORMAL', 'URGENT');

-- AlterTable
-- پیش‌فرض NORMAL تا هر کارِ موجود دقیقاً همان بماند که بود.
ALTER TABLE "WorkTask" ADD COLUMN "priority" "WorkTaskPriority" NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
-- صفِ کارگر «فوری‌ها اول، بعد قدیمی‌ترها» مرتب می‌شود.
CREATE INDEX "WorkTask_priority_createdAt_idx" ON "WorkTask"("priority", "createdAt");
