-- TASK-013 adds a single-use first PLATFORM_OWNER bootstrap ledger and durable
-- evidence for organization knowledge publication. No role is inferred or seeded.
CREATE TABLE "PlatformOwnerBootstrap" (
  "id" TEXT NOT NULL,
  "singletonKey" VARCHAR(50) NOT NULL,
  "authorizationId" VARCHAR(200) NOT NULL,
  "authorizationHash" VARCHAR(64) NOT NULL,
  "environment" VARCHAR(30) NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "sessionEvidenceHash" VARCHAR(64) NOT NULL,
  "mfaEventEvidenceId" VARCHAR(200) NOT NULL,
  "authorizationExpiresAt" TIMESTAMP(3) NOT NULL,
  "assignmentId" VARCHAR(200) NOT NULL,
  "auditEventId" VARCHAR(200) NOT NULL,
  "notificationId" VARCHAR(200) NOT NULL,
  "executedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformOwnerBootstrap_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformOwnerBootstrap_targetUserId_fkey"
    FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlatformOwnerBootstrap_environment_check"
    CHECK ("environment" IN ('integration', 'staging')),
  CONSTRAINT "PlatformOwnerBootstrap_authorization_hash_check"
    CHECK ("authorizationHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "PlatformOwnerBootstrap_session_evidence_hash_check"
    CHECK ("sessionEvidenceHash" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "PlatformOwnerBootstrap_singletonKey_key"
  ON "PlatformOwnerBootstrap"("singletonKey");
CREATE UNIQUE INDEX "PlatformOwnerBootstrap_authorizationId_key"
  ON "PlatformOwnerBootstrap"("authorizationId");
CREATE UNIQUE INDEX "PlatformOwnerBootstrap_authorizationHash_key"
  ON "PlatformOwnerBootstrap"("authorizationHash");
CREATE UNIQUE INDEX "PlatformOwnerBootstrap_assignmentId_key"
  ON "PlatformOwnerBootstrap"("assignmentId");
CREATE UNIQUE INDEX "PlatformOwnerBootstrap_auditEventId_key"
  ON "PlatformOwnerBootstrap"("auditEventId");
CREATE UNIQUE INDEX "PlatformOwnerBootstrap_notificationId_key"
  ON "PlatformOwnerBootstrap"("notificationId");
CREATE INDEX "PlatformOwnerBootstrap_targetUserId_executedAt_idx"
  ON "PlatformOwnerBootstrap"("targetUserId", "executedAt");

ALTER TABLE "KnowledgeArticle" ADD COLUMN "publicationApprovalId" TEXT;

-- A legacy organization PUBLIC row has no controlled-approval evidence. Fail closed:
-- retain its content and ownership, but return it to review/private until republished.
UPDATE "KnowledgeArticle"
SET "visibility" = 'PRIVATE',
    "status" = 'REVIEW',
    "publishedAt" = NULL,
    "version" = "version" + 1,
    "classificationEvidence" = LEFT("classificationEvidence" || ':task-013-reapproval', 200)
WHERE "ownerScope" = 'ORGANIZATION' AND "visibility" = 'PUBLIC';

ALTER TABLE "KnowledgeArticle"
  ADD CONSTRAINT "KnowledgeArticle_publicationApprovalId_fkey"
    FOREIGN KEY ("publicationApprovalId") REFERENCES "GovernanceApprovalRequest"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "KnowledgeArticle_organization_public_approval_check" CHECK (
    "ownerScope" <> 'ORGANIZATION'
    OR "visibility" <> 'PUBLIC'
    OR "publicationApprovalId" IS NOT NULL
  );

CREATE UNIQUE INDEX "KnowledgeArticle_publicationApprovalId_key"
  ON "KnowledgeArticle"("publicationApprovalId");
