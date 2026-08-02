import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);

async function main() {
  const repositoryRoot = new URL('../../..', import.meta.url);
  const { stdout } = await execute(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: repositoryRoot, encoding: 'buffer' },
  );
  const files = stdout.toString('utf8').split('\0').filter(Boolean);
  const findings: string[] = [];
  if (files.some((file) => /^\.env\.staging$/u.test(file))) {
    findings.push('.env.staging: rendered staging credentials must not be tracked');
  }
  const requiredFiles = [
    '.env.staging.example',
    'docker-compose.staging.yml',
    'docker-compose.staging.local.yml',
    'apps/web/lib/staging-configuration.ts',
    'apps/web/lib/notification-outbox.ts',
    'apps/web/lib/jira-configuration.ts',
    'apps/web/lib/jira-outbox.ts',
    'apps/web/lib/knowledge-index-worker.ts',
  ];
  for (const file of requiredFiles) {
    if (!files.includes(file)) findings.push(`${file}: staging baseline file missing`);
  }
  for (const file of files) {
    if (
      !/^(?:\.env\.staging.*\.example|docker-compose\.staging.*\.yml|apps\/web\/lib\/(?:staging-|notification-(?:outbox|providers|worker)|knowledge-index).*\.ts|apps\/web\/scripts\/(?:check-staging|run-staging|notification-outbox).*\.ts)$/u.test(
        file,
      )
    ) {
      continue;
    }
    const content = await readFile(new URL(file, repositoryRoot), 'utf8').catch(() => '');
    if (
      file !== 'apps/web/scripts/staging-security-scan.ts' &&
      /\b(?:reset|dropdb|TRUNCATE\s+TABLE|DROP\s+DATABASE)\b/iu.test(content)
    ) {
      findings.push(`${file}: destructive database reset command is forbidden`);
    }
    if (
      /console\.(?:log|info|warn|error)\([^\n]*(?:recipientUserId|recipientReference|email|RESEND_API_KEY|OBJECT_STORAGE_SECRET_KEY)/u.test(
        content,
      )
    ) {
      findings.push(`${file}: notification recipient or secret may be logged`);
    }
    if (/^\s*-\s*['"]?\d{2,5}:\d{2,5}['"]?\s*$/mu.test(content)) {
      findings.push(`${file}: staging port must bind loopback in the local simulation`);
    }
  }
  const outbox = await readFile(
    new URL('apps/web/lib/notification-outbox.ts', repositoryRoot),
    'utf8',
  );
  for (const marker of [
    'idempotencyKey',
    'FOR UPDATE SKIP LOCKED',
    'DEAD_LETTER',
    'notificationBackoffMs',
    'NOTIFICATION_LEASE_LOST',
  ]) {
    if (!outbox.includes(marker)) findings.push(`notification-outbox: missing ${marker}`);
  }
  const jiraOutbox = await readFile(new URL('apps/web/lib/jira-outbox.ts', repositoryRoot), 'utf8');
  for (const marker of [
    'FOR UPDATE SKIP LOCKED',
    'idempotencyKey',
    'DEAD_LETTER',
    'jiraBackoffMs',
    'JIRA_LEASE_LOST',
  ]) {
    if (!jiraOutbox.includes(marker)) findings.push(`jira-outbox: missing ${marker}`);
  }
  const indexing = await readFile(
    new URL('apps/web/lib/knowledge-index-worker.ts', repositoryRoot),
    'utf8',
  );
  for (const marker of [
    'FOR UPDATE SKIP LOCKED',
    'DEAD_LETTER',
    'sourceVersion',
    'KNOWLEDGE_INDEX_LEASE_LOST',
  ]) {
    if (!indexing.includes(marker)) findings.push(`knowledge-index-worker: missing ${marker}`);
  }
  const configuration = await readFile(
    new URL('apps/web/lib/staging-configuration.ts', repositoryRoot),
    'utf8',
  );
  for (const marker of [
    "environment.APP_ENV !== 'staging'",
    'DATABASE_NAME_NOT_STAGING',
    'REDIS_NAMESPACE_NOT_STAGING',
    'loadJiraConfiguration',
  ]) {
    if (!configuration.includes(marker)) findings.push(`staging-configuration: missing ${marker}`);
  }
  console.info(JSON.stringify({ status: findings.length === 0 ? 'passed' : 'failed', findings }));
  if (findings.length > 0) process.exitCode = 1;
}

void main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', code: 'STAGING_SECURITY_SCAN_FAILED' }));
  process.exitCode = 1;
});
