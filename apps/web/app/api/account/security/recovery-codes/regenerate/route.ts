import { NextResponse } from 'next/server';

import { regenerateRecoveryCodes } from '../../../../../../lib/identity-management';
import { identityCorrelationId, parseIdentityMutation } from '../../../../../../lib/identity-route';
import { recordIdentitySecurityEvent } from '../../../../../../lib/identity-security-events';
import { authorizePortalApi } from '../../../../../../lib/portal-session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const code = typeof parsed.body.code === 'string' ? parsed.body.code.trim() : '';
  if (!code) {
    return NextResponse.json({ error: 'Укажите текущий код MFA.' }, { status: 400 });
  }
  try {
    const recoveryCodes = await regenerateRecoveryCodes(authorization.session, code);
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: identityCorrelationId(request),
      },
      action: 'identity.recovery_codes.regenerated',
      result: 'SUCCEEDED',
      metadata: { method: 'TOTP' },
      notify: true,
    });
    const response = NextResponse.json({ recoveryCodes });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Не удалось выпустить новые recovery codes.' },
      { status: 400 },
    );
  }
}
