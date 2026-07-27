import type { AppSession } from './session';

type DemoIdentity = Omit<AppSession, 'expiresAt'>;

export function isDemoAuthEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.NODE_ENV !== 'production' && environment.ENABLE_DEMO_AUTH === 'true';
}

export function getDemoIdentity(
  email: string,
  password: string,
  environment: Record<string, string | undefined> = process.env,
): DemoIdentity | null {
  if (!isDemoAuthEnabled(environment)) return null;

  if (email === 'admin@avantime.lv' && password === 'admin') {
    return {
      userId: 'demo-admin',
      name: 'Администратор Avantime',
      company: 'Avantime',
      email,
      role: 'ADMIN',
    };
  }

  if (email === 'demo@avantime.lv' && password === 'avantime') {
    return {
      userId: 'demo-user',
      name: 'Александр',
      company: 'Demo Company',
      companyId: 'demo-company',
      email,
      role: 'CLIENT',
    };
  }

  return null;
}
