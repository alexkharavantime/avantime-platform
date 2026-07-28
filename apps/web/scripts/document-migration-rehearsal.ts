import path from 'node:path';

import {
  assertSafeDocumentIntegrationEnvironment,
  loadDocumentIntegrationEnvironment,
  runIntegrationCommand,
} from './document-integration-environment';

const FIRST_MIGRATION = '20260727150000_document_metadata_persistence';

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

async function rehearseEmptyDatabase(options: {
  repositoryRoot: string;
  schema: string;
  environment: NodeJS.ProcessEnv;
  targetDatabaseUrl: string;
}) {
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
    if (Number(migrations[0]?.count ?? 0) !== 2) {
      throw new Error('Empty database did not apply exactly two document migrations.');
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
      `INSERT INTO "DocumentMetadata"
        ("id", "companyId", "uploadedBy", "originalName", "storedName", "mimeType",
         "size", "status", "checksum", "createdAt", "updatedAt", "deletedAt")
       VALUES
        ('legacy-completed', 'integration-legacy', 'integration-user',
         'completed.pdf', 'completed.pdf', 'application/pdf', 10, 'PROCESSED',
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
        ('legacy-failed', 'integration-legacy', 'integration-user',
         'failed.pdf', 'failed.pdf', 'application/pdf', 10, 'FAILED',
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL),
        ('legacy-deleted', 'integration-legacy', 'integration-user',
         'deleted.pdf', 'deleted.pdf', 'application/pdf', 10, 'PROCESSED',
         $1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
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
    for (const record of records) {
      if (
        record.processingStartedAt !== null ||
        record.nextRetryAt !== null ||
        record.quarantinedAt !== null
      ) {
        throw new Error('New nullable processing fields have unsafe legacy values.');
      }
    }

    const indexes = await verified.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'DocumentMetadata'`,
    );
    const indexNames = new Set(indexes.map((index) => index.indexname));
    if (
      !indexNames.has('DocumentMetadata_companyId_nextRetryAt_idx') ||
      !indexNames.has('DocumentMetadata_companyId_quarantinedAt_idx')
    ) {
      throw new Error('Processing indexes are missing after migration.');
    }

    let negativeAttemptsRejected = false;
    try {
      await verified.$executeRawUnsafe(
        `UPDATE "DocumentMetadata"
         SET "processingAttempts" = -1
         WHERE "companyId" = 'integration-legacy' AND "id" = 'legacy-completed'`,
      );
    } catch {
      negativeAttemptsRejected = true;
    }
    if (!negativeAttemptsRejected) {
      throw new Error('processingAttempts constraint did not reject a negative value.');
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
