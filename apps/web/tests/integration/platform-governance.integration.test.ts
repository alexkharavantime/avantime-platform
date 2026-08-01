import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import {
  cancelGovernanceApproval,
  decideGovernanceApproval,
  executeGovernanceApproval,
  expireStaleGovernanceApprovals,
  GovernanceApprovalError,
  requestGovernanceApproval,
} from '../../lib/governance-approvals';
import { listKnowledgeArticles } from '../../lib/knowledge-store';
import { authorizePlatformSession } from '../../lib/platform-authorization';
import { executePlatformOwnerChange } from '../../lib/platform-role-governance';
import {
  endPlatformSupportSession,
  loadPlatformSupportSession,
  startPlatformSupportSession,
  terminatePlatformSupportSessionByOperator,
} from '../../lib/platform-support';
import type { AppSession } from '../../lib/session';
import { integrationDatabase } from './integration-test-environment';

function governanceSession(input: {
  userId: string;
  companyId: string;
  organizationRole?: 'OWNER' | 'ADMIN';
  now: Date;
}): AppSession {
  return {
    userId: input.userId,
    name: `Governance ${input.userId}`,
    email: `${input.userId}@example.test`,
    company: 'Governance integration tenant',
    companyId: input.companyId,
    role: 'CLIENT',
    organizationRole: input.organizationRole ?? 'OWNER',
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    mfaSatisfied: true,
    authenticationAt: input.now.getTime(),
    expiresAt: input.now.getTime() + 60_000,
  };
}

