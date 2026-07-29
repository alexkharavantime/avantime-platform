import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

function run(
  command: string,
  arguments_: string[],
  options: { cwd: string; environment: NodeJS.ProcessEnv; input?: Buffer; capture?: boolean },
) {
  return new Promise<Buffer>((resolve, reject) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.environment,
      shell: false,
      stdio: [options.input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout.push(chunk);
      if (!options.capture) process.stdout.write(chunk);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
      if (!options.capture) process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else reject(new Error(Buffer.concat(stderr).toString('utf8') || `${command} failed.`));
    });
    if (options.input) child.stdin?.end(options.input);
  });
}

async function main() {
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'avantime-restore-rehearsal-'));
  const archive = path.join(temporaryDirectory, 'integration.dump');
  const compose = [
    'compose',
    '--env-file',
    '.env.integration',
    '-p',
    'avantime-integration',
    '-f',
    'docker-compose.integration.yml',
  ];
  const user = environment.POSTGRES_USER ?? 'avantime_test';
  const database = environment.POSTGRES_DB ?? 'avantime_integration';
  try {
    const dump = await run(
      'docker',
      [...compose, 'exec', '-T', 'postgres', 'pg_dump', '-U', user, '-d', database, '-Fc'],
      { cwd: repositoryRoot, environment, capture: true },
    );
    await writeFile(archive, dump, { flag: 'wx', mode: 0o600 });
    await run(
      'docker',
      [...compose, '--profile', 'restore', 'up', '-d', '--wait', 'postgres-restore'],
      { cwd: repositoryRoot, environment },
    );
    const storedArchive = await readFile(archive);
    await run(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        'postgres-restore',
        'pg_restore',
        '-U',
        user,
        '-d',
        'avantime_restore_rehearsal',
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-acl',
        '--exit-on-error',
      ],
      { cwd: repositoryRoot, environment, input: storedArchive },
    );
    const verification = await run(
      'docker',
      [
        ...compose,
        'exec',
        '-T',
        'postgres-restore',
        'psql',
        '-U',
        user,
        '-d',
        'avantime_restore_rehearsal',
        '-Atc',
        `SELECT COUNT(*) FROM "_prisma_migrations";
         SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';`,
      ],
      { cwd: repositoryRoot, environment, capture: true },
    );
    const [migrationCount, tableCount] = verification
      .toString('utf8')
      .trim()
      .split(/\s+/)
      .map(Number);
    if (migrationCount < 5 || tableCount < 1) {
      throw new Error('Restore verification did not find the expected schema and migrations.');
    }
    console.log(
      JSON.stringify({
        status: 'completed',
        component: 'restore-rehearsal',
        targetDatabase: 'avantime_restore_rehearsal',
        migrationCount,
        tableCount,
        archiveBytes: storedArchive.length,
      }),
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

void main().catch(() => {
  console.error(
    JSON.stringify({
      status: 'failed',
      component: 'restore-rehearsal',
      errorCode: 'RESTORE_REHEARSAL_FAILED',
    }),
  );
  process.exitCode = 1;
});
