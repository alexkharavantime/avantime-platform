import { NextResponse } from 'next/server';

import { verifyEmailToken } from '../../../../../lib/email-verification';
import { isSameOriginMutation } from '../../../../../lib/identity-auth';
import { recordIdentitySecurityEvent } from '../../../../../lib/identity-security-events';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  let body: { token?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Код подтверждения недействителен.' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  try {
    const result = await verifyEmailToken(token);
    if (result.status !== 'VERIFIED') {
      return NextResponse.json({ error: 'Код подтверждения недействителен.' }, { status: 400 });
    }
    await recordIdentitySecurityEvent({
      context: {
        userId: result.userId,
        companyId: result.companyId,
        correlationId,
      },
      action: 'identity.email_verification.completed',
      result: 'SUCCEEDED',
      notify: true,
    });
    return NextResponse.json({ verified: true, returnTo: result.redirectTo });
  } catch {
    return NextResponse.json({ error: 'Подтверждение временно недоступно.' }, { status: 503 });
  }
}
