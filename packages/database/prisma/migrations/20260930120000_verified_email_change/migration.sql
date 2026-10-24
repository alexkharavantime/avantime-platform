CREATE TABLE "EmailChangeVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChangeVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailChangeVerification_tokenHash_key"
ON "EmailChangeVerification"("tokenHash");

CREATE INDEX "EmailChangeVerification_userId_usedAt_expiresAt_idx"
ON "EmailChangeVerification"("userId", "usedAt", "expiresAt");

CREATE INDEX "EmailChangeVerification_emailNormalized_expiresAt_idx"
ON "EmailChangeVerification"("emailNormalized", "expiresAt");

ALTER TABLE "EmailChangeVerification"
ADD CONSTRAINT "EmailChangeVerification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;