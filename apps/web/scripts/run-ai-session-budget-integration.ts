import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import {
  type AiProviderAvailability,
  assembleProviderContext,
  type EmbeddingProvider,
  type EmbeddingRequest,
  type RagAnswerProvider,
  type RagGenerationRequest,
} from '../lib/ai-gateway';
import { MemoryAiRateLimiter, PostgreSQLAiCostController } from '../lib/ai-control';
import { loadDocumentConfiguration } from '../lib/document-configuration';
import { enqueueDocumentEmbedding } from '../lib/document-embedding';
import { createDocumentServices } from '../lib/document-services';
import { readAiUsageSummary } from '../lib/ai-usage-summary';
import { buildRagSystemInstructions } from '../lib/rag-answer';
import type { DocumentTenantContext } from '../lib/document-model';
import { loadRagConfiguration } from '../lib/rag-configuration';
import type { VectorDatabaseClient } from '../lib/vector-repository';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(webDirectory, '../..');

async function verifyDevelopmentServiceBudget(database: PrismaClient) {
  const directory = await mkdtemp(path.join(tmpdir(), 'avantime-dev-ai-budget-'));
  const dataDirectory = path.join(directory, 'data');
  const diagnosticsFile = path.join(directory, 'provider-events.jsonl');
  const environment = {
    NODE_ENV: 'development',
    BROWSER_REAL_AI_KB_SMOKE: '1',
    BROWSER_REAL_AI_DIAGNOSTIC_MODE: '1',
    BROWSER_REAL_AI_DIAGNOSTICS_FILE: diagnosticsFile,
    OPENAI_API_KEY: 'offline-integration-key',
    DOCUMENT_DATA_DIR: dataDirectory,
    DOCUMENT_EMBEDDING_DRIVER: 'openai',
    DOCUMENT_EMBEDDING_MODEL: 'text-embedding-3-small',
    DOCUMENT_EMBEDDING_DIMENSIONS: '2',
    DOCUMENT_EMBEDDING_VERSION: 'dev-budget-test-v1',
    DOCUMENT_EMBEDDING_MAX_ATTEMPTS: '1',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'local',
    DOCUMENT_VECTOR_DRIVER: 'memory',
    RAG_ANSWER_DRIVER: 'openai',
    RAG_ANSWER_MODEL: 'gpt-5-mini',
    RAG_MAX_OUTPUT_TOKENS: '512',
    AI_PROVIDER_MAX_ATTEMPTS: '1',
    AI_DAILY_BUDGET_EUR: '0.25',
    AI_MONTHLY_BUDGET_EUR: '1',
  };
  const environmentKeys = [
    'NODE_ENV',
    'BROWSER_REAL_AI_KB_SMOKE',
    'BROWSER_REAL_AI_DIAGNOSTIC_MODE',
    'BROWSER_REAL_AI_DIAGNOSTICS_FILE',
  ] as const;
  const originalEnvironment = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );
  const mutableEnvironment = process.env as Record<string, string | undefined>;
  const providerAttempts: string[] = [];
  let generatedContext = '';
  let generatedInstructions = '';
  const availability: AiProviderAvailability = {
    configured: true,
    available: true,
    capabilities: { embeddings: true, answers: true },
  };
  const provider: EmbeddingProvider & RagAnswerProvider = {
    id: 'openai',
    async embed(request: EmbeddingRequest) {
      providerAttempts.push(request.purpose === 'query' ? 'query_embedding' : 'document_embedding');
      return {
        vectors: request.texts.map(() => [0.1, 0.2]),
        model: request.model,
        dimensions: request.dimensions,
        usage: { inputTokens: 4, outputTokens: 0, estimatedCostEur: 0.000004 },
        providerDiagnostic: { provider: 'openai', operation: 'embedding' },
      };
    },
    async generate(request: RagGenerationRequest) {
      providerAttempts.push('rag_answer');
      generatedContext = assembleProviderContext(request);
      generatedInstructions = request.systemInstructions;
      return {
        answer: 'offline integration response',
        model: request.model,
        usage: { inputTokens: 12, outputTokens: 5, estimatedCostEur: 0.000032 },
        providerDiagnostic: {
          provider: 'openai',
          operation: 'answer',
          responseStatus: 'completed',
        },
      };
    },
    async checkAvailability() {
      return availability;
    },
  };

  try {
    mutableEnvironment.NODE_ENV = environment.NODE_ENV;
    mutableEnvironment.BROWSER_REAL_AI_KB_SMOKE = environment.BROWSER_REAL_AI_KB_SMOKE;
    mutableEnvironment.BROWSER_REAL_AI_DIAGNOSTIC_MODE =
      environment.BROWSER_REAL_AI_DIAGNOSTIC_MODE;
    mutableEnvironment.BROWSER_REAL_AI_DIAGNOSTICS_FILE = diagnosticsFile;

    const ragConfiguration = loadRagConfiguration(environment);
    ragConfiguration.limits.sessionProviderOperationLimit = 3;
    const loadDatabase = async () => database as unknown as VectorDatabaseClient;
    const sharedOptions = {
      ragConfiguration,
      rag: {
        environment,
        embeddingProvider: provider,
        answerProvider: provider,
        loadDatabase,
        rateLimiter: new MemoryAiRateLimiter(),
        knowledgeSemanticSource: null,
      },
    };
    const documentConfiguration = loadDocumentConfiguration(environment);
    const workerServices = createDocumentServices(documentConfiguration, sharedOptions);
    if (!workerServices.rag) throw new Error('Development worker RAG services are unavailable.');
    const apiServices = createDocumentServices(documentConfiguration, {
      ...sharedOptions,
      rag: { ...sharedOptions.rag, vectors: workerServices.rag.vectors },
    });
    if (!apiServices.rag) throw new Error('Development API RAG services are unavailable.');

    const tenant: DocumentTenantContext = {
      companyId: 'dev-service-budget-test',
      userId: 'dev-service-budget-test-user',
    };
    const now = new Date().toISOString();
    const createCompletedSource = async (documentId: string) => {
      const text =
        documentId === 'dev-budget-source-one'
          ? 'Nightly maintenance starts at 21:45.'
          : 'Backups are retained for 14 days.';
      await workerServices.metadata.create(tenant, {
        id: documentId,
        status: 'COMPLETED',
        originalName: `${documentId}.pdf`,
        storedName: `${documentId}.pdf`,
        mimeType: 'application/pdf',
        size: text.length,
        checksum: 'a'.repeat(64),
        createdAt: now,
        updatedAt: now,
        processingCompletedAt: now,
        pages: 1,
        textLength: text.length,
        chunksCount: 1,
      });
      await workerServices.processing.save(tenant, documentId, {
        text,
        chunks: [{ id: `${documentId}-chunk`, index: 0, text, start: 0, end: text.length }],
      });
      const queued = await enqueueDocumentEmbedding(
        tenant,
        documentId,
        workerServices.rag!.embedding,
      );
      assert.equal(queued.outcome, 'QUEUED');
    };

    await createCompletedSource('dev-budget-source-one');
    await createCompletedSource('dev-budget-source-two');
    const firstWorkerRun = await workerServices.rag
      .createEmbeddingWorker()
      .runOnce(tenant, 'dev-budget-worker-one');
    assert.equal(firstWorkerRun.outcome, 'COMPLETED');

    const answer = await apiServices.rag.answers.answer({
      tenant,
      question: 'What time does maintenance start, and how long are backups retained?',
      correlationId: 'dev-budget-api-answer',
    });
    assert.equal(answer.status, 'answered');
    assert.ok(answer.citations.length > 0);
    assert.match(generatedContext, /Nightly maintenance starts at 21:45\./u);
    assert.match(generatedContext, /Backups are retained for 14 days\./u);
    assert.match(generatedContext, /<untrusted_retrieved_documents>/u);
    assert.match(generatedInstructions, /Answer only from the supplied source excerpts\./u);
    assert.match(generatedInstructions, /available sources are insufficient/u);
    assert.doesNotMatch(generatedInstructions, /21:45|14 days|1C:ERP 3\.0/u);
    assert.equal(generatedInstructions, buildRagSystemInstructions('en'));

    const secondWorkerRun = await workerServices.rag
      .createEmbeddingWorker()
      .runOnce(tenant, 'dev-budget-worker-two');
    assert.equal(secondWorkerRun.outcome, 'FAILED');
    if (secondWorkerRun.outcome !== 'FAILED')
      throw new Error('Expected the shared budget to block the worker.');
    assert.equal(secondWorkerRun.errorCode, 'AI_BUDGET_EXCEEDED');
    assert.deepEqual(providerAttempts, ['document_embedding', 'query_embedding', 'rag_answer']);

    const usage = await database.$queryRaw<Array<{ requestType: string; operationCount: number }>>`
      SELECT "requestType", COUNT(*)::int AS "operationCount"
      FROM "AiUsageLedger"
      WHERE "companyId" = ${tenant.companyId} AND "provider" = 'openai'
      GROUP BY "requestType" ORDER BY "requestType"
    `;
    assert.deepEqual(usage, [
      { requestType: 'document_embedding', operationCount: 1 },
      { requestType: 'query_embedding', operationCount: 1 },
      { requestType: 'rag_answer', operationCount: 1 },
    ]);
    const events = (await readFile(diagnosticsFile, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const providerEvents = events.filter((event) => event.name === 'provider_call');
    assert.equal(providerEvents.length, 3);
    assert.ok(providerEvents.every((event) => event.actualCostEur === null));
    assert.deepEqual(
      providerEvents.map(
        (event) => (event.providerDiagnostic as { stage?: string } | undefined)?.stage,
      ),
      ['document_embedding', 'query_embedding', 'rag_answer'],
    );
    assert.ok(events.some((event) => event.name === 'embedding_job_failed'));
    const usageSummary = await readAiUsageSummary(database);
    const serviceCostEur = usageSummary.operations.reduce(
      (total, operation) => total + operation.estimatedCostEur,
      0,
    );
    return {
      providerAttempts: providerAttempts.length,
      sharedBudgetRejectedWorkerOperation: true,
      usageRows: usage,
      serviceCostEur: Number(serviceCostEur.toFixed(6)),
      providerEventCount: providerEvents.length,
      diagnosticEventsPersisted: true,
    };
  } finally {
    for (const key of environmentKeys) {
      if (originalEnvironment[key] === undefined) delete mutableEnvironment[key];
      else mutableEnvironment[key] = originalEnvironment[key];
    }
    await rm(directory, { recursive: true, force: true });
  }
}

async function main() {
  const environmentFile = path.join(repositoryRoot, '.env');
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
  const sourceUrl = new URL(process.env.DATABASE_URL ?? '');
  const sourceDatabase = sourceUrl.pathname.replace(/^\/+/, '');
  if (
    !['postgres:', 'postgresql:'].includes(sourceUrl.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(sourceUrl.hostname) ||
    sourceDatabase !== 'avantime'
  ) {
    throw new Error('Session-limit integration requires loopback PostgreSQL database avantime.');
  }

  const databaseName = `avantime_ai_session_test_${randomUUID().replaceAll('-', '')}`;
  if (!/^avantime_ai_session_test_[a-f0-9]{32}$/u.test(databaseName)) {
    throw new Error('Unsafe temporary AI session integration database name.');
  }
  const adminUrl = new URL(sourceUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  const testUrl = new URL(sourceUrl);
  testUrl.pathname = `/${databaseName}`;
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  let testDatabase: PrismaClient | undefined;
  let created = false;
  let summaryPersistedBeforeDatabaseCleanup = false;
  try {
    const existing = await admin.$queryRaw<Array<{ datname: string }>>`
      SELECT datname FROM pg_database WHERE datname = ${databaseName}
    `;
    if (existing.length > 0) throw new Error('Temporary integration database already exists.');
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    created = true;
    const extensionDatabase = new PrismaClient({ datasourceUrl: testUrl.toString() });
    try {
      await extensionDatabase.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS vector');
    } finally {
      await extensionDatabase.$disconnect();
    }

    const prismaCli = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const push = spawnSync(
      prismaCli,
      [
        'prisma',
        'db',
        'push',
        '--skip-generate',
        '--schema',
        path.join(repositoryRoot, 'packages', 'database', 'prisma', 'schema.prisma'),
      ],
      {
        cwd: repositoryRoot,
        env: { ...process.env, DATABASE_URL: testUrl.toString() },
        shell: process.platform === 'win32',
        stdio: 'inherit',
      },
    );
    if (push.error) throw push.error;
    if (push.status !== 0) throw new Error('Temporary AI session database migration failed.');

    testDatabase = new PrismaClient({ datasourceUrl: testUrl.toString() });
    const developmentServiceEvidence = await verifyDevelopmentServiceBudget(testDatabase);
    await testDatabase.aiUsageLedger.deleteMany({
      where: { companyId: 'dev-service-budget-test' },
    });
    await testDatabase.aiBudgetReservation.deleteMany({
      where: { companyId: 'dev-service-budget-test' },
    });
    const controller = new PostgreSQLAiCostController(
      async () => testDatabase as unknown as VectorDatabaseClient,
      0.25,
      1,
      300_000,
      12,
      0.05,
    );
    const tenant = { companyId: 'temporary-ai-session-test', userId: 'integration-test' };
    const baseRequest = {
      tenant,
      provider: 'openai',
      model: 'gpt-5-mini',
      requestType: 'rag_answer' as const,
      estimatedCostEur: 0.0041,
    };

    for (let operation = 1; operation <= 11; operation += 1) {
      const reservation = await controller.reserve({
        ...baseRequest,
        correlationId: `session-operation-${operation}`,
        idempotencyKey: `session-operation-${operation}`,
      });
      assert.ok(reservation, `expected operation ${operation} to reserve within the cap`);
      await controller.reconcile({
        reservation,
        inputTokens: 100,
        outputTokens: 10,
        embeddingUnits: 0,
        estimatedCostEur: 0.0041,
        status: 'SUCCEEDED',
      });
    }

    const failedReservation = await controller.reserve({
      ...baseRequest,
      correlationId: 'session-operation-12',
      idempotencyKey: 'session-operation-12',
    });
    assert.ok(failedReservation);
    await controller.release(failedReservation, 'FAILED');

    assert.equal(
      await controller.reserve({
        ...baseRequest,
        estimatedCostEur: 0.001,
        correlationId: 'over-budget-operation',
        idempotencyKey: 'over-budget-operation',
      }),
      null,
      'failed reservations remain charged against the session allowance',
    );

    const thirteenthReservation = await controller.reserve({
      ...baseRequest,
      estimatedCostEur: 0.0007,
      correlationId: 'session-operation-13',
      idempotencyKey: 'session-operation-13',
    });
    assert.equal(
      thirteenthReservation,
      null,
      'operation 13 is rejected while session budget headroom remains',
    );

    assert.equal(
      await controller.reserve({
        ...baseRequest,
        estimatedCostEur: 0,
        correlationId: 'session-operation-13-zero-cost',
        idempotencyKey: 'session-operation-13-zero-cost',
      }),
      null,
      'operation 13 is rejected even with a zero estimate',
    );

    await testDatabase.aiUsageLedger.createMany({
      data: [
        {
          id: 'summary-success-response',
          companyId: 'temporary-summary-test',
          correlationId: 'completed-response',
          idempotencyKey: 'completed-response',
          requestType: 'rag_answer',
          provider: 'openai',
          model: 'gpt-5-mini',
          inputTokens: 52,
          outputTokens: 22,
          estimatedCostEur: 0.00014,
          actualCostEur: null,
          status: 'SUCCEEDED',
        },
        {
          id: 'summary-incomplete-response',
          companyId: 'temporary-summary-test',
          correlationId: 'incomplete-response',
          idempotencyKey: 'incomplete-response',
          requestType: 'rag_answer',
          provider: 'openai',
          model: 'gpt-5-mini',
          inputTokens: 52,
          outputTokens: 96,
          estimatedCostEur: 0.000436,
          actualCostEur: null,
          status: 'FAILED',
        },
        {
          id: 'summary-partial-actual-response',
          companyId: 'temporary-summary-test',
          correlationId: 'partially-known-actual',
          idempotencyKey: 'partially-known-actual',
          requestType: 'rag_answer',
          provider: 'openai',
          model: 'gpt-5-mini',
          inputTokens: 1,
          outputTokens: 1,
          estimatedCostEur: 0.000005,
          actualCostEur: 0.000004,
          status: 'SUCCEEDED',
        },
        {
          id: 'summary-known-actual-response',
          companyId: 'temporary-summary-test',
          correlationId: 'known-actual',
          idempotencyKey: 'known-actual',
          requestType: 'query_embedding',
          provider: 'openai',
          model: 'text-embedding-3-small',
          inputTokens: 1,
          outputTokens: 0,
          embeddingUnits: 1,
          estimatedCostEur: 0.000002,
          actualCostEur: 0.000001,
          status: 'SUCCEEDED',
        },
      ],
    });
    await testDatabase.aiBudgetReservation.create({
      data: {
        id: 'summary-failed-reservation',
        companyId: 'temporary-summary-test',
        provider: 'openai',
        correlationId: 'incomplete-response',
        idempotencyKey: 'incomplete-response-reservation',
        estimatedCostEur: 0.00109,
        status: 'FAILED',
        expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      },
    });
    const evidence = await readAiUsageSummary(testDatabase);
    const evidenceDirectory = await mkdtemp(path.join(tmpdir(), 'avantime-ai-summary-'));
    try {
      const evidencePath = path.join(evidenceDirectory, 'usage-summary.json');
      const evidencePayload = JSON.stringify(evidence);
      await writeFile(evidencePath, evidencePayload, { encoding: 'utf8', flag: 'wx' });
      const persistedEvidence = JSON.parse(await readFile(evidencePath, 'utf8')) as typeof evidence;
      assert.deepEqual(persistedEvidence, evidence);
      summaryPersistedBeforeDatabaseCleanup = true;
    } finally {
      await rm(evidenceDirectory, { recursive: true, force: true });
    }
    const completed = evidence.operations.find(
      (operation) => operation.requestType === 'rag_answer' && operation.status === 'SUCCEEDED',
    );
    const incomplete = evidence.operations.find((operation) => operation.status === 'FAILED');
    const knownActual = evidence.operations.find(
      (operation) => operation.requestType === 'query_embedding',
    );
    const failedReservationSummary = evidence.reservations.find(
      (reservation) => reservation.status === 'FAILED',
    );
    assert.equal(completed?.operationCount, 13);
    assert.equal(completed?.actualCostEur, null);
    assert.equal(incomplete?.operationCount, 1);
    assert.equal(incomplete?.inputTokens, '52');
    assert.equal(incomplete?.outputTokens, '96');
    assert.equal(incomplete?.estimatedCostEur, 0.000436);
    assert.equal(incomplete?.actualCostEur, null);
    assert.equal(knownActual?.actualCostEur, 0.000001);
    assert.equal(failedReservationSummary?.reservationCount, 2);
    assert.equal(failedReservationSummary?.reservedCostEur, 0.00519);
    const ordinaryBudgetController = new PostgreSQLAiCostController(
      async () => testDatabase as unknown as VectorDatabaseClient,
      0.25,
      1,
    );
    assert.equal(
      await ordinaryBudgetController.reserve({
        tenant: { companyId: 'temporary-summary-test', userId: 'integration-test' },
        provider: 'openai',
        model: 'gpt-5-mini',
        requestType: 'rag_answer',
        correlationId: 'ordinary-budget-overrun',
        idempotencyKey: 'ordinary-budget-overrun',
        estimatedCostEur: 0.248335,
      }),
      null,
      'FAILED provider usage and reservation remain charged against ordinary daily budget',
    );
    const ordinaryMonthlyBudgetController = new PostgreSQLAiCostController(
      async () => testDatabase as unknown as VectorDatabaseClient,
      1,
      0.25,
    );
    assert.equal(
      await ordinaryMonthlyBudgetController.reserve({
        tenant: { companyId: 'temporary-summary-test', userId: 'integration-test' },
        provider: 'openai',
        model: 'gpt-5-mini',
        requestType: 'rag_answer',
        correlationId: 'ordinary-monthly-budget-overrun',
        idempotencyKey: 'ordinary-monthly-budget-overrun',
        estimatedCostEur: 0.248335,
      }),
      null,
      'FAILED provider usage and reservation remain charged against ordinary monthly budget',
    );
    console.info(
      JSON.stringify({
        event: 'ai_session_budget_integration',
        result: 'passed',
        developmentServiceAccounting: developmentServiceEvidence,
        providerOperations: 12,
        sessionBudgetLimitEur: 0.05,
        reservedAndReconciledEstimateEur: 0.0492,
        overBudgetReservationRejected: true,
        thirteenthOperationRejected: true,
        usageSummaryQueriesPassedBeforeDatabaseCleanup: true,
        summaryPersistedBeforeDatabaseCleanup,
        failedUsageAndReservationBlockOrdinaryDailyOverspend: true,
        failedUsageAndReservationBlockOrdinaryMonthlyOverspend: true,
        successfulActualCostEur: completed?.actualCostEur ?? null,
        fullyKnownActualCostEur: knownActual?.actualCostEur,
        incompleteUsage: {
          inputTokens: Number(incomplete?.inputTokens),
          outputTokens: Number(incomplete?.outputTokens),
          estimatedCostEur: incomplete?.estimatedCostEur,
          actualCostEur: incomplete?.actualCostEur ?? null,
        },
        failedReservation: {
          count: failedReservationSummary?.reservationCount,
          reservedCostEur: failedReservationSummary?.reservedCostEur,
        },
        ordinaryDailyLimitEur: 0.25,
        ordinaryMonthlyLimitEur: 1,
      }),
    );
  } finally {
    try {
      await testDatabase?.$disconnect();
    } finally {
      try {
        if (created) {
          await admin.$executeRawUnsafe(`DROP DATABASE "${databaseName}" WITH (FORCE)`);
        }
      } finally {
        await admin.$disconnect();
      }
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'AI session integration failed.');
  process.exitCode = 1;
});
