import assert from 'node:assert/strict';
import test from 'node:test';

import type { PrismaClient } from '@prisma/client';

import {
  cancelGovernanceApproval,
  decideGovernanceApproval,
  executeGovernanceApproval,
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

  await prisma.company.createMany({
    data: [
      { id: companyA, name: 'Governance integration tenant A' },
      { id: companyB, name: 'Governance integration tenant B' },
    ],
  });
  for (const userId of [requesterId, approverId, targetId]) {
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
});
