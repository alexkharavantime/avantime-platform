import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import { TestJiraProvider, type JiraProviderAdapter } from '../../lib/jira';
import { loadJiraConfiguration } from '../../lib/jira-configuration';
import { processJiraOperationBatch } from '../../lib/jira-outbox';
import { createRequest, getRequest } from '../../lib/requests-store';
import type { AppSession } from '../../lib/session';
import { integrationDatabase } from './integration-test-environment';

function jiraEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    JIRA_INTEGRATION_ENABLED: 'true',
    JIRA_MODE: 'test',
    JIRA_BASE_URL: 'https://jira.test.invalid',
    JIRA_PROJECT_KEY: 'TEST',
    JIRA_ISSUE_TYPE: 'Task',
    JIRA_REQUEST_TIMEOUT_MS: '5000',
    JIRA_MAX_ATTEMPTS: '3',
    JIRA_BATCH_SIZE: '10',
    JIRA_LEASE_MS: '5000',
    JIRA_POLL_INTERVAL_MS: '250',
  };
}

function disabledJiraEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    JIRA_INTEGRATION_ENABLED: 'false',
    JIRA_MODE: 'disabled',
  };
}

function session(companyId: string, userId: string, label: string): AppSession {
  return {
    userId,
    name: `Jira ${label}`,
    company: `Jira ${label}`,
    companyId,
    email: `${label}@jira.test`,
    role: 'CLIENT',
    organizationRole: 'MEMBER',
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    expiresAt: Date.now() + 60_000,
  };
}

function requestInput(label: string) {
  return {
    title: `Jira integration ${label}`,
    description: `Synthetic Jira integration description for ${label}.`,
    category: 'Интеграция',
    priority: 'HIGH' as const,
  };
}

