import { NextResponse } from 'next/server';

import {
  authorizeCriticalOrganizationAction,
  authorizeOrganizationApi,
} from '../../../../../lib/organization-authorization';
import {
  appendOrganizationAudit,
  createOrganizationSecurityNotification,
  listOrganizationAudit,
} from '../../../../../lib/organization-audit';

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('identity.audit.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json({ events: await listOrganizationAudit(authorization.session) });
  } catch {
    return NextResponse.json({ error: 'Аудит временно недоступен.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeOrganizationApi('identity.audit.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const body = (await request.json()) as { confirmation?: unknown; companyId?: unknown };
  if (body.companyId !== undefined) {
    return NextResponse.json(
      { error: 'Поле companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
      { status: 400 },
    );
  }
  const critical = await authorizeCriticalOrganizationAction(authorization.session, {
    action: 'organization.audit.export',
    confirmation: typeof body.confirmation === 'string' ? body.confirmation : null,
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (critical.response) return critical.response;
  try {
    const events = await listOrganizationAudit(authorization.session);
    await appendOrganizationAudit(authorization.session, {
      action: 'organization.export.requested',
      result: 'SUCCEEDED',
      targetType: 'export',
      targetId: authorization.session.companyId ?? null,
      correlationId: request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
      metadata: { criticalAction: 'organization.audit.export' },
    });
    await createOrganizationSecurityNotification({
      session: authorization.session,
      targetUserId: authorization.session.userId,
      title: 'Запрошен экспорт организации',
    });
    return NextResponse.json({ events }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Экспорт аудита временно недоступен.' }, { status: 503 });
  }
}
