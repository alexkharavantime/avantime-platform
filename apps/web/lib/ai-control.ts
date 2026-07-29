import { createHash } from 'node:crypto';

import type { DocumentTenantContext } from './document-model';
import type { RedisCommandClient } from './redis-lease-queue';
import type { VectorDatabaseClient, VectorDatabaseLoader } from './vector-repository';

export type AiRequestType = 'document_embedding' | 'query_embedding' | 'rag_answer';

export type AiRateLimitRequest = {
  tenant: DocumentTenantContext;
  provider: string;
  requestType: AiRequestType;
  minuteLimit: number;
  dailyLimit: number;
  burstLimit: number;
};

export interface DistributedAiRateLimiter {
  readonly kind: 'memory' | 'redis';
  consume(request: AiRateLimitRequest): Promise<boolean>;
  checkReadiness(): Promise<boolean>;
}

export type AiBudgetReservationRequest = {
  tenant: DocumentTenantContext;
  provider: string;
  model: string;
  requestType: AiRequestType;
  correlationId: string;
  idempotencyKey: string;
  estimatedCostEur: number;
};

export type AiBudgetReservation = AiBudgetReservationRequest & {
  id: string;
  reservedCostEur: number;
};

export type AiUsageLedgerEvent = {
  reservation: AiBudgetReservation;
  inputTokens: number;
  outputTokens: number;
  embeddingUnits: number;
  estimatedCostEur: number;
  actualCostEur?: number;
  status: 'SUCCEEDED' | 'FAILED';
};

export interface AiCostController {
  readonly kind: 'memory' | 'postgresql';
  reserve(request: AiBudgetReservationRequest): Promise<AiBudgetReservation | null>;
  reconcile(event: AiUsageLedgerEvent): Promise<void>;
  release(reservation: AiBudgetReservation, status?: 'FAILED' | 'CANCELLED'): Promise<void>;
  checkReadiness(): Promise<boolean>;
}

function assertCost(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be non-negative.`);
}

function stableLimitKey(request: AiRateLimitRequest) {
  return createHash('sha256')
    .update(
      [request.tenant.companyId, request.tenant.userId, request.provider, request.requestType].join(
        '\0',
      ),
    )
    .digest('hex');
}

export class MemoryAiRateLimiter implements DistributedAiRateLimiter {
  readonly kind = 'memory';
  private readonly entries = new Map<string, number[]>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async consume(request: AiRateLimitRequest) {
    const key = stableLimitKey(request);
    const now = this.now().getTime();
    const dayStart = now - 86_400_000;
    const minuteStart = now - 60_000;
    const retained = (this.entries.get(key) ?? []).filter((timestamp) => timestamp > dayStart);
    const minuteCount = retained.filter((timestamp) => timestamp > minuteStart).length;
    const burstCount = retained.filter((timestamp) => timestamp > now - 10_000).length;
    if (
      minuteCount >= request.minuteLimit ||
      retained.length >= request.dailyLimit ||
      burstCount >= request.burstLimit
    ) {
      return false;
    }
    retained.push(now);
    this.entries.set(key, retained);
    return true;
  }

  async checkReadiness() {
    return true;
  }
}

const distributedRateLimitScript = `
local serverTime = redis.call('TIME')
local nowMs = (serverTime[1] * 1000) + math.floor(serverTime[2] / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', nowMs - 86400000)
local minuteCount = redis.call('ZCOUNT', KEYS[1], nowMs - 60000, '+inf')
local dayCount = redis.call('ZCARD', KEYS[1])
local burstCount = redis.call('ZCOUNT', KEYS[1], nowMs - 10000, '+inf')
if minuteCount >= tonumber(ARGV[1]) or dayCount >= tonumber(ARGV[2])
  or burstCount >= tonumber(ARGV[3]) then
  return 0
end
redis.call('ZADD', KEYS[1], nowMs, ARGV[4])
redis.call('PEXPIRE', KEYS[1], 86460000)
return 1
`;

export class RedisAiRateLimiter implements DistributedAiRateLimiter {
  readonly kind = 'redis';

  constructor(private readonly client: RedisCommandClient) {}

  async consume(request: AiRateLimitRequest) {
    for (const [name, value] of [
      ['minuteLimit', request.minuteLimit],
      ['dailyLimit', request.dailyLimit],
      ['burstLimit', request.burstLimit],
    ] as const) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive safe integer.`);
      }
    }
    const result = await this.client.sendCommand([
      'EVAL',
      distributedRateLimitScript,
      '1',
      `avantime:ai-rate:${stableLimitKey(request)}`,
      String(request.minuteLimit),
      String(request.dailyLimit),
      String(request.burstLimit),
      crypto.randomUUID(),
    ]);
    return Number(result) === 1;
  }

  async checkReadiness() {
    try {
      return String(await this.client.sendCommand(['PING'])) === 'PONG';
    } catch {
      return false;
    }
  }
}

export class MemoryAiCostController implements AiCostController {
  readonly kind = 'memory';
  private readonly reservations = new Map<string, AiBudgetReservation>();
  private readonly usage = new Map<string, number>();