test('platform governance persists scoped support, approval replay protection, and knowledge ownership', async () => {
  const prisma = (await integrationDatabase()) as unknown as PrismaClient;
  const suffix = crypto.randomUUID();
  const now = new Date();
  const companyA = `governance-company-a-${suffix}`;
  const companyB = `governance-company-b-${suffix}`;
  const requesterId = `governance-requester-${suffix}`;
  const approverId = `governance-approver-${suffix}`;
  const targetId = `governance-target-${suffix}`;
  const concurrentTargetId = `governance-concurrent-target-${suffix}`;

  await prisma.company.createMany({
    data: [
      { id: companyA, name: 'Governance integration tenant A' },
      { id: companyB, name: 'Governance integration tenant B' },
    ],
  });
  for (const userId of [requesterId, approverId, targetId, concurrentTargetId]) {
    await prisma.user.create({
      data: {
        id: userId,
        email: `${userId}@example.test`,
        emailNormalized: `${userId}@example.test`,
        emailVerifiedAt: now,
        name: userId,
        role: 'CLIENT',
        active: true,
        companyId: companyA,
        memberships: {
          create: {
            companyId: companyA,
            role: 'ADMIN',
            organizationRole: 'OWNER',
            status: 'ACTIVE',
          },
        },
      },
    });
  }
  await prisma.platformRoleAssignment.createMany({
    data: [
      { userId: requesterId, role: 'PLATFORM_ADMIN' },
      { userId: approverId, role: 'PLATFORM_OWNER' },
    ],
  });

  const requester = governanceSession({ userId: requesterId, companyId: companyA, now });
  const approver = governanceSession({ userId: approverId, companyId: companyA, now });
  const organizationOnly = governanceSession({ userId: targetId, companyId: companyA, now });
  assert.ok((await authorizePlatformSession(organizationOnly, 'platform.view')).response);
  assert.equal((await authorizePlatformSession(requester, 'platform.view')).response, undefined);

  const supportSession = await startPlatformSupportSession({
    session: requester,
    companyId: companyB,
    reasonCode: 'INCIDENT_REVIEW',
    ticketReference: `TASK-012-${suffix}`,
    allowedScopes: ['platform.support.resource.view'],
    now,
  });
  const supportContext = await loadPlatformSupportSession({
    actorId: requesterId,
    supportSessionId: supportSession.id,
  });
  assert.ok(supportContext);
  assert.equal(
    (
      await authorizePlatformSession(requester, 'platform.support.resource.view', {
        operationalContext: {
          companyId: companyB,
          targetType: 'organization',
          targetId: companyB,
          requireSupportSession: true,
        },
        supportSession: supportContext,
      })
    ).response,
    undefined,
  );
  assert.ok(
    (
      await authorizePlatformSession(requester, 'platform.support.resource.view', {
        operationalContext: { companyId: companyA, requireSupportSession: true },
        supportSession: supportContext,
      })
    ).response,
  );

  const terminatedSupportSession = await startPlatformSupportSession({
    session: requester,
    companyId: companyB,
    reasonCode: 'INCIDENT_TERMINATE',
    ticketReference: `TASK-013-${suffix}`,
    allowedScopes: ['platform.support.resource.view'],
    now: new Date(now.getTime() + 1),
  });
  const terminated = await terminatePlatformSupportSessionByOperator({
    operatorUserId: approverId,
    supportSessionId: terminatedSupportSession.id,
    confirmation: 'TERMINATE SUPPORT SESSION',
    now: new Date(now.getTime() + 2),
  });
  assert.equal(terminated.terminated, true);
  const terminatedAgain = await terminatePlatformSupportSessionByOperator({
    operatorUserId: approverId,
    supportSessionId: terminatedSupportSession.id,
    confirmation: 'TERMINATE SUPPORT SESSION',
    now: new Date(now.getTime() + 3),
  });
  assert.equal(terminatedAgain.alreadyEnded, true);
  await endPlatformSupportSession({ session: requester, supportSessionId: supportSession.id, now });
  const endedSupportContext = await loadPlatformSupportSession({
    actorId: requesterId,
    supportSessionId: supportSession.id,
  });
  assert.ok(
    (
      await authorizePlatformSession(requester, 'platform.support.resource.view', {
        operationalContext: { companyId: companyB, requireSupportSession: true },
        supportSession: endedSupportContext,
      })
    ).response,
  );

  const approval = await requestGovernanceApproval({
    session: requester,
    actionType: 'PLATFORM_OWNER_ASSIGN',
    scope: 'PLATFORM',
    resourceId: targetId,
    expectedVersion: 0,
    safeParameters: { targetUserId: targetId, assignmentVersion: 0 },
    confirmation: 'ASSIGN PLATFORM OWNER',
    now,
  });
  await assert.rejects(
    () =>
      decideGovernanceApproval({
        session: requester,
        requestId: approval.id,
        approved: true,
        approverAuthorized: true,
        now,
      }),
    (error: unknown) =>
      error instanceof GovernanceApprovalError && error.code === 'SELF_APPROVAL_DENIED',
  );
  const approved = await decideGovernanceApproval({
    session: approver,
    requestId: approval.id,
    approved: true,
    approverAuthorized: true,
    now,
  });
  assert.equal(approved.status, 'APPROVED');
  const assignment = await executePlatformOwnerChange({
    session: requester,
    approvalId: approval.id,
    targetUserId: targetId,
    action: 'ASSIGN',
    authorized: true,
    now,
  });
  assert.equal(assignment.role, 'PLATFORM_OWNER');
  assert.equal(assignment.active, true);
  await assert.rejects(
    () =>
      executePlatformOwnerChange({
        session: requester,
        approvalId: approval.id,
        targetUserId: targetId,
        action: 'ASSIGN',
        authorized: true,
        now,
      }),
    (error: unknown) =>
      error instanceof GovernanceApprovalError && error.code === 'APPROVAL_NOT_APPROVED',
  );
  assert.equal(
    await prisma.governanceApprovalRequest.count({
      where: { id: approval.id, status: 'EXECUTED', executionKey: { not: null } },
    }),
    1,
  );

  const concurrentApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'PLATFORM_OWNER_ASSIGN',
    scope: 'PLATFORM',
    resourceId: concurrentTargetId,
    expectedVersion: 0,
    safeParameters: { targetUserId: concurrentTargetId, assignmentVersion: 0 },
    confirmation: 'ASSIGN PLATFORM OWNER',
    now: new Date(now.getTime() + 20),
  });
  await decideGovernanceApproval({
    session: approver,
    requestId: concurrentApproval.id,
    approved: true,
    approverAuthorized: true,
    now: new Date(now.getTime() + 21),
  });
  const concurrentExecutions = await Promise.allSettled([
    executePlatformOwnerChange({
      session: requester,
      approvalId: concurrentApproval.id,
      targetUserId: concurrentTargetId,
      action: 'ASSIGN',
      authorized: true,
      now: new Date(now.getTime() + 22),
    }),
    executePlatformOwnerChange({
      session: requester,
      approvalId: concurrentApproval.id,
      targetUserId: concurrentTargetId,
      action: 'ASSIGN',
      authorized: true,
      now: new Date(now.getTime() + 22),
    }),
  ]);
  assert.equal(concurrentExecutions.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrentExecutions.filter((result) => result.status === 'rejected').length, 1);

  const auditExportApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'PLATFORM_AUDIT_EXPORT',
    scope: 'PLATFORM',
    safeParameters: { from: '2026-01-01', to: '2026-01-31', format: 'json' },
    confirmation: 'EXPORT PLATFORM AUDIT',
    now: new Date(now.getTime() + 23),
  });
  await decideGovernanceApproval({
    session: approver,
    requestId: auditExportApproval.id,
    approved: true,
    approverAuthorized: true,
    now: new Date(now.getTime() + 24),
  });
  let auditExportExecutions = 0;
  const auditExportResult = await executeGovernanceApproval({
    session: requester,
    requestId: auditExportApproval.id,
    executionKey: `platform-audit-export:${auditExportApproval.id}`,
    executionAuthorized: true,
    expectedActionType: 'PLATFORM_AUDIT_EXPORT',
    now: new Date(now.getTime() + 25),
    execute: async (_transaction, evidence) => {
      auditExportExecutions += 1;
      return { approvalId: evidence.id, format: evidence.safeParameters.format };
    },
  });
  assert.deepEqual(auditExportResult, { approvalId: auditExportApproval.id, format: 'json' });
  await assert.rejects(() =>
    executeGovernanceApproval({
      session: requester,
      requestId: auditExportApproval.id,
      executionKey: `platform-audit-export:${auditExportApproval.id}`,
      executionAuthorized: true,
      expectedActionType: 'PLATFORM_AUDIT_EXPORT',
      now: new Date(now.getTime() + 26),
      execute: async () => {
        auditExportExecutions += 1;
      },
    }),
  );
  assert.equal(auditExportExecutions, 1);

  const destructiveSupportSession = await startPlatformSupportSession({
    session: requester,
    companyId: companyB,
    reasonCode: 'REQUEST_STATUS_RECOVERY',
    ticketReference: `TASK-013-DESTRUCTIVE-${suffix}`,
    allowedScopes: ['platform.support.action.execute'],
    now: new Date(now.getTime() + 27),
  });
  const destructiveSupportContext = await loadPlatformSupportSession({
    actorId: requesterId,
    supportSessionId: destructiveSupportSession.id,
  });
  const destructiveResourceId = `governance-support-resource-${suffix}`;
  const destructiveResourceVersion = 1;
  assert.equal(
    (
      await authorizePlatformSession(requester, 'platform.support.action.execute', {
        operationalContext: {
          companyId: companyB,
          targetType: 'request',
          targetId: destructiveResourceId,
          requireSupportSession: true,
        },
        supportSession: destructiveSupportContext,
      })
    ).response,
    undefined,
  );
  const destructiveApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION',
    scope: 'PLATFORM',
    companyId: companyB,
    resourceId: destructiveResourceId,
    expectedVersion: destructiveResourceVersion,
    safeParameters: {
      supportSessionId: destructiveSupportSession.id,
      operation: 'REQUEST_STATUS_CHANGE:RESOLVED',
      resourceId: destructiveResourceId,
      resourceVersion: destructiveResourceVersion,
    },
    confirmation: 'EXECUTE SUPPORT ACTION',
    now: new Date(now.getTime() + 28),
  });
  await decideGovernanceApproval({
    session: approver,
    requestId: destructiveApproval.id,
    approved: true,
    approverAuthorized: true,
    now: new Date(now.getTime() + 29),
  });
  let destructiveExecutions = 0;
  const destructiveResult = await executeGovernanceApproval({
    session: requester,
    requestId: destructiveApproval.id,
    executionKey: `support-request-status:${destructiveApproval.id}`,
    executionAuthorized: true,
    expectedActionType: 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION',
    currentResourceVersion: destructiveResourceVersion,
    now: new Date(now.getTime() + 30),
    execute: async (transaction, evidence) => {
      assert.equal(evidence.companyId, companyB);
      assert.equal(evidence.safeParameters.supportSessionId, destructiveSupportSession.id);
      assert.equal(evidence.resourceId, destructiveResourceId);
      void transaction;
      destructiveExecutions += 1;
      return { status: 'RESOLVED', version: destructiveResourceVersion + 1 };
    },
  });
  assert.deepEqual(destructiveResult, { status: 'RESOLVED', version: 2 });
  await endPlatformSupportSession({
    session: requester,
    supportSessionId: destructiveSupportSession.id,
    now: new Date(now.getTime() + 31),
  });
  assert.ok(
    (
      await authorizePlatformSession(requester, 'platform.support.action.execute', {
        operationalContext: { companyId: companyB, requireSupportSession: true },
        supportSession: await loadPlatformSupportSession({
          actorId: requesterId,
          supportSessionId: destructiveSupportSession.id,
        }),
      })
    ).response,
  );
  await assert.rejects(() =>
    executeGovernanceApproval({
      session: requester,
      requestId: destructiveApproval.id,
      executionKey: `support-request-status:${destructiveApproval.id}`,
      executionAuthorized: true,
      expectedActionType: 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION',
      currentResourceVersion: destructiveResourceVersion,
      now: new Date(now.getTime() + 32),
      execute: async () => {
        destructiveExecutions += 1;
      },
    }),
  );
  assert.equal(destructiveExecutions, 1);

  const cancelledApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'PLATFORM_AUDIT_EXPORT',
    scope: 'PLATFORM',
    safeParameters: { from: '2026-01-01', to: '2026-01-31', format: 'json' },
    confirmation: 'EXPORT PLATFORM AUDIT',
    now: new Date(now.getTime() + 1),
  });
  await cancelGovernanceApproval({
    session: requester,
    requestId: cancelledApproval.id,
    now: new Date(now.getTime() + 2),
  });
  assert.equal(
    (
      await prisma.governanceApprovalRequest.findUniqueOrThrow({
        where: { id: cancelledApproval.id },
      })
    ).status,
    'CANCELLED',
  );

  const tamperedApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'PLATFORM_AUDIT_EXPORT',
    scope: 'PLATFORM',
    safeParameters: { from: '2026-02-01', to: '2026-02-28', format: 'json' },
    confirmation: 'EXPORT PLATFORM AUDIT',
    now: new Date(now.getTime() + 3),
  });
  await decideGovernanceApproval({
    session: approver,
    requestId: tamperedApproval.id,
    approved: true,
    approverAuthorized: true,
    now: new Date(now.getTime() + 4),
  });
  await prisma.governanceApprovalRequest.update({
    where: { id: tamperedApproval.id },
    data: { safeParameters: { from: '2026-02-01', to: '2026-12-31', format: 'json' } },
  });
  let tamperedExecutorCalled = false;
  await assert.rejects(
    () =>
      executeGovernanceApproval({
        session: requester,
        requestId: tamperedApproval.id,
        executionKey: `tampered-${suffix}`,
        executionAuthorized: true,
        expectedActionType: 'PLATFORM_AUDIT_EXPORT',
        now: new Date(now.getTime() + 5),
        execute: async () => {
          tamperedExecutorCalled = true;
        },
      }),
    (error: unknown) =>
      error instanceof GovernanceApprovalError && error.code === 'APPROVAL_PAYLOAD_CHANGED',
  );
  assert.equal(tamperedExecutorCalled, false);

  const expiringApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'PLATFORM_AUDIT_EXPORT',
    scope: 'PLATFORM',
    safeParameters: { from: '2026-03-01', to: '2026-03-31', format: 'json' },
    confirmation: 'EXPORT PLATFORM AUDIT',
    now: new Date(now.getTime() + 6),
  });
  const afterExpiry = new Date(now.getTime() + 11 * 60_000);
  await assert.rejects(
    () =>
      decideGovernanceApproval({
        session: { ...approver, authenticationAt: afterExpiry.getTime() },
        requestId: expiringApproval.id,
        approved: true,
        approverAuthorized: true,
        now: afterExpiry,
      }),
    (error: unknown) =>
      error instanceof GovernanceApprovalError && error.code === 'APPROVAL_EXPIRED',
  );
  assert.equal(
    (
      await prisma.governanceApprovalRequest.findUniqueOrThrow({
        where: { id: expiringApproval.id },
      })
    ).status,
    'EXPIRED',
  );

  const cleanupApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'PLATFORM_AUDIT_EXPORT',
    scope: 'PLATFORM',
    safeParameters: { from: '2026-04-01', to: '2026-04-30', format: 'json' },
    confirmation: 'EXPORT PLATFORM AUDIT',
    now: new Date(now.getTime() + 30),
  });
  const cleanupResult = await expireStaleGovernanceApprovals({
    actorId: approverId,
    now: new Date(now.getTime() + 11 * 60_000),
  });
  assert.ok(cleanupResult.expired >= 1);
  assert.equal(
    (
      await prisma.governanceApprovalRequest.findUniqueOrThrow({
        where: { id: cleanupApproval.id },
      })
    ).status,
    'EXPIRED',
  );

  const articleA = await prisma.knowledgeArticle.create({
    data: {
      slug: `governance-a-${suffix}`,
      title: 'Tenant A knowledge',
      summary: 'Tenant A only',
      category: 'governance',
      content: [],
      status: 'PUBLISHED',
      ownerScope: 'ORGANIZATION',
      companyId: companyA,
      visibility: 'ORGANIZATION',
      classificationEvidence: 'integration-explicit-owner',
    },
  });
  await prisma.knowledgeArticle.create({
    data: {
      slug: `governance-b-${suffix}`,
      title: 'Tenant B knowledge',
      summary: 'Tenant B only',
      category: 'governance',
      content: [],
      status: 'PUBLISHED',
      ownerScope: 'ORGANIZATION',
      companyId: companyB,
      visibility: 'ORGANIZATION',
      classificationEvidence: 'integration-explicit-owner',
    },
  });
  const tenantAArticles = await listKnowledgeArticles({
    audience: { kind: 'ORGANIZATION', companyId: companyA },
  });
  assert.equal(
    tenantAArticles.some((article) => article.slug === articleA.slug),
    true,
  );
  assert.equal(
    tenantAArticles.some((article) => article.slug === `governance-b-${suffix}`),
    false,
  );
  await assert.rejects(() =>
    prisma.knowledgeArticle.update({
      where: { id: articleA.id },
      data: { companyId: companyB },
    }),
  );

  await assert.rejects(() =>
    prisma.knowledgeArticle.update({
      where: { id: articleA.id },
      data: { visibility: 'PUBLIC', publicationApprovalId: null },
    }),
  );

  const publicationApproval = await requestGovernanceApproval({
    session: requester,
    actionType: 'KNOWLEDGE_VISIBILITY_PUBLIC',
    scope: 'ORGANIZATION',
    companyId: companyA,
    resourceId: articleA.id,
    expectedVersion: articleA.version,
    safeParameters: { articleId: articleA.id, articleVersion: articleA.version },
    confirmation: 'PUBLISH ORGANIZATION KNOWLEDGE',
    now: new Date(now.getTime() + 40),
  });
  await decideGovernanceApproval({
    session: approver,
    requestId: publicationApproval.id,
    approved: true,
    approverAuthorized: true,
    now: new Date(now.getTime() + 41),
  });
  await executeGovernanceApproval({
    session: requester,
    requestId: publicationApproval.id,
    executionKey: `knowledge-public:${publicationApproval.id}`,
    executionAuthorized: true,
    expectedActionType: 'KNOWLEDGE_VISIBILITY_PUBLIC',
    currentResourceVersion: articleA.version,
    now: new Date(now.getTime() + 42),
    execute: async (transaction, approvalEvidence) => {
      assert.equal(approvalEvidence.resourceId, articleA.id);
      await transaction.knowledgeArticle.update({
        where: { id: articleA.id },
        data: {
          visibility: 'PUBLIC',
          publicationApprovalId: approvalEvidence.id,
          version: { increment: 1 },
        },
      });
    },
  });
  const published = await prisma.knowledgeArticle.findUniqueOrThrow({ where: { id: articleA.id } });
  assert.equal(published.visibility, 'PUBLIC');
  assert.equal(published.publicationApprovalId, publicationApproval.id);
});
