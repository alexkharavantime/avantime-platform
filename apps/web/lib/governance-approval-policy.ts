import { createHash } from 'node:crypto';

import type { OrganizationPermission } from './organization-permissions';
import type { PlatformPermission } from './platform-permissions';

export const GOVERNANCE_APPROVAL_ACTIONS = [
  'PLATFORM_OWNER_ASSIGN',
  'PLATFORM_OWNER_REMOVE',
  'ORGANIZATION_LAST_OWNER_TRANSFER',
  'ORGANIZATION_REQUIRED_SSO_EMERGENCY_DISABLE',
  'ORGANIZATION_BREAK_GLASS_DISABLE',
  'IDENTITY_PROVIDER_DELETE',
  'PLATFORM_AUDIT_EXPORT',
  'ORGANIZATION_AUDIT_EXPORT',
  'BULK_TENANT_EXPORT',
  'KNOWLEDGE_VISIBILITY_PUBLIC',
  'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION',
] as const;

// Only these actions have both a target resolver and an atomic executor. Registry-only
// policies stay documented but cannot be requested until that pair is connected.
export const CONNECTED_GOVERNANCE_APPROVAL_EXECUTORS = [
  'PLATFORM_OWNER_ASSIGN',
  'PLATFORM_OWNER_REMOVE',
  'PLATFORM_AUDIT_EXPORT',
  'ORGANIZATION_AUDIT_EXPORT',
  'KNOWLEDGE_VISIBILITY_PUBLIC',
  'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION',
] as const satisfies readonly GovernanceApprovalAction[];

export function governanceApprovalExecutorConnected(actionType: string) {
  return CONNECTED_GOVERNANCE_APPROVAL_EXECUTORS.includes(
    actionType as (typeof CONNECTED_GOVERNANCE_APPROVAL_EXECUTORS)[number],
  );
}

export type GovernanceApprovalAction = (typeof GOVERNANCE_APPROVAL_ACTIONS)[number];
export type GovernanceScope = 'PLATFORM' | 'ORGANIZATION';

export type GovernanceApprovalPolicy = {
  actionType: GovernanceApprovalAction;
  scope: GovernanceScope;
  approvalRequired: true;
  requiredApproverPermission: PlatformPermission | OrganizationPermission;
  minimumApprovals: number;
  requesterMayApprove: false;
  ttlSeconds: number;
  mfaRequired: true;
  recentAuthenticationRequired: true;
  confirmationPhrase: string;
  notificationPolicy: 'PLATFORM_SECURITY' | 'ORGANIZATION_SECURITY' | 'BOTH';
  safeParameterKeys: readonly string[];
};

const policy = (
  value: Omit<
    GovernanceApprovalPolicy,
    | 'approvalRequired'
    | 'minimumApprovals'
    | 'requesterMayApprove'
    | 'ttlSeconds'
    | 'mfaRequired'
    | 'recentAuthenticationRequired'
  >,
): GovernanceApprovalPolicy => ({
  ...value,
  approvalRequired: true,
  minimumApprovals: 1,
  requesterMayApprove: false,
  ttlSeconds: 10 * 60,
  mfaRequired: true,
  recentAuthenticationRequired: true,
});

export const GOVERNANCE_APPROVAL_POLICIES: Readonly<
  Record<GovernanceApprovalAction, GovernanceApprovalPolicy>
