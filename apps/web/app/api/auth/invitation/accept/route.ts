import { NextResponse } from 'next/server';

import { identityCorrelationId, parseIdentityMutation, requestRateLimitSubject } from '../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';
import { getIdentityRateLimiter } from '../../../../../lib/identity-rate-limit';
import { TeamInvitationError, activateAccessRequestInvitation } from '../../../../../lib/team';

export async function POST(request: Request) {
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const token = typeof parsed.body.token === 'string' ? parsed.body.token : '';
  const password = typeof parsed.body.password === 'string' ? parsed.body.password : '';
  if (!token || token.length > 256 || !password) {
    return NextResponse.json({ error: 'Приглашение недействительно.', code: 'INVITATION_INVALID' }, { status: 400 });
  }

  try {
    const limiter = getIdentityRateLimiter();
    const [tokenAllowed, ipAllowed] = await Promise.all([
      limiter.consume({ scope: 'invitation', subject: token, limit: 10, windowSeconds: 60 * 60 }),
      limiter.consume({
        scope: 'invitation',
        subject: `activation:${requestRateLimitSubject(request)}`,
        limit: 30,
        windowSeconds: 60 * 60,
      }),
    ]);
    if (!tokenAllowed || !ipAllowed) {
      return NextResponse.json({ error: 'Приглашение недействительно.', code: 'INVITATION_INVALID' }, { status: 400 });
    }
    const result = await activateAccessRequestInvitation(token, password);
    if (result.status === 'POLICY_REJECTED') {
      return NextResponse.json({ error: result.error, code: 'PASSWORD_POLICY_REJECTED' }, { status: 400 });
    }
    await recordIdentitySecurityEvent({
      context: {
        userId: result.userId,
        companyId: result.companyId,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.invitation.accepted',
      result: 'SUCCEEDED',
    });
    return NextResponse.json({ accepted: true });
  } catch (error) {
    if (error instanceof TeamInvitationError && error.code === 'INVITATION_ACCOUNT_EXISTS') {
      return NextResponse.json(
        { error: 'Войдите в существующую учётную запись и откройте приглашение снова.', code: error.code },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Приглашение недействительно.', code: 'INVITATION_INVALID' }, { status: 400 });
  }
}