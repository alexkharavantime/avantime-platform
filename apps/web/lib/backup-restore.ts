import { spawn } from 'node:child_process';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export type BackupPlan = {
  environment: string;
  databaseHost: string;
  databaseName: string;
  outputDirectory: string;
  databaseArchive: string;
  manifestFile: string;
  encrypted: boolean;
  dryRun: boolean;
};

export type CompletedBackup = BackupPlan & {
  dryRun: false;
  bytes: number;
  sha256: string;
  sourceSha256: string;
};

const SAFE_ENVIRONMENT = /^[a-z0-9][a-z0-9-]{1,49}$/;
const REHEARSAL_DATABASE = /(?:^|[_-])restore[_-]rehearsal$/i;
const ENCRYPTED_ARCHIVE_MAGIC = Buffer.from('AVANTIME1');

function requireValue(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePostgresUrl(environment: Record<string, string | undefined>, name: string) {
  const raw = requireValue(environment, name);
  const url = new URL(raw);
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error(`${name} must use PostgreSQL.`);
  }
  const databaseName = url.pathname.replace(/^\/+/, '');
  if (!databaseName) throw new Error(`${name} must include a database name.`);
  return { raw, url, databaseName };
}

function assertSafeOutputDirectory(directory: string) {
  const resolved = path.resolve(directory);
  const parsed = path.parse(resolved);
  if (resolved === parsed.root || resolved === process.cwd() || resolved.length < 12) {
    throw new Error('BACKUP_OUTPUT_DIR must be a dedicated directory.');
  }
  return resolved;
}

export function createBackupPlan(
  environment: Record<string, string | undefined>,
  dryRun = true,
): BackupPlan {
  const name = requireValue(environment, 'BACKUP_ENVIRONMENT');
  if (!SAFE_ENVIRONMENT.test(name)) throw new Error('BACKUP_ENVIRONMENT is invalid.');
  const database = parsePostgresUrl(environment, 'DATABASE_URL');
  const outputDirectory = assertSafeOutputDirectory(requireValue(environment, 'BACKUP_OUTPUT_DIR'));
  const timestamp = (environment.BACKUP_TIMESTAMP || new Date().toISOString())
    .replace(/\.\d{3}Z$/, 'Z')
    .replace(/[:]/g, '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{6}Z$/.test(timestamp)) {
    throw new Error('BACKUP_TIMESTAMP has an invalid format.');
  }
  return {
    environment: name,
    databaseHost: database.url.hostname,
    databaseName: database.databaseName,
    outputDirectory,
    databaseArchive: path.join(outputDirectory, `${name}-${timestamp}.dump.enc`),
    manifestFile: path.join(outputDirectory, `${name}-${timestamp}.manifest.json`),
    encrypted: environment.BACKUP_ENCRYPTION_REQUIRED === 'true',
    dryRun,
  };
}

