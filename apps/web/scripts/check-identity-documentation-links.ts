import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const documents = [
  'README.md',
  'docs/IDENTITY_ARCHITECTURE.md',
  'docs/IDENTITY_PRODUCTION_CEREMONY.md',
  'docs/authentication.md',
  'docs/SECURITY_HARDENING.md',
  'docs/PORTAL_ARCHITECTURE.md',
  'docs/TESTING.md',
  'docs/BROWSER_TESTING.md',
  'docs/DECISIONS.md',
  'docs/ROADMAP.md',
  'docs/PRODUCT_BACKLOG.md',
  'docs/PROJECT_STATUS.md',
  'docs/tasks/README.md',
  'docs/tasks/TASK-009.md',
];

async function main() {
  const missing: string[] = [];
  for (const document of documents) {
    const absolute = path.join(repositoryRoot, document);
    const content = await readFile(absolute, 'utf8');
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      const target = match[1];
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('#') ||
        target.startsWith('mailto:')
      ) {
        continue;
      }
      const relativeTarget = target.split('#')[0];
      if (!relativeTarget) continue;
      try {
        await access(path.resolve(path.dirname(absolute), relativeTarget));
      } catch {
        missing.push(`${document}: ${target}`);
      }
    }
  }
  if (missing.length > 0) {
    throw new Error(`Missing documentation links:\n${missing.join('\n')}`);
  }
  console.log(JSON.stringify({ status: 'passed', documents: documents.length }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Documentation link check failed.');
  process.exitCode = 1;
});
