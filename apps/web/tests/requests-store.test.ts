import assert from 'node:assert/strict';
import test from 'node:test';

import { listRequests, listRequestsStrict } from '../lib/requests-store';
import type { AppSession } from '../lib/session';

const prismaGlobal = globalThis as typeof globalThis & {
  avantimePrismaClient?: unknown;
};

test('strict request list distinguishes an empty tenant list from a database failure', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousPrismaClient = prismaGlobal.avantimePrismaClient;
  const session: AppSession = {
    userId: 'synthetic-user',
    name: 'Synthetic User',
    email: 'synthetic-user@example.test',
    company: 'Synthetic Tenant',
    companyId: 'synthetic-tenant',
    role: 'CLIENT',
    expiresAt: Date.now() + 60_000,
  };

  process.env.DATABASE_URL = 'postgresql://synthetic.invalid/database';
  try {
    prismaGlobal.avantimePrismaClient = { supportRequest: { findMany: async () => [] } };
    assert.deepEqual(await listRequestsStrict(session), []);

    prismaGlobal.avantimePrismaClient = {
      supportRequest: {
        findMany: async () => {
          throw new Error('Synthetic database outage.');
        },
      },
    };
    await assert.rejects(listRequestsStrict(session), {
      message: 'Request list is unavailable.',
    });
    assert.deepEqual(await listRequests(session), []);
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousPrismaClient === undefined) delete prismaGlobal.avantimePrismaClient;
    else prismaGlobal.avantimePrismaClient = previousPrismaClient;
  }
});