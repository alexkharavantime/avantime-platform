import { NextResponse } from 'next/server';

import { identityCorrelationId, parseIdentityMutation } from '../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../lib/portal-session';
import { revokeCompanyInvitation } from '../../../../../lib/team';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const invitationId =
    typeof parsed.body.invitationId === 'string' ? parsed.body.invitationId.trim() : '';
  try {
    await revokeCompanyInvitation(authorization.session, invitationId);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.invitation.revoked',
      result: 'SUCCEEDED',
      notify: true,
    });
    return NextResponse.json({ revoked: true });
  } catch {
    return NextResponse.json({ error: 'Приглашение не найдено.' }, { status: 404 });
  }
}
