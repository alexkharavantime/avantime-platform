import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { getRealAiBudgetAllowance } from './real-ai-budget';
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
  sessionId: string;
  diagnosticMode: boolean;
  databaseName: string;
  dataDirectory: string;
  artifactDirectory: string;
  diagnosticsFile: string;
};

function requireRealAiConfiguration() {
  const embeddingDriver = process.env.DOCUMENT_EMBEDDING_DRIVER;
  const answerDriver = process.env.RAG_ANSWER_DRIVER;
  const supportedDrivers = ['openai', 'gemini'];
  if (!supportedDrivers.includes(embeddingDriver ?? '')) {
    throw new Error(
      'Set DOCUMENT_EMBEDDING_DRIVER to an approved real provider in repository-root .env.',
    );
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

function configureBrowserDatabase(
  realAiMode: boolean,
  diagnosticMode: boolean,
): RealAiBrowserResources | undefined {
  const rootEnvironmentFile = path.resolve(webDirectory, '../../.env');
  if (existsSync(rootEnvironmentFile)) process.loadEnvFile(rootEnvironmentFile);

  if (diagnosticMode) {
    process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE = '1';
    process.env.DOCUMENT_EMBEDDING_DRIVER = 'openai';
    process.env.DOCUMENT_EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.DOCUMENT_EMBEDDING_DIMENSIONS = '1536';
    process.env.RAG_ANSWER_DRIVER = 'openai';
    process.env.RAG_ANSWER_MODEL = 'gpt-5-mini';
  } else {
    delete process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE;
  }

  if (process.env.BROWSER_REAL_AI_KB_SMOKE === '1' && !realAiMode) {
    throw new Error('BROWSER_REAL_AI_KB_SMOKE is reserved for the dedicated --real-ai runner.');
  }
  if (realAiMode) {
    requireRealAiConfiguration();
    if (process.env.BROWSER_DATABASE_URL || process.env.BROWSER_DATABASE_NAME) {
      throw new Error(
        'The real-AI smoke does not accept caller-supplied browser database overrides.',
      );
    }
  }

  if (process.env.BROWSER_DATABASE_URL || process.env.BROWSER_DATABASE_NAME) return;
  if (!process.env.DATABASE_URL) {
    if (realAiMode)
      throw new Error('Set DATABASE_URL to local database avantime in repository-root .env.');
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
    throw new Error(
      'Automatic browser database setup requires loopback PostgreSQL database avantime.',
    );
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
  const diagnosticsFile = path.join(path.dirname(artifactDirectory), 'provider-events.jsonl');
  if (existsSync(dataDirectory) || existsSync(path.dirname(artifactDirectory))) {
    throw new Error(
      'The generated real-AI resource directory already exists; refusing to reuse it.',
    );
  }
  process.env.BROWSER_DATA_DIRECTORY = dataDirectory;
  process.env.BROWSER_ARTIFACT_DIRECTORY = artifactDirectory;
  process.env.BROWSER_REAL_AI_KB_SMOKE = '1';
  process.env.BROWSER_REAL_AI_SESSION_ID = runId;
  process.env.BROWSER_REAL_AI_DIAGNOSTICS_FILE = diagnosticsFile;
  return {
    sessionId: runId,
    diagnosticMode,
    databaseName: browserDatabaseName,
    dataDirectory,
    artifactDirectory,
    diagnosticsFile,
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
    throw new Error(
      'Refusing real-AI test artifact cleanup outside its unique .artifacts directory.',
    );
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

async function exportRealAiUsageSummary(resources: RealAiBrowserResources) {
  const databaseUrl = process.env.BROWSER_DATABASE_URL;
  if (!databaseUrl) throw new Error('Temporary browser database URL is unavailable.');
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const operations = await prisma.$queryRaw<
      Array<{
        requestType: string;
        provider: string;
        status: string;
        operationCount: number;
        inputTokens: string;
        outputTokens: string;
        embeddingUnits: string;
        estimatedCostEur: number;
        actualCostEur: number | null;
      }>
    >`
      SELECT
        "requestType",
        "provider",
        "status",
        COUNT(*)::int AS "operationCount",
        COALESCE(SUM("inputTokens"), 0)::text AS "inputTokens",
        COALESCE(SUM("outputTokens"), 0)::text AS "outputTokens",
        COALESCE(SUM("embeddingUnits"), 0)::text AS "embeddingUnits",
        COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "estimatedCostEur",
        CASE WHEN COUNT("actualCostEur") = 0 THEN NULL
          ELSE SUM("actualCostEur")::float8 END AS "actualCostEur"
      FROM "AiUsageLedger"
      GROUP BY "requestType", "provider", "status"
      ORDER BY "requestType", "provider", "status"
    `;
    const reservations = await prisma.$queryRaw<
      Array<{
        requestType: string;
        provider: string;
        status: string;
        reservationCount: number;
        reservedCostEur: number;
      }>
    >`
      SELECT "requestType", "provider", "status", COUNT(*)::int AS "reservationCount",
        COALESCE(SUM("estimatedCostEur"), 0)::float8 AS "reservedCostEur"
      FROM "AiBudgetReservation"
      GROUP BY "requestType", "provider", "status"
      ORDER BY "requestType", "provider", "status"
    `;
    const diagnosticEvents = existsSync(resources.diagnosticsFile)
      ? (await readFile(resources.diagnosticsFile, 'utf8'))
          .split('\n')
          .filter((line) => line.trim()).length
      : 0;
    const summary = {
      sessionId: resources.sessionId,
      diagnosticMode: resources.diagnosticMode,
      sessionProviderOperationLimit: 13,
      ...(resources.diagnosticMode ? { sessionBudgetLimitEur: 0.05 } : {}),
      providerEventFile: path.basename(resources.diagnosticsFile),
      providerEventCount: diagnosticEvents,
      generatedAt: new Date().toISOString(),
      operations: operations.map((operation) => ({
        requestType: ['document_embedding', 'query_embedding', 'rag_answer'].includes(
          operation.requestType,
        )
          ? operation.requestType
          : 'other',
        provider: ['openai', 'gemini', 'fake', 'disabled'].includes(operation.provider)
          ? operation.provider
          : 'other',
        status: ['SUCCEEDED', 'FAILED'].includes(operation.status) ? operation.status : 'other',
        operationCount: operation.operationCount,
        inputTokens: Number(operation.inputTokens),
        outputTokens: Number(operation.outputTokens),
        embeddingUnits: Number(operation.embeddingUnits),
        estimatedCostEur: operation.estimatedCostEur,
        actualCostEur: operation.actualCostEur,
      })),
      reservations: reservations.map((reservation) => ({
        requestType: ['document_embedding', 'query_embedding', 'rag_answer'].includes(
          reservation.requestType,
        )
          ? reservation.requestType
          : 'other',
        provider: ['openai', 'gemini', 'fake', 'disabled'].includes(reservation.provider)
          ? reservation.provider
          : 'other',
        status: ['RESERVED', 'RECONCILED', 'FAILED', 'CANCELLED'].includes(reservation.status)
          ? reservation.status
          : 'other',
        reservationCount: reservation.reservationCount,
        reservedCostEur: reservation.reservedCostEur,
      })),
      budgetImpactEur: Number(
        (
          operations.reduce(
            (total, operation) =>
              total + Math.max(operation.actualCostEur ?? 0, operation.estimatedCostEur),
            0,
          ) +
          reservations.reduce(
            (total, reservation) =>
              total + (reservation.status === 'RECONCILED' ? 0 : reservation.reservedCostEur),
            0,
          )
        ).toFixed(6),
      ),
      providerOperationCount:
        operations.reduce(
          (total, operation) =>
            total +
            (['openai', 'gemini'].includes(operation.provider) ? operation.operationCount : 0),
          0,
        ) +
        reservations.reduce(
          (total, reservation) =>
            total +
            (['openai', 'gemini'].includes(reservation.provider) &&
            reservation.status !== 'RECONCILED'
              ? reservation.reservationCount
              : 0),
          0,
        ),
    };
    const summaryPath = path.join(path.dirname(resources.artifactDirectory), 'usage-summary.json');
    await mkdir(path.dirname(summaryPath), { recursive: true, mode: 0o700 });
    await writeFile(summaryPath, JSON.stringify(summary, null, 2), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    });
    console.info(
      JSON.stringify({
        event: 'real_ai_smoke_usage_summary',
        sessionId: resources.sessionId,
        diagnosticMode: resources.diagnosticMode,
        budgetImpactEur: summary.budgetImpactEur,
        providerOperationCount: summary.providerOperationCount,
        providerEventCount: summary.providerEventCount,
        outputFile: path.basename(summaryPath),
        operationGroups: summary.operations.length,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

async function writeUnavailableRealAiUsageSummary(resources: RealAiBrowserResources) {
  const summaryPath = path.join(path.dirname(resources.artifactDirectory), 'usage-summary.json');
  const diagnosticEvents = existsSync(resources.diagnosticsFile)
    ? (await readFile(resources.diagnosticsFile, 'utf8')).split('\n').filter((line) => line.trim())
        .length
    : 0;
  await mkdir(path.dirname(summaryPath), { recursive: true, mode: 0o700 });
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        sessionId: resources.sessionId,
        diagnosticMode: resources.diagnosticMode,
        sessionProviderOperationLimit: 13,
        ...(resources.diagnosticMode ? { sessionBudgetLimitEur: 0.05 } : {}),
        providerEventFile: path.basename(resources.diagnosticsFile),
        providerEventCount: diagnosticEvents,
        generatedAt: new Date().toISOString(),
        summaryStatus: 'unavailable',
        summaryErrorCode: 'AI_USAGE_SUMMARY_UNAVAILABLE',
        budgetImpactEur: null,
        providerOperationCount: null,
        operations: null,
        reservations: null,
      },
      null,
      2,
    ),
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
}

async function main() {
  const diagnosticMode = process.argv.includes('--real-ai-diagnostic');
  const realAiMode = process.argv.includes('--real-ai') || diagnosticMode;
  const testArguments = process.argv
    .slice(2)
    .filter((argument) => !['--real-ai', '--real-ai-diagnostic'].includes(argument));
  if (process.env.BROWSER_REAL_AI_KB_SMOKE === '1' && !realAiMode) {
    throw new Error('Use the dedicated test:browser:real-ai command to enable real AI.');
  }
  if (realAiMode && testArguments.length > 0) {
    throw new Error('The dedicated real-AI browser command does not accept Playwright overrides.');
  }

  const resources = configureBrowserDatabase(realAiMode, diagnosticMode);
  const realAiBudget = realAiMode
    ? getRealAiBudgetAllowance(path.resolve(webDirectory, '../..'))
    : undefined;
  const childEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    ...(realAiMode ? { NODE_ENV: 'test' as const } : {}),
    ...(diagnosticMode ? { AI_DAILY_BUDGET_EUR: '0.25', AI_MONTHLY_BUDGET_EUR: '1.00' } : {}),
    ...(realAiBudget
      ? {
          AI_DAILY_BUDGET_EUR: String(realAiBudget.dailyRemainingEur),
          AI_MONTHLY_BUDGET_EUR: String(realAiBudget.monthlyRemainingEur),
        }
      : {}),
  };
  if (diagnosticMode && resources) {
    console.info(
      JSON.stringify({
        event: 'real_ai_diagnostic_session_started',
        sessionId: resources.sessionId,
        sessionBudgetLimitEur: 0.05,
        dailyBudgetEur: 0.25,
        monthlyBudgetEur: 1,
        maxProviderOperations: 13,
      }),
    );
  }
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
        ? [...testArguments, '--grep', '@real-ai', '--retries', '0']
        : testArguments;
      const result = run(
        process.execPath,
        [require.resolve('@playwright/test/cli'), 'test', ...selectedArguments],
        childEnvironment,
      );
      exitCode = result.status ?? 1;
    }
  } finally {
    const finalization = {
      usageSummary: resources ? 'pending' : 'skipped',
      artifactSanitization: artifactDirectory ? 'pending' : 'skipped',
      resourceCleanup: resources ? 'pending' : 'skipped',
    };
    if (resources) {
      try {
        await exportRealAiUsageSummary(resources);
        finalization.usageSummary = 'written';
      } catch {
        finalization.usageSummary = 'failed';
        exitCode = 1;
        try {
          await writeUnavailableRealAiUsageSummary(resources);
        } catch {
          finalization.usageSummary = 'failed';
        }
      }
    }
    if (artifactDirectory) {
      try {
        await sanitizePlaywrightArtifacts(artifactDirectory);
        finalization.artifactSanitization = 'completed';
      } catch {
        finalization.artifactSanitization = 'failed';
        exitCode = 1;
      }
    }
    if (resources) {
      try {
        await cleanupRealAiResources(resources);
        finalization.resourceCleanup = 'completed';
      } catch {
        finalization.resourceCleanup = 'failed';
        exitCode = 1;
      }
    }
    if (Object.values(finalization).includes('failed')) {
      console.error(JSON.stringify({ event: 'browser_test_finalization', ...finalization }));
    }
  }
  process.exitCode = exitCode;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser test runner failed.');
  process.exit(1);
});
