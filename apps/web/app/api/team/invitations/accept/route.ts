import { NextResponse } from 'next/server';

import { identityCorrelationId, parseIdentityMutation } from '../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../lib/portal-session';
import { acceptCompanyInvitation } from '../../../../../lib/team';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const token = typeof parsed.body.token === 'string' ? parsed.body.token : '';
  try {
    const result = await acceptCompanyInvitation(authorization.session, token);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: result.companyId,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.invitation.accepted',
      result: 'SUCCEEDED',
      notify: true,
    });
    return NextResponse.json({ accepted: true });
  } catch {
    return NextResponse.json({ error: 'Приглашение недействительно.' }, { status: 400 });
  }
}
