import { NextResponse } from 'next/server';
import { getAccountProfile, updateAccountProfile } from '../../../lib/account';
import { authorizePortalApi } from '../../../lib/portal-session';
import { appendPortalAudit } from '../../../lib/portal-audit';

export async function GET() {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json(await getAccountProfile(authorization.session));
  } catch {
    return NextResponse.json({ error: 'Профиль временно недоступен.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const session = authorization.session;
  const body = (await request.json()) as Record<string, unknown>;
  const profile = {
    name: String(body.name ?? '').trim(),
    email: session.email,
    phone: String(body.phone ?? '').trim(),
    jobTitle: String(body.jobTitle ?? '').trim(),
    companyName: String(body.companyName ?? '').trim(),
    registrationNumber: String(body.registrationNumber ?? '').trim(),
    address: String(body.address ?? '').trim(),
  };
  if (!profile.name || !profile.companyName) {
    return NextResponse.json({ error: 'Укажите имя и название компании.' }, { status: 400 });
  }
  try {
    const updated = await updateAccountProfile(session, profile);
    await appendPortalAudit(
      session,
      {
        action: 'portal.company.update',
        targetType: 'company',
        targetId: session.companyId ?? null,
        result: 'SUCCEEDED',
      },
      request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
    );
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить профиль.' }, { status: 503 });
  }
}
