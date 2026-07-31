CREATE TYPE "OidcProviderProfile" AS ENUM (
  'MICROSOFT_ENTRA_ID',
  'GOOGLE_WORKSPACE',
  'GENERIC_OIDC'
);

ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Existing accounts keep access during the staged verification rollout.
UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL;

ALTER TABLE "IdentityProvider"
  ADD COLUMN "oidcProfile" "OidcProviderProfile",
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "clientSecretRef" TEXT,
  ADD COLUMN "discoveryUrl" TEXT,
  ADD COLUMN "authorizationEndpoint" TEXT,
  ADD COLUMN "tokenEndpoint" TEXT,
  ADD COLUMN "jwksUri" TEXT,
  ADD COLUMN "redirectUri" TEXT,
  ADD COLUMN "allowedDomains" JSONB,
  ADD COLUMN "tenantMappingPolicy" JSONB,
  ADD COLUMN "claimMapping" JSONB,
  ADD COLUMN "groupRoleMapping" JSONB,
  ADD COLUMN "metadataRefreshedAt" TIMESTAMP(3),
  ADD COLUMN "metadataExpiresAt" TIMESTAMP(3);

ALTER TABLE "ExternalIdentity"
  ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastAuthenticatedAt" TIMESTAMP(3);

ALTER TABLE "EmailVerificationToken"
  ADD COLUMN "redirectTo" TEXT;

CREATE TABLE "OidcAuthorizationRequest" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT,
  "stateHash" VARCHAR(64) NOT NULL,
  "nonceHash" VARCHAR(64) NOT NULL,
  "pkceVerifierEncrypted" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OidcAuthorizationRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OidcAuthorizationRequest_stateHash_key"
  ON "OidcAuthorizationRequest"("stateHash");
CREATE INDEX "OidcAuthorizationRequest_providerId_expiresAt_idx"
  ON "OidcAuthorizationRequest"("providerId", "expiresAt");
CREATE INDEX "OidcAuthorizationRequest_userId_expiresAt_idx"
  ON "OidcAuthorizationRequest"("userId", "expiresAt");

CREATE TABLE "IdentityInvitation" (
  "id" TEXT NOT NULL,
  "tokenHash" VARCHAR(64) NOT NULL,
  "companyId" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
  "invitedBy" TEXT NOT NULL,
  "acceptedBy" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IdentityInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IdentityInvitation_tokenHash_key"
  ON "IdentityInvitation"("tokenHash");
CREATE INDEX "IdentityInvitation_companyId_emailNormalized_revokedAt_acceptedAt_idx"
  ON "IdentityInvitation"("companyId", "emailNormalized", "revokedAt", "acceptedAt");
CREATE INDEX "IdentityInvitation_invitedBy_createdAt_idx"
  ON "IdentityInvitation"("invitedBy", "createdAt");
CREATE INDEX "IdentityInvitation_expiresAt_idx"
  ON "IdentityInvitation"("expiresAt");
CREATE INDEX "IdentityProvider_companyId_enabled_idx"
  ON "IdentityProvider"("companyId", "enabled");
CREATE INDEX "IdentityProvider_kind_enabled_idx"
  ON "IdentityProvider"("kind", "enabled");

ALTER TABLE "IdentityProvider"
  ADD CONSTRAINT "IdentityProvider_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OidcAuthorizationRequest"
  ADD CONSTRAINT "OidcAuthorizationRequest_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "OidcAuthorizationRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IdentityInvitation"
  ADD CONSTRAINT "IdentityInvitation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "IdentityInvitation_invitedBy_fkey"
  FOREIGN KEY ("invitedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "IdentityInvitation_acceptedBy_fkey"
  FOREIGN KEY ("acceptedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