  constructor(
    private readonly dailyLimitEur: number,
    private readonly monthlyLimitEur = dailyLimitEur > 0 ? dailyLimitEur * 31 : 0,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(request: AiBudgetReservationRequest) {
    assertCost(request.estimatedCostEur, 'estimatedCostEur');
    const existing = this.reservations.get(`${request.tenant.companyId}:${request.idempotencyKey}`);
    if (existing) return null;
    const now = this.now().toISOString();
    const day = now.slice(0, 10);
    const month = now.slice(0, 7);
    const daily = this.usage.get(`${request.tenant.companyId}:${day}`) ?? 0;
    const monthly = this.usage.get(`${request.tenant.companyId}:${month}`) ?? 0;
    const reserved = [...this.reservations.values()]
      .filter((item) => item.tenant.companyId === request.tenant.companyId)
      .reduce((sum, item) => sum + item.reservedCostEur, 0);
    if (
      (this.dailyLimitEur > 0 &&
        daily + reserved + request.estimatedCostEur > this.dailyLimitEur) ||
      (this.monthlyLimitEur > 0 &&
        monthly + reserved + request.estimatedCostEur > this.monthlyLimitEur)
    ) {
      return null;
    }
    const reservation = {
      ...request,
      id: crypto.randomUUID(),
      reservedCostEur: request.estimatedCostEur,
    };
    this.reservations.set(`${request.tenant.companyId}:${request.idempotencyKey}`, reservation);
    return reservation;
  }

  async reconcile(event: AiUsageLedgerEvent) {
    assertCost(event.estimatedCostEur, 'estimatedCostEur');
    const key = `${event.reservation.tenant.companyId}:${event.reservation.idempotencyKey}`;
    if (!this.reservations.delete(key)) return;
    const date = this.now().toISOString();
    const cost = event.actualCostEur ?? event.estimatedCostEur;
    this.usage.set(
      `${event.reservation.tenant.companyId}:${date.slice(0, 10)}`,
      (this.usage.get(`${event.reservation.tenant.companyId}:${date.slice(0, 10)}`) ?? 0) + cost,
    );
    this.usage.set(
      `${event.reservation.tenant.companyId}:${date.slice(0, 7)}`,
      (this.usage.get(`${event.reservation.tenant.companyId}:${date.slice(0, 7)}`) ?? 0) + cost,
    );
  }

  async release(reservation: AiBudgetReservation) {
    this.reservations.delete(`${reservation.tenant.companyId}:${reservation.idempotencyKey}`);
  }

  async checkReadiness() {
    return true;
  }
}

type AiControlDatabaseClient = VectorDatabaseClient & {
  $transaction?<T>(callback: (database: AiControlDatabaseClient) => Promise<T>): Promise<T>;
};

export class PostgreSQLAiCostController implements AiCostController {
  readonly kind = 'postgresql';

  constructor(
    private readonly loadDatabase: VectorDatabaseLoader,
    private readonly defaultDailyLimitEur: number,
    private readonly defaultMonthlyLimitEur: number,
    private readonly reservationTtlMs = 300_000,
  ) {}

