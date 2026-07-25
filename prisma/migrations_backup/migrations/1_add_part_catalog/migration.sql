CREATE TABLE "PartCatalog" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "unit" TEXT NOT NULL DEFAULT 'عدد',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartCatalog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartCatalog_name_key" 
ON "PartCatalog"("name");
