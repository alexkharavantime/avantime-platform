import { NextResponse } from 'next/server';
import { resetPassword } from '../../../../lib/password-reset';
export async function POST(request: Request) {
  const { token, password } = (await request.json()) as { token?: string; password?: string };
  if (!token || !password || password.length < 8) return NextResponse.json({ error: 'Ссылка недействительна или пароль короче 8 символов.' }, { status: 400 });
  const ok = await resetPassword(token, password);
  return ok ? NextResponse.json({ message: 'Пароль изменён.' }) : NextResponse.json({ error: 'Ссылка недействительна или истекла.' }, { status: 400 });
}