export function encryptBackupPayload(payload: Buffer, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([ENCRYPTED_ARCHIVE_MAGIC, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptBackupPayload(payload: Buffer, secret: string) {
  if (
    payload.length <= ENCRYPTED_ARCHIVE_MAGIC.length + 28 ||
    !payload.subarray(0, ENCRYPTED_ARCHIVE_MAGIC.length).equals(ENCRYPTED_ARCHIVE_MAGIC)
  ) {
    throw new Error('Backup archive encryption header is invalid.');
  }
  const ivStart = ENCRYPTED_ARCHIVE_MAGIC.length;
  const tagStart = ivStart + 12;
  const contentStart = tagStart + 16;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    createHash('sha256').update(secret).digest(),
    payload.subarray(ivStart, tagStart),
  );
  decipher.setAuthTag(payload.subarray(tagStart, contentStart));
  return Buffer.concat([decipher.update(payload.subarray(contentStart)), decipher.final()]);
}

function runCommand(executable: string, args: string[], environment?: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ['ignore', 'inherit', 'inherit'],
      env: environment,
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(executable)} exited with code ${code ?? 'unknown'}.`));
    });
  });
}

export async function createPostgreSQLBackup(
  environment: Record<string, string | undefined>,
  options: { execute: boolean },
): Promise<BackupPlan | CompletedBackup> {
  const plan = createBackupPlan(environment, !options.execute);
  if (!options.execute) return plan;
  if (environment.BACKUP_CONFIRMATION !== `BACKUP:${plan.environment}`) {
    throw new Error('BACKUP_CONFIRMATION does not match the selected environment.');
  }
  if (!plan.encrypted) throw new Error('Production backups require encryption at rest.');
  await mkdir(plan.outputDirectory, { recursive: true, mode: 0o700 });
  const database = parsePostgresUrl(environment, 'DATABASE_URL');
  const plaintextArchive = `${plan.databaseArchive}.plaintext`;
  try {
    await runCommand(
      environment.PG_DUMP_BIN?.trim() || 'pg_dump',
      ['--format=custom', '--no-owner', '--no-acl', '--file', plaintextArchive],
      { ...process.env, PGDATABASE: database.raw },
    );
    const plaintext = await readFile(plaintextArchive);
    const encrypted = encryptBackupPayload(
      plaintext,
      requireValue(environment, 'BACKUP_ENCRYPTION_KEY'),
    );
    await writeFile(plan.databaseArchive, encrypted, { flag: 'wx', mode: 0o600 });
    const result = {
      ...plan,
      dryRun: false as const,
      bytes: encrypted.length,
      sha256: createHash('sha256').update(encrypted).digest('hex'),
      sourceSha256: createHash('sha256').update(plaintext).digest('hex'),
    };
    await writeFile(
      plan.manifestFile,
      `${JSON.stringify(
        {
          version: 1,
          environment: result.environment,
          databaseHost: result.databaseHost,
          databaseName: result.databaseName,
          archive: path.basename(result.databaseArchive),
          bytes: result.bytes,
          sha256: result.sha256,
          sourceSha256: result.sourceSha256,
          encrypted: true,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      { flag: 'wx', mode: 0o600 },
    );
    return result;
  } finally {
    await unlink(plaintextArchive).catch(() => undefined);
  }
}

export function validateRestoreRehearsalEnvironment(
  environment: Record<string, string | undefined>,
) {
  const source = parsePostgresUrl(environment, 'DATABASE_URL');
  const target = parsePostgresUrl(environment, 'RESTORE_DATABASE_URL');
  if (!REHEARSAL_DATABASE.test(target.databaseName)) {
    throw new Error('Restore target database name must end with restore_rehearsal.');
  }
  if (source.raw === target.raw || source.databaseName === target.databaseName) {
    throw new Error('Restore rehearsal target must be isolated from the source database.');
  }
  if (environment.RESTORE_REHEARSAL_ALLOWED !== 'true') {
    throw new Error('RESTORE_REHEARSAL_ALLOWED=true is required.');
  }
  if (environment.RESTORE_CONFIRMATION !== `RESTORE:${target.databaseName}`) {
    throw new Error('RESTORE_CONFIRMATION does not match the isolated target database.');
  }
  return { source, target };
}

export async function restorePostgreSQLRehearsal(
  environment: Record<string, string | undefined>,
  archivePath: string,
  options: { execute: boolean },
) {
  const { target } = validateRestoreRehearsalEnvironment(environment);
  const resolvedArchive = path.resolve(archivePath);
  if (!options.execute) {
    return {
      dryRun: true,
      targetHost: target.url.hostname,
      targetDatabase: target.databaseName,
      archive: resolvedArchive,
    };
  }
  await access(resolvedArchive);
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'avantime-restore-'));
  const plaintextArchive = path.join(temporaryDirectory, 'archive.dump');
  try {
    const encrypted = await readFile(resolvedArchive);
    const plaintext = decryptBackupPayload(
      encrypted,
      requireValue(environment, 'BACKUP_ENCRYPTION_KEY'),
    );
    await writeFile(plaintextArchive, plaintext, { flag: 'wx', mode: 0o600 });
    await runCommand(
      environment.PG_RESTORE_BIN?.trim() || 'pg_restore',
      ['--clean', '--if-exists', '--no-owner', '--no-acl', '--exit-on-error', plaintextArchive],
      { ...process.env, PGDATABASE: target.raw },
    );
    return {
      dryRun: false,
      targetHost: target.url.hostname,
      targetDatabase: target.databaseName,
      archive: resolvedArchive,
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
