export type MfaPolicyRequirement = 'OPTIONAL' | 'ADMINS' | 'ALL_MEMBERS';

export type MfaPolicyContext = {
  role: 'CLIENT' | 'ADMIN';
  hasActiveMfa: boolean;
  policy?: {
    mfaRequirement: MfaPolicyRequirement;
    gracePeriodDays: number;
    enforcementAt: Date | null;
  } | null;
  exemption?: {
    expiresAt: Date;
  } | null;
  now?: Date;
  requireAdminMfa?: boolean;
};

export type MfaPolicyDecision = {
  challengeRequired: boolean;
  enrollmentRequired: boolean;
  policyRequired: boolean;
  reason: 'ACTIVE_METHOD' | 'GLOBAL_ADMIN' | 'ORGANIZATION' | 'OPTIONAL';
};

export function evaluateMfaPolicy(context: MfaPolicyContext): MfaPolicyDecision {
  const now = context.now ?? new Date();
  const exemptionActive = Boolean(context.exemption && context.exemption.expiresAt > now);
  const enforcementAt = context.policy?.enforcementAt;
  const graceEndsAt = enforcementAt
    ? new Date(
        enforcementAt.getTime() + Math.max(0, context.policy?.gracePeriodDays ?? 0) * 86_400_000,
      )
    : null;
  const organizationEnforced =
    !exemptionActive &&
    Boolean(enforcementAt && enforcementAt <= now && (!graceEndsAt || graceEndsAt <= now)) &&
    (context.policy?.mfaRequirement === 'ALL_MEMBERS' ||
      (context.policy?.mfaRequirement === 'ADMINS' && context.role === 'ADMIN'));
  const globalAdminRequired = context.role === 'ADMIN' && context.requireAdminMfa === true;
  const policyRequired = organizationEnforced || globalAdminRequired;
  const reason = globalAdminRequired
    ? 'GLOBAL_ADMIN'
    : organizationEnforced
      ? 'ORGANIZATION'
      : context.hasActiveMfa
        ? 'ACTIVE_METHOD'
        : 'OPTIONAL';
  return {
    challengeRequired: context.hasActiveMfa,
    enrollmentRequired: policyRequired && !context.hasActiveMfa,
    policyRequired,
    reason,
  };
}

export function requireAdminMfa(environment: Record<string, string | undefined> = process.env) {
  return environment.AUTH_ADMIN_MFA_REQUIRED === 'true';
}

export function isOrganizationLoginMethodAllowed(input: {
  policy?: {
    ssoRequirement: 'DISABLED' | 'OPTIONAL' | 'REQUIRED';
    ssoProviderId: string | null;
    ssoEnforcementAt: Date | null;
    ssoGracePeriodDays: number;
    localLoginAllowed: boolean;
  } | null;
  method: 'LOCAL' | 'OIDC';
  providerId?: string;
  now?: Date;
}) {
  const policy = input.policy;
  if (!policy || policy.ssoRequirement === 'DISABLED') return input.method === 'LOCAL';
  if (input.method === 'OIDC') return Boolean(policy.ssoProviderId === input.providerId);
  if (!policy.localLoginAllowed) return false;
  if (policy.ssoRequirement !== 'REQUIRED') return true;
  const now = input.now ?? new Date();
  if (!policy.ssoEnforcementAt) return true;
  const enforcedAt = new Date(
    policy.ssoEnforcementAt.getTime() + Math.max(0, policy.ssoGracePeriodDays) * 86_400_000,
  );
  return enforcedAt > now;
}
