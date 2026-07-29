ALTER TABLE "DocumentMetadata"
  ADD COLUMN IF NOT EXISTS "workerVersion" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "deploymentGeneration" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "processingFencingToken" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "workerHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "processingLeaseUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "embeddingWorkerId" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "embeddingWorkerVersion" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "embeddingDeploymentGeneration" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "embeddingFencingToken" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "embeddingHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "embeddingLeaseUntil" TIMESTAMP(3);

ALTER TABLE "DocumentChunkEmbedding"
  ADD COLUMN IF NOT EXISTS "sourceSegmentIndex" INTEGER,
  ADD COLUMN IF NOT EXISTS "extractionMethod" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "sourceCoordinates" JSONB,
  ADD COLUMN IF NOT EXISTS "provenanceConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "provenanceVersion" VARCHAR(50);

ALTER TABLE "DocumentEmbeddingJob"
  ADD COLUMN IF NOT EXISTS "correlationId" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "jobVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "fencingToken" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "workerVersion" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "deploymentGeneration" VARCHAR(100);

UPDATE "DocumentEmbeddingJob"
SET "correlationId" = "id"
WHERE "correlationId" IS NULL;

ALTER TABLE "DocumentEmbeddingJob"
  ALTER COLUMN "correlationId" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "AiUsageLedger" (
  "id" VARCHAR(200) NOT NULL,
  "companyId" VARCHAR(200) NOT NULL,
  "userId" VARCHAR(200),
  "correlationId" VARCHAR(200) NOT NULL,
  "idempotencyKey" VARCHAR(250) NOT NULL,
  "requestType" VARCHAR(50) NOT NULL,
  "provider" VARCHAR(100) NOT NULL,
  "model" VARCHAR(200) NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "embeddingUnits" INTEGER NOT NULL DEFAULT 0,
  "estimatedCostEur" DECIMAL(18,8) NOT NULL DEFAULT 0,
  "actualCostEur" DECIMAL(18,8),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "status" VARCHAR(30) NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiUsageLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AiUsageLedger_companyId_idempotencyKey_key"
  ON "AiUsageLedger"("companyId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "AiUsageLedger_companyId_occurredAt_idx"
  ON "AiUsageLedger"("companyId", "occurredAt");
CREATE INDEX IF NOT EXISTS "AiUsageLedger_companyId_provider_occurredAt_idx"
  ON "AiUsageLedger"("companyId", "provider", "occurredAt");

CREATE TABLE IF NOT EXISTS "AiBudgetPolicy" (
  "companyId" VARCHAR(200) NOT NULL,
  "dailyLimitEur" DECIMAL(18,8) NOT NULL,
  "monthlyLimitEur" DECIMAL(18,8) NOT NULL,
  "providerLimits" JSONB,
  "warningThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.8,
  "hardStopThreshold" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "updatedBy" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiBudgetPolicy_pkey" PRIMARY KEY ("companyId"),
  CONSTRAINT "AiBudgetPolicy_thresholds_check"
    CHECK ("warningThreshold" >= 0 AND "warningThreshold" <= 1
      AND "hardStopThreshold" > 0 AND "hardStopThreshold" <= 1
      AND "warningThreshold" <= "hardStopThreshold"),
  CONSTRAINT "AiBudgetPolicy_limits_check"
    CHECK ("dailyLimitEur" >= 0 AND "monthlyLimitEur" >= 0)
);
CREATE INDEX IF NOT EXISTS "AiBudgetPolicy_updatedAt_idx" ON "AiBudgetPolicy"("updatedAt");

CREATE TABLE IF NOT EXISTS "AiBudgetReservation" (
  "id" VARCHAR(200) NOT NULL,
  "companyId" VARCHAR(200) NOT NULL,
  "userId" VARCHAR(200),
  "provider" VARCHAR(100) NOT NULL,
  "correlationId" VARCHAR(200) NOT NULL,
  "idempotencyKey" VARCHAR(250) NOT NULL,
  "estimatedCostEur" DECIMAL(18,8) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
  "status" VARCHAR(30) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "reconciledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiBudgetReservation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiBudgetReservation_cost_check" CHECK ("estimatedCostEur" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS "AiBudgetReservation_companyId_idempotencyKey_key"
  ON "AiBudgetReservation"("companyId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "AiBudgetReservation_companyId_status_expiresAt_idx"
  ON "AiBudgetReservation"("companyId", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "AiBudgetReservation_companyId_provider_status_idx"
  ON "AiBudgetReservation"("companyId", "provider", "status");

CREATE TABLE IF NOT EXISTS "ProductionAuditEvent" (
  "id" VARCHAR(200) NOT NULL,
  "companyId" VARCHAR(200),
  "actorId" VARCHAR(200),
  "action" VARCHAR(100) NOT NULL,
  "targetType" VARCHAR(100) NOT NULL,
  "targetId" VARCHAR(200),
  "result" VARCHAR(30) NOT NULL,
  "correlationId" VARCHAR(200) NOT NULL,
  "safeMetadata" JSONB,
  "previousState" JSONB,
  "newState" JSONB,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductionAuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ProductionAuditEvent_companyId_occurredAt_idx"
  ON "ProductionAuditEvent"("companyId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ProductionAuditEvent_action_occurredAt_idx"
  ON "ProductionAuditEvent"("action", "occurredAt");
CREATE INDEX IF NOT EXISTS "ProductionAuditEvent_correlationId_idx"
  ON "ProductionAuditEvent"("correlationId");

CREATE TABLE IF NOT EXISTS "RecoveryOperation" (
  "id" VARCHAR(200) NOT NULL,
  "operationType" VARCHAR(50) NOT NULL,
  "environment" VARCHAR(50) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "checksum" VARCHAR(128),
  "objectCount" INTEGER,
  "databaseBackupAt" TIMESTAMP(3),
  "objectBackupAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "safeDetails" JSONB,
  CONSTRAINT "RecoveryOperation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecoveryOperation_operationType_status_startedAt_idx"
  ON "RecoveryOperation"("operationType", "status", "startedAt");

CREATE INDEX IF NOT EXISTS "DocumentMetadata_workerHeartbeatAt_idx"
  ON "DocumentMetadata"("workerHeartbeatAt");
CREATE INDEX IF NOT EXISTS "DocumentMetadata_embeddingHeartbeatAt_idx"
  ON "DocumentMetadata"("embeddingHeartbeatAt");
CREATE INDEX IF NOT EXISTS "DocumentEmbeddingJob_heartbeatAt_idx"
  ON "DocumentEmbeddingJob"("heartbeatAt");
