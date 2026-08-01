import { NextResponse } from 'next/server';
import { getAccountProfile, updateAccountProfile } from '../../../lib/account';
import { appendPortalAudit } from '../../../lib/portal-audit';
import { authorizeOrganizationApi } from '../../../lib/organization-authorization';
import { hasOrganizationPermission } from '../../../lib/organization-permissions';

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('organization.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json(await getAccountProfile(authorization.session));
  } catch {
    return NextResponse.json({ error: 'Профиль временно недоступен.' }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const authorization = await authorizeOrganizationApi('organization.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const session = authorization.session;
  const body = (await request.json()) as Record<string, unknown>;
  if (body.companyId !== undefined) {
    return NextResponse.json({ error: 'companyId определяется сервером.' }, { status: 400 });
  }
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
    const current = await getAccountProfile(session);
    const companyChanged =
      current.companyName !== profile.companyName ||
      current.registrationNumber !== profile.registrationNumber ||
      current.address !== profile.address;
    const mayUpdateCompany = hasOrganizationPermission(session, 'organization.update');
    if (companyChanged && !mayUpdateCompany) {
      return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
    }
    const updated = await updateAccountProfile(session, profile, {
      allowCompanyUpdate: mayUpdateCompany,
    });
    if (companyChanged) {
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
    }
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Не удалось сохранить профиль.' }, { status: 503 });
  }
}
