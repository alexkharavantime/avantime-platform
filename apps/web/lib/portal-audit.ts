import { getPrisma } from '@avantime/database';

import {
  PostgreSQLProductionAuditTrail,
  type ProductionAuditEntry,
  type ProductionAuditTrail,
} from './production-audit';
import type { AppSession } from './session';

const PORTAL_AUDIT_TARGETS = {
  'portal.access': 'portal',
  'portal.document.download': 'document',
  'portal.company.update': 'company',
  'portal.team.invite': 'invitation',
  'portal.notification.read': 'notification',
} as const;

export type PortalAuditAction = keyof typeof PORTAL_AUDIT_TARGETS;
export type PortalAuditTargetType = (typeof PORTAL_AUDIT_TARGETS)[PortalAuditAction];
export type PortalAuditResult = Extract<ProductionAuditEntry['result'], 'SUCCEEDED' | 'FAILED'>;

export type PortalAuditInput = {
  action: PortalAuditAction;
  targetType: PortalAuditTargetType;
  targetId: string | null;
  result: PortalAuditResult;
  metadata?: Record<string, unknown>;
};

type PortalAuditOptions = {
  databaseConfigured?: boolean;
  sink?: Pick<ProductionAuditTrail, 'append'>;
};

const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/;

function safeIdentifier(value: string | null) {
  return value && SAFE_IDENTIFIER.test(value) ? value : null;
}

function safeCorrelationId(value: string) {
  return SAFE_IDENTIFIER.test(value) ? value : crypto.randomUUID();
}

function safeMetadata(input: PortalAuditInput): NonNullable<ProductionAuditEntry['safeMetadata']> {
  if (input.action !== 'portal.document.download') return {};
  const sizeBytes = input.metadata?.sizeBytes;
  return typeof sizeBytes === 'number' && Number.isSafeInteger(sizeBytes) && sizeBytes >= 0
    ? { sizeBytes }
    : {};
}

export function createPortalAuditEntry(
  session: AppSession,
  input: PortalAuditInput,
  correlationId: string,
): ProductionAuditEntry {
  if (PORTAL_AUDIT_TARGETS[input.action] !== input.targetType) {
    throw new Error('Portal audit action and target type do not match.');
  }

  return {
    companyId: session.companyId ?? null,
    actorId: session.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: safeIdentifier(input.targetId),
    result: input.result,
    correlationId: safeCorrelationId(correlationId),
    safeMetadata: safeMetadata(input),
  };
}

export async function appendPortalAudit(
  session: AppSession,
  input: PortalAuditInput,
  correlationId = crypto.randomUUID(),
  options: PortalAuditOptions = {},
) {
  const entry = createPortalAuditEntry(session, input, correlationId);
  if (options.databaseConfigured ?? Boolean(process.env.DATABASE_URL)) {
    try {
      const audit =
        options.sink ?? new PostgreSQLProductionAuditTrail(async () => await getPrisma());
      await audit.append(entry);
    } catch {
      // Portal audit is fail-open by policy; never expose sink internals to the caller.
      console.warn('Portal audit event could not be persisted.');
    }
  }
}
