import { NextResponse } from 'next/server';

import {
  authorizeCriticalOrganizationAction,
  authorizeOrganizationApi,
} from '../../../../../lib/organization-authorization';
import {
  bootstrapFirstOrganizationOwner,
  changeOrganizationMemberRole,
  changeOrganizationMembershipStatus,
  TeamGovernanceError,
} from '../../../../../lib/team';

const roles = new Set(['OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']);
const statuses = new Set(['ACTIVE', 'SUSPENDED', 'REMOVED']);

function correlationId(request: Request) {
  return request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
}

function governanceError(error: unknown) {
  if (!(error instanceof TeamGovernanceError)) {
    return NextResponse.json({ error: 'Не удалось изменить участника.' }, { status: 503 });
  }
  if (error.code === 'MEMBERSHIP_NOT_FOUND') {
    return NextResponse.json({ error: 'Участник не найден.' }, { status: 404 });
  }
  if (error.code === 'MEMBERSHIP_VERSION_CONFLICT') {
    return NextResponse.json({ error: 'Данные участника уже изменились.' }, { status: 409 });
  }
  if (error.code === 'LAST_OWNER_PROTECTED') {
    return NextResponse.json(
      { error: 'Нельзя изменить последнего действующего владельца.' },
      { status: 409 },
    );
  }
  return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeOrganizationApi('members.role.manage', {
    correlationId: correlationId(request),
  });
  if (authorization.response) return authorization.response;
  const body = (await request.json()) as Record<string, unknown>;
  if (body.companyId !== undefined) {
    return NextResponse.json({ error: 'companyId определяется сервером.' }, { status: 400 });
  }
  const expectedVersion = body.expectedVersion;
  if (!Number.isSafeInteger(expectedVersion) || (expectedVersion as number) < 1) {
    return NextResponse.json({ error: 'Некорректная версия участника.' }, { status: 400 });
  }
  const membershipId = (await context.params).id;
  try {
    if (body.action === 'bootstrap-owner') {
      const critical = await authorizeCriticalOrganizationAction(authorization.session, {
        action: 'organization.owner.assign',
        confirmation: typeof body.confirmation === 'string' ? body.confirmation : null,
        correlationId: correlationId(request),
      });
      if (critical.response) return critical.response;
      return NextResponse.json(
        await bootstrapFirstOrganizationOwner({
          session: authorization.session,
          membershipId,
          expectedVersion: expectedVersion as number,
          correlationId: correlationId(request),
          confirmation: body.confirmation as string,
        }),
      );
    }
    if (body.action === 'role' && typeof body.role === 'string' && roles.has(body.role)) {
      if (body.role === 'OWNER') {
        const critical = await authorizeCriticalOrganizationAction(authorization.session, {
          action: 'organization.owner.assign',
          confirmation: typeof body.confirmation === 'string' ? body.confirmation : null,
          correlationId: correlationId(request),
        });
        if (critical.response) return critical.response;
      }
      const membership = await changeOrganizationMemberRole({
        session: authorization.session,
        membershipId,
        nextRole: body.role,
        expectedVersion: expectedVersion as number,
        correlationId: correlationId(request),
        confirmation: typeof body.confirmation === 'string' ? body.confirmation : undefined,
      });
      return NextResponse.json({
        membership: {
          id: membership.id,
          role: membership.organizationRole,
          status: membership.status,
          version: membership.version,
        },
      });
    }
    if (body.action === 'status' && typeof body.status === 'string' && statuses.has(body.status)) {
      const permission = await authorizeOrganizationApi('members.remove', {
        correlationId: correlationId(request),
      });
      if (permission.response) return permission.response;
      const membership = await changeOrganizationMembershipStatus({
        session: permission.session,
        membershipId,
        status: body.status as 'ACTIVE' | 'SUSPENDED' | 'REMOVED',
        expectedVersion: expectedVersion as number,
        correlationId: correlationId(request),
      });
      return NextResponse.json({
        membership: {
          id: membership.id,
          role: membership.organizationRole,
          status: membership.status,
          version: membership.version,
        },
      });
    }
    return NextResponse.json({ error: 'Некорректное действие.' }, { status: 400 });
  } catch (error) {
    return governanceError(error);
  }
}
