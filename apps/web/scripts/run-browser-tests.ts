import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { sanitizePlaywrightArtifacts } from './sanitize-playwright-artifacts';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function run(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env) {
  return spawnSync(command, args, {
    cwd: webDirectory,
    env: environment,
    stdio: 'inherit',
  });
}

type RealAiBrowserResources = {
  databaseName: string;
  dataDirectory: string;
  artifactDirectory: string;
};

function requireRealAiConfiguration() {
  const embeddingDriver = process.env.DOCUMENT_EMBEDDING_DRIVER;
  const answerDriver = process.env.RAG_ANSWER_DRIVER;
  const supportedDrivers = ['openai', 'gemini'];
  if (!supportedDrivers.includes(embeddingDriver ?? '')) {
    throw new Error('Set DOCUMENT_EMBEDDING_DRIVER to an approved real provider in repository-root .env.');
  }
  if (!supportedDrivers.includes(answerDriver ?? '')) {
    throw new Error('Set RAG_ANSWER_DRIVER to an approved real provider in repository-root .env.');
  }
  const requiredKeys = new Set<string>();
  for (const driver of [embeddingDriver, answerDriver]) {
    requiredKeys.add(driver === 'openai' ? 'OPENAI_API_KEY' : 'GOOGLE_GENERATIVE_AI_API_KEY');
  }
  for (const key of requiredKeys) {
    if (!process.env[key]?.trim()) {
      throw new Error(`Missing ${key}; add it to the ignored repository-root .env file.`);
    }
  }
  if (
    embeddingDriver === 'gemini' &&
    !['768', '1536', '3072'].includes(process.env.DOCUMENT_EMBEDDING_DIMENSIONS ?? '')
  ) {
    throw new Error(
      'For the Gemini real-AI smoke, set DOCUMENT_EMBEDDING_DIMENSIONS to 768, 1536 or 3072.',
    );
  }
}

function configureBrowserDatabase(realAiMode: boolean): RealAiBrowserResources | undefined {
  const rootEnvironmentFile = path.resolve(webDirectory, '../../.env');
  if (existsSync(rootEnvironmentFile)) process.loadEnvFile(rootEnvironmentFile);

  if (process.env.BROWSER_REAL_AI_KB_SMOKE === '1' && !realAiMode) {
    throw new Error('BROWSER_REAL_AI_KB_SMOKE is reserved for the dedicated --real-ai runner.');
  }
  if (realAiMode) {
    requireRealAiConfiguration();
    if (process.env.BROWSER_DATABASE_URL || process.env.BROWSER_DATABASE_NAME) {
      throw new Error('The real-AI smoke does not accept caller-supplied browser database overrides.');
    }
  }

  if (process.env.BROWSER_DATABASE_URL || process.env.BROWSER_DATABASE_NAME) return;
  if (!process.env.DATABASE_URL) {
    if (realAiMode) throw new Error('Set DATABASE_URL to local database avantime in repository-root .env.');
    return;
  }

  let sourceUrl: URL;
  try {
    sourceUrl = new URL(process.env.DATABASE_URL);
  } catch {
    throw new Error('Browser tests require a valid local DATABASE_URL.');
  }

  const databaseName = sourceUrl.pathname.replace(/^\/+/, '');
  if (
    !['postgres:', 'postgresql:'].includes(sourceUrl.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname) ||
    databaseName !== 'avantime'
  ) {
    throw new Error('Automatic browser database setup requires loopback PostgreSQL database avantime.');
  }

  const runId = randomUUID().replaceAll('-', '');
  const browserDatabaseName = realAiMode
    ? `avantime_browser_integration_real-ai-${runId}`
    : `avantime_browser_integration_${runId}`;
  sourceUrl.pathname = `/${browserDatabaseName}`;
  process.env.BROWSER_DATABASE_NAME = browserDatabaseName;
  process.env.BROWSER_DATABASE_URL = sourceUrl.toString();
  if (!realAiMode) return;

  const repositoryRoot = path.resolve(webDirectory, '../..');
  const dataDirectory = path.join(repositoryRoot, '.tmp', `document-kb-real-ai-${runId}`);
  const artifactDirectory = path.join(
    repositoryRoot,
    '.artifacts',
    `document-kb-real-ai-${runId}`,
    'playwright-results',
  );
  if (existsSync(dataDirectory) || existsSync(path.dirname(artifactDirectory))) {
    throw new Error('The generated real-AI resource directory already exists; refusing to reuse it.');
  }
  process.env.BROWSER_DATA_DIRECTORY = dataDirectory;
  process.env.BROWSER_ARTIFACT_DIRECTORY = artifactDirectory;
  process.env.BROWSER_REAL_AI_KB_SMOKE = '1';
  return {
    databaseName: browserDatabaseName,
    dataDirectory,
    artifactDirectory,
  };
}

