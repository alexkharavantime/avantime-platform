import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function run(arguments_: string[], input?: Buffer, capture = false) {
  return new Promise<Buffer>((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const child = spawn('docker', arguments_, {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    child.stdout!.on('data', (chunk: Buffer) => {
      stdout.push(chunk);
      if (!capture) process.stdout.write(chunk);
    });
    child.stderr!.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
      if (!capture) process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else
        reject(
          new Error(Buffer.concat(stderr).toString('utf8') || 'STAGING_RESTORE_COMMAND_FAILED'),
        );
    });
    if (input) child.stdin!.end(input);
  });
}

async function main() {
  if (process.env.STAGING_MODE !== 'local') throw new Error('STAGING_RESTORE_LOCAL_ONLY');
  const directory = await mkdtemp(path.join(tmpdir(), 'avantime-staging-restore-'));
  const archive = path.join(directory, 'staging.dump');
  const compose = [
    'compose',
    '--env-file',
    '.env.staging',
    '-p',
    'avantime-staging',
    '-f',
    'docker-compose.staging.yml',
    '-f',
    'docker-compose.staging.local.yml',
  ];
  const user = process.env.POSTGRES_USER ?? 'avantime_staging_local';
  const database = process.env.POSTGRES_DB ?? 'avantime_staging_local';
  try {
    const dump = await run(
      [...compose, 'exec', '-T', 'postgres', 'pg_dump', '-U', user, '-d', database, '-Fc'],
      undefined,
      true,
    );
    await writeFile(archive, dump, { flag: 'wx', mode: 0o600 });
    await run([...compose, '--profile', 'restore', 'up', '-d', '--wait', 'postgres-restore']);
    const stored = await readFile(archive);
    await run(
      [
        ...compose,
        'exec',
        '-T',
        'postgres-restore',
        'pg_restore',
        '-U',
        user,
        '-d',
        'avantime_staging_restore_rehearsal',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
      ],
      stored,
    );
    const verification = await run(
      [
        ...compose,
        'exec',
        '-T',
        'postgres-restore',
        'psql',
        '-U',
        user,
        '-d',
        'avantime_staging_restore_rehearsal',
        '-Atc',
        `SELECT COUNT(*) FROM "_prisma_migrations";
         SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
         SELECT COUNT(*) FROM information_schema.tables
           WHERE table_name IN ('NotificationOutbox', 'KnowledgeIndexEvent');`,
      ],
      undefined,
      true,
    );
    const [migrations, tables, stagingTables] = verification
      .toString('utf8')
      .trim()
      .split(/\s+/u)
      .map(Number);
    if (migrations < 1 || tables < 1 || stagingTables !== 2) {
      throw new Error('STAGING_RESTORE_INVARIANTS_FAILED');
    }
    console.info(
      JSON.stringify({
        status: 'passed',
        target: 'avantime_staging_restore_rehearsal',
        migrations,
        tables,
        stagingTables,
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error instanceof Error ? error.message : 'STAGING_RESTORE_FAILED',
    }),
  );
  process.exitCode = 1;
});
