import { getPrisma } from '@avantime/database';

import type { DocumentTenantContext } from './document-model';
import type { VectorDatabaseLoader } from './vector-repository';

export type ProductionAuditEntry = {
  companyId: string | null;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: 'SUCCEEDED' | 'FAILED' | 'DENIED';
  correlationId: string;
  safeMetadata?: Record<string, string | number | boolean | null>;
  previousState?: Record<string, string | number | boolean | null>;
  newState?: Record<string, string | number | boolean | null>;
  occurredAt?: string;
};

export interface ProductionAuditTrail {
  readonly kind: 'memory' | 'postgresql';
  append(entry: ProductionAuditEntry): Promise<void>;
  list(companyId: string): Promise<readonly ProductionAuditEntry[]>;
}

function validateAuditEntry(entry: ProductionAuditEntry) {
  for (const [name, value] of [
    ['action', entry.action],
    ['targetType', entry.targetType],
    ['correlationId', entry.correlationId],
  ] as const) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/.test(value)) {
      throw new Error(`Audit ${name} is invalid.`);
    }
  }
  const serialized = JSON.stringify({
    safeMetadata: entry.safeMetadata,
    previousState: entry.previousState,
    newState: entry.newState,
  });
  if (
    /prompt|answer|documentText|embedding|api[_-]?key|password|secret|credential/i.test(serialized)
  ) {
    throw new Error('Audit metadata contains a forbidden content or secret field.');
  }
}

export class MemoryProductionAuditTrail implements ProductionAuditTrail {
  readonly kind = 'memory';
  private readonly entries: ProductionAuditEntry[] = [];

  async append(entry: ProductionAuditEntry) {
    validateAuditEntry(entry);
    this.entries.push(
      Object.freeze({
        ...structuredClone(entry),
        occurredAt: entry.occurredAt ?? new Date().toISOString(),
      }),
    );
  }

  async list(companyId: string) {
    return this.entries
      .filter((entry) => entry.companyId === companyId)
      .map((entry) => structuredClone(entry));
  }
}

export class PostgreSQLProductionAuditTrail implements ProductionAuditTrail {
  readonly kind = 'postgresql';

  constructor(private readonly loadDatabase: VectorDatabaseLoader) {}

  async append(entry: ProductionAuditEntry) {
    validateAuditEntry(entry);
    const database = await this.loadDatabase();
    if (!database) throw new Error('Production audit database is unavailable.');
    await database.$executeRawUnsafe(
      `INSERT INTO "ProductionAuditEvent" (
         "id", "companyId", "actorId", "action", "targetType", "targetId", "result",
         "correlationId", "safeMetadata", "previousState", "newState", "occurredAt"
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb,
         COALESCE($12, CURRENT_TIMESTAMP))`,
      crypto.randomUUID(),
      entry.companyId,
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.result,
      entry.correlationId,
      JSON.stringify(entry.safeMetadata ?? {}),
      JSON.stringify(entry.previousState ?? {}),
      JSON.stringify(entry.newState ?? {}),
      entry.occurredAt ? new Date(entry.occurredAt) : null,
    );
  }

  async list(companyId: string) {
    const database = await this.loadDatabase();
    if (!database) throw new Error('Production audit database is unavailable.');
    return database.$queryRawUnsafe<ProductionAuditEntry[]>(
      `SELECT "companyId", "actorId", "action", "targetType", "targetId", "result",
              "correlationId", "safeMetadata", "previousState", "newState",
              "occurredAt"::text AS "occurredAt"
       FROM "ProductionAuditEvent"
       WHERE "companyId" = $1
       ORDER BY "occurredAt" DESC
       LIMIT 500`,
      companyId,
    );
  }
}

export async function appendCriticalDocumentAudit(
  tenant: DocumentTenantContext,
  entry: Omit<ProductionAuditEntry, 'companyId' | 'actorId' | 'correlationId'>,
) {
  if (process.env.DOCUMENT_METADATA_DRIVER !== 'postgresql') return;
  const audit = new PostgreSQLProductionAuditTrail(async () => await getPrisma());
  await audit.append({
    ...entry,
    companyId: tenant.companyId,
    actorId: tenant.userId,
    correlationId: crypto.randomUUID(),
  });
}
