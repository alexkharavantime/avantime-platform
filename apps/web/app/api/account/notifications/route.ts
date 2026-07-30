import { NextResponse } from 'next/server';

import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from '../../../../lib/notification-preferences';
import { authorizePortalApi } from '../../../../lib/portal-session';

export async function GET() {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json(await getNotificationPreferences(authorization.session.userId));
  } catch {
    return NextResponse.json({ error: 'Настройки временно недоступны.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const body = await request.json();
  try {
    return NextResponse.json(
      await updateNotificationPreferences(authorization.session.userId, {
        requestCreated: Boolean(body.requestCreated),
        requestUpdated: Boolean(body.requestUpdated),
        newMessage: Boolean(body.newMessage),
        slaAlerts: Boolean(body.slaAlerts),
        weeklySummary: Boolean(body.weeklySummary),
      }),
    );
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить настройки.' }, { status: 503 });
  }
}
