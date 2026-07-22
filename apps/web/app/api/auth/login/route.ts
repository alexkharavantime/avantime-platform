import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';
import { verifyPassword } from '../../../../lib/password';
import { encodeSession, SESSION_COOKIE } from '../../../../lib/session';

export async function POST(request: Request) {
  const body = (await request.json()) as { email?: string; password?: string };
  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? '';
  if (!email || !password) {
    return NextResponse.json({ error: 'Укажите email и пароль.' }, { status: 400 });
  }

  let identity:
    | { userId: string; name: string; company: string; companyId?: string; email: string; role: 'CLIENT' | 'ADMIN' }
    | null = null;

  if (process.env.DATABASE_URL) {
    try {
      const prisma = await getPrisma();
      const user = await prisma?.user.findUnique({ where: { email }, include: { company: true } });
      if (user?.passwordHash && verifyPassword(password, user.passwordHash)) {
        identity = {
          userId: user.id,
          name: user.name,
          company: user.company?.name ?? 'Avantime',
          companyId: user.companyId ?? undefined,
          email: user.email,
          role: user.role,
        };
      }
    } catch (error) {
      console.warn('Database authentication unavailable; using demo credentials.', error);
    }
  }

  if (!identity) {
    if (email === 'admin@avantime.lv' && password === 'admin') {
      identity = { userId: 'demo-admin', name: 'Администратор Avantime', company: 'Avantime', email, role: 'ADMIN' };
    } else if (email === 'demo@avantime.lv' && password === 'avantime') {
      identity = { userId: 'demo-user', name: 'Александр', company: 'Demo Company', companyId: 'demo-company', email, role: 'CLIENT' };
    }
  }

  if (!identity) {
    return NextResponse.json({ error: 'Неверный email или пароль.' }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, role: identity.role });
  response.cookies.set(SESSION_COOKIE, encodeSession(identity), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 8,
  });
  return response;
}
