import type { AppSession } from './session';

export const PLATFORM_PERMISSIONS = [
  'platform.view',
  'platform.configure',
  'platform.security.manage',
  'platform.roles.manage',
  'platform.audit.view',
  'platform.audit.export',
  'platform.support.access',
  'platform.operations.manage',
  'platform.integrations.manage',
  'platform.providers.manage',
  'platform.support.session.start',
  'platform.support.session.end',
  'platform.support.organization.view',
  'platform.support.resource.view',
  'platform.support.action.execute',
  'platform.documents.operations',
  'platform.jobs.view',
  'platform.jobs.retry',
  'platform.jobs.cancel',
  'platform.health.view',
  'platform.backup.evidence.view',
  'platform.knowledge.view',
  'platform.knowledge.manage',
  'platform.knowledge.publish',
  'platform.knowledge.visibility.manage',
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type PlatformSystemRole =
  | 'PLATFORM_OWNER'
  | 'PLATFORM_ADMIN'
  | 'PLATFORM_SUPPORT'
  | 'PLATFORM_AUDITOR'
  | 'PLATFORM_OPERATOR';

export type PlatformRoleAssignmentContext = {
  id: string;
  userId: string;
  role: string;
  active: boolean;
  disabledAt?: Date | null;
  version: number;
};

export type PlatformSupportSessionContext = {
  id: string;
  actorId: string;
  companyId: string;
  allowedScopes: readonly string[];
  expiresAt: Date;
  endedAt?: Date | null;
};

export type PlatformAuthorizationReason =
  | 'ALLOWED'
  | 'AUTHENTICATION_REQUIRED'
  | 'ASSIGNMENT_REQUIRED'
  | 'ASSIGNMENT_INACTIVE'
  | 'ASSIGNMENT_ACTOR_MISMATCH'
  | 'UNKNOWN_ROLE'
  | 'UNKNOWN_PERMISSION'
  | 'PERMISSION_DENIED'
  | 'OPERATIONAL_CONTEXT_REQUIRED'
  | 'SUPPORT_SESSION_REQUIRED'
  | 'SUPPORT_SESSION_INVALID'
  | 'SUPPORT_SCOPE_DENIED';

export type PlatformOperationalContext = {
  targetType?: string;
  targetId?: string | null;
  companyId?: string | null;
  requireSupportSession?: boolean;
};

export type PlatformAuthorizationDecision = {
  allowed: boolean;
  reasonCode: PlatformAuthorizationReason;
  permission: string;
  actorId: string | null;
  assignmentId: string | null;
  role: PlatformSystemRole | null;
  auditContext: {
    targetType: string;
    targetId: string | null;
    companyId: string | null;
    supportSessionId: string | null;
  };
};

const permissionSet = new Set<string>(PLATFORM_PERMISSIONS);
const roleSet = new Set<PlatformSystemRole>([
  'PLATFORM_OWNER',
  'PLATFORM_ADMIN',
  'PLATFORM_SUPPORT',
  'PLATFORM_AUDITOR',
  'PLATFORM_OPERATOR',
]);

const ROLE_PERMISSIONS = {
  PLATFORM_OWNER: PLATFORM_PERMISSIONS,
  PLATFORM_ADMIN: [
    'platform.view',
    'platform.configure',
    'platform.security.manage',
    'platform.roles.manage',
    'platform.audit.view',
    'platform.audit.export',
    'platform.support.access',
    'platform.operations.manage',
    'platform.integrations.manage',
    'platform.providers.manage',
    'platform.support.session.start',
    'platform.support.session.end',
    'platform.support.organization.view',
    'platform.support.resource.view',
    'platform.support.action.execute',
    'platform.documents.operations',
    'platform.jobs.view',
    'platform.jobs.retry',
    'platform.jobs.cancel',
    'platform.health.view',
    'platform.backup.evidence.view',
    'platform.knowledge.view',
    'platform.knowledge.manage',
    'platform.knowledge.publish',
    'platform.knowledge.visibility.manage',
  ],
  PLATFORM_SUPPORT: [
    'platform.view',
    'platform.support.access',
    'platform.support.session.start',
    'platform.support.session.end',
    'platform.support.organization.view',
    'platform.support.resource.view',
    'platform.support.action.execute',
  ],
  PLATFORM_AUDITOR: [
    'platform.view',
    'platform.audit.view',
    'platform.audit.export',
    'platform.health.view',
    'platform.backup.evidence.view',
    'platform.knowledge.view',
  ],
  PLATFORM_OPERATOR: [
    'platform.view',
    'platform.operations.manage',
    'platform.documents.operations',
    'platform.jobs.view',
    'platform.jobs.retry',
    'platform.jobs.cancel',
    'platform.health.view',
  ],
} as const satisfies Record<PlatformSystemRole, readonly PlatformPermission[]>;

const supportPermissions = new Set<PlatformPermission>([
  'platform.support.organization.view',
  'platform.support.resource.view',
  'platform.support.action.execute',
]);

export function evaluatePlatformPermission(input: {
  session: AppSession | null;
  assignment?: PlatformRoleAssignmentContext | null;
  permission: string;
  operationalContext?: PlatformOperationalContext;
  supportSession?: PlatformSupportSessionContext | null;
  now?: Date;
}): PlatformAuthorizationDecision {
  const context = input.operationalContext ?? {};
  const base = {
    permission: input.permission,
    actorId: input.session?.userId ?? null,
    assignmentId: input.assignment?.id ?? null,
    role: null,
    auditContext: {
      targetType: context.targetType ?? 'platform',
      targetId: context.targetId ?? null,
      companyId: context.companyId ?? null,
      supportSessionId: input.supportSession?.id ?? null,
    },
  } satisfies Omit<PlatformAuthorizationDecision, 'allowed' | 'reasonCode'>;

  if (!input.session) return { ...base, allowed: false, reasonCode: 'AUTHENTICATION_REQUIRED' };
  if (!permissionSet.has(input.permission)) {
    return { ...base, allowed: false, reasonCode: 'UNKNOWN_PERMISSION' };
  }
  if (!input.assignment) return { ...base, allowed: false, reasonCode: 'ASSIGNMENT_REQUIRED' };
  if (input.assignment.userId !== input.session.userId) {
    return { ...base, allowed: false, reasonCode: 'ASSIGNMENT_ACTOR_MISMATCH' };
  }
  if (!input.assignment.active || input.assignment.disabledAt) {
    return { ...base, allowed: false, reasonCode: 'ASSIGNMENT_INACTIVE' };
  }
  if (!roleSet.has(input.assignment.role as PlatformSystemRole)) {
    return { ...base, allowed: false, reasonCode: 'UNKNOWN_ROLE' };
  }
  const role = input.assignment.role as PlatformSystemRole;
  const decisionBase = { ...base, role };
  if (!(ROLE_PERMISSIONS[role] as readonly string[]).includes(input.permission)) {
    return { ...decisionBase, allowed: false, reasonCode: 'PERMISSION_DENIED' };
  }

  const permission = input.permission as PlatformPermission;
  if (supportPermissions.has(permission) || context.requireSupportSession) {
    if (!context.companyId) {
      return { ...decisionBase, allowed: false, reasonCode: 'OPERATIONAL_CONTEXT_REQUIRED' };
    }
    const support = input.supportSession;
    if (!support) {
      return { ...decisionBase, allowed: false, reasonCode: 'SUPPORT_SESSION_REQUIRED' };
    }
    const now = input.now ?? new Date();
    if (
      support.actorId !== input.session.userId ||
      support.companyId !== context.companyId ||
      support.endedAt ||
      support.expiresAt <= now
    ) {
      return { ...decisionBase, allowed: false, reasonCode: 'SUPPORT_SESSION_INVALID' };
    }
    if (!support.allowedScopes.includes(permission)) {
      return { ...decisionBase, allowed: false, reasonCode: 'SUPPORT_SCOPE_DENIED' };
    }
  }

  return { ...decisionBase, allowed: true, reasonCode: 'ALLOWED' };
}

export function permissionsForPlatformRole(role: PlatformSystemRole) {
  return [...ROLE_PERMISSIONS[role]];
}

export function sessionHasPlatformPermission(
  session: AppSession | null,
  permission: PlatformPermission,
) {
  return Boolean(
    session?.platformRoles?.some(
      (role) =>
        evaluatePlatformPermission({
          session,
          assignment: {
            id: `session:${role}`,
            userId: session.userId,
            role,
            active: true,
            version: 1,
          },
          permission,
        }).allowed,
    ),
  );
}
