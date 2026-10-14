import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PostgreSQLAiCostController,
  type AiBudgetReservationRequest,
} from '../lib/ai-control';
import type { VectorDatabaseClient } from '../lib/vector-repository';

interface TransactionalTestDatabase extends VectorDatabaseClient {
  $transaction<T>(callback: (database: TransactionalTestDatabase) => Promise<T>): Promise<T>;
}

test('PostgreSQL AI ledger refuses reservations when no finite budget is configured', async () => {
  let reservationWrites = 0;
  const database: TransactionalTestDatabase = {
    $transaction: async (callback) => callback(database),
    $executeRawUnsafe: async () => 0,
    $queryRawUnsafe: async <T>(query: string) => {
      if (query.includes('COALESCE(policy."dailyLimitEur"')) {
        return [
          {
            dailyLimit: 0,
            monthlyLimit: 0,
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
      return [{ id: 'unexpected-reservation' }] as T;
    },
  };

  const controller = new PostgreSQLAiCostController(async () => database, 0, 0);
  const request: AiBudgetReservationRequest = {
    tenant: { companyId: 'avantime', userId: 'test-user' },
    provider: 'openai',
    model: 'gpt-5-mini',
    requestType: 'rag_answer',
    correlationId: 'zero-budget-test',
    idempotencyKey: 'zero-budget-test',
    estimatedCostEur: 0.01,
  };

  assert.equal(await controller.reserve(request), null);
  assert.equal(reservationWrites, 0);
});
