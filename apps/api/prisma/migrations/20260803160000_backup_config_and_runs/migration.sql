-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "BackupConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "destination" TEXT NOT NULL DEFAULT '',
    "hour" INTEGER NOT NULL DEFAULT 23,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "keepCount" INTEGER NOT NULL DEFAULT 14,
    "remindAfterHours" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BackupConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "configId" TEXT,
    "status" "BackupStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',
    "filePath" TEXT,
    "sizeBytes" BIGINT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "startedById" TEXT,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackupRun_status_startedAt_idx" ON "BackupRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "BackupRun_startedAt_idx" ON "BackupRun"("startedAt");

-- AddForeignKey
ALTER TABLE "BackupRun" ADD CONSTRAINT "BackupRun_configId_fkey" FOREIGN KEY ("configId") REFERENCES "BackupConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