  async reserve(request: AiBudgetReservationRequest) {
    assertCost(request.estimatedCostEur, 'estimatedCostEur');
    const database = await this.database();
    if (!database.$transaction) {
      throw new Error('AI cost ledger requires transactional database support.');
    }
    return database.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        request.tenant.companyId,
      );
      const [totals] = await transaction.$queryRawUnsafe<
        Array<{
          dailyLimit: number;
          monthlyLimit: number;
          providerLimit: number | null;
          hardStopThreshold: number;
          dailyUsage: number;
          monthlyUsage: number;
          providerUsage: number;
          reserved: number;
          providerReserved: number;
        }>
      >(
        `SELECT
           COALESCE(policy."dailyLimitEur", $3::decimal)::float8 AS "dailyLimit",
           COALESCE(policy."monthlyLimitEur", $4::decimal)::float8 AS "monthlyLimit",
           CASE
             WHEN policy."providerLimits" ? $2
             THEN (policy."providerLimits" ->> $2)::float8
             ELSE NULL
           END AS "providerLimit",
           COALESCE(policy."hardStopThreshold", 1)::float8 AS "hardStopThreshold",
           COALESCE(usage.daily, 0)::float8 AS "dailyUsage",
           COALESCE(usage.monthly, 0)::float8 AS "monthlyUsage",
           COALESCE(usage.provider, 0)::float8 AS "providerUsage",
           COALESCE(reservations.total, 0)::float8 AS "reserved",
           COALESCE(reservations.provider, 0)::float8 AS "providerReserved"
         FROM (SELECT 1) AS singleton
         LEFT JOIN "AiBudgetPolicy" policy ON policy."companyId" = $1
         LEFT JOIN LATERAL (
           SELECT
             SUM(CASE WHEN "occurredAt" >= date_trunc('day', CURRENT_TIMESTAMP)
               THEN COALESCE("actualCostEur", "estimatedCostEur") ELSE 0 END) AS daily,
             SUM(CASE WHEN "occurredAt" >= date_trunc('month', CURRENT_TIMESTAMP)
               THEN COALESCE("actualCostEur", "estimatedCostEur") ELSE 0 END) AS monthly,
             SUM(CASE WHEN "provider" = $2
               THEN COALESCE("actualCostEur", "estimatedCostEur") ELSE 0 END) AS provider
           FROM "AiUsageLedger"
           WHERE "companyId" = $1 AND "status" = 'SUCCEEDED'
             AND "occurredAt" >= date_trunc('month', CURRENT_TIMESTAMP)
         ) usage ON true
         LEFT JOIN LATERAL (
           SELECT
             SUM("estimatedCostEur") AS total,
             SUM(CASE WHEN "provider" = $2 THEN "estimatedCostEur" ELSE 0 END) AS provider
           FROM "AiBudgetReservation"
           WHERE "companyId" = $1 AND "status" = 'RESERVED'
             AND "expiresAt" > CURRENT_TIMESTAMP
         ) reservations ON true`,
        request.tenant.companyId,
        request.provider,
        this.defaultDailyLimitEur,
        this.defaultMonthlyLimitEur,
      );
      if (!totals) throw new Error('AI budget totals are unavailable.');
      const hardStop = totals.hardStopThreshold;
      const exceeds = (current: number, reserved: number, requested: number, limit: number) =>
        limit > 0 && current + reserved + requested > limit * hardStop;
      if (
        exceeds(totals.dailyUsage, totals.reserved, request.estimatedCostEur, totals.dailyLimit) ||
        exceeds(
          totals.monthlyUsage,
          totals.reserved,
          request.estimatedCostEur,
          totals.monthlyLimit,
        ) ||
        (totals.providerLimit !== null &&
          exceeds(
            totals.providerUsage,
            totals.providerReserved,
            request.estimatedCostEur,
            totals.providerLimit,
          ))
      ) {
        return null;
      }
      const rows = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO "AiBudgetReservation" (
           "id", "companyId", "userId", "provider", "correlationId", "idempotencyKey",
           "estimatedCostEur", "currency", "status", "expiresAt", "createdAt", "updatedAt"
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, 'EUR', 'RESERVED',
           CURRENT_TIMESTAMP + ($8 * INTERVAL '1 millisecond'),
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT ("companyId", "idempotencyKey") DO NOTHING
         RETURNING "id"`,
        crypto.randomUUID(),
        request.tenant.companyId,
        request.tenant.userId,
        request.provider,
        request.correlationId,
        request.idempotencyKey,
        request.estimatedCostEur,
        this.reservationTtlMs,
      );
      return rows[0]
        ? {
            ...request,
            id: rows[0].id,
            reservedCostEur: request.estimatedCostEur,
          }
        : null;
    });
  }

  async reconcile(event: AiUsageLedgerEvent) {
    const database = await this.database();
    await database.$executeRawUnsafe(
      `WITH inserted AS (
         INSERT INTO "AiUsageLedger" (
           "id", "companyId", "userId", "correlationId", "idempotencyKey",
           "requestType", "provider", "model", "inputTokens", "outputTokens",
           "embeddingUnits", "estimatedCostEur", "actualCostEur", "currency",
           "status", "occurredAt", "createdAt"
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
           'EUR', $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT ("companyId", "idempotencyKey") DO NOTHING
       )
       UPDATE "AiBudgetReservation"
       SET "status" = 'RECONCILED', "reconciledAt" = CURRENT_TIMESTAMP,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $15 AND "companyId" = $2 AND "status" = 'RESERVED'`,
      crypto.randomUUID(),
      event.reservation.tenant.companyId,
      event.reservation.tenant.userId,
      event.reservation.correlationId,
      event.reservation.idempotencyKey,
      event.reservation.requestType,
      event.reservation.provider,
      event.reservation.model,
      event.inputTokens,
      event.outputTokens,
      event.embeddingUnits,
      event.estimatedCostEur,
      event.actualCostEur ?? null,
      event.status,
      event.reservation.id,
    );
  }

  async release(reservation: AiBudgetReservation, status: 'FAILED' | 'CANCELLED' = 'FAILED') {
    const database = await this.database();
    await database.$executeRawUnsafe(
      `UPDATE "AiBudgetReservation"
       SET "status" = $3, "reconciledAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "id" = $1 AND "companyId" = $2 AND "status" = 'RESERVED'`,
      reservation.id,
      reservation.tenant.companyId,
      status,
    );
  }

  async checkReadiness() {
    try {
      const rows = await (
        await this.database()
      ).$queryRawUnsafe<Array<{ ready: boolean }>>(
        `SELECT to_regclass('"AiUsageLedger"') IS NOT NULL
          AND to_regclass('"AiBudgetReservation"') IS NOT NULL AS "ready"`,
      );
      return rows[0]?.ready ?? false;
    } catch {
      return false;
    }
  }

  private async database(): Promise<AiControlDatabaseClient> {
    const database = await this.loadDatabase();
    if (!database) throw new Error('AI cost ledger database is unavailable.');
    return database;
  }
}
