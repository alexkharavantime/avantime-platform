import { NextResponse } from 'next/server';

import { AccessRequestError, decideAccessRequest } from '../../../../../../lib/access-requests';
import {
  isIdentityEmailDeliveryEnabled,
  sendIdentityEmail,
} from '../../../../../../lib/identity-email';
import { recordIdentitySecurityEvent } from '../../../../../../lib/identity-security-events';
import { authorizePlatformApi } from '../../../../../../lib/platform-authorization';
import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';
import { localePath } from '../../../../../../lib/i18n';
import { identityPublicUrl } from '../../../../../../lib/identity-public-url';
import { TeamInvitationError, TeamInviteConflictError } from '../../../../../../lib/team';
import type { OrganizationRole } from '../../../../../../lib/session';

const DECIDABLE_ROLES = new Set<OrganizationRole>(['ADMIN', 'MANAGER', 'MEMBER', 'VIEWER']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  const authorization = await authorizePlatformApi('platform.access_requests.manage', {
    operationalContext: { targetType: 'access-request', targetId: (await params).id },
  });
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.action !== 'approve' && body.action !== 'reject')) {
    return NextResponse.json({ error: 'Некорректный запрос.' }, { status: 400 });
  }
  const correlationId = request.headers.get('x-avantime-correlation-id') ?? crypto.randomUUID();
  try {
    if (body.action === 'reject') {
      const reason = typeof body.reason === 'string' ? body.reason : undefined;
      await decideAccessRequest(authorization.session.userId, id, { action: 'reject', reason });
      await recordIdentitySecurityEvent({
        context: { userId: authorization.session.userId, companyId: null, correlationId },
        action: 'identity.access_request.rejected',
        result: 'SUCCEEDED',
      });
      return NextResponse.json({ status: 'REJECTED' });
    }
    if (typeof body.companyId !== 'string' || !DECIDABLE_ROLES.has(body.role as OrganizationRole)) {
      return NextResponse.json({ error: 'Укажите компанию и допустимую роль.' }, { status: 400 });
    }
    const result = await decideAccessRequest(authorization.session.userId, id, {
      action: 'approve',
      companyId: body.companyId,
      role: body.role as OrganizationRole,
    });
    if (result.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Не удалось обработать заявку.' }, { status: 503 });
    }
    await recordIdentitySecurityEvent({
      context: { userId: authorization.session.userId, companyId: body.companyId, correlationId },
      action: 'identity.access_request.approved',
      result: 'SUCCEEDED',
      notify: true,
    });
    // The invitation is already saved; a delivery failure here must not undo the decision.
    let emailAccepted = false;
    const emailDeliveryEnabled = isIdentityEmailDeliveryEnabled();
    let emailDeliverySuppressed = !emailDeliveryEnabled;
    try {
      const invitationUrl = identityPublicUrl(
        localePath(result.locale ?? 'lv', '/portal/accept-invitation'),
        request.url,
      );
      invitationUrl.searchParams.set('token', result.invitation.token);
      const delivery = await sendIdentityEmail({
        kind: 'ACCESS_REQUEST_INVITATION',
        recipient: result.invitation.email,
        code: invitationUrl.toString(),
        locale: result.locale,
      });
      emailAccepted = delivery.accepted;
      emailDeliverySuppressed = delivery.suppressed;
    } catch (error) {
      emailAccepted = false;
      console.warn('Access request invitation email failed to send.', error);
    }
    return NextResponse.json({
      status: 'APPROVED',
      invitationCreated: true,
      emailAccepted,
      emailDeliveryConfirmed: false,
      emailDeliveryEnabled,
      emailDeliverySuppressed,
    });
  } catch (error) {
    if (error instanceof AccessRequestError && error.code === 'INVALID_STATE') {
      return NextResponse.json(
        { error: 'Заявка уже обработана или ещё не подтверждена по email.' },
        { status: 409 },
      );
    }
    if (error instanceof AccessRequestError && error.code === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Заявка не найдена.' }, { status: 404 });
    }
    if (error instanceof TeamInviteConflictError) {
      return NextResponse.json(
        { error: 'Этот email уже связан с выбранной компанией.', code: error.code },
        { status: 409 },
      );
    }
    if (error instanceof TeamInvitationError && error.code === 'INVITATION_INVALID') {
      return NextResponse.json({ error: 'Выбранная компания не найдена.' }, { status: 400 });
    }
    if (error instanceof TeamInvitationError && error.code === 'INVITATION_FORBIDDEN') {
      return NextResponse.json({ error: 'Недопустимая роль для приглашения.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Не удалось обработать заявку.' }, { status: 503 });
  }
}
