import { NextResponse } from 'next/server';

import { updateOrganizationMfaPolicy } from '../../../../../lib/identity-management';
import { identityCorrelationId, parseIdentityMutation } from '../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';

export async function PUT(request: Request) {
  const authorization = await authorizeOrganizationApi('identity.policy.manage', {
    correlationId: identityCorrelationId(request),
  });
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const requirement = parsed.body.requirement;
  const enforcementAt = parsed.body.enforcementAt;
  const gracePeriodDays = parsed.body.gracePeriodDays;
  if (
    (requirement !== 'OPTIONAL' && requirement !== 'ADMINS' && requirement !== 'ALL_MEMBERS') ||
    (enforcementAt !== null && typeof enforcementAt !== 'string') ||
    typeof gracePeriodDays !== 'number'
  ) {
    return NextResponse.json({ error: 'Некорректная MFA policy.' }, { status: 400 });
  }
  try {
    const policy = await updateOrganizationMfaPolicy(authorization.session, {
      requirement,
      enforcementAt,
      gracePeriodDays,
    });
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.policy.updated',
      result: 'SUCCEEDED',
      metadata: { reasonCode: requirement },
      notify: true,
    });
    return NextResponse.json({
      requirement: policy.mfaRequirement,
      enforcementAt: policy.enforcementAt?.toISOString() ?? null,
      gracePeriodDays: policy.gracePeriodDays,
    });
  } catch {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }
}
