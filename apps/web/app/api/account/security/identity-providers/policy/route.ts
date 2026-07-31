import { NextResponse } from 'next/server';

import { identityCorrelationId, parseIdentityMutation } from '../../../../../../lib/identity-route';
import {
  getOrganizationSsoPolicy,
  updateOrganizationSsoPolicy,
} from '../../../../../../lib/oidc-provider-configuration';
import { authorizePortalApi } from '../../../../../../lib/portal-session';

export async function GET() {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json(await getOrganizationSsoPolicy(authorization.session), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const requirement = parsed.body.requirement;
  const providerId = parsed.body.providerId;
  const enforcementAt = parsed.body.enforcementAt;
  if (
    !['DISABLED', 'OPTIONAL', 'REQUIRED'].includes(String(requirement)) ||
    (providerId !== null && typeof providerId !== 'string') ||
    (enforcementAt !== null && typeof enforcementAt !== 'string') ||
    typeof parsed.body.gracePeriodDays !== 'number' ||
    typeof parsed.body.localLoginAllowed !== 'boolean' ||
    typeof parsed.body.expectedVersion !== 'number'
  ) {
    return NextResponse.json({ error: 'Некорректная SSO policy.' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await updateOrganizationSsoPolicy({
        session: authorization.session,
        requirement: requirement as 'DISABLED' | 'OPTIONAL' | 'REQUIRED',
        providerId,
        enforcementAt,
        gracePeriodDays: parsed.body.gracePeriodDays,
        localLoginAllowed: parsed.body.localLoginAllowed,
        expectedVersion: parsed.body.expectedVersion,
        correlationId: identityCorrelationId(request),
      }),
    );
  } catch {
    return NextResponse.json({ error: 'SSO policy не обновлена.' }, { status: 409 });
  }
}
