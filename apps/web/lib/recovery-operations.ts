import { getPrisma } from '@avantime/database';

import { PostgreSQLProductionAuditTrail } from './production-audit';
import type { VectorDatabaseClient } from './vector-repository';

export type RecoveryOperationInput = {
  operationType: 'BACKUP' | 'OBJECT_BACKUP' | 'RESTORE_REHEARSAL';
  environment: string;
  status: 'SUCCEEDED' | 'FAILED';
  checksum?: string;
  objectCount?: number;
  databaseBackupAt?: Date;
  objectBackupAt?: Date;
  safeDetails?: Record<string, string | number | boolean | null>;
  correlationId?: string;
  actorId?: string;
};

export async function recordRecoveryOperation(input: RecoveryOperationInput) {
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(input.environment)) {
    throw new Error('Recovery operation environment is invalid.');
  }
  const database = (await getPrisma()) as VectorDatabaseClient | null;
  if (!database) throw new Error('Recovery operation database is unavailable.');
  const correlationId = input.correlationId ?? crypto.randomUUID();
  const operationId = crypto.randomUUID();
  await database.$executeRawUnsafe(
    `INSERT INTO "RecoveryOperation" (
       "id", "operationType", "environment", "status", "checksum", "objectCount",
       "databaseBackupAt", "objectBackupAt", "startedAt", "completedAt", "safeDetails"
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $9::jsonb
     )`,
    operationId,
    input.operationType,
    input.environment,
    input.status,
    input.checksum ?? null,
    input.objectCount ?? null,
    input.databaseBackupAt ?? null,
    input.objectBackupAt ?? null,
    JSON.stringify(input.safeDetails ?? {}),
  );
  const audit = new PostgreSQLProductionAuditTrail(async () => database);
  await audit.append({
    companyId: null,
    actorId: input.actorId ?? 'system',
    action: `recovery.${input.operationType.toLowerCase()}`,
    targetType: 'environment',
    targetId: input.environment,
    result: input.status,
    correlationId,
    safeMetadata: {
      operationId,
      checksumRecorded: Boolean(input.checksum),
      objectCount: input.objectCount ?? null,
    },
  });
}
