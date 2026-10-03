-- CreateEnum
CREATE TYPE "CandidateStatus" AS ENUM ('PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'NONE');

-- CreateEnum
CREATE TYPE "SearchJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "ProductImageCandidate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceDomain" TEXT,
    "searchQuery" TEXT,
    "localPath" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "originalWidth" INTEGER,
    "originalHeight" INTEGER,
    "originalSize" INTEGER,
    "processedPath" TEXT,
    "processedWidth" INTEGER,
    "processedHeight" INTEGER,
    "processedSize" INTEGER,
    "backgroundRemoved" BOOLEAN NOT NULL DEFAULT false,
    "backgroundRemovalFailed" BOOLEAN NOT NULL DEFAULT false,
    "sha256" TEXT,
    "perceptualHash" TEXT,
    "confidenceScore" INTEGER NOT NULL DEFAULT 0,
    "confidenceLevel" "ConfidenceLevel" NOT NULL DEFAULT 'NONE',
    "matchReason" TEXT,
    "status" "CandidateStatus" NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,

    CONSTRAINT "ProductImageCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageSearchJob" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" "SearchJobStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageSearchJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagePublishLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagePublishLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductImageCandidate_productId_idx" ON "ProductImageCandidate"("productId");

-- CreateIndex
CREATE INDEX "ProductImageCandidate_status_idx" ON "ProductImageCandidate"("status");

-- CreateIndex
CREATE INDEX "ProductImageCandidate_confidenceLevel_idx" ON "ProductImageCandidate"("confidenceLevel");

-- CreateIndex
CREATE INDEX "ProductImageCandidate_productId_status_idx" ON "ProductImageCandidate"("productId", "status");

-- CreateIndex
CREATE INDEX "ImageSearchJob_status_priority_idx" ON "ImageSearchJob"("status", "priority");

-- CreateIndex
CREATE INDEX "ImageSearchJob_productId_idx" ON "ImageSearchJob"("productId");

-- CreateIndex
CREATE INDEX "ImagePublishLog_productId_createdAt_idx" ON "ImagePublishLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ImagePublishLog_createdAt_idx" ON "ImagePublishLog"("createdAt");

-- AddForeignKey
ALTER TABLE "ProductImageCandidate" ADD CONSTRAINT "ProductImageCandidate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageCandidate" ADD CONSTRAINT "ProductImageCandidate_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "ProductImageCandidate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductImageCandidate" ADD CONSTRAINT "ProductImageCandidate_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageSearchJob" ADD CONSTRAINT "ImageSearchJob_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePublishLog" ADD CONSTRAINT "ImagePublishLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePublishLog" ADD CONSTRAINT "ImagePublishLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
