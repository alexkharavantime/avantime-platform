import type { AppSession, MembershipStatus, OrganizationRole, PlatformRole } from './session';

export const ORGANIZATION_PERMISSIONS = [
  'organization.view',
  'organization.update',
  'organization.security.manage',
  'organization.audit.view',
  'organization.export',
  'members.view',
  'members.invite',
  'members.role.manage',
  'members.remove',
  'requests.view',
  'requests.create',
  'requests.comment',
  'requests.manage',
  'requests.export',
  'documents.view',
  'documents.download',
  'documents.upload',
  'documents.manage',
  'documents.reprocess',
  'documents.delete',
  'documents.export',
  'knowledge.view',
  'knowledge.search',
  'knowledge.manage',
  'knowledge.publish',
  'notifications.view',
  'notifications.manage',
  'identity.sessions.manage_self',
  'identity.mfa.manage_self',
  'identity.providers.manage',
  'identity.policy.manage',
  'identity.audit.view',
] as const;

export type OrganizationPermission = (typeof ORGANIZATION_PERMISSIONS)[number];

const allPermissions = new Set<string>(ORGANIZATION_PERMISSIONS);

const ROLE_PERMISSIONS = {
  OWNER: ORGANIZATION_PERMISSIONS,
  ADMIN: ORGANIZATION_PERMISSIONS,
  MANAGER: [
    'organization.view',
    'members.view',
    'members.invite',
    'members.role.manage',
    'members.remove',
    'requests.view',
    'requests.create',
    'requests.comment',
    'requests.manage',
    'documents.view',
    'documents.download',
    'documents.upload',
    'documents.manage',
    'documents.reprocess',
    'knowledge.view',
    'knowledge.search',
    'knowledge.manage',
    'knowledge.publish',
    'notifications.view',
    'notifications.manage',
    'identity.sessions.manage_self',
    'identity.mfa.manage_self',
  ],
  MEMBER: [
    'organization.view',
    'members.view',
    'requests.view',
    'requests.create',
    'requests.comment',
    'documents.view',
    'documents.download',
    'knowledge.view',
    'knowledge.search',
    'notifications.view',
    'notifications.manage',
    'identity.sessions.manage_self',
    'identity.mfa.manage_self',
  ],
  VIEWER: [
    'organization.view',
    'requests.view',
    'documents.view',
    'documents.download',
    'knowledge.view',
    'knowledge.search',
    'notifications.view',
    'identity.sessions.manage_self',
    'identity.mfa.manage_self',
  ],
} as const satisfies Record<OrganizationRole, readonly OrganizationPermission[]>;

export type AuthorizationReasonCode =
  | 'ALLOWED'
  | 'AUTHENTICATION_REQUIRED'
  | 'ORGANIZATION_CONTEXT_REQUIRED'
  | 'MEMBERSHIP_INACTIVE'
  | 'UNKNOWN_PERMISSION'
  | 'UNKNOWN_ROLE'
  | 'PERMISSION_DENIED'
  | 'RESOURCE_TENANT_MISMATCH'
  | 'RESOURCE_OWNER_MISMATCH';

export type OrganizationResourceContext = {
  companyId?: string | null;
  ownerUserId?: string | null;
  requireOwner?: boolean;
  targetType?: string;
  targetId?: string | null;
};

export type OrganizationAuthorizationDecision = {
  allowed: boolean;
  reasonCode: AuthorizationReasonCode;
  permission: string;
  companyId: string | null;
  actorId: string | null;
  role: OrganizationRole | null;
  compatibilityUsed: boolean;
  auditContext: {
    targetType: string;
    targetId: string | null;
  };
};

const organizationRoles = new Set<OrganizationRole>([
  'OWNER',
  'ADMIN',
  'MANAGER',
  'MEMBER',
  'VIEWER',
]);

function compatibilityRole(platformRole: PlatformRole): OrganizationRole {
  return platformRole === 'ADMIN' ? 'ADMIN' : 'MEMBER';
}

