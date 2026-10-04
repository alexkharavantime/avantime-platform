CREATE TYPE "AccessRequestStatus" AS ENUM (
  'PENDING',
  'EMAIL_VERIFIED',
  'APPROVED',
  'REJECTED'
);

CREATE TABLE "AccessRequest" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "companyName" TEXT NOT NULL,
  "comment" TEXT,
  "locale" TEXT,
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "verificationTokenHash" VARCHAR(64),
  "verificationExpiresAt" TIMESTAMP(3),
  "emailVerifiedAt" TIMESTAMP(3),
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "decisionCompanyId" TEXT,
  "decisionRole" "OrganizationRole",
  "rejectionReason" TEXT,
  "invitationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccessRequest_verificationTokenHash_key"
  ON "AccessRequest"("verificationTokenHash");
CREATE UNIQUE INDEX "AccessRequest_invitationId_key"
  ON "AccessRequest"("invitationId");
CREATE INDEX "AccessRequest_emailNormalized_status_idx"
  ON "AccessRequest"("emailNormalized", "status");
CREATE INDEX "AccessRequest_status_createdAt_idx"
  ON "AccessRequest"("status", "createdAt");

ALTER TABLE "AccessRequest"
  ADD CONSTRAINT "AccessRequest_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "AccessRequest_invitationId_fkey"
    FOREIGN KEY ("invitationId") REFERENCES "IdentityInvitation"("id") ON DELETE SET NULL ON UPDATE CASCADE;