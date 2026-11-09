import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { workerFailureMessage } from '../lib/worker-failure-message';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

export function getRepositoryRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function unquote(value: string) {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvironmentFile(source: string) {
  const environment: Record<string, string> = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) {
      throw new Error('Integration environment contains an invalid line.');
    }
    const name = line.slice(0, separator).trim();
    const value = unquote(line.slice(separator + 1).trim());
    if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
      throw new Error('Integration environment contains an invalid variable name.');
    }
    environment[name] = value;
  }

  return environment;
}

function assertLocalUrl(value: string | undefined, name: string, protocol: string) {
  if (!value) throw new Error(`${name} is required for integration operations.`);
  const parsed = new URL(value);
  if (parsed.protocol !== protocol || !LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(`${name} must target a local integration service.`);
  }
  return parsed;
}

export function assertSafeDocumentIntegrationEnvironment(
  environment: Record<string, string | undefined>,
) {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Integration operations are forbidden with NODE_ENV=production.');
  }
  if (environment.RUN_DOCUMENT_INTEGRATION_TESTS !== '1') {
    throw new Error('RUN_DOCUMENT_INTEGRATION_TESTS=1 is required.');
  }

  const databaseUrl = assertLocalUrl(environment.DATABASE_URL, 'DATABASE_URL', 'postgresql:');
  const databaseName = databaseUrl.pathname.replace(/^\/+/, '');
  if (!databaseName.includes('integration')) {
    throw new Error('Integration database name must contain "integration".');
  }

  assertLocalUrl(environment.OBJECT_STORAGE_ENDPOINT, 'OBJECT_STORAGE_ENDPOINT', 'http:');
  if (!environment.OBJECT_STORAGE_BUCKET?.includes('integration')) {
    throw new Error('Integration bucket name must contain "integration".');
  }
  if (
    environment.DOCUMENT_STORAGE_DRIVER !== 's3' ||
    environment.DOCUMENT_METADATA_DRIVER !== 'postgresql' ||
    environment.DOCUMENT_PROCESSING_QUEUE_DRIVER !== 'local'
  ) {
    throw new Error('Integration drivers must be s3, postgresql and local queue.');
  }
  if (
    environment.DOCUMENT_EMBEDDING_DRIVER !== 'fake' ||
    environment.DOCUMENT_VECTOR_DRIVER !== 'pgvector' ||
    environment.DOCUMENT_EMBEDDING_QUEUE_DRIVER !== 'postgresql' ||
    environment.RAG_ANSWER_DRIVER !== 'fake'
  ) {
    throw new Error(
      'Integration RAG drivers must use deterministic fake AI, pgvector and PostgreSQL jobs.',
    );
  }

  return {
    databaseUrl,
    databaseName,
  };
}

export async function loadDocumentIntegrationEnvironment() {
  const repositoryRoot = getRepositoryRoot();
  const environmentFile = path.resolve(
    repositoryRoot,
    process.env.DOCUMENT_INTEGRATION_ENV_FILE || '.env.integration',
  );
  const fileEnvironment = parseEnvironmentFile(await readFile(environmentFile, 'utf8'));
  const redisPort = fileEnvironment.REDIS_PORT || '56379';
  const redisPassword = fileEnvironment.REDIS_PASSWORD || 'avantime_redis_test_only';
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DOCUMENT_EMBEDDING_DRIVER: 'fake',
    DOCUMENT_EMBEDDING_MODEL: 'deterministic-hash-integration-v1',
    DOCUMENT_EMBEDDING_DIMENSIONS: '32',
    DOCUMENT_EMBEDDING_VERSION: 'embedding-integration-v1',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'postgresql',
    DOCUMENT_VECTOR_DRIVER: 'pgvector',
    RAG_ANSWER_DRIVER: 'fake',
    DOCUMENT_RAG_REQUIRED_FOR_READINESS: 'true',
    REDIS_PORT: redisPort,
    REDIS_PASSWORD: redisPassword,
    REDIS_URL:
      fileEnvironment.REDIS_URL ||
      `redis://:${encodeURIComponent(redisPassword)}@127.0.0.1:${redisPort}/0`,
    ...fileEnvironment,
  };
  assertSafeDocumentIntegrationEnvironment(environment);

  return {
    repositoryRoot,
    environmentFile,
    environment,
  };
}

/**
 * Turns `npx <package> ...` into `node <package bin> ...` resolved from the repository's
 * node_modules. On Windows `npx` is `npx.cmd`, which `spawn` cannot start without a shell
 * (ENOENT, and EINVAL for `.cmd` since Node 20.12), and a shell would re-parse paths with spaces.
 * Running the package's own entry point through the current Node works the same everywhere.
 */
export function resolveIntegrationCommand(
  command: string,
  arguments_: string[],
  cwd: string,
): { command: string; arguments_: string[] } {
  if (command === 'node') return { command: process.execPath, arguments_ };
  if (command !== 'npx') return { command, arguments_ };
  const [packageName, ...rest] = arguments_;
  if (!packageName || packageName.startsWith('-')) {
    throw new Error('Integration command "npx" needs a package name as its first argument.');
  }
  const require = createRequire(path.join(cwd, 'package.json'));
  let manifestPath: string;
  try {
    manifestPath = require.resolve(`${packageName}/package.json`);
  } catch {
    throw new Error(
      `Integration command "npx ${packageName}" failed: package "${packageName}" is not installed. Run npm ci.`,
    );
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
    bin?: string | Record<string, string>;
  };
  const bin =
    typeof manifest.bin === 'string'
      ? manifest.bin
      : (manifest.bin?.[packageName.replace(/^@[^/]+\//u, '')] ??
        Object.values(manifest.bin ?? {})[0]);
  if (!bin) {
    throw new Error(`Integration command "npx ${packageName}" failed: the package has no bin.`);
  }
  return {
    command: process.execPath,
    arguments_: [path.resolve(path.dirname(manifestPath), bin), ...rest],
  };
}

function describeCommand(command: string, arguments_: string[]) {
  return [command, ...arguments_.slice(0, 3)].join(' ');
}

export async function runIntegrationCommand(
  command: string,
  arguments_: string[],
  options: {
    cwd: string;
    environment: NodeJS.ProcessEnv;
  },
) {
  const description = describeCommand(command, arguments_);
  const resolved = resolveIntegrationCommand(command, arguments_, options.cwd);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(resolved.command, resolved.arguments_, {
      cwd: options.cwd,
      env: options.environment,
      stdio: 'inherit',
    });
    child.once('error', (error: NodeJS.ErrnoException) => {
      reject(
        new Error(
          `Integration command "${description}" could not start: ${error.code ?? error.message}.`,
        ),
      );
    });
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Integration command "${description}" stopped by ${signal}.`
            : `Integration command "${description}" exited with code ${code ?? 'unknown'}.`,
        ),
      );
    });
  });
}

/** Prints why an integration script failed (URL passwords masked) and sets a failing exit code. */
export function reportIntegrationFailure(label: string, error: unknown) {
  console.error(workerFailureMessage(label, error));
  process.exitCode = 1;
}
