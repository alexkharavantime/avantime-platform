import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getPrisma } from '@avantime/database';

import type { DocumentTenantContext } from './document-model';
import { assertDocumentTenantContext, assertSafeDocumentSegment } from './document-storage';
import type { VectorDatabaseClient, VectorDatabaseLoader } from './vector-repository';

export type EmbeddingJob = {
  id: string;
  documentId: string;
  version?: 1;
  correlationId?: string;
  enqueuedAt: string;
  availableAt: string;
  attempts: number;
  fencingToken?: number;
  leaseExpiresAt?: string | null;
};

export type EmbeddingEnqueueResult = {
  job: EmbeddingJob;
  enqueued: boolean;
};

export interface EmbeddingJobQueue {
  readonly kind: 'local' | 'postgresql' | 'external';
  enqueue(tenant: DocumentTenantContext, documentId: string): Promise<EmbeddingEnqueueResult>;
  claim(
    tenant: DocumentTenantContext,
    workerId: string,
    options?: {
      now?: Date;
      leaseDurationMs?: number;
    },
  ): Promise<EmbeddingJob | null>;
  renew?(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
    leaseDurationMs: number,
  ): Promise<EmbeddingJob>;
  assertLease?(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken?: number,
  ): Promise<void>;
  acknowledge(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken?: number,
  ): Promise<void>;
  release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    availableAt: string,
    fencingToken?: number,
  ): Promise<void>;
  removeForDocument(tenant: DocumentTenantContext, documentId: string): Promise<void>;
  list(tenant: DocumentTenantContext): Promise<EmbeddingJob[]>;
  checkReadiness(): Promise<boolean>;
}

type StoredEmbeddingJob = EmbeddingJob & {
  version: 1;
  correlationId: string;
  fencingToken: number;
  leaseExpiresAt: string | null;
  state: 'QUEUED' | 'CLAIMED';
  workerId: string | null;
};

const fileLocks = new Map<string, Promise<void>>();

async function withFileLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const previous = fileLocks.get(filePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  fileLocks.set(filePath, chained);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (fileLocks.get(filePath) === chained) fileLocks.delete(filePath);
  }
}

