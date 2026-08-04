import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const documents = [
  'README.md',
  'docs/STAGING_INFRASTRUCTURE.md',
  'docs/STAGING_DEPLOYMENT.md',
  'docs/NOTIFICATION_OUTBOX.md',
  'docs/KNOWLEDGE_INDEXING.md',
  'docs/BACKUP_RESTORE.md',
  'docs/runbooks/staging-deploy.md',
  'docs/runbooks/staging-rollback.md',
  'docs/runbooks/notification-outbox.md',
  'docs/runbooks/knowledge-reindex.md',
  'docs/JIRA_INTEGRATION.md',
  'docs/JIRA_WEBHOOKS.md',
  'docs/runbooks/jira-worker.md',
  'docs/runbooks/jira-webhooks.md',
  'docs/tasks/TASK-015.md',
  'docs/tasks/TASK-016.md',
  'docs/tasks/TASK-017.md',
];

async function main() {
  const missing: string[] = [];
  for (const file of documents) {
    const absolute = path.join(repositoryRoot, file);
    const source = await readFile(absolute, 'utf8');
    const links = [...source.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/gu)].map(
      (match) => match[1]!,
    );
    for (const link of links) {
      if (/^[a-z]+:/iu.test(link)) continue;
      const target = path.resolve(path.dirname(absolute), decodeURIComponent(link));
      await access(target).catch(() => missing.push(`${file} -> ${link}`));
    }
    if (file !== 'README.md' && !source.includes('## Связанные документы')) {
      missing.push(`${file} -> missing final related documents section`);
    }
  }
  console.info(JSON.stringify({ status: missing.length === 0 ? 'passed' : 'failed', missing }));
  if (missing.length > 0) process.exitCode = 1;
}

void main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', code: 'STAGING_DOCUMENTATION_CHECK_FAILED' }));
  process.exitCode = 1;
});
