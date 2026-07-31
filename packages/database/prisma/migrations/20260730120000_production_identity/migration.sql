CREATE TYPE "IdentityProviderKind" AS ENUM ('LOCAL', 'OIDC', 'SAML');
CREATE TYPE "CredentialKind" AS ENUM ('PASSWORD');
CREATE TYPE "MfaMethodKind" AS ENUM ('TOTP', 'WEBAUTHN', 'IDP_CLAIM');
CREATE TYPE "MfaMethodStatus" AS ENUM ('PENDING', 'ACTIVE', 'DISABLED');
CREATE TYPE "SecurityEventResult" AS ENUM ('SUCCEEDED', 'FAILED', 'DENIED');
CREATE TYPE "OrganizationMfaRequirement" AS ENUM ('OPTIONAL', 'ADMINS', 'ALL_MEMBERS');

ALTER TABLE "User"
  ADD COLUMN "emailNormalized" TEXT,
  ADD COLUMN "disabledAt" TIMESTAMP(3);

UPDATE "User"
SET "emailNormalized" = lower(trim("email"));

ALTER TABLE "User"
  ALTER COLUMN "emailNormalized" SET NOT NULL;

DROP INDEX IF EXISTS "User_email_key";
CREATE INDEX "User_emailNormalized_idx" ON "User"("emailNormalized");

CREATE TABLE "OrganizationMembership" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationMembership_userId_companyId_key"
  ON "OrganizationMembership"("userId", "companyId");
CREATE INDEX "OrganizationMembership_companyId_active_idx"
  ON "OrganizationMembership"("companyId", "active");
CREATE INDEX "OrganizationMembership_userId_active_idx"
  ON "OrganizationMembership"("userId", "active");

INSERT INTO "OrganizationMembership" (
  "id", "userId", "companyId", "role", "active", "createdAt", "updatedAt"
)
SELECT
  concat('membership_', md5("id" || ':' || "companyId")),
  "id",
  "companyId",
  "role",
  "active",
  "createdAt",
  "updatedAt"
FROM "User"
WHERE "companyId" IS NOT NULL
ON CONFLICT ("userId", "companyId") DO NOTHING;

CREATE TABLE "IdentityProvider" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "kind" "IdentityProviderKind" NOT NULL,
  "displayName" TEXT NOT NULL,
  "issuer" TEXT,
  "clientId" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityProvider_key_key" ON "IdentityProvider"("key");