function parseDate(value: string, name: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid date.`);
  return date;
}

function toPublicJob(job: StoredEmbeddingJob): EmbeddingJob {
  return {
    id: job.id,
    documentId: job.documentId,
    version: job.version,
    correlationId: job.correlationId,
    enqueuedAt: job.enqueuedAt,
    availableAt: job.availableAt,
    attempts: job.attempts,
    fencingToken: job.fencingToken,
    leaseExpiresAt: job.leaseExpiresAt,
  };
}

function validateStoredJob(job: StoredEmbeddingJob) {
  assertSafeDocumentSegment(job.id, 'embedding job id');
  assertSafeDocumentSegment(job.documentId, 'document id');
  assertSafeDocumentSegment(job.correlationId, 'correlationId');
  if (job.version !== 1) throw new Error('Embedding job version is unsupported.');
  parseDate(job.enqueuedAt, 'enqueuedAt');
  parseDate(job.availableAt, 'availableAt');
  if (!Number.isSafeInteger(job.attempts) || job.attempts < 0) {
    throw new Error('Embedding job attempts must be a non-negative integer.');
  }
  if (!Number.isSafeInteger(job.fencingToken) || job.fencingToken < 0) {
    throw new Error('Embedding fencingToken must be a non-negative integer.');
  }
  if (!['QUEUED', 'CLAIMED'].includes(job.state)) {
    throw new Error('Embedding job state is invalid.');
  }
  if (job.workerId) assertSafeDocumentSegment(job.workerId, 'workerId');
  if (job.leaseExpiresAt) parseDate(job.leaseExpiresAt, 'leaseExpiresAt');
}

export class LocalEmbeddingJobQueue implements EmbeddingJobQueue {
  readonly kind = 'local';

  constructor(private readonly dataDirectory = path.join(process.cwd(), '.data')) {}

  async enqueue(tenant: DocumentTenantContext, documentId: string) {
    const filePath = this.queueFile(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    return withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const existing = jobs.find((job) => job.documentId === documentId);
      if (existing) return { job: toPublicJob(existing), enqueued: false };
      const now = new Date().toISOString();
      const job: StoredEmbeddingJob = {
        id: crypto.randomUUID(),
        documentId,
        version: 1,
        correlationId: crypto.randomUUID(),
        enqueuedAt: now,
        availableAt: now,
        attempts: 0,
        fencingToken: 0,
        state: 'QUEUED',
        workerId: null,
        leaseExpiresAt: null,
      };
      jobs.push(job);
      await this.write(filePath, jobs);
      return { job: toPublicJob(job), enqueued: true };
    });
  }

  async claim(
    tenant: DocumentTenantContext,
    workerId: string,
    options: {
      now?: Date;
      leaseDurationMs?: number;
    } = {},
  ) {
    const filePath = this.queueFile(tenant);
    assertSafeDocumentSegment(workerId, 'workerId');
    const now = options.now ?? new Date();
    const leaseDurationMs = options.leaseDurationMs ?? 5 * 60_000;
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
      throw new Error('Embedding lease duration must be a positive integer.');
    }
    return withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const job = jobs
        .filter(
          (item) =>
            parseDate(item.availableAt, 'availableAt') <= now &&
            (item.state === 'QUEUED' ||
              Boolean(
                item.leaseExpiresAt && parseDate(item.leaseExpiresAt, 'leaseExpiresAt') <= now,
              )),
        )
        .sort((first, second) => first.enqueuedAt.localeCompare(second.enqueuedAt))[0];
      if (!job) return null;
      job.state = 'CLAIMED';
      job.workerId = workerId;
      job.leaseExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
      job.attempts += 1;
      job.fencingToken += 1;
      await this.write(filePath, jobs);
      return toPublicJob(job);
    });
  }

  async renew(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
    leaseDurationMs: number,
  ) {
    const filePath = this.queueFile(tenant);
    this.assertLeaseArguments(jobId, workerId, fencingToken);
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
      throw new Error('Embedding lease duration must be a positive integer.');
    }
    return withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const job = jobs.find((item) => item.id === jobId);
      if (!job) throw new Error('Embedding job was not found.');
      this.assertOwner(job, workerId, fencingToken);
      if (
        !job.leaseExpiresAt ||
        parseDate(job.leaseExpiresAt, 'leaseExpiresAt').getTime() <= Date.now()
      ) {
        throw new Error('Embedding lease has expired.');
      }
      job.leaseExpiresAt = new Date(Date.now() + leaseDurationMs).toISOString();
      await this.write(filePath, jobs);
      return toPublicJob(job);
    });
  }

  async assertLease(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
  ) {
    const filePath = this.queueFile(tenant);
    this.assertLeaseArguments(jobId, workerId, fencingToken);
    await withFileLock(filePath, async () => {
      const job = (await this.read(filePath)).find((item) => item.id === jobId);
      if (!job) throw new Error('Embedding job was not found.');
      this.assertOwner(job, workerId, fencingToken);
      if (
        !job.leaseExpiresAt ||
        parseDate(job.leaseExpiresAt, 'leaseExpiresAt').getTime() <= Date.now()
      ) {
        throw new Error('Embedding lease has expired.');
      }
    });
  }

  async acknowledge(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken?: number,
  ) {
    const filePath = this.queueFile(tenant);
    this.assertLeaseArguments(jobId, workerId, fencingToken);
    await withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const index = jobs.findIndex((job) => job.id === jobId);
      if (index === -1) return;
      this.assertOwner(jobs[index], workerId, fencingToken ?? jobs[index].fencingToken);
      jobs.splice(index, 1);
      await this.write(filePath, jobs);
    });
  }

  async release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    availableAt: string,
    fencingToken?: number,
  ) {
    const filePath = this.queueFile(tenant);
    parseDate(availableAt, 'availableAt');
    await withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const job = jobs.find((item) => item.id === jobId);
      if (!job) throw new Error('Embedding job was not found.');
      this.assertOwner(job, workerId, fencingToken ?? job.fencingToken);
      job.state = 'QUEUED';
      job.workerId = null;
      job.leaseExpiresAt = null;
      job.availableAt = availableAt;
      await this.write(filePath, jobs);
    });
  }

  async removeForDocument(tenant: DocumentTenantContext, documentId: string) {
    const filePath = this.queueFile(tenant);
    await withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const retained = jobs.filter((job) => job.documentId !== documentId);
      if (retained.length !== jobs.length) await this.write(filePath, retained);
    });
  }

  async list(tenant: DocumentTenantContext) {
    return (await this.read(this.queueFile(tenant))).map(toPublicJob);
  }

  async checkReadiness() {
    return true;
  }

  private queueFile(tenant: DocumentTenantContext) {
    assertDocumentTenantContext(tenant);
    return path.join(
      this.dataDirectory,
      'document-tenants',
      tenant.companyId,
      'embedding-queue.json',
    );
  }

  private async read(filePath: string): Promise<StoredEmbeddingJob[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      const jobs = parsed as StoredEmbeddingJob[];
      jobs.forEach(validateStoredJob);
      return jobs;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }
  }

  private async write(filePath: string, jobs: StoredEmbeddingJob[]) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryFile = `${filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(jobs, null, 2), 'utf8');
    await rename(temporaryFile, filePath);
  }

  private assertOwner(job: StoredEmbeddingJob, workerId: string, fencingToken?: number) {
    if (
      job.state !== 'CLAIMED' ||
      job.workerId !== workerId ||
      (fencingToken !== undefined && job.fencingToken !== fencingToken)
    ) {
      throw new Error('Embedding job is not claimed by this worker.');
    }
  }

  private assertLeaseArguments(jobId: string, workerId: string, fencingToken?: number) {
    assertSafeDocumentSegment(jobId, 'embedding job id');
    assertSafeDocumentSegment(workerId, 'workerId');
    if (fencingToken !== undefined && (!Number.isSafeInteger(fencingToken) || fencingToken <= 0)) {
      throw new Error('Embedding fencingToken must be a positive integer.');
    }
  }
}

