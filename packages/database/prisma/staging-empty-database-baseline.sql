-- The repository's first Prisma migration starts after the legacy account schema.
-- Bootstrap that historical foundation only when the target database is completely
-- empty. A partially initialized or damaged database fails closed.
DO $staging_baseline$
BEGIN
  IF to_regclass('"_prisma_migrations"') IS NOT NULL THEN
    IF to_regclass('"User"') IS NULL
      OR to_regclass('"Company"') IS NULL
      OR to_regclass('"DocumentMetadata"') IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM "_prisma_migrations"
        WHERE migration_name = '20260727150000_document_metadata_persistence'
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
      )
    THEN
      RAISE EXCEPTION 'STAGING_MIGRATION_FOUND_INCOMPLETE_ACCOUNT_BASELINE';
    END IF;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = current_schema()
  ) THEN
    RAISE EXCEPTION 'STAGING_MIGRATION_REFUSES_NONEMPTY_UNVERSIONED_DATABASE';
  END IF;

  CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'ADMIN');

  CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
  );

  CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "passwordHash" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "User_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id")
      ON DELETE SET NULL ON UPDATE CASCADE
  );
  CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

  CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PasswordResetToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE
  );
  CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"
    ON "PasswordResetToken"("tokenHash");

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
    CONSTRAINT "DocumentMetadata_checksum_check" CHECK ("checksum" ~ '^[a-f0-9]{64}$')
  );
  CREATE INDEX "DocumentMetadata_companyId_status_idx"
    ON "DocumentMetadata"("companyId", "status");
  CREATE INDEX "DocumentMetadata_companyId_createdAt_idx"
    ON "DocumentMetadata"("companyId", "createdAt");
  CREATE INDEX "DocumentMetadata_createdAt_idx" ON "DocumentMetadata"("createdAt");
  CREATE INDEX "DocumentMetadata_deletedAt_idx" ON "DocumentMetadata"("deletedAt");
END
$staging_baseline$;
