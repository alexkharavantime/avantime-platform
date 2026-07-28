import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
    ...fileEnvironment,
  };
  assertSafeDocumentIntegrationEnvironment(environment);

  return {
    repositoryRoot,
    environmentFile,
    environment,
  };
}

export async function runIntegrationCommand(
  command: string,
  arguments_: string[],
  options: {
    cwd: string;
    environment: NodeJS.ProcessEnv;
  },
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, arguments_, {
      cwd: options.cwd,
      env: options.environment,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Integration command stopped by ${signal}.`
            : `Integration command exited with code ${code ?? 'unknown'}.`,
        ),
      );
    });
  });
}