type DatabaseEmbeddingJob = {
  id: string;
  documentId: string;
  attempts: number;
  correlationId: string;
  fencingToken: number;
  leaseUntil: Date | null;
  availableAt: Date;
  createdAt: Date;
};

function mapDatabaseJob(job: DatabaseEmbeddingJob): EmbeddingJob {
  return {
    id: job.id,
    documentId: job.documentId,
    version: 1,
    correlationId: job.correlationId,
    attempts: job.attempts,
    fencingToken: job.fencingToken,
    leaseExpiresAt: job.leaseUntil?.toISOString() ?? null,
    availableAt: job.availableAt.toISOString(),
    enqueuedAt: job.createdAt.toISOString(),
  };
}

export class PostgreSQLEmbeddingJobQueue implements EmbeddingJobQueue {
  readonly kind = 'postgresql';

  constructor(
    private readonly loadDatabase: VectorDatabaseLoader = async () =>
      (await getPrisma()) as VectorDatabaseClient | null,
  ) {}

  async enqueue(tenant: DocumentTenantContext, documentId: string) {
    const database = await this.database(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const id = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const inserted = await database.$queryRawUnsafe<DatabaseEmbeddingJob[]>(
      `INSERT INTO "DocumentEmbeddingJob" (
        "id", "companyId", "documentId", "correlationId", "status", "attempts",
        "availableAt", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, 'QUEUED', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("companyId", "documentId") DO NOTHING
      RETURNING "id", "documentId", "attempts", "correlationId", "fencingToken",
                "leaseUntil", "availableAt", "createdAt"`,
      id,
      tenant.companyId,
      documentId,
      correlationId,
    );
    const rows =
      inserted.length > 0
        ? inserted
        : await database.$queryRawUnsafe<DatabaseEmbeddingJob[]>(
            `SELECT "id", "documentId", "attempts", "correlationId", "fencingToken",
                    "leaseUntil", "availableAt", "createdAt"
             FROM "DocumentEmbeddingJob"
             WHERE "companyId" = $1 AND "documentId" = $2`,
            tenant.companyId,
            documentId,
          );
    if (!rows[0]) throw new Error('Embedding job could not be enqueued.');
    return {
      job: mapDatabaseJob(rows[0]),
      enqueued: inserted.length > 0,
    };
  }

  async claim(
    tenant: DocumentTenantContext,
    workerId: string,
    options: {
      now?: Date;
      leaseDurationMs?: number;
    } = {},
  ) {
    const database = await this.database(tenant);
    assertSafeDocumentSegment(workerId, 'workerId');
    const now =
      options.now ??
      (await database.$queryRawUnsafe<Array<{ now: Date }>>(`SELECT CURRENT_TIMESTAMP AS "now"`))[0]
        ?.now;
    if (!now) throw new Error('PostgreSQL embedding queue clock is unavailable.');
    const leaseDurationMs = options.leaseDurationMs ?? 5 * 60_000;
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
      throw new Error('Embedding lease duration must be a positive integer.');
    }
    const leaseUntil = new Date(now.getTime() + leaseDurationMs);
    const rows = await database.$queryRawUnsafe<DatabaseEmbeddingJob[]>(
      `WITH candidate AS (
        SELECT "id"
        FROM "DocumentEmbeddingJob"
        WHERE "companyId" = $1
          AND "availableAt" <= $2
          AND ("status" = 'QUEUED' OR "leaseUntil" <= $2)
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "DocumentEmbeddingJob" job
      SET "status" = 'PROCESSING',
          "leaseOwner" = $3,
          "leaseUntil" = $4,
          "attempts" = job."attempts" + 1,
          "fencingToken" = job."fencingToken" + 1,
          "heartbeatAt" = $2,
          "updatedAt" = $2
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING job."id", job."documentId", job."attempts", job."correlationId",
                job."fencingToken", job."leaseUntil", job."availableAt", job."createdAt"`,
      tenant.companyId,
      now,
      workerId,
      leaseUntil,
    );
    return rows[0] ? mapDatabaseJob(rows[0]) : null;
  }

