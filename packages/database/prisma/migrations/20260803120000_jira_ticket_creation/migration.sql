DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequestStatus') THEN
    CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Priority') THEN
    CREATE TYPE "Priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "SupportRequest" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "priority" "Priority" NOT NULL DEFAULT 'NORMAL',
  "status" "RequestStatus" NOT NULL DEFAULT 'NEW',
  "version" INTEGER NOT NULL DEFAULT 1,
  "jiraKey" TEXT,
  "jiraSyncAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "requesterId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SupportRequest_requesterId_fkey"
    FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SupportRequest_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupportRequest_publicId_key" ON "SupportRequest"("publicId");
CREATE INDEX IF NOT EXISTS "SupportRequest_companyId_updatedAt_idx"
  ON "SupportRequest"("companyId", "updatedAt");

CREATE TABLE IF NOT EXISTS "RequestMessage" (
  "id" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RequestMessage_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AuditEvent" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "RequestAttachment" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestAttachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestAttachment_requestId_fkey"
    FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TYPE "JiraIntegrationStatus" AS ENUM (
  'NOT_CONFIGURED', 'PENDING', 'PROCESSING', 'CREATED', 'FAILED', 'DEAD_LETTER'
);
CREATE TYPE "JiraOperationType" AS ENUM ('CREATE_ISSUE');
CREATE TYPE "JiraOperationStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'
);

ALTER TABLE "SupportRequest"
  ADD COLUMN "jiraIntegrationStatus" "JiraIntegrationStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
  ADD COLUMN "jiraIssueId" VARCHAR(200),
  ADD COLUMN "jiraIssueUrl" VARCHAR(500),
  ADD COLUMN "correlationId" VARCHAR(200),
  ADD COLUMN "idempotencyKey" VARCHAR(200);

ALTER TABLE "SupportRequest" ALTER COLUMN "jiraKey" TYPE VARCHAR(100);

CREATE UNIQUE INDEX "SupportRequest_jiraIssueId_key" ON "SupportRequest"("jiraIssueId");
CREATE UNIQUE INDEX "SupportRequest_jiraKey_key" ON "SupportRequest"("jiraKey");
CREATE UNIQUE INDEX "SupportRequest_idempotencyKey_key" ON "SupportRequest"("idempotencyKey");
CREATE INDEX "SupportRequest_companyId_jiraIntegrationStatus_createdAt_idx"
  ON "SupportRequest"("companyId", "jiraIntegrationStatus", "createdAt");
CREATE INDEX "SupportRequest_correlationId_idx" ON "SupportRequest"("correlationId");

CREATE TABLE "JiraOrganizationMapping" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "projectKey" VARCHAR(50) NOT NULL,
  "issueType" VARCHAR(100),
  "componentId" VARCHAR(100),
  "requestType" VARCHAR(100),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraOrganizationMapping_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JiraOrganizationMapping_version_check" CHECK ("version" >= 1),
  CONSTRAINT "JiraOrganizationMapping_project_key_check"
    CHECK ("projectKey" ~ '^[A-Z][A-Z0-9_]{1,49}$')
);
CREATE UNIQUE INDEX "JiraOrganizationMapping_companyId_key"
  ON "JiraOrganizationMapping"("companyId");
CREATE INDEX "JiraOrganizationMapping_enabled_updatedAt_idx"
  ON "JiraOrganizationMapping"("enabled", "updatedAt");
ALTER TABLE "JiraOrganizationMapping"
  ADD CONSTRAINT "JiraOrganizationMapping_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JiraOperation" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "mappingId" TEXT NOT NULL,
  "mappingVersion" INTEGER NOT NULL,
  "operationType" "JiraOperationType" NOT NULL DEFAULT 'CREATE_ISSUE',
  "status" "JiraOperationStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" VARCHAR(100),
  "leaseUntil" TIMESTAMP(3),
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "correlationId" VARCHAR(200) NOT NULL,
  "projectKey" VARCHAR(50) NOT NULL,
  "issueType" VARCHAR(100) NOT NULL,
  "componentId" VARCHAR(100),
  "requestType" VARCHAR(100),
  "providerIssueId" VARCHAR(200),
  "providerIssueKey" VARCHAR(100),
  "lastFailureCode" VARCHAR(100),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraOperation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JiraOperation_attempts_check"
    CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20 AND "attempts" <= "maxAttempts"),
  CONSTRAINT "JiraOperation_mapping_version_check" CHECK ("mappingVersion" >= 1),
  CONSTRAINT "JiraOperation_terminal_check" CHECK (
    ("status" = 'COMPLETED' AND "providerIssueId" IS NOT NULL AND "providerIssueKey" IS NOT NULL)
    OR "status" <> 'COMPLETED'
  )
);
CREATE UNIQUE INDEX "JiraOperation_requestId_key" ON "JiraOperation"("requestId");
CREATE UNIQUE INDEX "JiraOperation_idempotencyKey_key" ON "JiraOperation"("idempotencyKey");
CREATE UNIQUE INDEX "JiraOperation_providerIssueId_key" ON "JiraOperation"("providerIssueId");
CREATE UNIQUE INDEX "JiraOperation_providerIssueKey_key" ON "JiraOperation"("providerIssueKey");
CREATE INDEX "JiraOperation_status_nextAttemptAt_idx"
  ON "JiraOperation"("status", "nextAttemptAt");
CREATE INDEX "JiraOperation_leaseUntil_idx" ON "JiraOperation"("leaseUntil");
CREATE INDEX "JiraOperation_companyId_status_createdAt_idx"
  ON "JiraOperation"("companyId", "status", "createdAt");
CREATE INDEX "JiraOperation_correlationId_idx" ON "JiraOperation"("correlationId");
ALTER TABLE "JiraOperation"
  ADD CONSTRAINT "JiraOperation_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JiraOperation"
  ADD CONSTRAINT "JiraOperation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JiraOperation"
  ADD CONSTRAINT "JiraOperation_mappingId_fkey"
  FOREIGN KEY ("mappingId") REFERENCES "JiraOrganizationMapping"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JiraWorkerHeartbeat" (
  "workerId" VARCHAR(100) NOT NULL,
  "workerVersion" VARCHAR(100) NOT NULL,
  "deploymentGeneration" VARCHAR(100) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "lastBatchSize" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" VARCHAR(100),
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraWorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);