test('Jira request creation is atomic, tenant-safe, idempotent and reaches retry/DLQ states', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const runId = crypto.randomUUID();
  const companyId = `jira-company-${runId}`;
  const userId = `jira-user-${runId}`;
  const foreignCompanyId = `jira-foreign-company-${runId}`;
  const foreignUserId = `jira-foreign-user-${runId}`;
  const correlationPrefix = `jira-${runId}`;
  const ownSession = session(companyId, userId, `own-${runId}`);
  const foreignSession = session(foreignCompanyId, foreignUserId, `foreign-${runId}`);
  const configuration = loadJiraConfiguration(jiraEnvironment());
  try {
    await prisma.company.createMany({
      data: [
        { id: companyId, name: 'Jira integration company' },
        { id: foreignCompanyId, name: 'Foreign Jira integration company' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: userId,
          email: `jira-${runId}@integration.test`,
          emailNormalized: `jira-${runId}@integration.test`,
          name: 'Jira integration user',
          companyId,
        },
        {
          id: foreignUserId,
          email: `jira-foreign-${runId}@integration.test`,
          emailNormalized: `jira-foreign-${runId}@integration.test`,
          name: 'Foreign Jira integration user',
          companyId: foreignCompanyId,
        },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        { id: `jira-membership-${runId}`, userId, companyId, organizationRole: 'MEMBER' },
        {
          id: `jira-foreign-membership-${runId}`,
          userId: foreignUserId,
          companyId: foreignCompanyId,
          organizationRole: 'MEMBER',
        },
      ],
    });
    const mapping = await prisma.jiraOrganizationMapping.create({
      data: { companyId, projectKey: 'TEST', issueType: 'Task', enabled: true },
    });

    const created = await Promise.all(
      ['success-a', 'success-b'].map((label) =>
        createRequest(requestInput(label), ownSession, {
          correlationId: `${correlationPrefix}:${label}`,
          idempotencyKey: `request:${runId}:${label}`,
          environment: jiraEnvironment(),
        }),
      ),
    );
    assert.equal(
      created.every((request) => request.jiraIntegrationStatus === 'PENDING'),
      true,
    );
    const operations = await prisma.jiraOperation.findMany({
      where: { companyId, request: { publicId: { in: created.map((request) => request.id) } } },
    });
    assert.equal(operations.length, 2);
    assert.equal(
      operations.every((operation) => operation.mappingId === mapping.id),
      true,
    );

    const duplicate = await createRequest(requestInput('success-a'), ownSession, {
      correlationId: `${correlationPrefix}:duplicate-submit`,
      idempotencyKey: `request:${runId}:success-a`,
      environment: jiraEnvironment(),
    });
    assert.equal(duplicate.id, created[0]?.id);
    assert.equal(
      await prisma.supportRequest.count({
        where: { idempotencyKey: `request:${runId}:success-a` },
      }),
      1,
    );

    const baseProvider = new TestJiraProvider(configuration);
    const deliveryCalls = new Map<string, number>();
    const provider: JiraProviderAdapter = {
      kind: 'test',
      checkReadiness: () => baseProvider.checkReadiness(),
      createIssue: async (payload, attempt) => {
        deliveryCalls.set(payload.marker, (deliveryCalls.get(payload.marker) ?? 0) + 1);
        return baseProvider.createIssue(payload, attempt);
      },
    };
    const workers = await Promise.all([
      processJiraOperationBatch({ provider, batchSize: 1, leaseMs: 5_000 }),
      processJiraOperationBatch({ provider, batchSize: 1, leaseMs: 5_000 }),
    ]);
    assert.equal(
      workers.reduce((total, worker) => total + worker.claimed, 0),
      2,
    );
    assert.equal(
      workers.reduce((total, worker) => total + worker.completed, 0),
      2,
    );
    assert.deepEqual([...deliveryCalls.values()].sort(), [1, 1]);
    assert.equal(
      await prisma.supportRequest.count({
        where: {
          publicId: { in: created.map((request) => request.id) },
          jiraIntegrationStatus: 'CREATED',
        },
      }),
      2,
    );
    assert.equal(
      await prisma.notificationOutbox.count({
        where: {
          correlationId: { startsWith: correlationPrefix },
          notificationType: 'JIRA_ISSUE_CREATED',
        },
      }),
      2,
    );
    assert.deepEqual(await processJiraOperationBatch({ provider, batchSize: 10, leaseMs: 5_000 }), {
      claimed: 0,
      completed: 0,
      failed: 0,
      deadLettered: 0,
    });
    assert.equal(await getRequest(created[0]!.id, foreignSession), null);

    const retryRequest = await createRequest(requestInput('retry'), ownSession, {
      correlationId: `${correlationPrefix}:retry`,
      idempotencyKey: `request:${runId}:retry`,
      environment: jiraEnvironment(),
    });
    let retryOperation = await prisma.jiraOperation.findFirstOrThrow({
      where: { request: { publicId: retryRequest.id } },
    });
    const retryProvider = new TestJiraProvider(configuration, { transientFailures: 2 });
    for (const expectedAttempt of [1, 2]) {
      const result = await processJiraOperationBatch({
        provider: retryProvider,
        batchSize: 1,
        leaseMs: 5_000,
        now: new Date(retryOperation.nextAttemptAt.getTime() + 1),
        correlationId: `${correlationPrefix}:retry`,
      });
      assert.deepEqual(result, { claimed: 1, completed: 0, failed: 1, deadLettered: 0 });
      retryOperation = await prisma.jiraOperation.findFirstOrThrow({
        where: { request: { publicId: retryRequest.id } },
      });
      assert.equal(retryOperation.status, 'FAILED');
      assert.equal(retryOperation.attempts, expectedAttempt);
      assert.equal(retryOperation.leaseUntil, null);
    }
    assert.deepEqual(
      await processJiraOperationBatch({
        provider: retryProvider,
        batchSize: 1,
        leaseMs: 5_000,
        now: new Date(retryOperation.nextAttemptAt.getTime() + 1),
        correlationId: `${correlationPrefix}:retry`,
      }),
      { claimed: 1, completed: 1, failed: 0, deadLettered: 0 },
    );
    assert.equal(
      (await prisma.supportRequest.findUniqueOrThrow({ where: { publicId: retryRequest.id } }))
        .jiraIntegrationStatus,
      'CREATED',
    );

    const permanentRequest = await createRequest(requestInput('permanent'), ownSession, {
      correlationId: `${correlationPrefix}:permanent`,
      idempotencyKey: `request:${runId}:permanent`,
      environment: jiraEnvironment(),
    });
    assert.deepEqual(
      await processJiraOperationBatch({
        provider: new TestJiraProvider(configuration, { permanentFailure: true }),
        batchSize: 1,
        leaseMs: 5_000,
        correlationId: `${correlationPrefix}:permanent`,
      }),
      { claimed: 1, completed: 0, failed: 0, deadLettered: 1 },
    );
    const permanentOperation = await prisma.jiraOperation.findFirstOrThrow({
      where: { request: { publicId: permanentRequest.id } },
    });
    assert.equal(permanentOperation.status, 'DEAD_LETTER');
    assert.equal(permanentOperation.attempts, 1);
    assert.equal(
      (await prisma.supportRequest.findUniqueOrThrow({ where: { publicId: permanentRequest.id } }))
        .jiraIntegrationStatus,
      'DEAD_LETTER',
    );

    const recoveryRequest = await createRequest(requestInput('recovery'), ownSession, {
      correlationId: `${correlationPrefix}:recovery`,
      idempotencyKey: `request:${runId}:recovery`,
      environment: jiraEnvironment(),
    });
    const recoveryOperation = await prisma.jiraOperation.findFirstOrThrow({
      where: { request: { publicId: recoveryRequest.id } },
    });
    await prisma.jiraOperation.update({
      where: { id: recoveryOperation.id },
      data: {
        status: 'PROCESSING',
        attempts: 1,
        leaseToken: 'expired-lease',
        leaseUntil: new Date(Date.now() - 1_000),
      },
    });
    assert.deepEqual(
      await processJiraOperationBatch({
        provider: new TestJiraProvider(configuration),
        batchSize: 1,
        leaseMs: 5_000,
        correlationId: `${correlationPrefix}:recovery`,
      }),
      { claimed: 1, completed: 1, failed: 0, deadLettered: 0 },
    );

    await prisma.jiraOrganizationMapping.update({
      where: { companyId },
      data: { enabled: false, version: { increment: 1 } },
    });
    const disabledMapping = await createRequest(requestInput('mapping-disabled'), ownSession, {
      correlationId: `${correlationPrefix}:mapping-disabled`,
      idempotencyKey: `request:${runId}:mapping-disabled`,
      environment: jiraEnvironment(),
    });
    assert.equal(disabledMapping.jiraIntegrationStatus, 'NOT_CONFIGURED');
    assert.equal(
      await prisma.jiraOperation.count({ where: { request: { publicId: disabledMapping.id } } }),
      0,
    );

    const missingMapping = await createRequest(requestInput('mapping-missing'), foreignSession, {
      correlationId: `${correlationPrefix}:mapping-missing`,
      idempotencyKey: `request:${runId}:mapping-missing`,
      environment: jiraEnvironment(),
    });
    assert.equal(missingMapping.jiraIntegrationStatus, 'NOT_CONFIGURED');
    assert.equal(
      await prisma.jiraOperation.count({ where: { request: { publicId: missingMapping.id } } }),
      0,
    );

    const jiraDisabled = await createRequest(requestInput('jira-disabled'), ownSession, {
      correlationId: `${correlationPrefix}:jira-disabled`,
      idempotencyKey: `request:${runId}:jira-disabled`,
      environment: disabledJiraEnvironment(),
    });
    assert.equal(jiraDisabled.jiraIntegrationStatus, 'NOT_CONFIGURED');
    assert.equal(
      await prisma.jiraOperation.count({ where: { request: { publicId: jiraDisabled.id } } }),
      0,
    );
  } finally {
    const requestIds = (
      await prisma.supportRequest.findMany({
        where: { OR: [{ companyId }, { companyId: foreignCompanyId }] },
        select: { id: true },
      })
    ).map((request) => request.id);
    await prisma.notificationOutbox.deleteMany({
      where: { correlationId: { startsWith: correlationPrefix } },
    });
    await prisma.productionAuditEvent.deleteMany({
      where: { correlationId: { startsWith: correlationPrefix } },
    });
    await prisma.portalNotification.deleteMany({
      where: { companyId: { in: [companyId, foreignCompanyId] } },
    });
    await prisma.jiraOperation.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.supportRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.jiraOrganizationMapping.deleteMany({
      where: { companyId: { in: [companyId, foreignCompanyId] } },
    });
    await prisma.organizationMembership.deleteMany({
      where: { companyId: { in: [companyId, foreignCompanyId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: [userId, foreignUserId] } } });
    await prisma.company.deleteMany({ where: { id: { in: [companyId, foreignCompanyId] } } });
  }
});
