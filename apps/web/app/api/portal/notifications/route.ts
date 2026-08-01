import { NextResponse } from 'next/server';

import { authorizeOrganizationApi } from '../../../../lib/organization-authorization';
import { appendPortalAudit } from '../../../../lib/portal-audit';
import {
  listPortalNotifications,
  markPortalNotificationRead,
} from '../../../../lib/portal-notifications';

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('notifications.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const url = new URL(request.url);
  if (url.searchParams.has('companyId')) {
    return NextResponse.json(
      { error: 'Параметр companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
      { status: 400 },
    );
  }
  const page = Number(url.searchParams.get('page') ?? '1');
  try {
    return NextResponse.json(await listPortalNotifications(authorization.session, page));
  } catch {
    return NextResponse.json({ error: 'Уведомления временно недоступны.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeOrganizationApi('notifications.manage', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const body = (await request.json()) as { id?: unknown; companyId?: unknown };
  if (body.companyId !== undefined) {
    return NextResponse.json(
      { error: 'Поле companyId не поддерживается.', code: 'TENANT_INPUT_REJECTED' },
      { status: 400 },
    );
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'Не указано уведомление.' }, { status: 400 });
  let marked = false;
  try {
    marked = await markPortalNotificationRead(authorization.session, id);
  } catch {
    return NextResponse.json({ error: 'Не удалось обновить уведомление.' }, { status: 503 });
  }
  if (!marked) return NextResponse.json({ error: 'Уведомление не найдено.' }, { status: 404 });
  await appendPortalAudit(
    authorization.session,
    {
      action: 'portal.notification.read',
      targetType: 'notification',
      targetId: id,
      result: 'SUCCEEDED',
    },
    request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
  );
  return NextResponse.json({ success: true });
}
