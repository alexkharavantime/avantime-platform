import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { buildRagSystemInstructions } from '../lib/rag-answer';
import { readAiUsageSummary } from '../lib/ai-usage-summary';
import {
  getRealAiBudgetAllowance,
  getRealAiDiagnosticCostPreflight,
  REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR,
  REAL_AI_DIAGNOSTIC_OUTPUT_TOKEN_LIMIT,
  REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT,
} from './real-ai-budget';
import { sanitizePlaywrightArtifacts } from './sanitize-playwright-artifacts';
import { startMockOpenAiTransport } from '../tests/browser/mock-openai-transport';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

function run(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: webDirectory,
      env: environment,
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
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

async function readDiagnosticEventCounts(filePath: string) {
  if (!existsSync(filePath)) return { diagnosticEventCount: 0, providerEventCount: 0 };
  const events = (await readFile(filePath, 'utf8'))
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { name?: unknown });
  return {
    diagnosticEventCount: events.length,
    providerEventCount: events.filter((event) => event.name === 'provider_call').length,
  };
}

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
  mockProviderBaseUrl?: string,
): RealAiBrowserResources | undefined {
  const rootEnvironmentFile = path.resolve(webDirectory, '../../.env');
  if (existsSync(rootEnvironmentFile)) process.loadEnvFile(rootEnvironmentFile);

  if (mockProviderBaseUrl) {
    process.env.OPENAI_API_KEY = 'offline-mock-provider-key';
    process.env.OPENAI_BASE_URL = mockProviderBaseUrl;
  }

  if (diagnosticMode) {
    process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE = '1';
    process.env.DOCUMENT_EMBEDDING_DRIVER = 'openai';
    process.env.DOCUMENT_EMBEDDING_MODEL = 'text-embedding-3-small';
    process.env.DOCUMENT_EMBEDDING_DIMENSIONS = '1536';
    process.env.RAG_ANSWER_DRIVER = 'openai';
    process.env.RAG_ANSWER_MODEL = 'gpt-5-mini';
    process.env.RAG_MAX_CONTEXT_CHARACTERS = '1500';
    process.env.RAG_MAX_OUTPUT_TOKENS = String(REAL_AI_DIAGNOSTIC_OUTPUT_TOKEN_LIMIT);
    process.env.RAG_QUERY_MAX_CHARACTERS = '500';
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
    ? `avantime_browser_integration_real-ai-${runId.slice(0, 26)}`
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
  if (!/^avantime_browser_integration_real-ai-[a-f0-9]{26}$/u.test(resources.databaseName)) {
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

async function exportRealAiUsageSummary(
  resources: RealAiBrowserResources,
  providerTransport?: 'mock-openai-loopback',
) {
  const databaseUrl = process.env.BROWSER_DATABASE_URL;
  if (!databaseUrl) throw new Error('Temporary browser database URL is unavailable.');
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  try {
    const { operations, reservations } = await readAiUsageSummary(prisma);
    const eventCounts = await readDiagnosticEventCounts(resources.diagnosticsFile);
    const summary = {
      sessionId: resources.sessionId,
      diagnosticMode: resources.diagnosticMode,
      ...(providerTransport ? { providerTransport } : {}),
      summaryStatus: 'available',
      sessionProviderOperationLimit: REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT,
      ...(resources.diagnosticMode
        ? { sessionBudgetLimitEur: REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR }
        : {}),
      providerEventFile: path.basename(resources.diagnosticsFile),
      ...eventCounts,
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
  const eventCounts = await readDiagnosticEventCounts(resources.diagnosticsFile);
  await mkdir(path.dirname(summaryPath), { recursive: true, mode: 0o700 });
  await writeFile(
    summaryPath,
    JSON.stringify(
      {
        sessionId: resources.sessionId,
        diagnosticMode: resources.diagnosticMode,
        sessionProviderOperationLimit: REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT,
        ...(resources.diagnosticMode
          ? { sessionBudgetLimitEur: REAL_AI_DIAGNOSTIC_BUDGET_LIMIT_EUR }
          : {}),
        providerEventFile: path.basename(resources.diagnosticsFile),
        ...eventCounts,
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

async function verifyMockProviderAccounting(
  resources: RealAiBrowserResources,
  providerCallCount: number,
  operations: readonly string[],
) {
  const summaryPath = path.join(path.dirname(resources.artifactDirectory), 'usage-summary.json');
  const summary = JSON.parse(await readFile(summaryPath, 'utf8')) as {
    providerOperationCount?: unknown;
    providerEventCount?: unknown;
    summaryStatus?: unknown;
  };
  const events = (await readFile(resources.diagnosticsFile, 'utf8'))
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { name?: unknown });
  const providerEventCount = events.filter((event) => event.name === 'provider_call').length;
  const expectedOperations = [
    'embedding',
    'embedding',
    'embedding',
    'answer',
    'embedding',
    'answer',
    'embedding',
    'answer',
    'embedding',
    'answer',
    'embedding',
    'answer',
  ];
  if (
    summary.summaryStatus !== 'available' ||
    summary.providerOperationCount !== providerCallCount ||
    summary.providerEventCount !== providerCallCount ||
    providerEventCount !== providerCallCount ||
    providerCallCount !== REAL_AI_DIAGNOSTIC_PROVIDER_OPERATION_LIMIT ||
    JSON.stringify(operations) !== JSON.stringify(expectedOperations)
  ) {
    throw new Error('MOCK_PROVIDER_ACCOUNTING_MISMATCH');
  }
  console.info(
    JSON.stringify({
      event: 'mock_provider_accounting',
      providerTransport: 'mock-openai-loopback',
      providerCallCount,
      providerEventCount,
      ledgerProviderOperationCount: summary.providerOperationCount,
      operations,
    }),
  );
}

async function main() {
  const diagnosticMode = process.argv.includes('--real-ai-diagnostic');
  const diagnosticPreflightOnly = process.argv.includes('--preflight-only');
  const mockProviderMode = process.argv.includes('--mock-provider');
  const realAiMode = process.argv.includes('--real-ai') || diagnosticMode;
  const testArguments = process.argv
    .slice(2)
    .filter(
      (argument) =>
        !['--real-ai', '--real-ai-diagnostic', '--preflight-only', '--mock-provider'].includes(
          argument,
        ),
    );
  if (process.env.BROWSER_REAL_AI_KB_SMOKE === '1' && !realAiMode) {
    throw new Error('Use the dedicated test:browser:real-ai command to enable real AI.');
  }
  if (realAiMode && testArguments.length > 0) {
    throw new Error('The dedicated real-AI browser command does not accept Playwright overrides.');
  }
  if (diagnosticPreflightOnly && !diagnosticMode) {
    throw new Error('--preflight-only is only available with --real-ai-diagnostic.');
  }
  if (mockProviderMode && (!diagnosticMode || diagnosticPreflightOnly)) {
    throw new Error('--mock-provider requires a diagnostic browser run, not preflight-only mode.');
  }

  const diagnosticPreflight = diagnosticMode
    ? getRealAiDiagnosticCostPreflight({
        maximumDocumentChunkBytes: 512,
        maximumQuestionBytes: 256,
        maximumContextBytes: 512,
        systemInstructionsBytes: Buffer.byteLength(buildRagSystemInstructions('ru'), 'utf8'),
      })
    : undefined;
  if (diagnosticPreflight && !diagnosticPreflight.withinBudget) {
    throw new Error('Maximum reserved diagnostic cost exceeds the separately approved EUR 0.05.');
  }
  if (diagnosticPreflightOnly && diagnosticPreflight) {
    console.info(
      JSON.stringify(
        {
          event: 'real_ai_diagnostic_cost_preflight',
          ...diagnosticPreflight,
          ordinaryDailyBudgetEur: 0.25,
          ordinaryMonthlyBudgetEur: 1,
          historicalSummaryRead: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  const mockProvider = mockProviderMode ? await startMockOpenAiTransport() : undefined;
  const resources = configureBrowserDatabase(realAiMode, diagnosticMode, mockProvider?.baseUrl);
  const realAiBudget = realAiMode && !diagnosticMode
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
        budgetLimitEur: diagnosticPreflight?.budgetLimitEur,
        maximumReservedCostEur: diagnosticPreflight?.maximumReservedCostEur,
        costPreflight: diagnosticPreflight,
        dailyBudgetEur: 0.25,
        monthlyBudgetEur: 1,
        maxProviderOperations: diagnosticPreflight?.providerOperationLimit,
        providerTransport: mockProvider ? 'mock-openai-loopback' : 'openai',
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
    const prepareStatus = await run(
      process.execPath,
      ['--import', 'tsx', 'scripts/prepare-browser-tests.ts'],
      childEnvironment,
    );
    if (prepareStatus !== 0) {
      exitCode = prepareStatus;
    } else {
      const selectedArguments = realAiMode
        ? [...testArguments, '--grep', '@real-ai', '--retries', '0']
        : testArguments;
      exitCode = await run(
        process.execPath,
        [require.resolve('@playwright/test/cli'), 'test', ...selectedArguments],
        childEnvironment,
      );
    }
  } finally {
    const finalization = {
      usageSummary: resources ? 'pending' : 'skipped',
      artifactSanitization: artifactDirectory ? 'pending' : 'skipped',
      resourceCleanup: resources ? 'pending' : 'skipped',
      mockProviderAccounting: mockProvider ? 'pending' : 'skipped',
    };
    if (resources) {
      try {
        await exportRealAiUsageSummary(
          resources,
          mockProvider ? 'mock-openai-loopback' : undefined,
        );
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
    if (resources && mockProvider) {
      try {
        await verifyMockProviderAccounting(
          resources,
          mockProvider.providerCallCount,
          mockProvider.operations,
        );
        finalization.mockProviderAccounting = 'completed';
      } catch {
        finalization.mockProviderAccounting = 'failed';
        exitCode = 1;
        console.error(JSON.stringify({ event: 'mock_provider_accounting', result: 'failed' }));
      }
    }
    if (mockProvider) {
      try {
        await mockProvider.close();
      } catch {
        exitCode = 1;
        finalization.mockProviderAccounting = 'failed';
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
