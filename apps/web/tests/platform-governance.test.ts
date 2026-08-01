import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalStepUpSatisfied,
  getGovernanceApprovalPolicy,
  governanceApprovalFingerprint,
} from '../lib/governance-approval-policy';
import {
  evaluatePlatformPermission,
  permissionsForPlatformRole,
  type PlatformSystemRole,
} from '../lib/platform-permissions';
import type { AppSession } from '../lib/session';

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    userId: 'platform-user',
    name: 'Platform User',
    email: 'platform@example.test',
    company: 'Organization projection must not authorize platform access',
    companyId: 'organization-a',
    role: 'CLIENT',
    organizationRole: 'OWNER',
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    mfaSatisfied: true,
    authenticationAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

function assignment(role: PlatformSystemRole, overrides: Record<string, unknown> = {}) {
  return {
    id: `assignment-${role}`,
    userId: 'platform-user',
    role,
    active: true,
    version: 1,
    ...overrides,
  };
}

test('platform permissions are independent from organization role and deny unknown state', () => {
  assert.equal(
    evaluatePlatformPermission({ session: session(), permission: 'platform.view' }).reasonCode,
    'ASSIGNMENT_REQUIRED',
  );
  assert.equal(
    evaluatePlatformPermission({
      session: session(),
      assignment: assignment('PLATFORM_ADMIN', { active: false }),
      permission: 'platform.view',
    }).reasonCode,
    'ASSIGNMENT_INACTIVE',
  );
  assert.equal(
    evaluatePlatformPermission({
      session: session(),
      assignment: assignment('PLATFORM_ADMIN'),
      permission: 'platform.unknown',
    }).reasonCode,
    'UNKNOWN_PERMISSION',
  );
  assert.equal(
    evaluatePlatformPermission({
      session: session(),
      assignment: { ...assignment('PLATFORM_ADMIN'), role: 'UNKNOWN' },
      permission: 'platform.view',
    }).reasonCode,
    'UNKNOWN_ROLE',
  );
});

test('support, auditor and operator roles remain least privilege', () => {
  assert.equal(
    permissionsForPlatformRole('PLATFORM_AUDITOR').includes('platform.configure'),
    false,
  );
  assert.equal(
    permissionsForPlatformRole('PLATFORM_SUPPORT').includes('platform.roles.manage'),
    false,
  );
  assert.equal(
    permissionsForPlatformRole('PLATFORM_OPERATOR').includes('platform.jobs.retry'),
    true,
  );
  assert.equal(
    permissionsForPlatformRole('PLATFORM_OPERATOR').includes('platform.audit.export'),
    false,
  );
});

test('cross-tenant support permission requires a live exact-scope session', () => {
  const base = {
    session: session(),
    assignment: assignment('PLATFORM_SUPPORT'),
    permission: 'platform.support.resource.view' as const,
    operationalContext: { companyId: 'organization-b', requireSupportSession: true },
  };
  assert.equal(evaluatePlatformPermission(base).reasonCode, 'SUPPORT_SESSION_REQUIRED');
  assert.equal(
    evaluatePlatformPermission({
      ...base,
      supportSession: {
        id: 'support-session',
        actorId: 'platform-user',
        companyId: 'organization-b',
        allowedScopes: ['platform.support.resource.view'],
        expiresAt: new Date(Date.now() + 60_000),
      },
    }).allowed,
    true,
  );
  assert.equal(
    evaluatePlatformPermission({
      ...base,
      supportSession: {
        id: 'support-session',
        actorId: 'platform-user',
        companyId: 'organization-c',
        allowedScopes: ['platform.support.resource.view'],
        expiresAt: new Date(Date.now() + 60_000),
      },
    }).reasonCode,
    'SUPPORT_SESSION_INVALID',
  );
});

test('approval registry is fail-closed and fingerprint is canonical and secret-safe', () => {
  assert.equal(getGovernanceApprovalPolicy('UNKNOWN'), null);
  assert.equal(
    getGovernanceApprovalPolicy('CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION')
      ?.requiredApproverPermission,
    'platform.security.manage',
  );
  const input = {
    actionType: 'PLATFORM_OWNER_ASSIGN' as const,
    scope: 'PLATFORM' as const,
    resourceId: 'assignment-target',
    expectedVersion: 1,
    requesterId: 'requester',
    expiresAt: new Date('2026-08-01T12:00:00.000Z'),
  };
  const left = governanceApprovalFingerprint({
    ...input,
    safeParameters: { targetUserId: 'user-2', assignmentVersion: 1 },
  });
  const right = governanceApprovalFingerprint({
    ...input,
    safeParameters: { assignmentVersion: 1, targetUserId: 'user-2' },
  });
  assert.equal(left, right);
  assert.match(left, /^[a-f0-9]{64}$/u);
  assert.throws(
    () =>
      governanceApprovalFingerprint({
        ...input,
        safeParameters: { secret: 'must-not-be-recorded' },
      }),
    /UNSAFE_APPROVAL_PARAMETER/u,
  );
  assert.throws(
    () => governanceApprovalFingerprint({ ...input, safeParameters: { targetUserId: 'user-2' } }),
    /UNSAFE_APPROVAL_PARAMETER/u,
  );
});

test('approval step-up requires MFA and authentication within ten minutes', () => {
  const now = new Date('2026-08-01T12:00:00.000Z');
  assert.equal(
    approvalStepUpSatisfied({
      mfaSatisfied: true,
      authenticationAt: now.getTime() - 9 * 60_000,
      now,
    }),
    true,
  );
  assert.equal(
    approvalStepUpSatisfied({
      mfaSatisfied: true,
      authenticationAt: now.getTime() - 11 * 60_000,
      now,
    }),
    false,
  );
  assert.equal(
    approvalStepUpSatisfied({ mfaSatisfied: false, authenticationAt: now.getTime(), now }),
    false,
  );
  assert.equal(
    approvalStepUpSatisfied({
      mfaSatisfied: true,
      authenticationAt: now.getTime() + 60_000,
      now,
    }),
    false,
  );
});
