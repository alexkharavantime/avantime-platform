-- TASK-015 adds two bounded, durable operational pipelines. Notification delivery
-- and knowledge indexing deliberately use separate records because their retry,
-- recipient and visibility semantics differ.
CREATE TYPE "NotificationOutboxStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER'
);

CREATE TABLE "NotificationOutbox" (
  "id" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "notificationType" VARCHAR(100) NOT NULL,
  "recipientReference" VARCHAR(200) NOT NULL,
  "recipientUserId" VARCHAR(200),
  "templateReference" VARCHAR(100) NOT NULL,
  "correlationId" VARCHAR(200) NOT NULL,
  "status" "NotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" VARCHAR(100),
  "leaseUntil" TIMESTAMP(3),
  "providerMessageId" VARCHAR(200),
  "lastFailureCode" VARCHAR(100),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationOutbox_attempts_check" CHECK (
    "attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20 AND "attempts" <= "maxAttempts"
  ),
  CONSTRAINT "NotificationOutbox_reference_check" CHECK (
    "recipientReference" !~* '@' AND length("recipientReference") >= 3
  ),
  CONSTRAINT "NotificationOutbox_delivery_check" CHECK (
    ("status" = 'DELIVERED' AND "providerMessageId" IS NOT NULL AND "deliveredAt" IS NOT NULL)
    OR "status" <> 'DELIVERED'
  )
);
CREATE UNIQUE INDEX "NotificationOutbox_idempotencyKey_key"
  ON "NotificationOutbox"("idempotencyKey");
CREATE INDEX "NotificationOutbox_status_nextAttemptAt_idx"
  ON "NotificationOutbox"("status", "nextAttemptAt");
CREATE INDEX "NotificationOutbox_leaseUntil_idx" ON "NotificationOutbox"("leaseUntil");
CREATE INDEX "NotificationOutbox_correlationId_idx" ON "NotificationOutbox"("correlationId");

