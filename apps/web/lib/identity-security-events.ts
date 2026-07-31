import { getPrisma } from '@avantime/database';
import type { Prisma, PrismaClient } from '@prisma/client';

import { PostgreSQLProductionAuditTrail } from './production-audit';

const IDENTITY_SECURITY_ACTIONS = new Set([
  'identity.login.success',
  'identity.login.failure',
  'identity.login.mfa_required',
  'identity.login.suspicious_threshold',
  'identity.logout',
  'identity.password.changed',
  'identity.password.reset_requested',
  'identity.password.reset_completed',
  'identity.email_verification.requested',
  'identity.email_verification.completed',
  'identity.mfa.enrollment_started',
  'identity.mfa.enabled',
  'identity.mfa.disabled',
  'identity.mfa.challenge_failed',
  'identity.recovery_code.used',
  'identity.recovery_codes.regenerated',
  'identity.session.revoked',
  'identity.session.revoked_all',
  'identity.external.linked',
  'identity.external.unlinked',
  'identity.provider.metadata_refreshed',
  'identity.policy.updated',
  'identity.invitation.created',
  'identity.invitation.accepted',
  'identity.invitation.revoked',
] as const);

export type IdentitySecurityAction =
  typeof IDENTITY_SECURITY_ACTIONS extends Set<infer Value> ? Value : never;

type SecurityResult = 'SUCCEEDED' | 'FAILED' | 'DENIED';

export type IdentitySecurityContext = {
  userId: string | null;
  companyId: string | null;
  correlationId: string;
};

export type IdentitySecurityMetadata = {
  method?: 'TOTP' | 'RECOVERY_CODE';
  reasonCode?: string;
  sessionId?: string;
};

const SAFE_VALUE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;

function safeValue(value: string | undefined) {
  return value && SAFE_VALUE.test(value) ? value : undefined;
}

function safeMetadata(metadata: IdentitySecurityMetadata = {}) {
  return {
    ...(metadata.method ? { method: metadata.method } : {}),
    ...(safeValue(metadata.reasonCode) ? { reasonCode: metadata.reasonCode } : {}),
    ...(safeValue(metadata.sessionId) ? { sessionId: metadata.sessionId } : {}),
  };
}

export async function recordIdentitySecurityEvent(input: {
  context: IdentitySecurityContext;
  action: IdentitySecurityAction;
  result: SecurityResult;
  metadata?: IdentitySecurityMetadata;
  notify?: boolean;
}) {
  if (!IDENTITY_SECURITY_ACTIONS.has(input.action)) {
    throw new Error('Identity security action is not allowlisted.');
  }
  const correlationId = safeValue(input.context.correlationId) ?? crypto.randomUUID();
  const metadata = safeMetadata(input.metadata);
  try {
    const prisma = (await getPrisma()) as PrismaClient | null;
    if (!prisma) return;
    await prisma.$transaction(async (database: Prisma.TransactionClient) => {
      await database.securityEvent.create({
        data: {
          userId: input.context.userId,
          companyId: input.context.companyId,
          action: input.action,
          result: input.result,
          correlationId,
          safeMetadata: metadata,
        },
      });
      if (input.notify && input.context.userId && input.context.companyId) {
        await database.portalNotification.create({
          data: {
            userId: input.context.userId,
            companyId: input.context.companyId,
            category: 'SECURITY',
            title: 'Изменение безопасности учётной записи',
            href: '/portal/settings/security',
          },
        });
      }
    });
    const audit = new PostgreSQLProductionAuditTrail(async () => prisma);
    await audit.append({
      companyId: input.context.companyId,
      actorId: input.context.userId,
      action: input.action,
      targetType: 'identity',
      targetId: input.context.userId,
      result: input.result,
      correlationId,
      safeMetadata: metadata,
    });
  } catch {
    // Identity security telemetry follows the existing fail-open audit policy.
    console.warn('Identity security event could not be persisted.');
  }
}
