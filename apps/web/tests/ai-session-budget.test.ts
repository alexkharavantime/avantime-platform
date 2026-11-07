import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiBudgetDeniedError,
  MemoryAiCostController,
  PostgreSQLAiCostController,
  type AiBudgetReservationRequest,
} from '../lib/ai-control';
import { configureLocalRagProfile } from '../lib/local-rag-profile';
import { loadRagConfiguration } from '../lib/rag-configuration';
import type { VectorDatabaseClient } from '../lib/vector-repository';

interface TransactionalTestDatabase extends VectorDatabaseClient {
  $transaction<T>(callback: (database: TransactionalTestDatabase) => Promise<T>): Promise<T>;
}

const request: AiBudgetReservationRequest = {
  tenant: { companyId: 'avantime', userId: 'test-user' },
  provider: 'openai',
  model: 'gpt-5-mini',
  requestType: 'rag_answer',
  correlationId: 'session-test',
  idempotencyKey: 'session-test',
  estimatedCostEur: 0.004,
};

const base = { NODE_ENV: 'test', DOCUMENT_EMBEDDING_DRIVER: 'fake', RAG_ANSWER_DRIVER: 'fake' };

function isDenied(reason: string) {
  return (error: unknown) => error instanceof AiBudgetDeniedError && error.reason === reason;
}

test('a manual session budget requires a start time and is unavailable in production', () => {
  const limits = loadRagConfiguration({
    ...base,
    AI_SESSION_BUDGET_EUR: '0.03',
    AI_SESSION_STARTED_AT: '2026-10-25T10:00:00+03:00',
  }).limits;
  assert.equal(limits.sessionBudgetLimitEur, 0.03);
  assert.equal(limits.sessionStartedAt, '2026-10-25T07:00:00.000Z');
  assert.equal(loadRagConfiguration(base).limits.sessionBudgetLimitEur, undefined);

  assert.throws(
    () => loadRagConfiguration({ ...base, AI_SESSION_BUDGET_EUR: '0.03' }),
    /AI_SESSION_STARTED_AT must be an ISO timestamp/u,
  );
  assert.throws(
    () =>
      loadRagConfiguration({
        ...base,
        AI_SESSION_BUDGET_EUR: '0',
        AI_SESSION_STARTED_AT: '2026-10-25T07:00:00Z',
      }),
    /AI_SESSION_BUDGET_EUR must be a positive number/u,
  );
  assert.throws(
    () =>
      loadRagConfiguration({
        NODE_ENV: 'production',
        DOCUMENT_EMBEDDING_DRIVER: 'openai',
        RAG_ANSWER_DRIVER: 'openai',
        OPENAI_API_KEY: 'test-key',
        DOCUMENT_VECTOR_DRIVER: 'pgvector',
        DATABASE_URL: 'postgresql://user@localhost/test',
        REDIS_URL: 'redis://localhost:6379',
        AI_SESSION_BUDGET_EUR: '0.03',
        AI_SESSION_STARTED_AT: '2026-10-25T07:00:00Z',
      }),
    /not available in production/u,
  );
});

test('the local real profile starts a manual session at launch unless a start is given', () => {
  const launched: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    AI_SESSION_BUDGET_EUR: '0.03',
  };
  configureLocalRagProfile(launched, 'real', 'web');
  assert.ok(!Number.isNaN(Date.parse(launched.AI_SESSION_STARTED_AT ?? '')));

  const resumed: Record<string, string | undefined> = {
    NODE_ENV: 'test',
    AI_SESSION_BUDGET_EUR: '0.03',
    AI_SESSION_STARTED_AT: '2026-10-25T07:00:00Z',
  };
  configureLocalRagProfile(resumed, 'real', 'web');
  assert.equal(resumed.AI_SESSION_STARTED_AT, '2026-10-25T07:00:00Z');

  const unlimited: Record<string, string | undefined> = { NODE_ENV: 'test' };
  configureLocalRagProfile(unlimited, 'real', 'web');
  assert.equal(unlimited.AI_SESSION_STARTED_AT, undefined);
});