async function cleanupRealAiResources(resources: RealAiBrowserResources) {
  if (!/^avantime_browser_integration_real-ai-[a-f0-9]{32}$/u.test(resources.databaseName)) {
    throw new Error('Unsafe real-AI browser database identifier during cleanup.');
  }
  const repositoryRoot = path.resolve(webDirectory, '../..');
  const resolvedDirectory = path.resolve(resources.dataDirectory);
  if (
    path.dirname(resolvedDirectory) !== path.join(repositoryRoot, '.tmp') ||
    !/^document-kb-real-ai-[a-f0-9]{32}$/u.test(path.basename(resolvedDirectory))
  ) {
    throw new Error('Refusing real-AI test storage cleanup outside its unique .tmp directory.');
  }
  const artifactRoot = path.join(repositoryRoot, '.artifacts');
  const resolvedArtifacts = path.resolve(resources.artifactDirectory);
  if (
    path.dirname(path.dirname(resolvedArtifacts)) !== artifactRoot ||
    path.basename(path.dirname(resolvedArtifacts)) !== path.basename(resolvedDirectory) ||
    path.basename(resolvedArtifacts) !== 'playwright-results'
  ) {
    throw new Error('Refusing real-AI test artifact cleanup outside its unique .artifacts directory.');
  }
  try {
    const sourceUrl = new URL(process.env.DATABASE_URL ?? '');
    if (
      !['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname) ||
      sourceUrl.pathname.replace(/^\/+/, '') !== 'avantime'
    ) {
      throw new Error('Refusing real-AI test cleanup outside loopback database avantime.');
    }
    sourceUrl.pathname = '/postgres';
    sourceUrl.search = '';
    const admin = new PrismaClient({ datasourceUrl: sourceUrl.toString() });
    try {
      const rows = await admin.$queryRaw<Array<{ datname: string }>>`
        SELECT datname FROM pg_database WHERE datname = ${resources.databaseName}
      `;
      if (rows.some((row) => row.datname === resources.databaseName)) {
        await admin.$executeRawUnsafe(`DROP DATABASE "${resources.databaseName}" WITH (FORCE)`);
      }
    } finally {
      await admin.$disconnect();
    }
  } finally {
    if (existsSync(resolvedDirectory)) await rm(resolvedDirectory, { recursive: true });
  }

}

async function main() {
  const realAiMode = process.argv.includes('--real-ai');
  const testArguments = process.argv.slice(2).filter((argument) => argument !== '--real-ai');
  if (process.env.BROWSER_REAL_AI_KB_SMOKE === '1' && !realAiMode) {
    throw new Error('Use the dedicated test:browser:real-ai command to enable real AI.');
  }
  if (realAiMode && testArguments.length > 0) {
    throw new Error('The dedicated real-AI browser command does not accept Playwright overrides.');
  }

  const resources = configureBrowserDatabase(realAiMode);
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    ...(realAiMode ? { NODE_ENV: 'test' as const } : {}),
  };
  if (!realAiMode) {
    delete childEnvironment.OPENAI_API_KEY;
    delete childEnvironment.GOOGLE_GENERATIVE_AI_API_KEY;
  }
  let exitCode = 1;
  let artifactDirectory: string | undefined;
  try {
    const environment = await import('../tests/browser/environment');
    artifactDirectory = environment.BROWSER_ARTIFACT_DIRECTORY;
    const prepare = run(
      process.execPath,
      ['--import', 'tsx', 'scripts/prepare-browser-tests.ts'],
      childEnvironment,
    );
    if (prepare.status !== 0) {
      exitCode = prepare.status ?? 1;
    } else {
      const selectedArguments = realAiMode
        ? [...testArguments, '--grep', '@real-ai']
        : testArguments;
      const result = run(process.execPath, [
        require.resolve('@playwright/test/cli'),
        'test',
        ...selectedArguments,
      ], childEnvironment);
      exitCode = result.status ?? 1;
    }
  } finally {
    try {
      if (artifactDirectory) await sanitizePlaywrightArtifacts(artifactDirectory);
    } finally {
      if (resources) await cleanupRealAiResources(resources);
    }
  }
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser test runner failed.');
  process.exit(1);
});
