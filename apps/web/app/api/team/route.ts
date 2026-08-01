import { NextResponse } from 'next/server';
import { appendPortalAudit } from '../../../lib/portal-audit';
import { getIdentityRateLimiter } from '../../../lib/identity-rate-limit';
import { identityTestResponseEnabled } from '../../../lib/identity-route';
import { sendIdentityEmail } from '../../../lib/identity-email';
import { recordIdentitySecurityEvent } from '../../../lib/identity-security-events';
import {
  inviteCompanyMember,
  listCompanyMembers,
  TeamInviteConflictError,
} from '../../../lib/team';
import { authorizeOrganizationApi } from '../../../lib/organization-authorization';
import type { OrganizationRole } from '../../../lib/session';

const INVITABLE_ROLES = new Set<OrganizationRole>(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']);

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('members.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  return NextResponse.json({ members: await listCompanyMembers(authorization.session) });
}

export async function POST(request: Request) {
  const authorization = await authorizeOrganizationApi('members.invite', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const body = (await request.json()) as {
    companyId?: unknown;
    name?: string;
    email?: string;
    jobTitle?: string;
    role?: string;
  };
  if (body.companyId !== undefined) {
    return NextResponse.json({ error: 'companyId определяется сервером.' }, { status: 400 });
  }
  if (!body.name?.trim() || !body.email?.includes('@'))
    return NextResponse.json({ error: 'Укажите имя и корректный email.' }, { status: 400 });
  try {
    const allowed = await getIdentityRateLimiter().consume({
      scope: 'invitation',
      subject: authorization.session.userId,
      limit: 20,
      windowSeconds: 60 * 60,
    });
    if (!allowed) {
      return NextResponse.json({ error: 'Слишком много приглашений.' }, { status: 429 });
    }
    const role = body.role ?? 'MEMBER';
    if (!INVITABLE_ROLES.has(role as OrganizationRole)) {
      return NextResponse.json({ error: 'Недопустимая роль приглашения.' }, { status: 400 });
    }
    const invitation = await inviteCompanyMember(authorization.session, {
      name: body.name.trim(),
      email: body.email.trim().toLowerCase(),
      jobTitle: body.jobTitle?.trim() ?? '',
      role: role as OrganizationRole,
    });
    await sendIdentityEmail({
      kind: 'INVITATION',
      recipient: invitation.email,
      code: invitation.token,
    });
    await appendPortalAudit(
      authorization.session,
      {
        action: 'portal.team.invite',
        targetType: 'invitation',
        targetId: invitation.id,
        result: 'SUCCEEDED',
      },
      request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
    );
    await recordIdentitySecurityEvent({
      context: {
        userId: authorization.session.userId,
        companyId: authorization.session.companyId ?? null,
        correlationId: request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID(),
      },
      action: 'identity.invitation.created',
      result: 'SUCCEEDED',
      notify: true,
    });
    const response = NextResponse.json(
      {
        invitation: {
          id: invitation.id,
          role: invitation.role,
          expiresAt: invitation.expiresAt.toISOString(),
        },
        invitationToken: identityTestResponseEnabled() ? invitation.token : undefined,
      },
      { status: 201 },
    );
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof TeamInviteConflictError) {
      return NextResponse.json(
        { error: 'Этот email нельзя добавить в компанию.', code: error.code },
        { status: 409 },
      );
    }
    if (error instanceof Error && 'code' in error && error.code === 'INVITATION_FORBIDDEN') {
      return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Не удалось добавить пользователя.' }, { status: 503 });
  }
}
