CREATE TYPE "DocumentType" AS ENUM (
  'INVOICE', 'CREDIT_NOTE', 'CONTRACT', 'ACT', 'ORDER', 'DELIVERY_NOTE',
  'BANK_STATEMENT', 'RECEIPT', 'REPORT', 'LETTER', 'IMAGE', 'UNKNOWN'
);
CREATE TYPE "DocumentTextExtractionMethod" AS ENUM ('PDF_TEXT', 'OCR', 'NONE');
CREATE TYPE "DocumentOcrStatus" AS ENUM (
  'NOT_REQUIRED', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNAVAILABLE'
);

ALTER TABLE "DocumentMetadata"
  ADD COLUMN "detectedDocumentType" "DocumentType" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN "detectedMimeType" VARCHAR(255),
  ADD COLUMN "detectionConfidence" DOUBLE PRECISION,
  ADD COLUMN "textExtractionMethod" "DocumentTextExtractionMethod" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "ocrStatus" "DocumentOcrStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "ocrProvider" VARCHAR(100),
  ADD COLUMN "ocrLanguage" VARCHAR(100),
  ADD COLUMN "ocrStartedAt" TIMESTAMP(3),
  ADD COLUMN "ocrCompletedAt" TIMESTAMP(3),
  ADD COLUMN "pageCount" INTEGER,
  ADD COLUMN "extractedCharacterCount" INTEGER,
  ADD COLUMN "requiresManualReview" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "intelligenceVersion" VARCHAR(100) NOT NULL DEFAULT 'document-intelligence-v1';

UPDATE "DocumentMetadata"
SET
  "detectedMimeType" = "mimeType",
  "textExtractionMethod" = CASE
    WHEN "status" = 'COMPLETED' AND "mimeType" = 'application/pdf'
      THEN 'PDF_TEXT'::"DocumentTextExtractionMethod"
    ELSE 'NONE'::"DocumentTextExtractionMethod"
  END,
  "ocrStatus" = CASE
    WHEN "status" = 'COMPLETED' AND "mimeType" = 'application/pdf'
      THEN 'NOT_REQUIRED'::"DocumentOcrStatus"
    ELSE 'PENDING'::"DocumentOcrStatus"
  END,
  "pageCount" = "pages",
  "extractedCharacterCount" = "textLength",
  "intelligenceVersion" = 'legacy-task-002',
  "requiresManualReview" = true;

ALTER TABLE "DocumentMetadata"
  ADD CONSTRAINT "DocumentMetadata_detectionConfidence_check"
    CHECK ("detectionConfidence" IS NULL OR ("detectionConfidence" >= 0 AND "detectionConfidence" <= 1)),
  ADD CONSTRAINT "DocumentMetadata_pageCount_check"
    CHECK ("pageCount" IS NULL OR "pageCount" >= 0),
  ADD CONSTRAINT "DocumentMetadata_extractedCharacterCount_check"
    CHECK ("extractedCharacterCount" IS NULL OR "extractedCharacterCount" >= 0);

CREATE INDEX "DocumentMetadata_companyId_detectedDocumentType_idx"
  ON "DocumentMetadata"("companyId", "detectedDocumentType");
CREATE INDEX "DocumentMetadata_companyId_requiresManualReview_idx"
  ON "DocumentMetadata"("companyId", "requiresManualReview");
