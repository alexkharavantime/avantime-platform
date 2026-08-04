import path from 'node:path';

import {
  assertSafeDocumentIntegrationEnvironment,
  loadDocumentIntegrationEnvironment,
  runIntegrationCommand,
} from './document-integration-environment';

const FIRST_MIGRATION = '20260727150000_document_metadata_persistence';
const EXPECTED_MIGRATION_COUNT = 16;
const PRE_OIDC_ROLLOUT_MIGRATIONS = [
  '20260727190000_document_processing_queue',
  '20260728120000_document_intelligence',
  '20260728180000_hybrid_rag',
  '20260728220000_production_readiness',
  '20260729120000_unified_portal_notifications',
  '20260730120000_production_identity',
  '20260730180000_identity_completion',
] as const;
const LEGACY_OIDC_REFERENCE = 'legacy-oidc-reference-for-rehearsal';

type RehearsalPrismaClient = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $disconnect(): Promise<void>;
};

async function createPrismaClient(databaseUrl: string): Promise<RehearsalPrismaClient> {
  const load = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{ PrismaClient: new (options: object) => RehearsalPrismaClient }>;
  const { PrismaClient } = await load('@prisma/client');
  return new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
    log: ['error'],
  });
}

function assertSafeDatabaseIdentifier(value: string) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value) || !value.includes('integration')) {
    throw new Error('Rehearsal database identifier is unsafe.');
  }
}

function quoteIdentifier(value: string) {
  assertSafeDatabaseIdentifier(value);
  return `"${value}"`;
}

function databaseUrl(base: URL, databaseName: string) {
  assertSafeDatabaseIdentifier(databaseName);
  const url = new URL(base);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createDatabase(client: RehearsalPrismaClient, databaseName: string) {
  await client.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
  );
  await client.$executeRawUnsafe(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
}

async function dropDatabase(client: RehearsalPrismaClient, databaseName: string) {
  await client.$executeRawUnsafe(
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
  );
}

async function deployMigrations(
  repositoryRoot: string,
  schema: string,
  environment: NodeJS.ProcessEnv,
  targetDatabaseUrl: string,
) {
  const commandEnvironment = {
    ...environment,
    DATABASE_URL: targetDatabaseUrl,
  };
  assertSafeDocumentIntegrationEnvironment(commandEnvironment);
  await runIntegrationCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema], {
    cwd: repositoryRoot,
    environment: commandEnvironment,
  });
}

async function applyAndResolveMigration(options: {
  repositoryRoot: string;
  schema: string;
  migrationsDirectory: string;
  environment: NodeJS.ProcessEnv;
  targetDatabaseUrl: string;
  migration: string;
}) {
  const commandEnvironment = {
    ...options.environment,
    DATABASE_URL: options.targetDatabaseUrl,
  };
  assertSafeDocumentIntegrationEnvironment(commandEnvironment);
  await runIntegrationCommand(
    'npx',
    [
      'prisma',
      'db',
      'execute',
      '--file',
      path.join(options.migrationsDirectory, options.migration, 'migration.sql'),
      '--schema',
      options.schema,
    ],
    {
      cwd: options.repositoryRoot,
      environment: commandEnvironment,
    },
  );
  await runIntegrationCommand(
    'npx',
    ['prisma', 'migrate', 'resolve', '--applied', options.migration, '--schema', options.schema],
    {
      cwd: options.repositoryRoot,
      environment: commandEnvironment,
    },
  );
}