INSERT INTO "IdentityProvider" (
  "id", "key", "kind", "displayName", "enabled", "createdAt", "updatedAt"
)
VALUES (
  'provider_local', 'local', 'LOCAL', 'Local password', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

CREATE TABLE "ExternalIdentity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "emailNormalized" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExternalIdentity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalIdentity_providerId_subject_key"
  ON "ExternalIdentity"("providerId", "subject");
CREATE INDEX "ExternalIdentity_userId_idx" ON "ExternalIdentity"("userId");
CREATE INDEX "ExternalIdentity_providerId_emailNormalized_idx"
  ON "ExternalIdentity"("providerId", "emailNormalized");

CREATE TABLE "UserCredential" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "CredentialKind" NOT NULL DEFAULT 'PASSWORD',
  "identifierNormalized" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserCredential_userId_kind_key"
  ON "UserCredential"("userId", "kind");
CREATE UNIQUE INDEX "UserCredential_identifierNormalized_key"
  ON "UserCredential"("identifierNormalized");
CREATE INDEX "UserCredential_updatedAt_idx" ON "UserCredential"("updatedAt");

INSERT INTO "UserCredential" (
  "id", "userId", "kind", "identifierNormalized", "passwordHash",
  "passwordChangedAt", "createdAt", "updatedAt"
)
SELECT
  concat('credential_', "id"),
  "id",
  'PASSWORD',
  lower(trim("email")),
  "passwordHash",
  "updatedAt",
  "createdAt",
  "updatedAt"
FROM "User"
WHERE "passwordHash" IS NOT NULL
ON CONFLICT ("userId", "kind") DO NOTHING;

UPDATE "User"
SET "passwordHash" = NULL
WHERE "passwordHash" IS NOT NULL;

CREATE TABLE "UserSession" (
  "id" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "idleExpiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "rotatedFromId" TEXT,
  "deviceLabel" VARCHAR(120),
  "authenticationAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX "UserSession_userId_revokedAt_expiresAt_idx"
  ON "UserSession"("userId", "revokedAt", "expiresAt");
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

CREATE TABLE "LoginChallenge" (
  "id" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT,
  "redirectTo" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoginChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginChallenge_tokenHash_key" ON "LoginChallenge"("tokenHash");
CREATE INDEX "LoginChallenge_userId_expiresAt_idx"
  ON "LoginChallenge"("userId", "expiresAt");
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "LoginChallenge"("expiresAt");

CREATE TABLE "MfaMethod" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" "MfaMethodKind" NOT NULL,
  "status" "MfaMethodStatus" NOT NULL DEFAULT 'PENDING',
  "label" VARCHAR(120),
  "secretEncrypted" TEXT,
  "lastUsedCounter" INTEGER,
  "confirmedAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MfaMethod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MfaMethod_userId_status_idx" ON "MfaMethod"("userId", "status");

CREATE TABLE "RecoveryCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "batchId" VARCHAR(100) NOT NULL,
  "codeHash" VARCHAR(64) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecoveryCode_codeHash_key" ON "RecoveryCode"("codeHash");
CREATE INDEX "RecoveryCode_userId_batchId_usedAt_idx"
  ON "RecoveryCode"("userId", "batchId", "usedAt");

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key"
  ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx"
  ON "EmailVerificationToken"("userId", "expiresAt");

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "companyId" TEXT,
  "action" VARCHAR(100) NOT NULL,
  "result" "SecurityEventResult" NOT NULL,
  "correlationId" VARCHAR(200) NOT NULL,
  "safeMetadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");
CREATE INDEX "SecurityEvent_companyId_createdAt_idx"
  ON "SecurityEvent"("companyId", "createdAt");
CREATE INDEX "SecurityEvent_action_createdAt_idx" ON "SecurityEvent"("action", "createdAt");

CREATE TABLE "OrganizationIdentityPolicy" (
  "companyId" TEXT NOT NULL,
  "mfaRequirement" "OrganizationMfaRequirement" NOT NULL DEFAULT 'OPTIONAL',
  "gracePeriodDays" INTEGER NOT NULL DEFAULT 0,
  "enforcementAt" TIMESTAMP(3),
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationIdentityPolicy_pkey" PRIMARY KEY ("companyId"),
  CONSTRAINT "OrganizationIdentityPolicy_gracePeriodDays_check"
    CHECK ("gracePeriodDays" >= 0 AND "gracePeriodDays" <= 365)
);

CREATE TABLE "OrganizationMfaExemption" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reasonCode" VARCHAR(100) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "approvedBy" VARCHAR(200) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationMfaExemption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrganizationMfaExemption_companyId_userId_key"
  ON "OrganizationMfaExemption"("companyId", "userId");
CREATE INDEX "OrganizationMfaExemption_expiresAt_idx"
  ON "OrganizationMfaExemption"("expiresAt");

ALTER TABLE "OrganizationMembership"
  ADD CONSTRAINT "OrganizationMembership_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrganizationMembership_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ExternalIdentity"
  ADD CONSTRAINT "ExternalIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ExternalIdentity_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "UserCredential"
  ADD CONSTRAINT "UserCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession"
  ADD CONSTRAINT "UserSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginChallenge"
  ADD CONSTRAINT "LoginChallenge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MfaMethod"
  ADD CONSTRAINT "MfaMethod_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RecoveryCode"
  ADD CONSTRAINT "RecoveryCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EmailVerificationToken"
  ADD CONSTRAINT "EmailVerificationToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SecurityEvent"
  ADD CONSTRAINT "SecurityEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrganizationIdentityPolicy"
  ADD CONSTRAINT "OrganizationIdentityPolicy_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationMfaExemption"
  ADD CONSTRAINT "OrganizationMfaExemption_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "OrganizationIdentityPolicy"("companyId")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OrganizationMfaExemption_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
