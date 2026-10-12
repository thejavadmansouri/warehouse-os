-- AlterTable
ALTER TABLE "WorkTask" ADD COLUMN "purchaseId" TEXT;

-- CreateTable
CREATE TABLE "WorkTaskAssignee" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "WorkTaskAssignee_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "WorkTask_purchaseId_idx" ON "WorkTask"("purchaseId");

-- CreateIndex
CREATE INDEX "WorkTaskAssignee_userId_idx" ON "WorkTaskAssignee"("userId");

-- AddForeignKey
ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "PurchaseInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskAssignee" ADD CONSTRAINT "WorkTaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkTaskAssignee" ADD CONSTRAINT "WorkTaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