> = {
  PLATFORM_OWNER_ASSIGN: policy({
    actionType: 'PLATFORM_OWNER_ASSIGN',
    scope: 'PLATFORM',
    requiredApproverPermission: 'platform.roles.manage',
    confirmationPhrase: 'ASSIGN PLATFORM OWNER',
    notificationPolicy: 'PLATFORM_SECURITY',
    safeParameterKeys: ['targetUserId', 'assignmentVersion'],
  }),
  PLATFORM_OWNER_REMOVE: policy({
    actionType: 'PLATFORM_OWNER_REMOVE',
    scope: 'PLATFORM',
    requiredApproverPermission: 'platform.roles.manage',
    confirmationPhrase: 'REMOVE PLATFORM OWNER',
    notificationPolicy: 'PLATFORM_SECURITY',
    safeParameterKeys: ['targetUserId', 'assignmentVersion'],
  }),
  ORGANIZATION_LAST_OWNER_TRANSFER: policy({
    actionType: 'ORGANIZATION_LAST_OWNER_TRANSFER',
    scope: 'ORGANIZATION',
    requiredApproverPermission: 'members.role.manage',
    confirmationPhrase: 'TRANSFER LAST OWNER',
    notificationPolicy: 'ORGANIZATION_SECURITY',
    safeParameterKeys: ['sourceMembershipId', 'targetMembershipId'],
  }),
  ORGANIZATION_REQUIRED_SSO_EMERGENCY_DISABLE: policy({
    actionType: 'ORGANIZATION_REQUIRED_SSO_EMERGENCY_DISABLE',
    scope: 'ORGANIZATION',
    requiredApproverPermission: 'identity.policy.manage',
    confirmationPhrase: 'EMERGENCY DISABLE SSO',
    notificationPolicy: 'BOTH',
    safeParameterKeys: ['policyVersion'],
  }),
  ORGANIZATION_BREAK_GLASS_DISABLE: policy({
    actionType: 'ORGANIZATION_BREAK_GLASS_DISABLE',
    scope: 'ORGANIZATION',
    requiredApproverPermission: 'organization.security.manage',
    confirmationPhrase: 'DISABLE BREAK GLASS',
    notificationPolicy: 'BOTH',
    safeParameterKeys: ['policyVersion'],
  }),
  IDENTITY_PROVIDER_DELETE: policy({
    actionType: 'IDENTITY_PROVIDER_DELETE',
    scope: 'ORGANIZATION',
    requiredApproverPermission: 'identity.providers.manage',
    confirmationPhrase: 'DELETE IDENTITY PROVIDER',
    notificationPolicy: 'ORGANIZATION_SECURITY',
    safeParameterKeys: ['providerId', 'configurationVersion'],
  }),
  PLATFORM_AUDIT_EXPORT: policy({
    actionType: 'PLATFORM_AUDIT_EXPORT',
    scope: 'PLATFORM',
    requiredApproverPermission: 'platform.audit.export',
    confirmationPhrase: 'EXPORT PLATFORM AUDIT',
    notificationPolicy: 'PLATFORM_SECURITY',
    safeParameterKeys: ['from', 'to', 'format'],
  }),
  ORGANIZATION_AUDIT_EXPORT: policy({
    actionType: 'ORGANIZATION_AUDIT_EXPORT',
    scope: 'ORGANIZATION',
    requiredApproverPermission: 'organization.export',
    confirmationPhrase: 'EXPORT ORGANIZATION AUDIT',
    notificationPolicy: 'ORGANIZATION_SECURITY',
    safeParameterKeys: ['from', 'to', 'format'],
  }),
  BULK_TENANT_EXPORT: policy({
    actionType: 'BULK_TENANT_EXPORT',
    scope: 'ORGANIZATION',
    requiredApproverPermission: 'organization.export',
    confirmationPhrase: 'EXPORT TENANT DATA',
    notificationPolicy: 'BOTH',
    safeParameterKeys: ['exportKind', 'format'],
  }),
  KNOWLEDGE_VISIBILITY_PUBLIC: policy({
    actionType: 'KNOWLEDGE_VISIBILITY_PUBLIC',
    scope: 'ORGANIZATION',
    requiredApproverPermission: 'knowledge.visibility.manage',
    confirmationPhrase: 'PUBLISH ORGANIZATION KNOWLEDGE',
    notificationPolicy: 'BOTH',
    safeParameterKeys: ['articleId', 'articleVersion'],
  }),
  CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION: policy({
    actionType: 'CROSS_TENANT_SUPPORT_DESTRUCTIVE_ACTION',
    scope: 'PLATFORM',
    requiredApproverPermission: 'platform.security.manage',
    confirmationPhrase: 'EXECUTE SUPPORT ACTION',
    notificationPolicy: 'BOTH',
    safeParameterKeys: ['supportSessionId', 'operation', 'resourceId', 'resourceVersion'],
  }),
};

export function getGovernanceApprovalPolicy(actionType: string) {
  return GOVERNANCE_APPROVAL_ACTIONS.includes(actionType as GovernanceApprovalAction)
    ? GOVERNANCE_APPROVAL_POLICIES[actionType as GovernanceApprovalAction]
    : null;
}

type FingerprintInput = {
  actionType: GovernanceApprovalAction;
  scope: GovernanceScope;
  companyId?: string | null;
  resourceId?: string | null;
  expectedVersion?: number | null;
  safeParameters: Record<string, string | number | boolean | null>;
  requesterId: string;
  expiresAt: Date;
};

function canonicalObject(value: Record<string, string | number | boolean | null>) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function governanceApprovalFingerprint(input: FingerprintInput) {
  const approvalPolicy = getGovernanceApprovalPolicy(input.actionType);
  if (!approvalPolicy || approvalPolicy.scope !== input.scope) {
    throw new Error('UNKNOWN_APPROVAL_ACTION');
  }
  const allowed = new Set(approvalPolicy.safeParameterKeys);
  const providedKeys = Object.keys(input.safeParameters);
  if (
    providedKeys.length !== approvalPolicy.safeParameterKeys.length ||
    providedKeys.some((key) => !allowed.has(key))
  ) {
    throw new Error('UNSAFE_APPROVAL_PARAMETER');
  }
  if (input.scope === 'ORGANIZATION' && !input.companyId) {
    throw new Error('APPROVAL_ORGANIZATION_REQUIRED');
  }
  const canonical = JSON.stringify({
    actionType: input.actionType,
    scope: input.scope,
    companyId: input.companyId ?? null,
    resourceId: input.resourceId ?? null,
    expectedVersion: input.expectedVersion ?? null,
    safeParameters: canonicalObject(input.safeParameters),
    requesterId: input.requesterId,
    expiresAt: input.expiresAt.toISOString(),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function approvalStepUpSatisfied(input: {
  mfaSatisfied?: boolean;
  authenticationAt?: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const authenticationAt = input.authenticationAt ?? 0;
  return (
    input.mfaSatisfied === true &&
    authenticationAt > 0 &&
    authenticationAt <= now.getTime() &&
    now.getTime() - authenticationAt <= 10 * 60_000
  );
}
