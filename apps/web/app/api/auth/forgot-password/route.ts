import { NextResponse } from 'next/server';
import { createPasswordReset } from '../../../../lib/password-reset';
export async function POST(request: Request) {
  const { email } = (await request.json()) as { email?: string };
  if (!email?.includes('@')) return NextResponse.json({ error: 'Укажите корректный email.' }, { status: 400 });
  const token = await createPasswordReset(email);
  const resetUrl = `/portal/reset-password?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ message: 'Инструкция сформирована.', resetUrl: process.env.NODE_ENV === 'production' ? undefined : resetUrl });
}
