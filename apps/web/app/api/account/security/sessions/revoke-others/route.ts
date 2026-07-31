import { NextResponse } from 'next/server';

import { revokeOtherSessions } from '../../../../../../lib/identity-management';
import { identityCorrelationId, parseIdentityMutation } from '../../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../../lib/portal-session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  try {
    const result = await revokeOtherSessions(authorization.session);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.session.revoked_all',
      result: 'SUCCEEDED',
      metadata: { sessionId: authorization.session.sessionId },
      notify: true,
    });
    return NextResponse.json({ success: true, revoked: result.count });
  } catch {
    return NextResponse.json({ error: 'Не удалось отозвать сессии.' }, { status: 503 });
  }
}