export function resolveOrganizationRole(session: AppSession): {
  role: OrganizationRole | null;
  compatibilityUsed: boolean;
} {
  if (session.organizationRole) {
    return organizationRoles.has(session.organizationRole)
      ? { role: session.organizationRole, compatibilityUsed: false }
      : { role: null, compatibilityUsed: false };
  }
  if (!session.companyId) return { role: null, compatibilityUsed: false };
  return { role: compatibilityRole(session.role), compatibilityUsed: true };
}

function membershipIsActive(session: AppSession, compatibilityUsed: boolean) {
  const status: MembershipStatus | undefined = session.membershipStatus;
  return status === 'ACTIVE' || (status === undefined && compatibilityUsed);
}

export function evaluateOrganizationPermission(
  session: AppSession | null,
  permission: string,
  resource: OrganizationResourceContext = {},
): OrganizationAuthorizationDecision {
  const targetType = resource.targetType ?? 'organization';
  const targetId = resource.targetId ?? null;
  const base = {
    permission,
    companyId: session?.companyId ?? null,
    actorId: session?.userId ?? null,
    role: null,
    compatibilityUsed: false,
    auditContext: { targetType, targetId },
  } satisfies Omit<OrganizationAuthorizationDecision, 'allowed' | 'reasonCode'>;

  if (!session) {
    return { ...base, allowed: false, reasonCode: 'AUTHENTICATION_REQUIRED' };
  }
  if (!allPermissions.has(permission)) {
    return { ...base, allowed: false, reasonCode: 'UNKNOWN_PERMISSION' };
  }
  if (!session.companyId) {
    return { ...base, allowed: false, reasonCode: 'ORGANIZATION_CONTEXT_REQUIRED' };
  }
  const resolved = resolveOrganizationRole(session);
  const context = { ...base, role: resolved.role, compatibilityUsed: resolved.compatibilityUsed };
  if (!resolved.role) {
    return { ...context, allowed: false, reasonCode: 'UNKNOWN_ROLE' };
  }
  if (!membershipIsActive(session, resolved.compatibilityUsed)) {
    return { ...context, allowed: false, reasonCode: 'MEMBERSHIP_INACTIVE' };
  }
  if (resource.companyId && resource.companyId !== session.companyId) {
    return { ...context, allowed: false, reasonCode: 'RESOURCE_TENANT_MISMATCH' };
  }
  if (resource.requireOwner && resource.ownerUserId !== session.userId) {
    return { ...context, allowed: false, reasonCode: 'RESOURCE_OWNER_MISMATCH' };
  }
  if (!(ROLE_PERMISSIONS[resolved.role] as readonly string[]).includes(permission)) {
    return { ...context, allowed: false, reasonCode: 'PERMISSION_DENIED' };
  }
  return { ...context, allowed: true, reasonCode: 'ALLOWED' };
}

export function hasOrganizationPermission(
  session: AppSession | null,
  permission: OrganizationPermission,
  resource?: OrganizationResourceContext,
) {
  return evaluateOrganizationPermission(session, permission, resource).allowed;
}

export const CRITICAL_ACTION_CONFIRMATIONS = {
  'organization.owner.assign': 'ASSIGN OWNER',
  'organization.owner.remove': 'REMOVE OWNER',
  'organization.sso.require': 'REQUIRE SSO',
  'organization.break_glass.disable': 'DISABLE BREAK GLASS',
  'identity.provider.delete': 'DELETE PROVIDER',
  'organization.export': 'EXPORT ORGANIZATION',
  'organization.members.bulk_remove': 'REMOVE MEMBERS',
  'documents.delete': 'DELETE DOCUMENT',
  'organization.audit.export': 'EXPORT AUDIT',
} as const;

