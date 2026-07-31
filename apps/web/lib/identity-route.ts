import { NextResponse } from 'next/server';

import { isSameOriginMutation } from './identity-auth';

export async function parseIdentityMutation(request: Request) {
  if (!isSameOriginMutation(request)) {
    return {
      response: NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 }),
    } as const;
  }
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Invalid JSON object.');
    }
    const record = body as Record<string, unknown>;
    if ('companyId' in record || 'organizationId' in record || 'tenantId' in record) {
      return {
        response: NextResponse.json(
          {
            error: 'Tenant identifier не поддерживается.',
            code: 'TENANT_INPUT_REJECTED',
          },
          { status: 400 },
        ),
      } as const;
    }
    return { body: record } as const;
  } catch {
    return {
      response: NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 }),
    } as const;
  }
}

export function identityCorrelationId(request: Request) {
  return request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
}

export function requestRateLimitSubject(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return candidate.length <= 200 ? candidate : 'invalid';
}

export function identityTestResponseEnabled(
  environment: Record<string, string | undefined> = process.env,
) {
  return (
    environment.NODE_ENV === 'test' ||
    (environment.NODE_ENV !== 'production' && environment.IDENTITY_TEST_MODE === 'browser')
  );
}
