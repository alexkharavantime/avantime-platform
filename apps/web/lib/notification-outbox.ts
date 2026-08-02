import { randomUUID } from 'node:crypto';

import { getPrisma } from '@avantime/database';

const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;
const SAFE_FAILURE_CODE = /^[A-Z0-9][A-Z0-9_-]{2,99}$/u;

export type NotificationOutboxRecord = {
  id: string;
  idempotencyKey: string;
  notificationType: string;
  recipientReference: string;
  recipientUserId: string | null;
  templateReference: string;
  correlationId: string;
  status: 'PENDING' | 'PROCESSING' | 'DELIVERED' | 'FAILED' | 'DEAD_LETTER';
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  leaseToken: string | null;
  leaseUntil: Date | null;
  providerMessageId: string | null;
  lastFailureCode: string | null;
  deliveredAt: Date | null;
};

export type NotificationDelivery = {
  providerMessageId: string;
  terminal: 'delivered' | 'accepted';
};

export interface NotificationProviderAdapter {
  readonly kind: 'test' | 'resend';
  checkReadiness(): Promise<boolean>;
  deliver(record: NotificationOutboxRecord): Promise<NotificationDelivery>;
}

type OutboxTransaction = {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
};

async function notificationDatabaseNow(prisma: {
  $queryRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
}) {
  const rows = (await prisma.$queryRaw`SELECT CURRENT_TIMESTAMP AS "now"`) as Array<{ now: Date }>;
  const now = rows[0]?.now;
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error('NOTIFICATION_DATABASE_TIME_INVALID');
  }
  return now;
}

function assertSafeReference(value: string, name: string) {
  if (!SAFE_REFERENCE.test(value)) throw new Error(`NOTIFICATION_${name}_INVALID`);
  return value;
}

export function notificationBackoffMs(attempt: number, baseMs = 1_000, maximumMs = 300_000) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt > 20) {
    throw new Error('NOTIFICATION_ATTEMPT_INVALID');
  }
  return Math.min(maximumMs, baseMs * 2 ** (attempt - 1));
}

export async function enqueueNotification(input: {
  idempotencyKey: string;
  notificationType: string;
  recipientReference: string;
  recipientUserId?: string;
  templateReference: string;
  correlationId: string;
  maximumAttempts?: number;
}) {
  for (const [name, value] of [
    ['IDEMPOTENCY_KEY', input.idempotencyKey],
    ['TYPE', input.notificationType],
    ['RECIPIENT_REFERENCE', input.recipientReference],
    ['TEMPLATE_REFERENCE', input.templateReference],
    ['CORRELATION_ID', input.correlationId],
  ] as const) {
    assertSafeReference(value, name);
  }
  if (input.recipientReference.includes('@')) throw new Error('NOTIFICATION_RAW_RECIPIENT_DENIED');
  const maximumAttempts = input.maximumAttempts ?? 5;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1 || maximumAttempts > 20) {
    throw new Error('NOTIFICATION_MAX_ATTEMPTS_INVALID');
  }
  const prisma = await getPrisma();
  if (!prisma) throw new Error('NOTIFICATION_DATABASE_UNAVAILABLE');
  return prisma.notificationOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      idempotencyKey: input.idempotencyKey,
      notificationType: input.notificationType,
      recipientReference: input.recipientReference,
      recipientUserId: input.recipientUserId,
      templateReference: input.templateReference,
      correlationId: input.correlationId,
      maxAttempts: maximumAttempts,
    },
    update: {},
  });
}

export async function claimNotificationBatch(input: {
  batchSize: number;
  leaseMs: number;
  now?: Date;
  correlationId?: string;
}) {
  if (!Number.isSafeInteger(input.batchSize) || input.batchSize < 1 || input.batchSize > 100) {
    throw new Error('NOTIFICATION_BATCH_SIZE_INVALID');
  }
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1_000 || input.leaseMs > 600_000) {
    throw new Error('NOTIFICATION_LEASE_INVALID');
  }
  const correlationId = input.correlationId
    ? assertSafeReference(input.correlationId, 'CORRELATION_ID')
    : null;
  const prisma = await getPrisma();
  if (!prisma) throw new Error('NOTIFICATION_DATABASE_UNAVAILABLE');
  const now = input.now ?? (await notificationDatabaseNow(prisma));
  const leaseToken = randomUUID();
  const leaseUntil = new Date(now.getTime() + input.leaseMs);
  return prisma.$transaction(async (transaction: OutboxTransaction) => {
    await transaction.$executeRaw`
      UPDATE "NotificationOutbox"
      SET "status" = 'DEAD_LETTER', "lastFailureCode" = 'LEASE_EXHAUSTED',
          "leaseToken" = NULL, "leaseUntil" = NULL, "updatedAt" = ${now}
      WHERE "status" = 'PROCESSING' AND "leaseUntil" <= ${now} AND "attempts" >= "maxAttempts"
    `;
    return (await transaction.$queryRaw`
      WITH candidates AS (
        SELECT "id"
        FROM "NotificationOutbox"
        WHERE "attempts" < "maxAttempts"
          AND (${correlationId}::TEXT IS NULL OR "correlationId" = ${correlationId})
          AND (
            ("status" IN ('PENDING', 'FAILED') AND "nextAttemptAt" <= ${now})
            OR ("status" = 'PROCESSING' AND "leaseUntil" <= ${now})
          )
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${input.batchSize}
      )
      UPDATE "NotificationOutbox" AS item
      SET "status" = 'PROCESSING', "attempts" = item."attempts" + 1,
          "leaseToken" = ${leaseToken}, "leaseUntil" = ${leaseUntil},
          "lastFailureCode" = NULL, "updatedAt" = ${now}
      FROM candidates
      WHERE item."id" = candidates."id"
      RETURNING item.*
    `) as NotificationOutboxRecord[];
  });
}