test('the memory session cap counts spend, open reservations and the next estimate', async () => {
  const controller = new MemoryAiCostController(1, 10, () => new Date(), undefined, 0.01);
  const first = await controller.reserve({ ...request, idempotencyKey: 'first' });
  assert.ok(first);
  await controller.reconcile({
    reservation: first,
    inputTokens: 100,
    outputTokens: 100,
    embeddingUnits: 0,
    estimatedCostEur: 0.003,
    status: 'SUCCEEDED',
  });
  const open = await controller.reserve({ ...request, idempotencyKey: 'open' });
  assert.ok(open);

  // 0.003 spent + 0.004 open + 0.004 next = 0.011 > 0.01.
  await assert.rejects(
    controller.reserve({ ...request, idempotencyKey: 'next' }),
    isDenied('insufficient_reservation'),
  );
});

function sessionDatabase(session: { providerOperations: number; providerSpendEur: number }) {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  let reservationWrites = 0;
  const database: TransactionalTestDatabase = {
    $transaction: async (callback) => callback(database),
    $executeRawUnsafe: async (query: string, ...values: unknown[]) => {
      calls.push({ query, values });
      return 0;
    },
    $queryRawUnsafe: async <T>(query: string, ...values: unknown[]) => {
      calls.push({ query, values });
      if (query.includes('"providerSpendEur"')) return [session] as T;
      if (query.includes('COALESCE(policy."dailyLimitEur"')) {
        return [
          {
            dailyLimit: 1,
            monthlyLimit: 10,
            providerLimit: null,
            hardStopThreshold: 1,
            dailyUsage: 0,
            monthlyUsage: 0,
            providerUsage: 0,
            reserved: 0,
            providerReserved: 0,
          },
        ] as T;
      }
      reservationWrites += 1;
      return [{ id: 'reservation' }] as T;
    },
  };
  return { database, calls, reservationWrites: () => reservationWrites };
}

test('the PostgreSQL session cap denies an operation that does not fit before reserving it', async () => {
  const startedAt = new Date('2026-10-25T07:00:00Z');
  const denied = sessionDatabase({ providerOperations: 3, providerSpendEur: 0.027 });
  const controller = new PostgreSQLAiCostController(
    async () => denied.database,
    0,
    0,
    300_000,
    undefined,
    0.03,
    startedAt,
  );

  await assert.rejects(controller.reserve(request), isDenied('insufficient_reservation'));
  assert.equal(denied.reservationWrites(), 0);
  const lock = denied.calls.find((call) => call.query.includes('pg_advisory_xact_lock'));
  assert.deepEqual(lock?.values, ['real-ai-provider-operation-session']);
  const session = denied.calls.find((call) => call.query.includes('"providerSpendEur"'));
  assert.deepEqual(session?.values, ['2026-10-25T07:00:00.000Z']);
  assert.match(session?.query ?? '', /"status" IN \('RESERVED', 'FAILED', 'CANCELLED'\)/u);

  const allowed = sessionDatabase({ providerOperations: 3, providerSpendEur: 0.025 });
  await new PostgreSQLAiCostController(
    async () => allowed.database,
    0,
    0,
    300_000,
    undefined,
    0.03,
    startedAt,
  ).reserve(request);
  assert.equal(allowed.reservationWrites(), 1);
});

test('isolated diagnostic databases keep counting the whole ledger', async () => {
  const isolated = sessionDatabase({ providerOperations: 0, providerSpendEur: 0 });
  await new PostgreSQLAiCostController(
    async () => isolated.database,
    0,
    0,
    300_000,
    undefined,
    0.05,
  ).reserve(request);
  const session = isolated.calls.find((call) => call.query.includes('"providerSpendEur"'));
  assert.deepEqual(session?.values, [null]);
});