  async renew(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
    leaseDurationMs: number,
  ) {
    const database = await this.database(tenant);
    this.assertLeaseArguments(jobId, workerId, fencingToken);
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
      throw new Error('Embedding lease duration must be a positive integer.');
    }
    const rows = await database.$queryRawUnsafe<DatabaseEmbeddingJob[]>(
      `UPDATE "DocumentEmbeddingJob"
       SET "leaseUntil" = CURRENT_TIMESTAMP + ($5 * INTERVAL '1 millisecond'),
           "heartbeatAt" = CURRENT_TIMESTAMP,
           "updatedAt" = CURRENT_TIMESTAMP
       WHERE "companyId" = $1 AND "id" = $2
         AND "status" = 'PROCESSING' AND "leaseOwner" = $3
         AND "fencingToken" = $4 AND "leaseUntil" > CURRENT_TIMESTAMP
       RETURNING "id", "documentId", "attempts", "correlationId", "fencingToken",
                 "leaseUntil", "availableAt", "createdAt"`,
      tenant.companyId,
      jobId,
      workerId,
      fencingToken,
      leaseDurationMs,
    );
    if (!rows[0]) throw new Error('Embedding lease is no longer owned by this worker.');
    return mapDatabaseJob(rows[0]);
  }

  async assertLease(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken?: number,
  ) {
    const database = await this.database(tenant);
    if (fencingToken === undefined) {
      throw new Error('PostgreSQL embedding queue requires a fencingToken.');
    }
    this.assertLeaseArguments(jobId, workerId, fencingToken);
    const rows = await database.$queryRawUnsafe<Array<{ valid: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM "DocumentEmbeddingJob"
         WHERE "companyId" = $1 AND "id" = $2
           AND "status" = 'PROCESSING' AND "leaseOwner" = $3
           AND "fencingToken" = $4 AND "leaseUntil" > CURRENT_TIMESTAMP
       ) AS "valid"`,
      tenant.companyId,
      jobId,
      workerId,
      fencingToken,
    );
    if (!rows[0]?.valid) throw new Error('Embedding lease is no longer owned by this worker.');
  }

  async acknowledge(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    fencingToken: number,
  ) {
    const database = await this.database(tenant);
    this.assertLeaseArguments(jobId, workerId, fencingToken);
    const deleted = await database.$executeRawUnsafe(
      `DELETE FROM "DocumentEmbeddingJob"
       WHERE "companyId" = $1 AND "id" = $2
         AND "status" = 'PROCESSING' AND "leaseOwner" = $3
         AND "fencingToken" = $4 AND "leaseUntil" > CURRENT_TIMESTAMP`,
      tenant.companyId,
      jobId,
      workerId,
      fencingToken,
    );
    if (deleted === 0) throw new Error('Embedding lease is no longer owned by this worker.');
  }

  async release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    availableAt: string,
    fencingToken?: number,
  ) {
    const database = await this.database(tenant);
    if (fencingToken === undefined) {
      throw new Error('PostgreSQL embedding queue requires a fencingToken.');
    }
    this.assertLeaseArguments(jobId, workerId, fencingToken);
    const parsed = parseDate(availableAt, 'availableAt');
    const updated = await database.$executeRawUnsafe(
      `UPDATE "DocumentEmbeddingJob"
       SET "status" = 'QUEUED', "leaseOwner" = NULL, "leaseUntil" = NULL,
           "heartbeatAt" = NULL, "availableAt" = $5, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "companyId" = $1 AND "id" = $2
         AND "status" = 'PROCESSING' AND "leaseOwner" = $3
         AND "fencingToken" = $4 AND "leaseUntil" > CURRENT_TIMESTAMP`,
      tenant.companyId,
      jobId,
      workerId,
      fencingToken,
      parsed,
    );
    if (updated === 0) throw new Error('Embedding job is not claimed by this worker.');
  }

  async removeForDocument(tenant: DocumentTenantContext, documentId: string) {
    const database = await this.database(tenant);
    await database.$executeRawUnsafe(
      `DELETE FROM "DocumentEmbeddingJob"
       WHERE "companyId" = $1 AND "documentId" = $2`,
      tenant.companyId,
      documentId,
    );
  }

  async list(tenant: DocumentTenantContext) {
    const database = await this.database(tenant);
    const rows = await database.$queryRawUnsafe<DatabaseEmbeddingJob[]>(
      `SELECT "id", "documentId", "attempts", "correlationId", "fencingToken",
              "leaseUntil", "availableAt", "createdAt"
       FROM "DocumentEmbeddingJob"
       WHERE "companyId" = $1
       ORDER BY "createdAt" ASC`,
      tenant.companyId,
    );
    return rows.map(mapDatabaseJob);
  }

  async checkReadiness() {
    try {
      const database = await this.database();
      const rows = await database.$queryRawUnsafe<Array<{ ready: boolean }>>(
        `SELECT to_regclass('"DocumentEmbeddingJob"') IS NOT NULL AS "ready"`,
      );
      return rows[0]?.ready ?? false;
    } catch {
      return false;
    }
  }

  private async database(tenant?: DocumentTenantContext) {
    if (tenant) assertDocumentTenantContext(tenant);
    const database = await this.loadDatabase();
    if (!database) throw new Error('PostgreSQL embedding queue is unavailable.');
    return database;
  }

  private assertLeaseArguments(jobId: string, workerId: string, fencingToken: number) {
    assertSafeDocumentSegment(jobId, 'embedding job id');
    assertSafeDocumentSegment(workerId, 'workerId');
    if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) {
      throw new Error('Embedding fencingToken must be a positive integer.');
    }
  }
}
