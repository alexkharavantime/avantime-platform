import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

import { SESSION_COOKIE } from './session-constants';

export { SESSION_COOKIE };
export type UserRole = 'CLIENT' | 'ADMIN';

export type AppSession = {
  userId: string;
  name: string;
  company: string;
  companyId?: string;
  email: string;
  role: UserRole;
  expiresAt: number;
};

export function getSessionSecret(
  environment: Record<string, string | undefined> = process.env,
) {
  const value = environment.SESSION_SECRET?.trim();

  if (!value) {
    throw new Error(
      'SESSION_SECRET is required. Configure a unique secret with at least 32 characters.',
    );
  }

  if (value.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters.');
  }

  return value;
}

const productionSessionSecret =
  process.env.NODE_ENV === 'production' ? getSessionSecret() : undefined;

function sign(payload: string) {
  return createHmac('sha256', productionSessionSecret ?? getSessionSecret())
    .update(payload)
    .digest('base64url');
}

export function encodeSession(session: Omit<AppSession, 'expiresAt'>, maxAgeSeconds = 60 * 60 * 8) {
  const payload = Buffer.from(
    JSON.stringify({ ...session, expiresAt: Date.now() + maxAgeSeconds * 1000 }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeSession(raw: string): AppSession | null {
  const [payload, signature] = raw.split('.');
  if (!payload || !signature) return null;
  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AppSession;
    if (!session.email || !session.name || !session.role || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<AppSession | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  return raw ? decodeSession(raw) : null;
}
