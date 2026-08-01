import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  loadDocumentIntegrationEnvironment,
  runIntegrationCommand,
} from './document-integration-environment';

const FIRST_MIGRATION = '20260727150000_document_metadata_persistence';

type IntegrationPrismaClient = {
  $queryRawUnsafe<T>(query: string): Promise<T>;
  $disconnect(): Promise<void>;
};

async function createPrismaClient(databaseUrl: string): Promise<IntegrationPrismaClient> {
  const load = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<{ PrismaClient: new (options: object) => IntegrationPrismaClient }>;
  const { PrismaClient } = await load('@prisma/client');
  return new PrismaClient({ datasourceUrl: databaseUrl, log: ['error'] });
}

async function prepareLegacyAccountBaseline(
  repositoryRoot: string,
  schema: string,
  environment: NodeJS.ProcessEnv,
) {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error('Integration DATABASE_URL is missing.');
  const client = await createPrismaClient(databaseUrl);
  let state: { userTable: boolean; migrationsTable: boolean };
  try {
    const rows = await client.$queryRawUnsafe<
      Array<{ userTable: boolean; migrationsTable: boolean }>
    >(
      `SELECT
         to_regclass('"User"') IS NOT NULL AS "userTable",
         to_regclass('"_prisma_migrations"') IS NOT NULL AS "migrationsTable"`,
    );
    state = rows[0] ?? { userTable: false, migrationsTable: false };
  } finally {
    await client.$disconnect();
  }
  if (!state.userTable) {
    await runIntegrationCommand(
      'npx',
      [
        'prisma',
        'db',
        'execute',
        '--file',
        path.join(
          repositoryRoot,
          'apps',
          'web',
          'tests',
          'fixtures',
          'legacy-account-baseline.sql',
        ),
        '--schema',
        schema,
      ],
      { cwd: repositoryRoot, environment },
    );
  }
  if (!state.migrationsTable) {
    await runIntegrationCommand(
      'npx',
      [
        'prisma',
        'db',
        'execute',
        '--file',
        path.join(
          repositoryRoot,
          'packages',
          'database',
          'prisma',
          'migrations',
          FIRST_MIGRATION,
          'migration.sql',
        ),
        '--schema',
        schema,
      ],
      { cwd: repositoryRoot, environment },
    );
    await runIntegrationCommand(
      'npx',
      ['prisma', 'migrate', 'resolve', '--applied', FIRST_MIGRATION, '--schema', schema],
      { cwd: repositoryRoot, environment },
    );
  }
}

async function main() {
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  const integrationRunSource = process.env.GITHUB_RUN_ID
    ? [
        'github',
        process.env.GITHUB_RUN_ID,
        process.env.GITHUB_RUN_ATTEMPT ?? '1',
        process.env.GITHUB_JOB ?? 'integration',
      ].join(':')
    : `local:${process.pid}`;
  environment.AVANTIME_INTEGRATION_RUN_ID = createHash('sha256')
    .update(integrationRunSource)
    .digest('hex')
    .slice(0, 24);
  const schema = path.join(repositoryRoot, 'packages', 'database', 'prisma', 'schema.prisma');
  const integrationTestsDirectory = path.join(
    repositoryRoot,
    'apps',
    'web',
    'tests',
    'integration',
  );
  const tests = (await readdir(integrationTestsDirectory))
    .filter(
      (file) =>
        file.endsWith('.integration.test.ts') && file !== 'document-ocr.integration.test.ts',
    )
    .sort()
    .map((file) => path.join(integrationTestsDirectory, file));
  if (tests.length === 0) {
    throw new Error('No document integration tests were found.');
  }

  await prepareLegacyAccountBaseline(repositoryRoot, schema, environment);
  await runIntegrationCommand('npx', ['prisma', 'migrate', 'deploy', '--schema', schema], {
    cwd: repositoryRoot,
    environment,
  });
  await runIntegrationCommand('npx', ['tsx', '--test', ...tests], {
    cwd: repositoryRoot,
    environment,
  });
}

void main().catch(() => {
  console.error('Document integration tests failed.');
  process.exitCode = 1;
});
