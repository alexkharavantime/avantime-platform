import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import nextConfig, { repositoryRoot as configuredRepositoryRoot } from '../next.config';

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

test('tracked staging templates use the current migration and no stale task release marker', async () => {
  const [managed, local] = await Promise.all([
    repositoryFile('.env.staging.example'),
    repositoryFile('.env.staging.local.example'),
  ]);
  for (const source of [managed, local]) {
    assert.match(source, /20260902120000_task_018_knowledge_delete_lifecycle/u);
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