export async function markNotificationDelivered(input: {
  id: string;
  leaseToken: string;
  providerMessageId: string;
  deliveredAt?: Date;
}) {
  assertSafeReference(input.providerMessageId, 'PROVIDER_MESSAGE_ID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('NOTIFICATION_DATABASE_UNAVAILABLE');
  const updated = await prisma.notificationOutbox.updateMany({
    where: { id: input.id, status: 'PROCESSING', leaseToken: input.leaseToken },
    data: {
      status: 'DELIVERED',
      providerMessageId: input.providerMessageId,
      deliveredAt: input.deliveredAt ?? new Date(),
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: null,
    },
  });
  if (updated.count !== 1) throw new Error('NOTIFICATION_LEASE_LOST');
}

export async function markNotificationAccepted(input: {
  id: string;
  leaseToken: string;
  providerMessageId: string;
  retryAt?: Date;
}) {
  assertSafeReference(input.providerMessageId, 'PROVIDER_MESSAGE_ID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('NOTIFICATION_DATABASE_UNAVAILABLE');
  const retryAt = input.retryAt ?? new Date(Date.now() + 60_000);
  const updated = await prisma.notificationOutbox.updateMany({
    where: { id: input.id, status: 'PROCESSING', leaseToken: input.leaseToken },
    data: {
      providerMessageId: input.providerMessageId,
      nextAttemptAt: retryAt,
      leaseToken: null,
      leaseUntil: retryAt,
      lastFailureCode: null,
    },
  });
  if (updated.count !== 1) throw new Error('NOTIFICATION_LEASE_LOST');
}

export async function markNotificationFailed(input: {
  record: NotificationOutboxRecord;
  leaseToken: string;
  failureCode: string;
  now?: Date;
}) {
  const failureCode = input.failureCode.toUpperCase();
  if (!SAFE_FAILURE_CODE.test(failureCode)) throw new Error('NOTIFICATION_FAILURE_CODE_INVALID');
  const now = input.now ?? new Date();
  const exhausted = input.record.attempts >= input.record.maxAttempts;
  const prisma = await getPrisma();
  if (!prisma) throw new Error('NOTIFICATION_DATABASE_UNAVAILABLE');
  const updated = await prisma.notificationOutbox.updateMany({
    where: { id: input.record.id, status: 'PROCESSING', leaseToken: input.leaseToken },
    data: {
      status: exhausted ? 'DEAD_LETTER' : 'FAILED',
      nextAttemptAt: exhausted
        ? now
        : new Date(now.getTime() + notificationBackoffMs(input.record.attempts)),
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: failureCode,
    },
  });
  if (updated.count !== 1) throw new Error('NOTIFICATION_LEASE_LOST');
}

export async function retryDeadLetterNotification(id: string, now = new Date()) {
  assertSafeReference(id, 'ID');
  const prisma = await getPrisma();
  if (!prisma) throw new Error('NOTIFICATION_DATABASE_UNAVAILABLE');
  const updated = await prisma.notificationOutbox.updateMany({
    where: { id, status: 'DEAD_LETTER' },
    data: {
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastFailureCode: null,
      providerMessageId: null,
      deliveredAt: null,
    },
  });
  if (updated.count !== 1) throw new Error('NOTIFICATION_DEAD_LETTER_NOT_FOUND');
}

export async function processNotificationBatch(input: {
  provider: NotificationProviderAdapter;
  batchSize: number;
  leaseMs: number;
  now?: Date;
  correlationId?: string;
}) {
  const records = await claimNotificationBatch(input);
  let delivered = 0;
  let failed = 0;
  let deadLettered = 0;
  for (const record of records) {
    const leaseToken = record.leaseToken!;
    try {
      const result = await input.provider.deliver(record);
      if (result.terminal === 'delivered') {
        await markNotificationDelivered({
          id: record.id,
          leaseToken,
          providerMessageId: result.providerMessageId,
          deliveredAt: input.now,
        });
        delivered += 1;
      } else {
        await markNotificationAccepted({
          id: record.id,
          leaseToken,
          providerMessageId: result.providerMessageId,
          retryAt: new Date((input.now ?? new Date()).getTime() + 60_000),
        });
      }
    } catch (error) {
      const code = notificationFailureCode(error);
      await markNotificationFailed({ record, leaseToken, failureCode: code, now: input.now });
      if (record.attempts >= record.maxAttempts) deadLettered += 1;
      else failed += 1;
    }
  }
  return { claimed: records.length, delivered, failed, deadLettered };
}

export function notificationFailureCode(error: unknown) {
  if (error instanceof NotificationProviderError) return error.code;
  return 'PROVIDER_DELIVERY_FAILED';
}

export class NotificationProviderError extends Error {
  constructor(readonly code: string) {
    super(code);
    if (!SAFE_FAILURE_CODE.test(code)) throw new Error('NOTIFICATION_FAILURE_CODE_INVALID');
  }
}
