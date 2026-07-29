import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { getRepositoryRoot } from './document-integration-environment';

const repositoryRoot = getRepositoryRoot();
const markdownLinkPattern = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;

async function collectMarkdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return collectMarkdownFiles(target);
      return entry.isFile() && entry.name.endsWith('.md') ? [target] : [];
    }),
  );
  return files.flat();
}

function resolveLocalTarget(source: string, rawTarget: string) {
  const withoutTitle = rawTarget.trim().replace(/\s+["'][^"']*["']$/, '');
  const decoded = decodeURIComponent(withoutTitle.split('#', 1)[0]);
  if (
    !decoded ||
    decoded.startsWith('#') ||
    /^[a-z][a-z0-9+.-]*:/i.test(decoded) ||
    decoded.startsWith('//')
  ) {
    return null;
  }
  return path.resolve(path.dirname(source), decoded);
}

async function exists(target: string) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const files = [
    path.join(repositoryRoot, 'README.md'),
    ...(await collectMarkdownFiles(path.join(repositoryRoot, 'docs'))),
  ];
  const failures: Array<{ source: string; target: string }> = [];
  let checked = 0;

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const match of content.matchAll(markdownLinkPattern)) {
      const rawTarget = match[1];
      const target = resolveLocalTarget(file, rawTarget);
      if (!target) continue;
      checked += 1;
      if (!(await exists(target))) {
        failures.push({
          source: path.relative(repositoryRoot, file),
          target: rawTarget,
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        status: failures.length === 0 ? 'passed' : 'failed',
        files: files.length,
        localLinksChecked: checked,
        failures,
      },
      null,
      2,
    ),
  );
  if (failures.length > 0) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      errorCode: 'DOCUMENTATION_LINK_CHECK_FAILED',
      message: error instanceof Error ? error.message : 'Documentation link check failed.',
    }),
  );
  process.exitCode = 1;
});
