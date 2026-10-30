-- CreateEnum
CREATE TYPE "ChequeStatus" AS ENUM ('RECEIVED', 'REGISTERED_SAYAD', 'CLEARED', 'BOUNCED', 'REJECTED');

-- CreateTable
CREATE TABLE "cheques" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sayadId" TEXT NOT NULL,
    "chequeNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "branchName" TEXT,
    "accountNumber" TEXT,
    "drawerName" TEXT NOT NULL,
    "drawerNationalId" TEXT,
    "amount" DECIMAL(18,0) NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ChequeStatus" NOT NULL DEFAULT 'RECEIVED',
    "adminNote" TEXT,
    "sayadVerified" BOOLEAN NOT NULL DEFAULT false,
    "imagePath" TEXT,
    "clearedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cheques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cheques_customerId_status_idx" ON "cheques"("customerId", "status");

-- CreateIndex
CREATE INDEX "cheques_sayadId_idx" ON "cheques"("sayadId");

-- CreateIndex
CREATE INDEX "cheques_dueDate_idx" ON "cheques"("dueDate");

-- AddForeignKey
ALTER TABLE "cheques" ADD CONSTRAINT "cheques_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