async function createLegacyAccountBaseline(targetDatabaseUrl: string, withIdentityFixture = false) {
  const client = await createPrismaClient(targetDatabaseUrl);
  try {
    for (const statement of [
      `CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'ADMIN')`,
      `CREATE TABLE "Company" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "registrationNumber" TEXT,
        "address" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE TABLE "User" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
        "active" BOOLEAN NOT NULL DEFAULT true,
        "passwordHash" TEXT,
        "phone" TEXT,
        "jobTitle" TEXT,
        "companyId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "User_companyId_fkey"
          FOREIGN KEY ("companyId") REFERENCES "Company"("id")
          ON DELETE SET NULL ON UPDATE CASCADE
      )`,
      `CREATE UNIQUE INDEX "User_email_key" ON "User"("email")`,
      `CREATE TABLE "PasswordResetToken" (
        "id" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL,
        "userId" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "usedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "PasswordResetToken_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      `CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key"
        ON "PasswordResetToken"("tokenHash")`,
    ]) {
      await client.$executeRawUnsafe(statement);
    }
    if (withIdentityFixture) {
      await client.$executeRawUnsafe(
        `INSERT INTO "Company" ("id", "name")
         VALUES ('integration-identity-company', 'Integration Identity Company')`,
      );
      await client.$executeRawUnsafe(
        `INSERT INTO "User" (
          "id", "email", "name", "role", "active", "passwordHash", "companyId"
        ) VALUES (
          'integration-identity-user',
          'LEGACY.USER@EXAMPLE.TEST',
          'Legacy Identity User',
          'CLIENT',
          true,
          'pbkdf2$210000$legacy-salt$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          'integration-identity-company'
        )`,
      );
      await client.$executeRawUnsafe(
        `INSERT INTO "User" (
          "id", "email", "name", "role", "active", "companyId"
        ) VALUES (
          'integration-legacy-organization-admin',
          'legacy.organization.admin@example.test',
          'Legacy Organization Administrator',
          'ADMIN',
          true,
          'integration-identity-company'
        )`,
      );
    }
  } finally {
    await client.$disconnect();
  }
}

async function rehearseEmptyDatabase(options: {
  repositoryRoot: string;
  schema: string;
  migrationsDirectory: string;
  environment: NodeJS.ProcessEnv;
  targetDatabaseUrl: string;
}) {
  await createLegacyAccountBaseline(options.targetDatabaseUrl);
  const commandEnvironment = {
    ...options.environment,
    DATABASE_URL: options.targetDatabaseUrl,
  };
  await runIntegrationCommand(
    'npx',
    [
      'prisma',
      'db',
      'execute',
      '--file',
      path.join(options.migrationsDirectory, FIRST_MIGRATION, 'migration.sql'),
      '--schema',
      options.schema,
    ],
    {
      cwd: options.repositoryRoot,
      environment: commandEnvironment,
    },
  );
  await runIntegrationCommand(
    'npx',
    ['prisma', 'migrate', 'resolve', '--applied', FIRST_MIGRATION, '--schema', options.schema],
    {
      cwd: options.repositoryRoot,
      environment: commandEnvironment,
    },
  );
  await deployMigrations(
    options.repositoryRoot,
    options.schema,
    options.environment,
    options.targetDatabaseUrl,
  );
  await deployMigrations(
    options.repositoryRoot,
    options.schema,
    options.environment,
    options.targetDatabaseUrl,
  );

  const client = await createPrismaClient(options.targetDatabaseUrl);
  try {
    const migrations = await client.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    );
    if (Number(migrations[0]?.count ?? 0) !== EXPECTED_MIGRATION_COUNT) {
      throw new Error(
        `Empty database did not apply exactly ${EXPECTED_MIGRATION_COUNT} platform migrations.`,
      );
    }
    const vector = await client.$queryRawUnsafe<Array<{ extension: boolean; tableReady: boolean }>>(
      `SELECT
        EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "extension",
        to_regclass('"DocumentChunkEmbedding"') IS NOT NULL AS "tableReady"`,
    );
    if (!vector[0]?.extension || !vector[0]?.tableReady) {
      throw new Error('pgvector storage is unavailable after empty database migration.');
    }
  } finally {
    await client.$disconnect();
  }
}

async function rehearseLegacyDatabase(options: {
  repositoryRoot: string;
  schema: string;
  migrationsDirectory: string;
  environment: NodeJS.ProcessEnv;
  targetDatabaseUrl: string;
}) {
  await createLegacyAccountBaseline(options.targetDatabaseUrl, true);
  const commandEnvironment = {
    ...options.environment,
    DATABASE_URL: options.targetDatabaseUrl,
  };
  await runIntegrationCommand(
    'npx',
    [
      'prisma',
      'db',
      'execute',
      '--file',
      path.join(options.migrationsDirectory, FIRST_MIGRATION, 'migration.sql'),
      '--schema',
      options.schema,
    ],
    {
      cwd: options.repositoryRoot,
      environment: commandEnvironment,
    },
  );
  const client = await createPrismaClient(options.targetDatabaseUrl);
  try {
    const checksum = 'a'.repeat(64);
    await client.$executeRawUnsafe(
      'ALTER TABLE "DocumentMetadata" ADD COLUMN "processingAttempts" INTEGER',
    );
    await client.$executeRawUnsafe(
      `INSERT INTO "DocumentMetadata"
        ("id", "companyId", "uploadedBy", "originalName", "storedName", "mimeType",
         "size", "status", "processingAttempts", "checksum", "createdAt", "updatedAt",
         "deletedAt")
       VALUES
        ('legacy-completed', 'integration-legacy', 'integration-user',
         'completed.pdf', 'completed.pdf', 'application/pdf', 10, 'PROCESSED',
         NULL, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
        ('legacy-failed', 'integration-legacy', 'integration-user',
         'failed.pdf', 'failed.pdf', 'application/pdf', 10, 'FAILED',
         NULL, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
        ('legacy-deleted', 'integration-legacy', 'integration-user',
         'deleted.pdf', 'deleted.pdf', 'application/pdf', 10, 'PROCESSED',
         NULL, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
        ('legacy-attempts-null', 'integration-legacy', 'integration-user',
         'attempts-null.pdf', 'attempts-null.pdf', 'application/pdf', 10, 'PROCESSING',
         NULL, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
        ('legacy-attempts-negative', 'integration-legacy', 'integration-user',
         'attempts-negative.pdf', 'attempts-negative.pdf', 'application/pdf', 10, 'PROCESSING',
         -1, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
        ('legacy-attempts-positive', 'integration-legacy', 'integration-user',
         'attempts-positive.pdf', 'attempts-positive.pdf', 'application/pdf', 10, 'PROCESSING',
         4, $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL)`,
      checksum,
    );
  } finally {
    await client.$disconnect();
  }

  await runIntegrationCommand(
    'npx',
    ['prisma', 'migrate', 'resolve', '--applied', FIRST_MIGRATION, '--schema', options.schema],
    {
      cwd: options.repositoryRoot,
      environment: commandEnvironment,
    },
  );
  for (const migration of PRE_OIDC_ROLLOUT_MIGRATIONS) {
    await applyAndResolveMigration({
      ...options,
      migration,
    });
  }

  const preRollout = await createPrismaClient(options.targetDatabaseUrl);
  try {
    await preRollout.$executeRawUnsafe(
      `CREATE TYPE "ArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED')`,
    );
    await preRollout.$executeRawUnsafe(
      `CREATE TABLE "KnowledgeArticle" (
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
           FOREIGN KEY ("authorId") REFERENCES "User"("id")
           ON DELETE SET NULL ON UPDATE CASCADE
       )`,
    );
    await preRollout.$executeRawUnsafe(
      `CREATE UNIQUE INDEX "KnowledgeArticle_slug_key" ON "KnowledgeArticle"("slug")`,
    );
    await preRollout.$executeRawUnsafe(
      `INSERT INTO "IdentityProvider" (
         "id", "key", "kind", "oidcProfile", "displayName", "issuer", "clientId",
         "enabled", "clientSecretRef", "discoveryUrl", "authorizationEndpoint",
         "tokenEndpoint", "jwksUri", "redirectUri", "createdAt", "updatedAt"
       ) VALUES (
         'integration-legacy-oidc', 'integration-legacy-oidc', 'OIDC', 'GENERIC_OIDC',
         'Integration Legacy OIDC', 'https://legacy-idp.example.test', 'legacy-client-id',
         true, $1, 'https://legacy-idp.example.test/.well-known/openid-configuration',
         'https://legacy-idp.example.test/authorize', 'https://legacy-idp.example.test/token',
         'https://legacy-idp.example.test/jwks', 'https://legacy-app.example.test/callback',
         CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )`,
      LEGACY_OIDC_REFERENCE,
    );
    await preRollout.$executeRawUnsafe(
      `INSERT INTO "KnowledgeArticle" (
         "id", "slug", "title", "summary", "category", "tags", "readingTime",
         "content", "status", "publishedAt", "createdAt", "updatedAt"
       ) VALUES (
         'integration-legacy-article', 'integration-legacy-article', 'Legacy article',
         'Existing public article', 'Integration', ARRAY[]::text[], '5 минут', '[]'::jsonb,
         'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
       )`,
    );
  } finally {
    await preRollout.$disconnect();
  }

  await deployMigrations(
    options.repositoryRoot,
    options.schema,
    options.environment,
    options.targetDatabaseUrl,
  );
  await deployMigrations(
    options.repositoryRoot,
    options.schema,
    options.environment,
    options.targetDatabaseUrl,
  );

  const verified = await createPrismaClient(options.targetDatabaseUrl);
  try {
    const legacyProvider = await verified.$queryRawUnsafe<
      Array<{
        enabled: boolean;
        validationStatus: string;
        clientSecretRef: string | null;
        clientSecretRefEncrypted: string | null;
        authorizationEndpoint: string | null;
        tokenEndpoint: string | null;
        jwksUri: string | null;
      }>
    >(
      `SELECT
         "enabled",
         "validationStatus"::text AS "validationStatus",
         "clientSecretRef",
         "clientSecretRefEncrypted",
         "authorizationEndpoint",
         "tokenEndpoint",
         "jwksUri"
       FROM "IdentityProvider"
       WHERE "id" = 'integration-legacy-oidc'`,
    );
    if (
      legacyProvider[0]?.enabled !== false ||
      legacyProvider[0]?.validationStatus !== 'REVALIDATION_REQUIRED' ||
      legacyProvider[0]?.clientSecretRef !== LEGACY_OIDC_REFERENCE ||
      legacyProvider[0]?.clientSecretRefEncrypted !== null ||
      legacyProvider[0]?.authorizationEndpoint !== null ||
      legacyProvider[0]?.tokenEndpoint !== null ||
      legacyProvider[0]?.jwksUri !== null
    ) {
      throw new Error('Legacy OIDC provider was not preserved and quarantined safely.');
    }

    const legacyArticle = await verified.$queryRawUnsafe<
      Array<{
        ownerScope: string;
        visibility: string;
        companyId: string | null;
        classificationEvidence: string;
      }>
    >(
      `SELECT "ownerScope"::text AS "ownerScope", "visibility"::text AS "visibility",
              "companyId", "classificationEvidence"
       FROM "KnowledgeArticle" WHERE "id" = 'integration-legacy-article'`,
    );
    if (
      legacyArticle[0]?.ownerScope !== 'PLATFORM' ||
      legacyArticle[0]?.visibility !== 'PRIVATE' ||
      legacyArticle[0]?.companyId !== null ||
      legacyArticle[0]?.classificationEvidence !== 'task-012-existing-platform-article-v1'
    ) {
      throw new Error('Legacy knowledge ownership backfill is not deterministic.');
    }

    const inferredPlatformAssignments = await verified.$queryRawUnsafe<Array<{ count: bigint }>>(
      `SELECT COUNT(*)::bigint AS count
       FROM "PlatformRoleAssignment"
       WHERE "userId" = 'integration-legacy-organization-admin'`,
    );
    if (Number(inferredPlatformAssignments[0]?.count ?? 0) !== 0) {
      throw new Error('Legacy organization ADMIN was incorrectly granted platform access.');
    }

    const identity = await verified.$queryRawUnsafe<
      Array<{
        emailNormalized: string;
        passwordHash: string | null;
        credentialIdentifier: string;
        credentialHash: string;
        membershipCompanyId: string;
        organizationRole: string;
        membershipStatus: string;
        membershipVersion: number;
        emailVerifiedAt: Date | null;
      }>
    >(
      `SELECT
         user_record."emailNormalized",
         user_record."passwordHash",
         credential."identifierNormalized" AS "credentialIdentifier",
         credential."passwordHash" AS "credentialHash",
         membership."companyId" AS "membershipCompanyId",
         membership."organizationRole"::text AS "organizationRole",
         membership."status"::text AS "membershipStatus",
         membership."version" AS "membershipVersion",
         user_record."emailVerifiedAt"
       FROM "User" user_record
       JOIN "UserCredential" credential ON credential."userId" = user_record."id"
       JOIN "OrganizationMembership" membership ON membership."userId" = user_record."id"
       WHERE user_record."id" = 'integration-identity-user'`,
    );
    if (
      identity[0]?.emailNormalized !== 'legacy.user@example.test' ||
      identity[0]?.passwordHash !== null ||
      identity[0]?.credentialIdentifier !== 'legacy.user@example.test' ||
      !identity[0]?.credentialHash.startsWith('pbkdf2$210000$') ||
      identity[0]?.membershipCompanyId !== 'integration-identity-company' ||
      identity[0]?.organizationRole !== 'MEMBER' ||
      identity[0]?.membershipStatus !== 'ACTIVE' ||
      identity[0]?.membershipVersion !== 1 ||
      !identity[0]?.emailVerifiedAt
    ) {
      throw new Error('Legacy identity was not normalized safely.');
    }
    const identityTables = await verified.$queryRawUnsafe<
      Array<{
        sessions: boolean;
        mfa: boolean;
        externalIdentities: boolean;
        oidcRequests: boolean;
        invitations: boolean;
      }>
    >(
      `SELECT
         to_regclass('"UserSession"') IS NOT NULL AS "sessions",
         to_regclass('"MfaMethod"') IS NOT NULL AS "mfa",
         to_regclass('"ExternalIdentity"') IS NOT NULL AS "externalIdentities",
         to_regclass('"OidcAuthorizationRequest"') IS NOT NULL AS "oidcRequests",
         to_regclass('"IdentityInvitation"') IS NOT NULL AS "invitations"`,
    );
    if (
      !identityTables[0]?.sessions ||
      !identityTables[0]?.mfa ||
      !identityTables[0]?.externalIdentities ||
      !identityTables[0]?.oidcRequests ||
      !identityTables[0]?.invitations
    ) {
      throw new Error('Identity foundation tables are missing after migration.');
    }

    const records = await verified.$queryRawUnsafe<
      Array<{
        id: string;
        status: string;
        processingAttempts: number;
        lastErrorCode: string | null;
        lastErrorMessage: string | null;
        processingStartedAt: Date | null;
        nextRetryAt: Date | null;
        quarantinedAt: Date | null;
        detectedDocumentType: string;
        textExtractionMethod: string;
        ocrStatus: string;
        requiresManualReview: boolean;
        intelligenceVersion: string;
        embeddingStatus: string;
        embeddingAttempts: number;
        embeddingModel: string | null;
        embeddingContentHash: string | null;
      }>
    >(
      `SELECT
         "id",
         "status"::text AS "status",
         "processingAttempts",
         "lastErrorCode",
         "lastErrorMessage",
         "processingStartedAt",
         "nextRetryAt",
         "quarantinedAt"
         ,"detectedDocumentType"::text AS "detectedDocumentType"
         ,"textExtractionMethod"::text AS "textExtractionMethod"
         ,"ocrStatus"::text AS "ocrStatus"
         ,"requiresManualReview"
         ,"intelligenceVersion"
         ,"embeddingStatus"::text AS "embeddingStatus"
         ,"embeddingAttempts"
         ,"embeddingModel"
         ,"embeddingContentHash"
       FROM "DocumentMetadata"
       WHERE "companyId" = 'integration-legacy'
       ORDER BY "id"`,
    );
    const byId = new Map(records.map((record) => [record.id, record]));
    if (
      byId.get('legacy-completed')?.status !== 'COMPLETED' ||
      byId.get('legacy-completed')?.processingAttempts !== 1
    ) {
      throw new Error('Legacy completed status was not migrated.');
    }
    if (
      byId.get('legacy-failed')?.status !== 'FAILED' ||
      byId.get('legacy-failed')?.lastErrorCode !== 'LEGACY_PROCESSING_ERROR' ||
      !byId.get('legacy-failed')?.lastErrorMessage
    ) {
      throw new Error('Legacy failed metadata was not normalized.');
    }
    if (byId.get('legacy-deleted')?.status !== 'DELETED') {
      throw new Error('Soft-deleted legacy metadata was not moved to DELETED.');
    }
    if (
      byId.get('legacy-attempts-null')?.processingAttempts !== 0 ||
      byId.get('legacy-attempts-negative')?.processingAttempts !== 0 ||
      byId.get('legacy-attempts-positive')?.processingAttempts !== 4
    ) {
      throw new Error('Legacy processing attempts were not normalized safely.');
    }
    for (const record of records) {
      if (
        record.processingStartedAt !== null ||
        record.nextRetryAt !== null ||
        record.quarantinedAt !== null
      ) {
        throw new Error('New nullable processing fields have unsafe legacy values.');
      }
      if (
        record.detectedDocumentType !== 'UNKNOWN' ||
        !record.requiresManualReview ||
        !record.intelligenceVersion
      ) {
        throw new Error('Document intelligence legacy defaults are unsafe.');
      }
      if (
        record.embeddingStatus !== 'PENDING' ||
        record.embeddingAttempts !== 0 ||
        record.embeddingModel !== null ||
        record.embeddingContentHash !== null
      ) {
        throw new Error('Embedding legacy defaults are unsafe.');
      }
    }

    const indexes = await verified.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'DocumentMetadata'`,
    );
    const indexNames = new Set(indexes.map((index) => index.indexname));
    if (
      !indexNames.has('DocumentMetadata_companyId_nextRetryAt_idx') ||
      !indexNames.has('DocumentMetadata_companyId_quarantinedAt_idx') ||
      !indexNames.has('DocumentMetadata_companyId_embeddingStatus_idx')
    ) {
      throw new Error('Processing indexes are missing after migration.');
    }

    await verified.$executeRawUnsafe(
      `DO $constraint_check$
       BEGIN
         BEGIN
           UPDATE "DocumentMetadata"
           SET "processingAttempts" = -1
           WHERE "companyId" = 'integration-legacy' AND "id" = 'legacy-completed';
           RAISE EXCEPTION 'processingAttempts constraint accepted a negative value';
         EXCEPTION
           WHEN check_violation THEN NULL;
         END;
       END
       $constraint_check$`,
    );
    const vectorIndexes = await verified.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'DocumentChunkEmbedding'`,
    );
    const vectorIndexNames = new Set(vectorIndexes.map((index) => index.indexname));
    if (
      !vectorIndexNames.has('DocumentChunkEmbedding_company_model_version_idx') ||
      !vectorIndexNames.has('DocumentChunkEmbedding_company_document_idx')
    ) {
      throw new Error('Tenant-aware vector indexes are missing after migration.');
    }
    const extension = await verified.$queryRawUnsafe<Array<{ extension: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) AS "extension"`,
    );
    if (!extension[0]?.extension) throw new Error('pgvector extension is missing.');
    await verified.$executeRawUnsafe(
      `DO $dimension_check$
       BEGIN
         BEGIN
           INSERT INTO "DocumentChunkEmbedding" (
             "companyId", "documentId", "chunkId", "chunkIndex", "contentHash",
             "contentPreview", "embeddingModel", "embeddingVersion",
             "dimensions", "embedding", "createdAt", "updatedAt"
           ) VALUES (
             'integration-legacy', 'legacy-completed', 'invalid-dimension', 0,
             'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
             'preview', 'rehearsal-model', 'rehearsal-v1', 3,
             '[1,2]'::vector, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
           );
           RAISE EXCEPTION 'vector dimension constraint accepted an invalid value';
         EXCEPTION
           WHEN check_violation THEN NULL;
         END;
       END
       $dimension_check$`,
    );
    const stagingBaseline = await verified.$queryRawUnsafe<
      Array<{
        outbox: boolean;
        indexing: boolean;
        notificationTrigger: boolean;
        knowledgeTrigger: boolean;
      }>
    >(
      `SELECT
         to_regclass('"NotificationOutbox"') IS NOT NULL AS "outbox",
         to_regclass('"KnowledgeIndexEvent"') IS NOT NULL
           AND to_regclass('"KnowledgeSearchIndex"') IS NOT NULL
           AND to_regclass('"KnowledgeVectorIndex"') IS NOT NULL AS "indexing",
         EXISTS(
           SELECT 1 FROM pg_trigger
           WHERE tgname = 'GovernanceNotification_enqueue_outbox' AND NOT tgisinternal
         ) AS "notificationTrigger",
         EXISTS(
           SELECT 1 FROM pg_trigger
           WHERE tgname = 'KnowledgeArticle_enqueue_index_event' AND NOT tgisinternal
         ) AS "knowledgeTrigger"`,
    );
    if (
      !stagingBaseline[0]?.outbox ||
      !stagingBaseline[0]?.indexing ||
      !stagingBaseline[0]?.notificationTrigger ||
      !stagingBaseline[0]?.knowledgeTrigger
    ) {
      throw new Error('TASK-015 staging pipeline schema is incomplete after migration.');
    }
  } finally {
    await verified.$disconnect();
  }
}

async function main() {
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  const safety = assertSafeDocumentIntegrationEnvironment(environment);
  const schema = path.join(repositoryRoot, 'packages', 'database', 'prisma', 'schema.prisma');
  const migrationsDirectory = path.join(
    repositoryRoot,
    'packages',
    'database',
    'prisma',
    'migrations',
  );
  const emptyDatabase = `${safety.databaseName}_rehearsal_empty`;
  const legacyDatabase = `${safety.databaseName}_rehearsal_legacy`;
  assertSafeDatabaseIdentifier(emptyDatabase);
  assertSafeDatabaseIdentifier(legacyDatabase);

  const adminUrl = new URL(safety.databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = await createPrismaClient(adminUrl.toString());

  try {
    await createDatabase(admin, emptyDatabase);
    await createDatabase(admin, legacyDatabase);
    await rehearseEmptyDatabase({
      repositoryRoot,
      schema,
      migrationsDirectory,
      environment,
      targetDatabaseUrl: databaseUrl(safety.databaseUrl, emptyDatabase),
    });
    await rehearseLegacyDatabase({
      repositoryRoot,
      schema,
      migrationsDirectory,
      environment,
      targetDatabaseUrl: databaseUrl(safety.databaseUrl, legacyDatabase),
    });
  } finally {
    await dropDatabase(admin, emptyDatabase);
    await dropDatabase(admin, legacyDatabase);
    await admin.$disconnect();
  }

  console.info(
    JSON.stringify({
      status: 'completed',
      emptyDatabase: 'verified-and-removed',
      legacyDatabase: 'verified-and-removed',
      repeatedDeploy: 'verified',
    }),
  );
}

void main().catch(() => {
  console.error('Document migration rehearsal failed.');
  process.exitCode = 1;
});
