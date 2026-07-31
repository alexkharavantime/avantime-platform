import { NextResponse } from 'next/server';

import { isSameOriginMutation } from '../../../../lib/identity-auth';
import { recordIdentitySecurityEvent } from '../../../../lib/identity-security-events';
import { resetPassword } from '../../../../lib/password-reset';

export async function POST(request: Request) {
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  let body: { token?: unknown; password?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Ссылка недействительна или истекла.' }, { status: 400 });
  }
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!token || !password) {
    return NextResponse.json({ error: 'Ссылка недействительна или истекла.' }, { status: 400 });
  }
  try {
    const result = await resetPassword(token, password);
    if (result.status === 'POLICY_REJECTED') {
      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }
    if (result.status !== 'SUCCEEDED') {
      return NextResponse.json({ error: 'Ссылка недействительна или истекла.' }, { status: 400 });
    }
    await recordIdentitySecurityEvent({
      context: {
        userId: result.userId,
        companyId: result.companyId,
        correlationId,
      },
      action: 'identity.password.reset_completed',
      result: 'SUCCEEDED',
      notify: true,
    });
    return NextResponse.json({ message: 'Пароль изменён. Выполните вход заново.' });
  } catch {
    return NextResponse.json({ error: 'Восстановление временно недоступно.' }, { status: 503 });
  }
}
