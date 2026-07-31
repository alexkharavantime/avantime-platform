import { NextResponse } from 'next/server';

import { confirmTotpEnrollment } from '../../../../../../../lib/identity-management';
import {
  identityCorrelationId,
  parseIdentityMutation,
} from '../../../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../../../lib/portal-session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const methodId = typeof parsed.body.methodId === 'string' ? parsed.body.methodId.trim() : '';
  const code = typeof parsed.body.code === 'string' ? parsed.body.code.trim() : '';
  if (!methodId || !code) {
    return NextResponse.json({ error: 'Укажите код подтверждения.' }, { status: 400 });
  }
  try {
    const recoveryCodes = await confirmTotpEnrollment(authorization.session, methodId, code);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.mfa.enabled',
      result: 'SUCCEEDED',
      metadata: { method: 'TOTP' },
      notify: true,
    });
    const response = NextResponse.json({ recoveryCodes });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.mfa.challenge_failed',
      result: 'FAILED',
      metadata: { method: 'TOTP', reasonCode: 'ENROLLMENT_CONFIRMATION_FAILED' },
    });
    return NextResponse.json(
      { error: 'Код подтверждения неверен или подключение истекло.' },
      { status: 400 },
    );
  }
}
