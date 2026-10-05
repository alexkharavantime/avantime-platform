import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PrismaClient } from '@prisma/client';

import { PostgreSQLAiCostController } from '../lib/ai-control';
import type { VectorDatabaseClient } from '../lib/vector-repository';

const webDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(webDirectory, '../..');

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
    const controller = new PostgreSQLAiCostController(
      async () => testDatabase as unknown as VectorDatabaseClient,
      0.25,
      1,
      300_000,
      13,
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
    assert.ok(thirteenthReservation, 'the 13th operation fits both session limits');
    await controller.reconcile({
      reservation: thirteenthReservation,
      inputTokens: 10,
      outputTokens: 2,
      embeddingUnits: 0,
      estimatedCostEur: 0.0007,
      status: 'SUCCEEDED',
    });

    assert.equal(
      await controller.reserve({
        ...baseRequest,
        estimatedCostEur: 0,
        correlationId: 'session-operation-14',
        idempotencyKey: 'session-operation-14',
      }),
      null,
      'operation 14 is rejected even though a fraction of the euro cap remains',
    );
    console.info(
      JSON.stringify({
        event: 'ai_session_budget_integration',
        result: 'passed',
        providerOperations: 13,
        sessionBudgetLimitEur: 0.05,
        reservedAndReconciledEstimateEur: 0.0499,
        overBudgetReservationRejected: true,
        fourteenthOperationRejected: true,
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
