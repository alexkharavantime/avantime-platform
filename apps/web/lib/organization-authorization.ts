import { NextResponse } from 'next/server';

import {
  appendOrganizationAudit,
  createOrganizationSecurityNotification,
} from './organization-audit';
import {
  evaluateCriticalOrganizationAction,
  evaluateOrganizationPermission,
  type CriticalOrganizationAction,
  type OrganizationPermission,
  type OrganizationResourceContext,
} from './organization-permissions';
import { getValidatedPortalSession } from './portal-session';
import type { AppSession } from './session';

type OrganizationAuthorization =
  { session: AppSession; response?: never } | { session?: never; response: NextResponse };

export function authorizeOrganizationSessionSync(
  session: AppSession | null,
  permission: OrganizationPermission,
  resource?: OrganizationResourceContext,
): OrganizationAuthorization {
  const decision = evaluateOrganizationPermission(session, permission, resource);
  if (decision.allowed && session) return { session };
  return {
    response: NextResponse.json(
      { error: session ? 'Недостаточно прав.' : 'Требуется авторизация.' },
      { status: session ? 403 : 401 },
    ),
  };
}

function correlationId(value?: string | null) {
  return value && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u.test(value) ? value : crypto.randomUUID();
}

export async function authorizeOrganizationSession(
  session: AppSession | null,
  permission: OrganizationPermission,
  options: {
    resource?: OrganizationResourceContext;
    correlationId?: string | null;
    concealCrossTenant?: boolean;
  } = {},
): Promise<OrganizationAuthorization> {
  const decision = evaluateOrganizationPermission(session, permission, options.resource);
  if (decision.allowed && session) {
    if (decision.compatibilityUsed && process.env.NODE_ENV !== 'production') {
      console.warn(`Legacy organization role compatibility used for ${permission}.`);
      await appendOrganizationAudit(session, {
        action: 'organization.permission.compatibility_used',
        result: 'SUCCEEDED',
        targetType: 'permission',
        targetId: permission,
        correlationId: correlationId(options.correlationId),
        metadata: { permission },
      });
    }
    return { session };
  }
  if (session) {
    await appendOrganizationAudit(session, {
      action: 'authorization.denied',
      result: 'DENIED',
      targetType: 'permission',
      targetId: permission,
      correlationId: correlationId(options.correlationId),
      metadata: { permission, reasonCode: decision.reasonCode },
    });
  }
  const conceal = options.concealCrossTenant && decision.reasonCode === 'RESOURCE_TENANT_MISMATCH';
  return {
    response: NextResponse.json(
      {
        error: conceal
          ? 'Ресурс не найден.'
          : session
            ? 'Недостаточно прав.'
            : 'Требуется авторизация.',
      },
      { status: conceal ? 404 : session ? 403 : 401 },
    ),
  };
}

export async function authorizeOrganizationApi(
  permission: OrganizationPermission,
  options: {
    resource?: OrganizationResourceContext;
    correlationId?: string | null;
    concealCrossTenant?: boolean;
  } = {},
) {
  return authorizeOrganizationSession(await getValidatedPortalSession(), permission, options);
}

export async function authorizeCriticalOrganizationAction(
  session: AppSession,
  input: {
    action: CriticalOrganizationAction;
    confirmation?: string | null;
    correlationId?: string | null;
    now?: Date;
  },
): Promise<{ response?: NextResponse }> {
  const decision = evaluateCriticalOrganizationAction(
    session,
    input.action,
    input.confirmation,
    input.now,
  );
  const safeCorrelationId = correlationId(input.correlationId);
  if (!decision.allowed) {
    await appendOrganizationAudit(session, {
      action: 'authorization.denied',
      result: 'DENIED',
      targetType: 'critical-action',
      targetId: input.action,
      correlationId: safeCorrelationId,
      metadata: {
        permission: input.action,
        reasonCode: decision.reasonCode,
      },
    });
    return {
      response: NextResponse.json(
        {
          error: 'Требуется повторное подтверждение личности и действия.',
          code: decision.reasonCode,
        },
        { status: 403 },
      ),
    };
  }
  await appendOrganizationAudit(session, {
    action: 'organization.critical_action.confirmed',
    result: 'SUCCEEDED',
    targetType: 'critical-action',
    targetId: input.action,
    correlationId: safeCorrelationId,
    metadata: { criticalAction: input.action },
  });
  await createOrganizationSecurityNotification({
    session,
    targetUserId: session.userId,
    title: 'Выполнено критическое действие безопасности',
  });
  return {};
}
