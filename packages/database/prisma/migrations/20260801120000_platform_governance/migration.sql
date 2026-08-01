-- TASK-012 is additive and backfills ownership before enforcing constraints.
CREATE TYPE "PlatformRole" AS ENUM (
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
  'PLATFORM_SUPPORT',
  'PLATFORM_AUDITOR',
  'PLATFORM_OPERATOR'
);

CREATE TYPE "KnowledgeOwnerScope" AS ENUM (
  'PLATFORM',
  'ORGANIZATION',
  'SYSTEM',
  'LEGACY_UNCLASSIFIED'
);

CREATE TYPE "KnowledgeVisibility" AS ENUM (
  'PRIVATE',
  'ORGANIZATION',
  'PLATFORM',
  'PUBLIC'
);

CREATE TYPE "GovernanceApprovalActionType" AS ENUM (
  'PLATFORM_OWNER_ASSIGN',
  'PLATFORM_OWNER_REMOVE',
  'ORGANIZATION_LAST_OWNER_TRANSFER',
  'ORGANIZATION_REQUIRED_SSO_EMERGENCY_DISABLE',
  'ORGANIZATION_BREAK_GLASS_DISABLE',
  'IDENTITY_PROVIDER_DELETE',
  'PLATFORM_AUDIT_EXPORT',
  'ORGANIZATION_AUDIT_EXPORT',
  'BULK_TENANT_EXPORT',
  'KNOWLEDGE_VISIBILITY_PUBLIC',
  'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION'
);

CREATE TYPE "GovernanceApprovalScope" AS ENUM ('PLATFORM', 'ORGANIZATION');
CREATE TYPE "GovernanceApprovalStatus" AS ENUM (
  'REQUESTED',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'EXECUTED',
  'CANCELLED'
);

-- KnowledgeArticle existed in the application schema before it was covered by the migration
-- chain. Fresh databases therefore need the legacy-shaped table, while deployed databases may
-- already have it. Establish the missing baseline first and then use the same governed backfill.
DO $$
BEGIN
  CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "ArticleStatus" ADD VALUE IF NOT EXISTS 'REVIEW';

CREATE TABLE IF NOT EXISTS "KnowledgeArticle" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "readingTime" TEXT NOT NULL DEFAULT '5 минут',
  "content" JSONB NOT NULL,
  "status" "ArticleStatus" NOT NULL DEFAULT 'DRAFT',
  "authorId" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "KnowledgeArticle_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug");

ALTER TABLE "KnowledgeArticle"
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "ownerScope" "KnowledgeOwnerScope",
  ADD COLUMN "visibility" "KnowledgeVisibility",
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "classificationEvidence" VARCHAR(200),
  ADD COLUMN "quarantinedAt" TIMESTAMP(3);

-- Legacy status is not sufficient ownership/visibility evidence. Preserve status and content,
-- but require explicit review before any row becomes visible outside platform administration.
UPDATE "KnowledgeArticle"
SET
  "ownerScope" = 'PLATFORM',
  "visibility" = 'PRIVATE'::"KnowledgeVisibility",
  "classificationEvidence" = 'task-012-existing-platform-article-v1'
WHERE "ownerScope" IS NULL;

ALTER TABLE "KnowledgeArticle"
  ALTER COLUMN "ownerScope" SET NOT NULL,
  ALTER COLUMN "visibility" SET NOT NULL,
  ALTER COLUMN "classificationEvidence" SET NOT NULL;

ALTER TABLE "KnowledgeArticle"
  ADD CONSTRAINT "KnowledgeArticle_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "KnowledgeArticle_owner_scope_check" CHECK (
    ("ownerScope" = 'ORGANIZATION' AND "companyId" IS NOT NULL)
    OR ("ownerScope" <> 'ORGANIZATION' AND "companyId" IS NULL)
  ),
  ADD CONSTRAINT "KnowledgeArticle_quarantine_check" CHECK (
    "ownerScope" <> 'LEGACY_UNCLASSIFIED' OR "quarantinedAt" IS NOT NULL
  ),
  ADD CONSTRAINT "KnowledgeArticle_visibility_scope_check" CHECK (
    ("ownerScope" = 'ORGANIZATION' AND "visibility" IN ('PRIVATE', 'ORGANIZATION', 'PUBLIC'))
    OR ("ownerScope" IN ('PLATFORM', 'SYSTEM') AND "visibility" IN ('PRIVATE', 'PLATFORM', 'PUBLIC'))
    OR ("ownerScope" = 'LEGACY_UNCLASSIFIED' AND "visibility" = 'PRIVATE')
  );

CREATE INDEX "KnowledgeArticle_status_visibility_category_idx"
  ON "KnowledgeArticle"("status", "visibility", "category");
CREATE INDEX "KnowledgeArticle_companyId_status_visibility_idx"
  ON "KnowledgeArticle"("companyId", "status", "visibility");
