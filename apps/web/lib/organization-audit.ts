import { getPrisma } from '@avantime/database';

import {
  PostgreSQLProductionAuditTrail,
  type ProductionAuditEntry,
  type ProductionAuditTrail,
} from './production-audit';
import type { AppSession, OrganizationRole } from './session';

export const ORGANIZATION_AUDIT_ACTIONS = [
  'authorization.denied',
  'organization.role.changed',
  'organization.member.suspended',
  'organization.member.reactivated',
  'organization.member.removed',
  'organization.owner.assigned',
  'organization.permission.compatibility_used',
  'organization.export.requested',
  'organization.critical_action.confirmed',
] as const;

export type OrganizationAuditAction = (typeof ORGANIZATION_AUDIT_ACTIONS)[number];
export const ORGANIZATION_SECURITY_NOTIFICATION_TITLES = [
  'Ваша роль в организации изменена',
  'Вы назначены владельцем организации',
  'Доступ к организации приостановлен',
  'Доступ к организации удалён',
  'Политика обязательного SSO изменена',
  'Выполнено критическое действие безопасности',
  'Запрошен экспорт организации',
] as const;
type OrganizationSecurityNotificationTitle =
  (typeof ORGANIZATION_SECURITY_NOTIFICATION_TITLES)[number];
type OrganizationAuditResult = Extract<
  ProductionAuditEntry['result'],
  'SUCCEEDED' | 'FAILED' | 'DENIED'
>;

export type OrganizationAuditMetadata = {
  permission?: string;
  reasonCode?: string;
  previousRole?: OrganizationRole;
  nextRole?: OrganizationRole;
  membershipStatus?: 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'REMOVED';
  membershipVersion?: number;
  criticalAction?: string;
};

type AuditOptions = {
  databaseConfigured?: boolean;
  sink?: Pick<ProductionAuditTrail, 'append'>;
  now?: Date;
};

const actions = new Set<string>(ORGANIZATION_AUDIT_ACTIONS);
const SAFE_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u;
const deniedWindows = new Map<string, number>();
const DENIED_AUDIT_WINDOW_MS = 60_000;

function safeValue(value: string | undefined) {
  return value && SAFE_VALUE.test(value) ? value : undefined;
}

function safeIdentifier(value: string | null | undefined) {
  return value && SAFE_VALUE.test(value) ? value : null;
}

function safeMetadata(metadata: OrganizationAuditMetadata = {}) {
  return {
    ...(safeValue(metadata.permission) ? { permission: metadata.permission } : {}),
    ...(safeValue(metadata.reasonCode) ? { reasonCode: metadata.reasonCode } : {}),
    ...(metadata.previousRole ? { previousRole: metadata.previousRole } : {}),
    ...(metadata.nextRole ? { nextRole: metadata.nextRole } : {}),
    ...(metadata.membershipStatus ? { membershipStatus: metadata.membershipStatus } : {}),
    ...(Number.isSafeInteger(metadata.membershipVersion) && (metadata.membershipVersion ?? 0) > 0
      ? { membershipVersion: metadata.membershipVersion as number }
      : {}),
    ...(safeValue(metadata.criticalAction) ? { criticalAction: metadata.criticalAction } : {}),
  };
}

function shouldRecordDenied(session: AppSession, metadata: OrganizationAuditMetadata, now: Date) {
  const key = `${session.userId}:${safeValue(metadata.permission) ?? 'unknown'}`;
  const previous = deniedWindows.get(key) ?? 0;
  if (now.getTime() - previous < DENIED_AUDIT_WINDOW_MS) return false;
  deniedWindows.set(key, now.getTime());
  return true;
}

export async function appendOrganizationAudit(
  session: AppSession,
  input: {
    action: OrganizationAuditAction;
    result: OrganizationAuditResult;
    targetType: 'organization' | 'membership' | 'permission' | 'export' | 'critical-action';
    targetId?: string | null;
    correlationId: string;
    metadata?: OrganizationAuditMetadata;
  },
  options: AuditOptions = {},
) {
  if (!actions.has(input.action)) throw new Error('Organization audit action is not allowlisted.');
  const now = options.now ?? new Date();
  if (
    input.action === 'authorization.denied' &&
    !shouldRecordDenied(session, input.metadata ?? {}, now)
  ) {
    return;
  }
  const entry: ProductionAuditEntry = {
    companyId: session.companyId ?? null,
    actorId: session.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: safeIdentifier(input.targetId),
    result: input.result,
    correlationId: safeIdentifier(input.correlationId) ?? crypto.randomUUID(),
    safeMetadata: safeMetadata(input.metadata),
  };
  if (!(options.databaseConfigured ?? Boolean(process.env.DATABASE_URL))) return;
  try {
    const sink = options.sink ?? new PostgreSQLProductionAuditTrail(async () => await getPrisma());
    await sink.append(entry);
  } catch {
    // Existing application policy keeps audit telemetry fail-open.
    console.warn('Organization audit event could not be persisted.');
  }
}

export async function createOrganizationSecurityNotification(input: {
  session: AppSession;
  targetUserId: string;
  title: OrganizationSecurityNotificationTitle;
}) {
  if (!(ORGANIZATION_SECURITY_NOTIFICATION_TITLES as readonly string[]).includes(input.title)) {
    throw new Error('Organization security notification title is not allowlisted.');
  }
  if (!input.session.companyId || !process.env.DATABASE_URL) return;
  try {
    const prisma = await getPrisma();
    if (!prisma) return;
    await prisma.portalNotification.create({
      data: {
        userId: input.targetUserId,
        companyId: input.session.companyId,
        category: 'SECURITY',
        title: input.title,
        href: '/portal/settings/security',
      },
    });
  } catch {
    console.warn('Organization security notification could not be persisted.');
  }
}

export function resetOrganizationAuditRateLimitForTests() {
  deniedWindows.clear();
}

export async function listOrganizationAudit(session: AppSession) {
  if (!session.companyId) return [];
  const audit = new PostgreSQLProductionAuditTrail(async () => await getPrisma());
  return audit.list(session.companyId);
}
