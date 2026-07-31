CREATE TYPE "OidcOrganizationMappingMode" AS ENUM (
  'STATIC',
  'PROVIDER_TENANT_CLAIM',
  'HOSTED_DOMAIN',
  'CLAIM'
);

CREATE TYPE "OidcProviderValidationStatus" AS ENUM (
  'NOT_VALIDATED',
  'METADATA_VALIDATED',
  'TENANT_VALIDATED',
  'REVALIDATION_REQUIRED',
  'FAILED'
);

CREATE TYPE "OidcProviderSessionPolicy" AS ENUM (
  'PRESERVE_EXISTING',
  'REVOKE_ON_DISABLE'
);

CREATE TYPE "OidcAuthorizationPurpose" AS ENUM (
  'LOGIN',
  'LINK',
  'PROVIDER_VALIDATION'
);

CREATE TYPE "OrganizationSsoRequirement" AS ENUM (
  'DISABLED',
  'OPTIONAL',
  'REQUIRED'
);

ALTER TABLE "IdentityProvider"
  ADD COLUMN "clientSecretRefEncrypted" TEXT,
  ADD COLUMN "secretKeyVersion" VARCHAR(32),
  ADD COLUMN "redirectUris" JSONB,
  ADD COLUMN "organizationMappingMode" "OidcOrganizationMappingMode" NOT NULL DEFAULT 'STATIC',
  ADD COLUMN "defaultRole" "UserRole" NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN "sessionPolicy" "OidcProviderSessionPolicy" NOT NULL DEFAULT 'REVOKE_ON_DISABLE',
  ADD COLUMN "validationStatus" "OidcProviderValidationStatus" NOT NULL DEFAULT 'NOT_VALIDATED',
  ADD COLUMN "validationEvidenceRef" VARCHAR(200),
  ADD COLUMN "createdBy" VARCHAR(200),
  ADD COLUMN "updatedBy" VARCHAR(200),
  ADD COLUMN "configurationVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "IdentityProvider"
SET "redirectUris" = jsonb_build_array("redirectUri")
WHERE "redirectUri" IS NOT NULL;

-- Legacy TASK-009 OIDC rows did not have a trusted tenant mapping. Preserve
-- them for operator review, but quarantine them from login and force explicit
-- tenant-bound reconfiguration instead of guessing a company.
UPDATE "IdentityProvider"
SET
  "enabled" = false,
  "validationStatus" = 'REVALIDATION_REQUIRED',
  "validationEvidenceRef" = NULL,
  "authorizationEndpoint" = NULL,
  "tokenEndpoint" = NULL,
  "jwksUri" = NULL,
  "metadataRefreshedAt" = NULL,
  "metadataExpiresAt" = NULL
WHERE "kind" = 'OIDC' AND "companyId" IS NULL;

-- TASK-009 did not permit production credentials. Any legacy reference must be
-- re-entered through the encrypted TASK-010 boundary.
ALTER TABLE "IdentityProvider"
  DROP COLUMN "clientSecretRef";

CREATE UNIQUE INDEX "IdentityProvider_id_companyId_key"
  ON "IdentityProvider"("id", "companyId");

ALTER TABLE "OidcAuthorizationRequest"
  ADD COLUMN "purpose" "OidcAuthorizationPurpose" NOT NULL DEFAULT 'LOGIN',
  ADD COLUMN "returnTo" TEXT,
  ADD COLUMN "validatedAt" TIMESTAMP(3);

CREATE TABLE "OidcTokenReplay" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "tokenIdHash" VARCHAR(64) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OidcTokenReplay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OidcTokenReplay_providerId_tokenIdHash_key"
  ON "OidcTokenReplay"("providerId", "tokenIdHash");
CREATE INDEX "OidcTokenReplay_expiresAt_idx"
  ON "OidcTokenReplay"("expiresAt");

ALTER TABLE "OidcTokenReplay"
  ADD CONSTRAINT "OidcTokenReplay_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserSession"
  ADD COLUMN "identityProviderId" TEXT;

CREATE INDEX "UserSession_identityProviderId_revokedAt_expiresAt_idx"
  ON "UserSession"("identityProviderId", "revokedAt", "expiresAt");

ALTER TABLE "UserSession"
  ADD CONSTRAINT "UserSession_identityProviderId_fkey"
  FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LoginChallenge"
  ADD COLUMN "identityProviderId" TEXT;

CREATE INDEX "LoginChallenge_identityProviderId_expiresAt_idx"
  ON "LoginChallenge"("identityProviderId", "expiresAt");

ALTER TABLE "LoginChallenge"
  ADD CONSTRAINT "LoginChallenge_identityProviderId_fkey"
  FOREIGN KEY ("identityProviderId") REFERENCES "IdentityProvider"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrganizationIdentityPolicy"
  ADD COLUMN "ssoRequirement" "OrganizationSsoRequirement" NOT NULL DEFAULT 'DISABLED',
  ADD COLUMN "ssoProviderId" TEXT,
  ADD COLUMN "ssoEnforcementAt" TIMESTAMP(3),
  ADD COLUMN "ssoGracePeriodDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "localLoginAllowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "configurationVersion" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "OrganizationIdentityPolicy_ssoGracePeriodDays_check"
    CHECK ("ssoGracePeriodDays" >= 0 AND "ssoGracePeriodDays" <= 365);

ALTER TABLE "OrganizationIdentityPolicy"
  ADD CONSTRAINT "OrganizationIdentityPolicy_ssoProviderId_companyId_fkey"
  FOREIGN KEY ("ssoProviderId", "companyId")
  REFERENCES "IdentityProvider"("id", "companyId")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IdentityProvider"
  ADD CONSTRAINT "IdentityProvider_oidc_tenant_check"
    CHECK (
      "kind" <> 'OIDC'
      OR "companyId" IS NOT NULL
      OR (
        "enabled" = false
        AND "validationStatus" = 'REVALIDATION_REQUIRED'
        AND "clientSecretRefEncrypted" IS NULL
      )
    ),
  ADD CONSTRAINT "IdentityProvider_configurationVersion_check"
    CHECK ("configurationVersion" > 0),
  ADD CONSTRAINT "IdentityProvider_defaultRole_check"
    CHECK ("defaultRole" = 'CLIENT');

ALTER TABLE "OrganizationIdentityPolicy"
  ADD CONSTRAINT "OrganizationIdentityPolicy_sso_configuration_check"
    CHECK (
      ("ssoRequirement" = 'DISABLED' AND "ssoProviderId" IS NULL)
      OR ("ssoRequirement" <> 'DISABLED' AND "ssoProviderId" IS NOT NULL)
    );
