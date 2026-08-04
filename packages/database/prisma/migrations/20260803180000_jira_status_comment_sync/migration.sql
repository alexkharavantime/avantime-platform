
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "RequestStatus" ADD VALUE IF NOT EXISTS 'CLOSED';

CREATE TYPE "JiraInboundEventStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'COMPLETED', 'IGNORED', 'FAILED', 'DEAD_LETTER'
);
CREATE TYPE "RequestMessageAuthorType" AS ENUM ('CUSTOMER', 'AVANTIME', 'JIRA', 'SYSTEM');
CREATE TYPE "RequestMessageDeliveryStatus" AS ENUM (
  'NOT_REQUIRED', 'PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD_LETTER'
);

ALTER TABLE "SupportRequest"
  ADD COLUMN "jiraStatusId" VARCHAR(100),
  ADD COLUMN "jiraStatusName" VARCHAR(160),
  ADD COLUMN "jiraUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "jiraSyncVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "JiraOrganizationMapping" ADD COLUMN "statusMapping" JSONB;

ALTER TABLE "RequestMessage"
  ALTER COLUMN "authorId" DROP NOT NULL,
  ADD COLUMN "authorType" "RequestMessageAuthorType" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN "authorDisplayName" VARCHAR(160),
  ADD COLUMN "deliveryStatus" "RequestMessageDeliveryStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN "jiraCommentId" VARCHAR(200),
  ADD COLUMN "jiraCommentUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "idempotencyKey" VARCHAR(200),
  ADD COLUMN "correlationId" VARCHAR(200),
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RequestMessage" AS message
SET "authorDisplayName" = "User"."name",
"authorType" = (
  CASE
    WHEN "User"."role" = 'ADMIN' THEN 'AVANTIME'
    ELSE 'CUSTOMER'
  END
)::"RequestMessageAuthorType"
FROM "User"
WHERE message."authorId" = "User"."id";

CREATE UNIQUE INDEX "RequestMessage_jiraCommentId_key" ON "RequestMessage"("jiraCommentId");
CREATE UNIQUE INDEX "RequestMessage_idempotencyKey_key" ON "RequestMessage"("idempotencyKey");
CREATE INDEX "RequestMessage_requestId_createdAt_idx" ON "RequestMessage"("requestId", "createdAt");
CREATE INDEX "RequestMessage_deliveryStatus_updatedAt_idx"
  ON "RequestMessage"("deliveryStatus", "updatedAt");

DROP INDEX "JiraOperation_requestId_key";
ALTER TABLE "JiraOperation"
  ADD COLUMN "localCommentId" TEXT,
  ADD COLUMN "providerCommentId" VARCHAR(200);
ALTER TABLE "JiraOperation" DROP CONSTRAINT IF EXISTS "JiraOperation_terminal_check";
ALTER TABLE "JiraOperation" ADD CONSTRAINT "JiraOperation_shape_check" CHECK (
  ("operationType" = 'CREATE_ISSUE' AND "localCommentId" IS NULL)
  OR ("operationType" = 'ADD_COMMENT' AND "localCommentId" IS NOT NULL)
);
ALTER TABLE "JiraOperation" ADD CONSTRAINT "JiraOperation_terminal_check" CHECK (
  ("status" <> 'COMPLETED')
  OR ("operationType" = 'CREATE_ISSUE' AND "providerIssueId" IS NOT NULL AND "providerIssueKey" IS NOT NULL)
  OR ("operationType" = 'ADD_COMMENT' AND "providerCommentId" IS NOT NULL AND "localCommentId" IS NOT NULL)
);
CREATE UNIQUE INDEX "JiraOperation_localCommentId_key" ON "JiraOperation"("localCommentId");
CREATE UNIQUE INDEX "JiraOperation_providerCommentId_key" ON "JiraOperation"("providerCommentId");
CREATE INDEX "JiraOperation_requestId_operationType_createdAt_idx"
  ON "JiraOperation"("requestId", "operationType", "createdAt");
ALTER TABLE "JiraOperation" ADD CONSTRAINT "JiraOperation_localCommentId_fkey"
  FOREIGN KEY ("localCommentId") REFERENCES "RequestMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "JiraInboundEvent" (
  "id" TEXT NOT NULL,
  "providerEventId" VARCHAR(200),
  "eventFingerprint" VARCHAR(64) NOT NULL,
  "eventType" VARCHAR(100) NOT NULL,
  "jiraTenantOrigin" VARCHAR(300) NOT NULL,
  "jiraIssueId" VARCHAR(200) NOT NULL,
  "jiraIssueKey" VARCHAR(100) NOT NULL,
  "requestId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "payloadVersion" INTEGER NOT NULL DEFAULT 1,
  "normalizedPayload" JSONB NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "JiraInboundEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" VARCHAR(100),
  "leaseUntil" TIMESTAMP(3),
  "lastFailureCode" VARCHAR(100),
  "correlationId" VARCHAR(200) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraInboundEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "JiraInboundEvent_attempts_check"
    CHECK ("attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20 AND "attempts" <= "maxAttempts"),
  CONSTRAINT "JiraInboundEvent_payload_version_check" CHECK ("payloadVersion" >= 1),
  CONSTRAINT "JiraInboundEvent_lease_check" CHECK (
    ("status" = 'PROCESSING' AND "leaseToken" IS NOT NULL AND "leaseUntil" IS NOT NULL)
    OR ("status" <> 'PROCESSING' AND "leaseToken" IS NULL AND "leaseUntil" IS NULL)
  ),
  CONSTRAINT "JiraInboundEvent_completion_check" CHECK (
    ("status" IN ('COMPLETED', 'IGNORED') AND "completedAt" IS NOT NULL)
    OR ("status" NOT IN ('COMPLETED', 'IGNORED') AND "completedAt" IS NULL)
  )
);
CREATE UNIQUE INDEX "JiraInboundEvent_eventFingerprint_key"
  ON "JiraInboundEvent"("eventFingerprint");
CREATE UNIQUE INDEX "JiraInboundEvent_jiraTenantOrigin_providerEventId_key"
  ON "JiraInboundEvent"("jiraTenantOrigin", "providerEventId");
CREATE INDEX "JiraInboundEvent_status_nextAttemptAt_idx"
  ON "JiraInboundEvent"("status", "nextAttemptAt");
CREATE INDEX "JiraInboundEvent_leaseUntil_idx" ON "JiraInboundEvent"("leaseUntil");
CREATE INDEX "JiraInboundEvent_companyId_status_createdAt_idx"
  ON "JiraInboundEvent"("companyId", "status", "createdAt");
CREATE INDEX "JiraInboundEvent_requestId_occurredAt_idx"
  ON "JiraInboundEvent"("requestId", "occurredAt");
CREATE INDEX "JiraInboundEvent_correlationId_idx" ON "JiraInboundEvent"("correlationId");
CREATE INDEX "JiraInboundEvent_receivedAt_idx" ON "JiraInboundEvent"("receivedAt");
ALTER TABLE "JiraInboundEvent" ADD CONSTRAINT "JiraInboundEvent_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "SupportRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JiraInboundEvent" ADD CONSTRAINT "JiraInboundEvent_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "JiraInboundWorkerHeartbeat" (
  "workerId" VARCHAR(100) NOT NULL,
  "workerVersion" VARCHAR(100) NOT NULL,
  "deploymentGeneration" VARCHAR(100) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "lastBatchSize" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" VARCHAR(100),
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JiraInboundWorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);
