import { NextResponse } from 'next/server';
import { authorizePortalApi } from '../../../lib/portal-session';
import { appendPortalAudit } from '../../../lib/portal-audit';
import {
  inviteCompanyMember,
  listCompanyMembers,
  TeamInviteConflictError,
} from '../../../lib/team';

export async function GET() {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  return NextResponse.json({ members: await listCompanyMembers(authorization.session) });
}

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const body = (await request.json()) as { name?: string; email?: string; jobTitle?: string };
  if (!body.name?.trim() || !body.email?.includes('@'))
    return NextResponse.json({ error: 'Укажите имя и корректный email.' }, { status: 400 });
  try {
    const member = await inviteCompanyMember(authorization.session, {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      jobTitle: body.jobTitle?.trim() ?? '',
    });
    await appendPortalAudit(
      authorization.session,
      {
        action: 'portal.team.invite',
        targetType: 'user',
        targetId: member.id,
        result: 'SUCCEEDED',
      },
      request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
    );
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    if (error instanceof TeamInviteConflictError) {
      return NextResponse.json(
        { error: 'Этот email нельзя добавить в компанию.', code: error.code },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Не удалось добавить пользователя.' }, { status: 503 });
  }
}
