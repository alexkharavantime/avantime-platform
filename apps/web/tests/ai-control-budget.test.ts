import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiBudgetDeniedError,
  PostgreSQLAiCostController,
  type AiBudgetReservationRequest,
} from '../lib/ai-control';
import type { VectorDatabaseClient } from '../lib/vector-repository';

interface TransactionalTestDatabase extends VectorDatabaseClient {
  $transaction<T>(callback: (database: TransactionalTestDatabase) => Promise<T>): Promise<T>;
}

function createController(totals: Record<string, number | null>) {
  let reservationWrites = 0;
  const database: TransactionalTestDatabase = {
    $transaction: async (callback) => callback(database),
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async <T>(query: string) => {
      if (query.includes('COALESCE(policy."dailyLimitEur"')) {
        return [totals] as T;
      }
      reservationWrites += 1;
      return [{ id: 'unexpected-reservation' }] as T;
    },
  };
  return {
    controller: new PostgreSQLAiCostController(async () => database, 0, 0),
    reservationWrites: () => reservationWrites,
  };
}

const request: AiBudgetReservationRequest = {
  tenant: { companyId: 'avantime', userId: 'test-user' },
  provider: 'openai',
  model: 'gpt-5-mini',
  requestType: 'rag_answer',
  correlationId: 'budget-test',
  idempotencyKey: 'budget-test',
  estimatedCostEur: 0.01,
};

function totals(
  overrides: Partial<Record<string, number | null>> = {},
): Record<string, number | null> {
  return {
    dailyLimit: 0,
    monthlyLimit: 0,
    providerLimit: null,
    hardStopThreshold: 1,
    dailyUsage: 0,
    monthlyUsage: 0,
    providerUsage: 0,
    reserved: 0,
    providerReserved: 0,
    ...overrides,
  };
}

test('PostgreSQL AI ledger identifies an unconfigured budget without writing a reservation', async () => {
  const { controller, reservationWrites } = createController(totals());

  await assert.rejects(
    controller.reserve(request),
    (error: unknown) => error instanceof AiBudgetDeniedError && error.reason === 'not_configured',
  );
  assert.equal(reservationWrites(), 0);
});

test('PostgreSQL AI ledger distinguishes reached limits from an insufficient reservation', async () => {
  const cases = [
    {
      name: 'daily limit reached',
      values: totals({ dailyLimit: 1, monthlyLimit: 10, dailyUsage: 1, monthlyUsage: 1 }),
      expected: 'daily_limit_reached',
    },
    {
      name: 'monthly limit reached',
      values: totals({ dailyLimit: 10, monthlyLimit: 1, dailyUsage: 0.25, monthlyUsage: 1 }),
      expected: 'monthly_limit_reached',
    },
    {
      name: 'reservation exceeds remaining daily budget',
      values: totals({ dailyLimit: 1, monthlyLimit: 10, dailyUsage: 0.999, monthlyUsage: 1 }),
      expected: 'insufficient_reservation',
    },
    {
      name: 'active reservation occupies the remaining daily budget',
      values: totals({
        dailyLimit: 1,
        monthlyLimit: 10,
        dailyUsage: 0.25,
        monthlyUsage: 1,
        reserved: 0.75,
      }),
      expected: 'daily_limit_reached',
    },
  ] as const;

  for (const item of cases) {
    const { controller, reservationWrites } = createController(item.values);
    await assert.rejects(
      controller.reserve(request),
      (error: unknown) =>
        error instanceof AiBudgetDeniedError && error.reason === item.expected,
      item.name,
    );
    assert.equal(reservationWrites(), 0, item.name);
  }
});

test('PostgreSQL AI ledger reports provider-specific limits separately', async () => {
  const { controller, reservationWrites } = createController(
    totals({ dailyLimit: 10, monthlyLimit: 10, providerLimit: 0.01, providerUsage: 0.01 }),
  );

  await assert.rejects(
    controller.reserve(request),
    (error: unknown) =>
      error instanceof AiBudgetDeniedError && error.reason === 'provider_limit_reached',
  );
  assert.equal(reservationWrites(), 0);
});
