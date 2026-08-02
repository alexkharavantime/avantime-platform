import { getPrisma } from '@avantime/database';

import { loadStagingConfiguration } from '../lib/staging-configuration';

async function main() {
  const configuration = loadStagingConfiguration();
  const prisma = await getPrisma();
  if (!prisma) throw new Error('STAGING_MIGRATION_DATABASE_UNAVAILABLE');
  const rows = (await prisma.$queryRaw`
    SELECT "migration_name", "finished_at", "rolled_back_at", "logs"
    FROM "_prisma_migrations"
    ORDER BY "started_at" DESC
  `) as Array<{
    migration_name: string;
    finished_at: Date | null;
    rolled_back_at: Date | null;
    logs: string | null;
  }>;
  const failed = rows.filter((row) => !row.finished_at && !row.rolled_back_at);
  const current = rows.find((row) => row.finished_at && !row.rolled_back_at)?.migration_name;
  if (failed.length > 0) throw new Error('STAGING_MIGRATION_FAILED');
  if (current !== configuration.versions.migration) throw new Error('STAGING_MIGRATION_PENDING');
  console.info(
    JSON.stringify({
      status: 'passed',
      expected: configuration.versions.migration,
      current,
      applied: rows.filter((row) => row.finished_at).length,
    }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error instanceof Error ? error.message : 'STAGING_MIGRATION_CHECK_FAILED',
    }),
  );
  process.exitCode = 1;
});
