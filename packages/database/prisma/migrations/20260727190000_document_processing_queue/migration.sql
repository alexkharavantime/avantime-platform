ALTER TYPE "DocumentProcessingStatus" RENAME TO "DocumentProcessingStatus_legacy";

CREATE TYPE "DocumentProcessingStatus" AS ENUM (
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'QUARANTINED',
  'DELETED'
);

ALTER TABLE "DocumentMetadata"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "DocumentProcessingStatus"
    USING (
      CASE "status"::text
        WHEN 'PROCESSED' THEN 'COMPLETED'
        ELSE "status"::text
      END
    )::"DocumentProcessingStatus",
  ALTER COLUMN "status" SET DEFAULT 'UPLOADED';

DROP TYPE "DocumentProcessingStatus_legacy";

ALTER TABLE "DocumentMetadata"
  RENAME COLUMN "processedAt" TO "processingCompletedAt";

ALTER TABLE "DocumentMetadata"
  RENAME COLUMN "errorMessage" TO "lastErrorMessage";

ALTER TABLE "DocumentMetadata"
  ADD COLUMN IF NOT EXISTS "processingAttempts" INTEGER DEFAULT 0,
  ADD COLUMN "lastErrorCode" VARCHAR(100),
  ADD COLUMN "processingStartedAt" TIMESTAMP(3),
  ADD COLUMN "nextRetryAt" TIMESTAMP(3),
  ADD COLUMN "quarantinedAt" TIMESTAMP(3),
  ADD COLUMN "workerId" VARCHAR(200);

UPDATE "DocumentMetadata"
SET
  "processingAttempts" = CASE
    WHEN "processingAttempts" IS NULL OR "processingAttempts" = 0 THEN 1
    ELSE "processingAttempts"
  END,
  "lastErrorCode" = CASE
    WHEN "status" = 'FAILED' THEN 'LEGACY_PROCESSING_ERROR'
    ELSE NULL
  END,
  "lastErrorMessage" = CASE
    WHEN "status" = 'FAILED' THEN 'Не удалось обработать документ.'
    ELSE NULL
  END
WHERE "status" IN ('COMPLETED', 'FAILED');

UPDATE "DocumentMetadata"
SET "processingAttempts" = 0
WHERE "processingAttempts" IS NULL OR "processingAttempts" < 0;

ALTER TABLE "DocumentMetadata"
  ALTER COLUMN "processingAttempts" SET DEFAULT 0,
  ALTER COLUMN "processingAttempts" SET NOT NULL;

UPDATE "DocumentMetadata"
SET "status" = 'DELETED'
WHERE "deletedAt" IS NOT NULL;

ALTER TABLE "DocumentMetadata"
  ADD CONSTRAINT "DocumentMetadata_processingAttempts_check"
    CHECK ("processingAttempts" >= 0);

CREATE INDEX "DocumentMetadata_companyId_nextRetryAt_idx"
  ON "DocumentMetadata"("companyId", "nextRetryAt");

CREATE INDEX "DocumentMetadata_companyId_quarantinedAt_idx"
  ON "DocumentMetadata"("companyId", "quarantinedAt");
