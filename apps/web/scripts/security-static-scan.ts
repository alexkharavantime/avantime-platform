import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
async function main() {
  const mode = process.argv[2];
  const repositoryRoot = new URL('../../..', import.meta.url);
  const { stdout } = await execute(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: repositoryRoot,
      encoding: 'buffer',
    },
  );
  const files = stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .filter((file) => !file.endsWith('package-lock.json'));
  const findings: string[] = [];

  for (const file of files) {
    if (mode === 'migrations' && !file.endsWith('/migration.sql')) continue;
    if (
      mode === 'architecture' &&
      !file.startsWith('apps/web/') &&
      file !== 'docker-compose.staging.yml'
    ) {
      continue;
    }
    let content: string;
    try {
      content = await readFile(new URL(file, repositoryRoot), 'utf8');
    } catch {
      continue;
    }
    if (
      mode === 'secrets' &&
      !file.endsWith('.example') &&
      /(?:sk-[a-zA-Z0-9]{20,}|AIza[a-zA-Z0-9_-]{20,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/.test(
        content,
      )
    ) {
      findings.push(`${file}: possible credential`);
    }
    if (
      mode === 'migrations' &&
      /\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE)|TRUNCATE\s+TABLE)\b/i.test(content)
    ) {
      findings.push(`${file}: destructive migration statement`);
    }
    if (
      mode === 'architecture' &&
      /from\s+['"](?:openai|@google\/genai)['"]/.test(content) &&
      file !== 'apps/web/lib/ai-gateway.ts'
    ) {
      findings.push(`${file}: direct AI provider import outside AI Gateway`);
    }
    if (
      mode === 'architecture' &&
      file.includes('/app/api/') &&
      /companyId\s*:\s*(?:body|input|payload|request)\.companyId/.test(content)
    ) {
      findings.push(`${file}: client-supplied companyId reaches a server operation`);
    }
    if (
      mode === 'architecture' &&
      file === 'docker-compose.staging.yml' &&
      /-\s*['"]?(?:5432|6379|9000|9090|4317|4318):/.test(content)
    ) {
      findings.push(`${file}: internal service port is publicly published`);
    }
  }

  console.log(
    JSON.stringify({
      status: findings.length === 0 ? 'passed' : 'failed',
      mode,
      findings,
    }),
  );
  if (findings.length > 0) process.exitCode = 1;
}

void main().catch(() => {
  console.error(JSON.stringify({ status: 'failed', errorCode: 'STATIC_SCAN_FAILED' }));
  process.exitCode = 1;
});
