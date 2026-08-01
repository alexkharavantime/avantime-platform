-- TASK-011 is additive. Legacy UserRole/role/active columns remain available to
-- the compatibility layer throughout the staged rollout.
DO $$
BEGIN
  CREATE TYPE "OrganizationRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REMOVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Nullable-first keeps the schema compatible while existing rows are backfilled.
ALTER TABLE "OrganizationMembership"
  ADD COLUMN IF NOT EXISTS "organizationRole" "OrganizationRole",
  ADD COLUMN IF NOT EXISTS "status" "MembershipStatus",
  ADD COLUMN IF NOT EXISTS "version" INTEGER,
  ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "removedAt" TIMESTAMP(3);

UPDATE "OrganizationMembership"
SET "organizationRole" = CASE
  WHEN "role" = 'ADMIN'::"UserRole" THEN 'ADMIN'::"OrganizationRole"
  ELSE 'MEMBER'::"OrganizationRole"
END
WHERE "organizationRole" IS NULL;

UPDATE "OrganizationMembership"
SET "status" = CASE
  WHEN "active" THEN 'ACTIVE'::"MembershipStatus"
  ELSE 'SUSPENDED'::"MembershipStatus"
END
WHERE "status" IS NULL;

UPDATE "OrganizationMembership"
SET "version" = 1
WHERE "version" IS NULL OR "version" < 1;

ALTER TABLE "OrganizationMembership"
  ALTER COLUMN "organizationRole" SET DEFAULT 'MEMBER'::"OrganizationRole",
  ALTER COLUMN "organizationRole" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE'::"MembershipStatus",
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "version" SET DEFAULT 1,
  ALTER COLUMN "version" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OrganizationMembership_version_check'
      AND conrelid = '"OrganizationMembership"'::regclass
  ) THEN
    ALTER TABLE "OrganizationMembership"
      ADD CONSTRAINT "OrganizationMembership_version_check" CHECK ("version" >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OrganizationMembership_companyId_status_organizationRole_idx"
  ON "OrganizationMembership"("companyId", "status", "organizationRole");
CREATE INDEX IF NOT EXISTS "OrganizationMembership_userId_status_idx"
  ON "OrganizationMembership"("userId", "status");

ALTER TABLE "IdentityInvitation"
  ADD COLUMN IF NOT EXISTS "organizationRole" "OrganizationRole";

UPDATE "IdentityInvitation"
SET "organizationRole" = CASE
  WHEN "role" = 'ADMIN'::"UserRole" THEN 'ADMIN'::"OrganizationRole"
  ELSE 'MEMBER'::"OrganizationRole"
END
WHERE "organizationRole" IS NULL;

ALTER TABLE "IdentityInvitation"
  ALTER COLUMN "organizationRole" SET DEFAULT 'MEMBER'::"OrganizationRole",
  ALTER COLUMN "organizationRole" SET NOT NULL;
