CREATE TABLE "PortalNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortalNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PortalNotification_userId_companyId_createdAt_idx"
  ON "PortalNotification" ("userId", "companyId", "createdAt");

CREATE INDEX "PortalNotification_userId_companyId_readAt_idx"
  ON "PortalNotification" ("userId", "companyId", "readAt");

DO $$
BEGIN
  IF to_regclass('"User"') IS NOT NULL THEN
    ALTER TABLE "PortalNotification"
      ADD CONSTRAINT "PortalNotification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF to_regclass('"Company"') IS NOT NULL THEN
    ALTER TABLE "PortalNotification"
      ADD CONSTRAINT "PortalNotification_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;
