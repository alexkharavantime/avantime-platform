CREATE TYPE "DocumentProcessingStatus" AS ENUM (
  'PROCESSING',
  'PROCESSED',
  'FAILED'
);

CREATE TABLE "DocumentMetadata" (
  "id" VARCHAR(200) NOT NULL,
  "companyId" VARCHAR(200) NOT NULL,
  "uploadedBy" VARCHAR(200) NOT NULL,
  "originalName" TEXT NOT NULL,
  "storedName" VARCHAR(255) NOT NULL,
  "mimeType" VARCHAR(255) NOT NULL,
  "size" INTEGER NOT NULL,
  "status" "DocumentProcessingStatus" NOT NULL DEFAULT 'PROCESSING',
  "checksum" VARCHAR(64) NOT NULL,
  "pages" INTEGER,
  "textLength" INTEGER,
  "processedAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "chunksCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),

  CONSTRAINT "DocumentMetadata_pkey" PRIMARY KEY ("companyId", "id"),
  CONSTRAINT "DocumentMetadata_size_check" CHECK ("size" >= 0),
  CONSTRAINT "DocumentMetadata_checksum_check"
    CHECK ("checksum" ~ '^[a-f0-9]{64}$')
);

CREATE INDEX "DocumentMetadata_companyId_status_idx"
  ON "DocumentMetadata"("companyId", "status");

CREATE INDEX "DocumentMetadata_companyId_createdAt_idx"
  ON "DocumentMetadata"("companyId", "createdAt");

CREATE INDEX "DocumentMetadata_createdAt_idx"
  ON "DocumentMetadata"("createdAt");

CREATE INDEX "DocumentMetadata_deletedAt_idx"
  ON "DocumentMetadata"("deletedAt");
