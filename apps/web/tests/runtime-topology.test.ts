import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import nextConfig, { repositoryRoot as configuredRepositoryRoot } from '../next.config';
import { CURRENT_STAGING_MIGRATION } from '../lib/staging-configuration';

const repositoryRoot = new URL('../../..', import.meta.url);

async function repositoryFile(path: string) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

const workers = [
  'document-worker',
  'embedding-worker',
  'notification-worker',
  'jira-worker',
  'jira-inbound-worker',
  'knowledge-index-worker',
] as const;

test('staging and production reference manifests contain the canonical worker topology', async () => {
  const [staging, production, dockerfile] = await Promise.all([
    repositoryFile('docker-compose.staging.yml'),
    repositoryFile('docker-compose.production.example.yml'),
    repositoryFile('docker/production.Dockerfile'),
  ]);
  const normalizedStaging = staging.replace(/\r\n/gu, '\n');

  for (const worker of workers) {
    assert.match(staging, new RegExp(`^  ${worker}:`, 'mu'));
    assert.match(production, new RegExp(`^  ${worker}:`, 'mu'));
    assert.match(dockerfile, new RegExp(`^FROM worker-base AS ${worker}$`, 'mu'));
  }
  assert.match(normalizedStaging, /check-staging-worker\.ts', 'document'/u);
  assert.match(normalizedStaging, /check-staging-worker\.ts', 'embedding'/u);
  assert.match(normalizedStaging, /document-worker:\n\s+condition: service_healthy/u);
  assert.match(normalizedStaging, /embedding-worker:\n\s+condition: service_healthy/u);
  assert.match(production, /api\/health\/documents\?mode=readiness/u);
  assert.doesNotMatch(production, /task-00[1-9]|task-01[0-8]/u);
});

test('production manifest migration runs the image Prisma CLI, not npm/npx removed from the image', async () => {
  const [production, dockerfile] = await Promise.all([
    repositoryFile('docker-compose.production.example.yml'),
    repositoryFile('docker/production.Dockerfile'),
  ]);
  const migrationStage = dockerfile.slice(
    dockerfile.indexOf('AS migration'),
    dockerfile.indexOf('FROM dependencies AS builder'),
  );
  assert.match(migrationStage, /rm -f \/usr\/local\/bin\/npm \/usr\/local\/bin\/npx/u);
  const migration = production.replace(/\r\n/gu, '\n').match(/^  migration:\n((?: {4}.*\n|\n)+)/mu);
  assert.ok(migration, 'migration service');
  assert.doesNotMatch(migration[1], /'(npx|npm)'/u);
  assert.match(
    migration[1].replace(/\s+/gu, ' '),
    /command: \[ 'node_modules\/\.bin\/prisma', 'migrate', 'deploy', '--schema', 'packages\/database\/prisma\/schema\.prisma', \]/u,
  );
});

test('production backup runs the backup script with node and tsx, not npm removed from the image', async () => {
  const [production, dockerfile, webPackage] = await Promise.all([
    repositoryFile('docker-compose.production.example.yml'),
    repositoryFile('docker/production.Dockerfile'),
    repositoryFile('apps/web/package.json'),
  ]);
  const workerBase = dockerfile.slice(
    dockerfile.indexOf('AS worker-base'),
    dockerfile.indexOf('FROM worker-base AS document-worker'),
  );
  assert.match(workerBase, /rm -f \/usr\/local\/bin\/npm \/usr\/local\/bin\/npx/u);
  assert.match(workerBase, /^WORKDIR \/workspace$/mu);
  assert.match(
    dockerfile.replace(/\r\n/gu, '\n'),
    /^FROM worker-base AS operations\nUSER root\n[\s\S]*?USER 10001:10001$/mu,
  );
  const normalized = production.replace(/\r\n/gu, '\n');
  const service = (name: string) =>
    normalized.match(new RegExp(`^  ${name}:\\n((?: {4}.*\\n|\\n)+)`, 'mu'))?.[1];
  const backup = service('backup');
  assert.ok(backup, 'backup service');
  assert.match(backup, /PRODUCTION_OPERATIONS_IMAGE/u);
  assert.match(backup, /- backup-data:\/var\/lib\/avantime-backups/u);
  // The runtime user 10001 writes the tsx cache to /tmp and the archives to the volume.
  assert.match(backup, /- \/tmp:size=\d+m,uid=10001,gid=10001,mode=0700/u);
  assert.match(backup, /backup-volume-init:\n\s+condition: service_completed_successfully/u);
  const init = service('backup-volume-init');
  assert.ok(init, 'backup volume init service');
  assert.match(init, /command: \['chown', '10001:10001', '\/var\/lib\/avantime-backups'\]/u);
  assert.match(init, /- backup-data:\/var\/lib\/avantime-backups/u);
  assert.match(init, /network_mode: none/u);
  assert.doesNotMatch(backup, /'(npx|npm)'/u);
  // The command must run the same script as the npm entry point.
  const script = (JSON.parse(webPackage) as { scripts: Record<string, string> }).scripts[
    'backup:create'
  ];
  assert.equal(script, 'tsx scripts/backup-production.ts');
  assert.match(
    backup,
    /command: \['node', '--import', 'tsx', 'apps\/web\/scripts\/backup-production\.ts', '--execute'\]/u,
  );
});

test('production workers get a private /tmp owned by the worker image user', async () => {
  const [production, dockerfile] = await Promise.all([
    repositoryFile('docker-compose.production.example.yml'),
    repositoryFile('docker/production.Dockerfile'),
  ]);
  const image = dockerfile.replace(/\r\n/gu, '\n');
  const workerBase = image.slice(
    image.indexOf('AS worker-base'),
    image.indexOf('FROM worker-base AS document-worker'),
  );
  assert.match(workerBase, /^USER 10001:10001$/mu);
  const normalized = production.replace(/\r\n/gu, '\n');
  const anchor = normalized.match(/^x-worker-runtime: &worker-runtime\n((?: {2}.*\n)+)/mu)?.[1];
  assert.ok(anchor, 'worker runtime anchor');
  assert.match(anchor, /^ {2}<<: \*runtime$/mu);
  // tsx writes its compile cache to /tmp at start; a root-owned 1770 tmpfs fails with EACCES.
  assert.match(anchor, /- \/tmp:size=\d+m,uid=10001,gid=10001,mode=0700/u);
  for (const worker of workers) {
    const block = normalized.match(new RegExp(`^  ${worker}:\\n((?: {4}.*\\n|\\n)+)`, 'mu'))?.[1];
    assert.ok(block, worker);
    assert.match(block, /^ {4}<<: \*worker-runtime$/mu, worker);
    assert.doesNotMatch(block, /tmpfs:/u, worker);
  }
});

test('identity core baseline precedes migrations that extend User', async () => {
  const migrationDirectory = new URL(
    'packages/database/prisma/migrations/',
    repositoryRoot,
  );
  const migrations = (await readdir(migrationDirectory)).sort();
  const baselineIndex = migrations.indexOf('20260730000000_identity_core_baseline');
  const identityIndex = migrations.indexOf('20260730120000_production_identity');
  const baseline = await repositoryFile(
    'packages/database/prisma/migrations/20260730000000_identity_core_baseline/migration.sql',
  );

  assert.ok(baselineIndex >= 0 && baselineIndex < identityIndex);
  assert.match(baseline, /CREATE TYPE "UserRole" AS ENUM/u);
  assert.match(baseline, /CREATE TABLE IF NOT EXISTS "Company"/u);
  assert.match(baseline, /CREATE TABLE IF NOT EXISTS "User"/u);
});

test('local smoke and managed preflight are separate fail-closed commands', async () => {
  const [rootPackage, webPackage, smoke, staging, localEnvironment] = await Promise.all([
    repositoryFile('package.json'),
    repositoryFile('apps/web/package.json'),
    repositoryFile('apps/web/scripts/run-staging-smoke.ts'),
    repositoryFile('docker-compose.staging.yml'),
    repositoryFile('.env.staging.local.example'),
  ]);

  for (const source of [rootPackage, webPackage]) {
    assert.match(source, /"staging:smoke:local"/u);
    assert.match(source, /"staging:preflight:managed"/u);
  }
  assert.match(smoke, /LOCAL_STAGING_SMOKE_MODE_REQUIRED/u);
  assert.match(smoke, /LOCAL_STAGING_SMOKE_TEST_PROVIDERS_REQUIRED/u);
  assert.match(smoke, /document-upload/u);
  assert.match(smoke, /document-retrieval-citation/u);
  assert.match(rootPackage, /run-with-git-commit-sha\.ts/u);
  assert.match(staging, /COMMIT_SHA: \$\{COMMIT_SHA:\?COMMIT_SHA is required\}/u);
  assert.doesNotMatch(localEnvironment, /COMMIT_SHA="local-validation"/u);
});

test('staging current migration is the newest repository migration', async () => {
  const migrations = (
    await readdir(new URL('packages/database/prisma/migrations/', repositoryRoot), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.equal(CURRENT_STAGING_MIGRATION, migrations.at(-1));
});

test('tracked staging templates use the current migration and no stale task release marker', async () => {
  const [managed, local] = await Promise.all([
    repositoryFile('.env.staging.example'),
    repositoryFile('.env.staging.local.example'),
  ]);
  for (const source of [managed, local]) {
    assert.match(source, /20261104120000_portal_settings_email_system_events/u);
    assert.doesNotMatch(source, /20260803180000_jira_status_comment_sync|task-016-local/u);
  }
});

test('document worker exits immediately after a fatal runtime failure', async () => {
  const source = await repositoryFile('apps/web/scripts/run-document-worker.ts');

  assert.match(source, /void main\(\)\.catch\(\(\) => \{[\s\S]*process\.exit\(1\);[\s\S]*\}\);/u);
  assert.doesNotMatch(source, /process\.exitCode\s*=/u);
});

test('Next.js tracing and Turbopack roots are pinned to the repository', async () => {
  const expectedRepositoryRoot = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  assert.equal(configuredRepositoryRoot, expectedRepositoryRoot);
  assert.equal(nextConfig.outputFileTracingRoot, expectedRepositoryRoot);
  assert.equal(nextConfig.turbopack?.root, expectedRepositoryRoot);
  assert.doesNotMatch(await repositoryFile('apps/web/next.config.ts'), /\/Users\//u);
});
