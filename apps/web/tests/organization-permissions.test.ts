import assert from 'node:assert/strict';
import test from 'node:test';

import { MemoryProductionAuditTrail } from '../lib/production-audit';
import {
  appendOrganizationAudit,
  ORGANIZATION_SECURITY_NOTIFICATION_TITLES,
} from '../lib/organization-audit';
import {
  evaluateCriticalOrganizationAction,
  evaluateOrganizationPermission,
  evaluateRoleAssignment,
  permissionsForRole,
  resolveSsoOrganizationRole,
} from '../lib/organization-permissions';
import { buildPortalNavigation } from '../lib/portal-navigation';
import type { AppSession, OrganizationRole } from '../lib/session';

function session(role: OrganizationRole, overrides: Partial<AppSession> = {}): AppSession {
  return {
    userId: 'permission-user',
    name: 'Permission User',
    email: 'permission@example.test',
    company: 'Permission Tenant',
    companyId: 'permission-tenant',
    role: role === 'OWNER' || role === 'ADMIN' ? 'ADMIN' : 'CLIENT',
    organizationRole: role,
    membershipStatus: 'ACTIVE',
    membershipVersion: 1,
    mfaSatisfied: true,
    authenticationAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

test('system role permissions are explicit and least-privilege', () => {
  assert.equal(
    evaluateOrganizationPermission(session('OWNER'), 'identity.policy.manage').allowed,
    true,
  );
  assert.equal(
    evaluateOrganizationPermission(session('ADMIN'), 'identity.providers.manage').allowed,
    true,
  );
  assert.equal(
    evaluateOrganizationPermission(session('MANAGER'), 'documents.reprocess').allowed,
    true,
  );
  assert.equal(
    evaluateOrganizationPermission(session('MANAGER'), 'identity.providers.manage').allowed,
    false,
  );
  assert.equal(evaluateOrganizationPermission(session('MEMBER'), 'requests.create').allowed, true);
  assert.equal(
    evaluateOrganizationPermission(session('MEMBER'), 'documents.reprocess').allowed,
    false,
  );
  assert.equal(evaluateOrganizationPermission(session('VIEWER'), 'requests.view').allowed, true);
  assert.equal(evaluateOrganizationPermission(session('VIEWER'), 'requests.create').allowed, false);
  assert.ok(permissionsForRole('OWNER').length > permissionsForRole('MEMBER').length);
});

test('permission resolution denies unknown, inactive, suspended, and cross-tenant contexts', () => {
  assert.equal(
    evaluateOrganizationPermission(null, 'requests.view').reasonCode,
    'AUTHENTICATION_REQUIRED',
  );
  assert.equal(
    evaluateOrganizationPermission(session('MEMBER'), 'unknown.permission').reasonCode,
    'UNKNOWN_PERMISSION',
  );
  assert.equal(
    evaluateOrganizationPermission(
      session('MEMBER', { organizationRole: 'UNRECOGNIZED' as OrganizationRole }),
      'requests.view',
    ).reasonCode,
    'UNKNOWN_ROLE',
  );
  assert.equal(
    evaluateOrganizationPermission(
      session('MEMBER', { membershipStatus: 'SUSPENDED' }),
      'requests.view',
    ).reasonCode,
    'MEMBERSHIP_INACTIVE',
  );
  assert.equal(
    evaluateOrganizationPermission(
      session('MEMBER', { membershipStatus: 'REMOVED' }),
      'requests.view',
    ).reasonCode,
    'MEMBERSHIP_INACTIVE',
  );
  assert.equal(
    evaluateOrganizationPermission(session('MEMBER'), 'requests.view', {
      companyId: 'foreign-tenant',
      targetType: 'request',
      targetId: 'foreign-request',
    }).reasonCode,
    'RESOURCE_TENANT_MISMATCH',
  );
});

test('legacy CLIENT and ADMIN membership mapping is explicit compatibility only', () => {
  const member = evaluateOrganizationPermission(
    session('MEMBER', { organizationRole: undefined, membershipStatus: undefined, role: 'CLIENT' }),
    'requests.create',
  );
  const admin = evaluateOrganizationPermission(
    session('ADMIN', { organizationRole: undefined, membershipStatus: undefined, role: 'ADMIN' }),
    'identity.policy.manage',
  );
  assert.equal(member.allowed, true);
  assert.equal(member.compatibilityUsed, true);
  assert.equal(member.role, 'MEMBER');
  assert.equal(admin.allowed, true);
  assert.equal(admin.compatibilityUsed, true);
  assert.equal(admin.role, 'ADMIN');
});

test('delegation prevents self escalation, manager/admin overreach, and last owner removal', () => {
  assert.equal(
    evaluateRoleAssignment({
      actorId: 'member',
      actorRole: 'MEMBER',
      targetUserId: 'member',
      currentRole: 'MEMBER',
      nextRole: 'ADMIN',
      activeOwnerCount: 1,
    }).reasonCode,
    'SELF_ESCALATION_DENIED',
  );
  assert.equal(
    evaluateRoleAssignment({
      actorId: 'manager',
      actorRole: 'MANAGER',
      targetUserId: 'target',
      currentRole: 'MEMBER',
      nextRole: 'ADMIN',
      activeOwnerCount: 1,
    }).reasonCode,
    'ROLE_DELEGATION_DENIED',
  );
  assert.equal(
    evaluateRoleAssignment({
      actorId: 'admin',
      actorRole: 'ADMIN',
      targetUserId: 'target',
      currentRole: 'ADMIN',
      nextRole: 'OWNER',
      activeOwnerCount: 1,
    }).reasonCode,
    'ROLE_DELEGATION_DENIED',
  );
  assert.equal(
    evaluateRoleAssignment({
      actorId: 'owner',
      actorRole: 'OWNER',
      targetUserId: 'owner',
      currentRole: 'OWNER',
      nextRole: 'ADMIN',
      activeOwnerCount: 1,
    }).reasonCode,
    'LAST_OWNER_PROTECTED',
  );
});

test('SSO role mapping can never grant OWNER and ADMIN requires explicit approval', () => {
  assert.equal(resolveSsoOrganizationRole('OWNER', { approvedAdminMapping: true }), null);
  assert.equal(resolveSsoOrganizationRole('ADMIN', { approvedAdminMapping: false }), null);
  assert.equal(resolveSsoOrganizationRole('ADMIN', { approvedAdminMapping: true }), 'ADMIN');
  assert.equal(resolveSsoOrganizationRole('MEMBER', { approvedAdminMapping: false }), 'MEMBER');
});

test('critical governance requires MFA, recent authentication, and exact confirmation', () => {
  assert.equal(
    evaluateCriticalOrganizationAction(
      session('OWNER', { mfaSatisfied: false }),
      'organization.owner.assign',
      'ASSIGN OWNER',
    ).reasonCode,
    'MFA_REQUIRED',
  );
  assert.equal(
    evaluateCriticalOrganizationAction(
      session('OWNER', { authenticationAt: Date.now() - 11 * 60_000 }),
      'organization.owner.assign',
      'ASSIGN OWNER',
    ).reasonCode,
    'RECENT_AUTHENTICATION_REQUIRED',
  );
  assert.equal(
    evaluateCriticalOrganizationAction(session('OWNER'), 'organization.owner.assign', 'wrong')
      .reasonCode,
    'EXPLICIT_CONFIRMATION_REQUIRED',
  );
  assert.equal(
    evaluateCriticalOrganizationAction(
      session('OWNER'),
      'organization.owner.assign',
      'ASSIGN OWNER',
    ).allowed,
    true,
  );
});

test('organization audit derives tenant and strips non-allowlisted sensitive metadata', async () => {
  const sink = new MemoryProductionAuditTrail();
  await appendOrganizationAudit(
    session('OWNER', { companyId: 'tenant-a', userId: 'actor-a' }),
    {
      action: 'organization.role.changed',
      result: 'SUCCEEDED',
      targetType: 'membership',
      targetId: 'membership-1',
      correlationId: 'permission-correlation',
      metadata: {
        previousRole: 'MEMBER',
        nextRole: 'MANAGER',
        email: 'sensitive@example.test',
        token: 'sensitive-token',
      } as never,
    },
    { databaseConfigured: true, sink },
  );
  const entries = await sink.list('tenant-a');
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.companyId, 'tenant-a');
  assert.equal(entries[0]?.actorId, 'actor-a');
  assert.deepEqual(entries[0]?.safeMetadata, {
    previousRole: 'MEMBER',
    nextRole: 'MANAGER',
  });
  assert.equal(JSON.stringify(entries).includes('sensitive'), false);
});

test('organization security notification templates contain no user or secret material', () => {
  const serialized = JSON.stringify(ORGANIZATION_SECURITY_NOTIFICATION_TITLES);
  assert.equal(/@|email|token|secret|document|request|provider|claim/iu.test(serialized), false);
  assert.equal(ORGANIZATION_SECURITY_NOTIFICATION_TITLES.length, 7);
});

test('portal navigation is built from server-derived permissions', () => {
  const viewerLinks = buildPortalNavigation(session('VIEWER')).map((item) => item.href);
  const ownerLinks = buildPortalNavigation(session('OWNER', { role: 'CLIENT' })).map(
    (item) => item.href,
  );
  assert.equal(viewerLinks.includes('/portal/team'), false);
  assert.equal(viewerLinks.includes('/admin/documents'), false);
  assert.equal(ownerLinks.includes('/portal/team'), true);
  assert.equal(ownerLinks.includes('/admin/documents'), true);
});