CREATE INDEX "KnowledgeArticle_ownerScope_status_idx"
  ON "KnowledgeArticle"("ownerScope", "status");

CREATE OR REPLACE FUNCTION "prevent_knowledge_owner_change"()
RETURNS trigger AS $$
BEGIN
  IF OLD."ownerScope" IS DISTINCT FROM NEW."ownerScope"
     OR OLD."companyId" IS DISTINCT FROM NEW."companyId" THEN
    RAISE EXCEPTION 'Knowledge ownership is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "KnowledgeArticle_immutable_owner"
BEFORE UPDATE ON "KnowledgeArticle"
FOR EACH ROW EXECUTE FUNCTION "prevent_knowledge_owner_change"();

CREATE TABLE "PlatformRoleAssignment" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "PlatformRole" NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "assignedById" TEXT,
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformRoleAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PlatformRoleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PlatformRoleAssignment_userId_role_key" ON "PlatformRoleAssignment"("userId", "role");
CREATE INDEX "PlatformRoleAssignment_userId_active_idx" ON "PlatformRoleAssignment"("userId", "active");
CREATE INDEX "PlatformRoleAssignment_role_active_idx" ON "PlatformRoleAssignment"("role", "active");

-- User.role is ambiguous legacy compatibility data: it may represent an organization
-- administrator rather than a platform operator. Deny by default and create no platform grant
-- from it. The initial PLATFORM_OWNER is assigned through the documented bootstrap ceremony.

CREATE TABLE "PlatformSupportSession" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "reasonCode" VARCHAR(100) NOT NULL,
  "ticketReference" VARCHAR(200) NOT NULL,
  "allowedScopes" JSONB NOT NULL,
  "mfaVerifiedAt" TIMESTAMP(3) NOT NULL,
  "authenticatedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformSupportSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlatformSupportSession_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlatformSupportSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "PlatformSupportSession_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "PlatformSupportSession_actorId_expiresAt_endedAt_idx" ON "PlatformSupportSession"("actorId", "expiresAt", "endedAt");
CREATE INDEX "PlatformSupportSession_companyId_expiresAt_endedAt_idx" ON "PlatformSupportSession"("companyId", "expiresAt", "endedAt");

CREATE TABLE "GovernanceApprovalRequest" (
  "id" TEXT NOT NULL,
  "actionType" "GovernanceApprovalActionType" NOT NULL,
  "scope" "GovernanceApprovalScope" NOT NULL,
  "companyId" TEXT,
  "resourceId" VARCHAR(200),
  "expectedVersion" INTEGER,
  "safeParameters" JSONB NOT NULL,
  "payloadFingerprint" VARCHAR(64) NOT NULL,
  "requesterId" TEXT NOT NULL,
  "status" "GovernanceApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "executionKey" VARCHAR(200),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernanceApprovalRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceApprovalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceApprovalRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "GovernanceApprovalRequest_scope_check" CHECK (
    "scope" = 'PLATFORM' OR ("scope" = 'ORGANIZATION' AND "companyId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "GovernanceApprovalRequest_payloadFingerprint_key" ON "GovernanceApprovalRequest"("payloadFingerprint");
CREATE UNIQUE INDEX "GovernanceApprovalRequest_executionKey_key" ON "GovernanceApprovalRequest"("executionKey");
CREATE INDEX "GovernanceApprovalRequest_scope_companyId_status_expiresAt_idx" ON "GovernanceApprovalRequest"("scope", "companyId", "status", "expiresAt");
CREATE INDEX "GovernanceApprovalRequest_requesterId_status_createdAt_idx" ON "GovernanceApprovalRequest"("requesterId", "status", "createdAt");

CREATE TABLE "GovernanceApprovalDecision" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "approverId" TEXT NOT NULL,
  "approved" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceApprovalDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceApprovalDecision_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "GovernanceApprovalRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GovernanceApprovalDecision_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "GovernanceApprovalDecision_requestId_approverId_key" ON "GovernanceApprovalDecision"("requestId", "approverId");
CREATE INDEX "GovernanceApprovalDecision_approverId_createdAt_idx" ON "GovernanceApprovalDecision"("approverId", "createdAt");

CREATE TABLE "GovernanceNotification" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "companyId" TEXT,
  "category" VARCHAR(50) NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "href" VARCHAR(250) NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GovernanceNotification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GovernanceNotification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "GovernanceNotification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GovernanceNotification_recipientId_readAt_createdAt_idx" ON "GovernanceNotification"("recipientId", "readAt", "createdAt");
CREATE INDEX "GovernanceNotification_companyId_createdAt_idx" ON "GovernanceNotification"("companyId", "createdAt");

-- Existing support requests need optimistic fencing before a cross-tenant executor can mutate
-- them. Fresh installations may create the application table later through the current baseline.
ALTER TABLE IF EXISTS "SupportRequest"
  ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