CREATE TABLE "NotificationWorkerHeartbeat" (
  "workerId" VARCHAR(100) NOT NULL,
  "workerVersion" VARCHAR(100) NOT NULL,
  "deploymentGeneration" VARCHAR(100) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "lastBatchSize" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" VARCHAR(100),
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NotificationWorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

CREATE TYPE "KnowledgeIndexEventStatus" AS ENUM (
  'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'
);

CREATE TABLE "KnowledgeIndexEvent" (
  "id" TEXT NOT NULL,
  "idempotencyKey" VARCHAR(200) NOT NULL,
  "articleId" VARCHAR(200) NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "ownerScope" "KnowledgeOwnerScope" NOT NULL,
  "companyId" VARCHAR(200),
  "visibility" "KnowledgeVisibility" NOT NULL,
  "lifecycleStatus" "ArticleStatus" NOT NULL,
  "status" "KnowledgeIndexEventStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" VARCHAR(100),
  "leaseUntil" TIMESTAMP(3),
  "lastFailureCode" VARCHAR(100),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeIndexEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeIndexEvent_version_check" CHECK ("sourceVersion" > 0),
  CONSTRAINT "KnowledgeIndexEvent_attempts_check" CHECK (
    "attempts" >= 0 AND "maxAttempts" BETWEEN 1 AND 20 AND "attempts" <= "maxAttempts"
  )
);
CREATE UNIQUE INDEX "KnowledgeIndexEvent_idempotencyKey_key"
  ON "KnowledgeIndexEvent"("idempotencyKey");
CREATE INDEX "KnowledgeIndexEvent_status_nextAttemptAt_idx"
  ON "KnowledgeIndexEvent"("status", "nextAttemptAt");
CREATE INDEX "KnowledgeIndexEvent_articleId_sourceVersion_idx"
  ON "KnowledgeIndexEvent"("articleId", "sourceVersion");
CREATE INDEX "KnowledgeIndexEvent_leaseUntil_idx" ON "KnowledgeIndexEvent"("leaseUntil");

CREATE TABLE "KnowledgeSearchIndex" (
  "articleId" VARCHAR(200) NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL,
  "ownerScope" "KnowledgeOwnerScope" NOT NULL,
  "companyId" VARCHAR(200),
  "visibility" "KnowledgeVisibility" NOT NULL,
  "lifecycleStatus" "ArticleStatus" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "searchText" TEXT NOT NULL,
  "operationalStatus" VARCHAR(30) NOT NULL,
  "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeSearchIndex_pkey" PRIMARY KEY ("articleId"),
  CONSTRAINT "KnowledgeSearchIndex_version_check" CHECK (
    "sourceVersion" > 0 AND "generation" > 0
  )
);
CREATE INDEX "KnowledgeSearchIndex_companyId_visibility_lifecycleStatus_idx"
  ON "KnowledgeSearchIndex"("companyId", "visibility", "lifecycleStatus");
CREATE INDEX "KnowledgeSearchIndex_sourceVersion_generation_idx"
  ON "KnowledgeSearchIndex"("sourceVersion", "generation");
CREATE INDEX "KnowledgeSearchIndex_searchText_idx"
  ON "KnowledgeSearchIndex" USING GIN (to_tsvector('simple', "searchText"));

CREATE TABLE "KnowledgeVectorIndex" (
  "articleId" VARCHAR(200) NOT NULL,
  "sourceVersion" INTEGER NOT NULL,
  "generation" INTEGER NOT NULL,
  "ownerScope" "KnowledgeOwnerScope" NOT NULL,
  "companyId" VARCHAR(200),
  "visibility" "KnowledgeVisibility" NOT NULL,
  "lifecycleStatus" "ArticleStatus" NOT NULL,
  "contentHash" VARCHAR(64) NOT NULL,
  "embeddingModel" VARCHAR(100) NOT NULL,
  "embeddingVersion" VARCHAR(100) NOT NULL,
  "embedding" vector,
  "operationalStatus" VARCHAR(30) NOT NULL,
  "indexedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeVectorIndex_pkey" PRIMARY KEY ("articleId"),
  CONSTRAINT "KnowledgeVectorIndex_version_check" CHECK (
    "sourceVersion" > 0 AND "generation" > 0
  ),
  CONSTRAINT "KnowledgeVectorIndex_content_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$')
);
CREATE INDEX "KnowledgeVectorIndex_companyId_visibility_lifecycleStatus_idx"
  ON "KnowledgeVectorIndex"("companyId", "visibility", "lifecycleStatus");
CREATE INDEX "KnowledgeVectorIndex_sourceVersion_generation_idx"
  ON "KnowledgeVectorIndex"("sourceVersion", "generation");

CREATE TABLE "KnowledgeIndexWorkerHeartbeat" (
  "workerId" VARCHAR(100) NOT NULL,
  "workerVersion" VARCHAR(100) NOT NULL,
  "deploymentGeneration" VARCHAR(100) NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "lastBatchSize" INTEGER NOT NULL DEFAULT 0,
  "lastErrorCode" VARCHAR(100),
  "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeIndexWorkerHeartbeat_pkey" PRIMARY KEY ("workerId")
);

-- Governance inbox writes and provider delivery are committed atomically. The
-- delivery record stores only a user reference and a template identifier; the
-- actual address is resolved immediately before provider delivery.
CREATE FUNCTION "enqueue_governance_notification_outbox"() RETURNS trigger AS $$
BEGIN
  INSERT INTO "NotificationOutbox" (
    "id", "idempotencyKey", "notificationType", "recipientReference",
    "recipientUserId", "templateReference", "correlationId", "updatedAt"
  ) VALUES (
    'notification-' || NEW."id",
    'governance:' || NEW."id",
    LEFT(NEW."category", 100),
    LEFT('user:' || NEW."recipientId", 200),
    LEFT(NEW."recipientId", 200),
    LEFT('governance-' || lower(regexp_replace(NEW."category", '[^a-zA-Z0-9_-]', '-', 'g')), 100),
    LEFT('governance:' || NEW."id", 200),
    CURRENT_TIMESTAMP
  ) ON CONFLICT ("idempotencyKey") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "GovernanceNotification_enqueue_outbox"
AFTER INSERT ON "GovernanceNotification"
FOR EACH ROW EXECUTE FUNCTION "enqueue_governance_notification_outbox"();

-- Article lifecycle/version changes enqueue a separate durable indexing event in
-- the same transaction. Consumers fence all writes by sourceVersion.
CREATE FUNCTION "enqueue_knowledge_index_event"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW."version" IS DISTINCT FROM OLD."version"
     OR NEW."ownerScope" IS DISTINCT FROM OLD."ownerScope"
     OR NEW."companyId" IS DISTINCT FROM OLD."companyId"
     OR NEW."visibility" IS DISTINCT FROM OLD."visibility"
     OR NEW."status" IS DISTINCT FROM OLD."status"
     OR NEW."quarantinedAt" IS DISTINCT FROM OLD."quarantinedAt" THEN
    INSERT INTO "KnowledgeIndexEvent" (
      "id", "idempotencyKey", "articleId", "sourceVersion", "ownerScope",
      "companyId", "visibility", "lifecycleStatus", "updatedAt"
    ) VALUES (
      'knowledge-' || NEW."id" || '-' || NEW."version"::text,
      'knowledge:' || NEW."id" || ':' || NEW."version"::text,
      LEFT(NEW."id", 200), NEW."version", NEW."ownerScope", LEFT(NEW."companyId", 200),
      NEW."visibility", NEW."status", CURRENT_TIMESTAMP
    ) ON CONFLICT ("idempotencyKey") DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "KnowledgeArticle_enqueue_index_event"
AFTER INSERT OR UPDATE ON "KnowledgeArticle"
FOR EACH ROW EXECUTE FUNCTION "enqueue_knowledge_index_event"();

-- Existing articles are not silently treated as indexed. Enqueue their current
-- versions once; the worker applies the same eligibility and tenant fencing as
-- future lifecycle changes.
INSERT INTO "KnowledgeIndexEvent" (
  "id", "idempotencyKey", "articleId", "sourceVersion", "ownerScope",
  "companyId", "visibility", "lifecycleStatus", "updatedAt"
)
SELECT
  'knowledge-' || article."id" || '-' || article."version"::text,
  'knowledge:' || article."id" || ':' || article."version"::text,
  LEFT(article."id", 200), article."version", article."ownerScope",
  LEFT(article."companyId", 200), article."visibility", article."status", CURRENT_TIMESTAMP
FROM "KnowledgeArticle" article
ON CONFLICT ("idempotencyKey") DO NOTHING;
