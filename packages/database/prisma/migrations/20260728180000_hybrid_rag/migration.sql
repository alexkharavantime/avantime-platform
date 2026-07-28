CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE "DocumentEmbeddingStatus" AS ENUM (
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'QUARANTINED',
  'DISABLED'
);

CREATE TYPE "DocumentEmbeddingJobStatus" AS ENUM (
  'QUEUED',
  'PROCESSING'
);

ALTER TABLE "DocumentMetadata"
  ADD COLUMN "embeddingStatus" "DocumentEmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "embeddingModel" VARCHAR(200),
  ADD COLUMN "embeddingDimensions" INTEGER,
  ADD COLUMN "embeddingVersion" VARCHAR(100),
  ADD COLUMN "embeddedAt" TIMESTAMP(3),
  ADD COLUMN "embeddingAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastEmbeddingErrorCode" VARCHAR(100),
  ADD COLUMN "embeddingContentHash" VARCHAR(64);

ALTER TABLE "DocumentMetadata"
  ADD CONSTRAINT "DocumentMetadata_embeddingAttempts_check"
  CHECK ("embeddingAttempts" >= 0),
  ADD CONSTRAINT "DocumentMetadata_embeddingDimensions_check"
  CHECK ("embeddingDimensions" IS NULL OR "embeddingDimensions" > 0),
  ADD CONSTRAINT "DocumentMetadata_embeddingContentHash_check"
  CHECK (
    "embeddingContentHash" IS NULL
    OR "embeddingContentHash" ~ '^[a-f0-9]{64}$'
  );

CREATE INDEX "DocumentMetadata_companyId_embeddingStatus_idx"
  ON "DocumentMetadata"("companyId", "embeddingStatus");

CREATE TABLE "DocumentChunkEmbedding" (
  "companyId" VARCHAR(200) NOT NULL,
  "documentId" VARCHAR(200) NOT NULL,
  "chunkId" VARCHAR(200) NOT NULL,
  "chunkIndex" INTEGER NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "contentPreview" TEXT NOT NULL,
  "pageStart" INTEGER,
  "pageEnd" INTEGER,
  "embeddingModel" VARCHAR(200) NOT NULL,
  "embeddingVersion" VARCHAR(100) NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "embedding" vector NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DocumentChunkEmbedding_pkey"
    PRIMARY KEY (
      "companyId",
      "documentId",
      "chunkId",
      "embeddingModel",
      "embeddingVersion"
    ),
  CONSTRAINT "DocumentChunkEmbedding_contentHash_check"
    CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "DocumentChunkEmbedding_dimensions_check"
    CHECK ("dimensions" > 0 AND vector_dims("embedding") = "dimensions"),
  CONSTRAINT "DocumentChunkEmbedding_page_check"
    CHECK (
      ("pageStart" IS NULL AND "pageEnd" IS NULL)
      OR (
        "pageStart" IS NOT NULL
        AND "pageEnd" IS NOT NULL
        AND "pageStart" > 0
        AND "pageEnd" >= "pageStart"
      )
    ),
  CONSTRAINT "DocumentChunkEmbedding_document_fkey"
    FOREIGN KEY ("companyId", "documentId")
    REFERENCES "DocumentMetadata"("companyId", "id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE INDEX "DocumentChunkEmbedding_company_model_version_idx"
  ON "DocumentChunkEmbedding"("companyId", "embeddingModel", "embeddingVersion");

CREATE INDEX "DocumentChunkEmbedding_company_document_idx"
  ON "DocumentChunkEmbedding"("companyId", "documentId");

CREATE TABLE "DocumentEmbeddingJob" (
  "id" VARCHAR(200) NOT NULL,
  "companyId" VARCHAR(200) NOT NULL,
  "documentId" VARCHAR(200) NOT NULL,
  "status" "DocumentEmbeddingJobStatus" NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" VARCHAR(200),
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DocumentEmbeddingJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentEmbeddingJob_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "DocumentEmbeddingJob_document_fkey"
    FOREIGN KEY ("companyId", "documentId")
    REFERENCES "DocumentMetadata"("companyId", "id")
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DocumentEmbeddingJob_company_document_key"
  ON "DocumentEmbeddingJob"("companyId", "documentId");

CREATE INDEX "DocumentEmbeddingJob_company_status_available_idx"
  ON "DocumentEmbeddingJob"("companyId", "status", "availableAt");

CREATE INDEX "DocumentEmbeddingJob_leaseUntil_idx"
  ON "DocumentEmbeddingJob"("leaseUntil");