export type CriticalOrganizationAction = keyof typeof CRITICAL_ACTION_CONFIRMATIONS;
export type CriticalActionReason =
  | 'CRITICAL_ACTION_ALLOWED'
  | 'MFA_REQUIRED'
  | 'RECENT_AUTHENTICATION_REQUIRED'
  | 'EXPLICIT_CONFIRMATION_REQUIRED';

export function evaluateCriticalOrganizationAction(
  session: AppSession,
  action: CriticalOrganizationAction,
  confirmation: string | null | undefined,
  now = new Date(),
): { allowed: boolean; reasonCode: CriticalActionReason } {
  if (session.mfaSatisfied !== true) {
    return { allowed: false, reasonCode: 'MFA_REQUIRED' };
  }
  const authenticationAt = session.authenticationAt ?? 0;
  if (authenticationAt <= 0 || now.getTime() - authenticationAt > 10 * 60_000) {
    return { allowed: false, reasonCode: 'RECENT_AUTHENTICATION_REQUIRED' };
  }
  if (confirmation !== CRITICAL_ACTION_CONFIRMATIONS[action]) {
    return { allowed: false, reasonCode: 'EXPLICIT_CONFIRMATION_REQUIRED' };
  }
  return { allowed: true, reasonCode: 'CRITICAL_ACTION_ALLOWED' };
}

export type RoleAssignmentReason =
  | 'ROLE_ASSIGNMENT_ALLOWED'
  | 'INVALID_ROLE'
  | 'SELF_ESCALATION_DENIED'
  | 'ROLE_DELEGATION_DENIED'
  | 'LAST_OWNER_PROTECTED';

const roleRank: Record<OrganizationRole, number> = {
  VIEWER: 1,
  MEMBER: 2,
  MANAGER: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function evaluateRoleAssignment(input: {
  actorId: string;
  actorRole: OrganizationRole;
  targetUserId: string;
  currentRole: OrganizationRole;
  nextRole: string;
  activeOwnerCount: number;
  allowAdminOwnerAssignment?: boolean;
}): { allowed: boolean; reasonCode: RoleAssignmentReason; role?: OrganizationRole } {
  if (!organizationRoles.has(input.nextRole as OrganizationRole)) {
    return { allowed: false, reasonCode: 'INVALID_ROLE' };
  }
  const nextRole = input.nextRole as OrganizationRole;
  if (input.actorId === input.targetUserId && roleRank[nextRole] > roleRank[input.currentRole]) {
    return { allowed: false, reasonCode: 'SELF_ESCALATION_DENIED' };
  }
  if (input.currentRole === 'OWNER' && nextRole !== 'OWNER' && input.activeOwnerCount <= 1) {
    return { allowed: false, reasonCode: 'LAST_OWNER_PROTECTED' };
  }
  const assignable: Record<OrganizationRole, readonly OrganizationRole[]> = {
    OWNER: ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'],
    ADMIN: input.allowAdminOwnerAssignment
      ? ['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']
      : ['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER'],
    MANAGER: ['MEMBER', 'VIEWER'],
    MEMBER: [],
    VIEWER: [],
  };
  if (!assignable[input.actorRole].includes(nextRole)) {
    return { allowed: false, reasonCode: 'ROLE_DELEGATION_DENIED' };
  }
  return { allowed: true, reasonCode: 'ROLE_ASSIGNMENT_ALLOWED', role: nextRole };
}

export function resolveSsoOrganizationRole(
  requestedRole: string,
  options: { approvedAdminMapping: boolean },
): OrganizationRole | null {
  if (requestedRole === 'OWNER') return null;
  if (requestedRole === 'ADMIN') return options.approvedAdminMapping ? 'ADMIN' : null;
  return requestedRole === 'MANAGER' || requestedRole === 'MEMBER' || requestedRole === 'VIEWER'
    ? requestedRole
    : null;
}

export function permissionsForRole(role: OrganizationRole) {
  return [...ROLE_PERMISSIONS[role]];
}
