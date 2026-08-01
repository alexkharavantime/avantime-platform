import { NextResponse } from 'next/server';

import type { GovernanceApprovalPolicy } from './governance-approval-policy';
import { authorizeOrganizationSession } from './organization-authorization';
import type { OrganizationPermission } from './organization-permissions';
import { authorizePlatformSession } from './platform-authorization';
import type { PlatformPermission } from './platform-permissions';
import type { AppSession } from './session';

export async function authorizeGovernanceApprovalPolicy(
  session: AppSession | null,
  policy: GovernanceApprovalPolicy,
): Promise<
  { session: AppSession; response?: never } | { session?: never; response: NextResponse }
> {
  if (policy.scope === 'PLATFORM') {
    return authorizePlatformSession(
      session,
      policy.requiredApproverPermission as PlatformPermission,
    );
  }
  return authorizeOrganizationSession(
    session,
    policy.requiredApproverPermission as OrganizationPermission,
  );
}
