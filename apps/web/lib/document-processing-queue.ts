import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { DocumentTenantContext } from './document-model';
import { assertDocumentTenantContext, assertSafeDocumentSegment } from './document-storage';

export type DocumentProcessingJob = {
  id: string;
  documentId: string;
  enqueuedAt: string;
  availableAt: string;
  attempts: number;
};

export type DocumentEnqueueResult = {
  job: DocumentProcessingJob;
  enqueued: boolean;
};

export interface DocumentProcessingQueue {
  readonly kind: 'local' | 'external';
  enqueue(tenant: DocumentTenantContext, documentId: string): Promise<DocumentEnqueueResult>;
  claim(
    tenant: DocumentTenantContext,
    workerId: string,
    options?: {
      now?: Date;
      leaseDurationMs?: number;
    },
  ): Promise<DocumentProcessingJob | null>;
  acknowledge(tenant: DocumentTenantContext, jobId: string, workerId: string): Promise<void>;
  release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    availableAt: string,
  ): Promise<void>;
  removeForDocument(tenant: DocumentTenantContext, documentId: string): Promise<void>;
  list(tenant: DocumentTenantContext): Promise<DocumentProcessingJob[]>;
}

export interface ExternalDocumentProcessingQueue extends DocumentProcessingQueue {
  readonly kind: 'external';
  readonly queueName: string;
}

type StoredDocumentProcessingJob = DocumentProcessingJob & {
  state: 'QUEUED' | 'CLAIMED';
  workerId: string | null;
  leaseExpiresAt: string | null;
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
    if (fileLocks.get(filePath) === chained) {
      fileLocks.delete(filePath);
    }
  }
}

function parseDate(value: string, name: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${name} must be a valid date.`);
  }
  return parsed;
}

function toPublicJob(job: StoredDocumentProcessingJob): DocumentProcessingJob {
  return {
    id: job.id,
    documentId: job.documentId,
    enqueuedAt: job.enqueuedAt,
    availableAt: job.availableAt,
    attempts: job.attempts,
  };
}

function validateStoredJob(job: StoredDocumentProcessingJob) {
  assertSafeDocumentSegment(job.id, 'job id');
  assertSafeDocumentSegment(job.documentId, 'document id');
  parseDate(job.enqueuedAt, 'enqueuedAt');
  parseDate(job.availableAt, 'availableAt');
  if (!Number.isSafeInteger(job.attempts) || job.attempts < 0) {
    throw new Error('Queue job attempts must be a non-negative safe integer.');
  }
  if (job.state !== 'QUEUED' && job.state !== 'CLAIMED') {
    throw new Error('Queue job has an unsupported state.');
  }
  if (job.workerId) assertSafeDocumentSegment(job.workerId, 'workerId');
  if (job.leaseExpiresAt) parseDate(job.leaseExpiresAt, 'leaseExpiresAt');
}

export class LocalDocumentProcessingQueue implements DocumentProcessingQueue {
  readonly kind = 'local';

  constructor(private readonly dataDirectory = path.join(process.cwd(), '.data')) {}

  async enqueue(tenant: DocumentTenantContext, documentId: string) {
    assertDocumentTenantContext(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const filePath = this.queueFile(tenant);

    return withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const existing = jobs.find((job) => job.documentId === documentId);
      if (existing) {
        return {
          job: toPublicJob(existing),
          enqueued: false,
        };
      }

      const now = new Date().toISOString();
      const job: StoredDocumentProcessingJob = {
        id: crypto.randomUUID(),
        documentId,
        enqueuedAt: now,
        availableAt: now,
        attempts: 0,
        state: 'QUEUED',
        workerId: null,
        leaseExpiresAt: null,
      };
      jobs.push(job);
      await this.write(filePath, jobs);
      return {
        job: toPublicJob(job),
        enqueued: true,
      };
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
    assertDocumentTenantContext(tenant);
    assertSafeDocumentSegment(workerId, 'workerId');
    const filePath = this.queueFile(tenant);
    const now = options.now ?? new Date();
    const leaseDurationMs = options.leaseDurationMs ?? 5 * 60_000;
    if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
      throw new Error('Queue lease duration must be a positive integer.');
    }

    return withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const claimable = jobs
        .filter((job) => {
          if (parseDate(job.availableAt, 'availableAt').getTime() > now.getTime()) return false;
          if (job.state === 'QUEUED') return true;
          return Boolean(
            job.leaseExpiresAt &&
            parseDate(job.leaseExpiresAt, 'leaseExpiresAt').getTime() <= now.getTime(),
          );
        })
        .sort((first, second) => first.enqueuedAt.localeCompare(second.enqueuedAt))[0];
      if (!claimable) return null;

      claimable.state = 'CLAIMED';
      claimable.workerId = workerId;
      claimable.leaseExpiresAt = new Date(now.getTime() + leaseDurationMs).toISOString();
      claimable.attempts += 1;
      await this.write(filePath, jobs);
      return toPublicJob(claimable);
    });
  }

  async acknowledge(tenant: DocumentTenantContext, jobId: string, workerId: string) {
    const filePath = this.queueFile(tenant);
    assertSafeDocumentSegment(jobId, 'job id');
    assertSafeDocumentSegment(workerId, 'workerId');

    await withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const index = jobs.findIndex((job) => job.id === jobId);
      if (index === -1) return;
      this.assertClaimOwner(jobs[index], workerId);
      jobs.splice(index, 1);
      await this.write(filePath, jobs);
    });
  }

  async release(
    tenant: DocumentTenantContext,
    jobId: string,
    workerId: string,
    availableAt: string,
  ) {
    const filePath = this.queueFile(tenant);
    assertSafeDocumentSegment(jobId, 'job id');
    assertSafeDocumentSegment(workerId, 'workerId');
    parseDate(availableAt, 'availableAt');

    await withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const job = jobs.find((item) => item.id === jobId);
      if (!job) throw new Error('Queue job was not found.');
      this.assertClaimOwner(job, workerId);
      job.state = 'QUEUED';
      job.workerId = null;
      job.leaseExpiresAt = null;
      job.availableAt = availableAt;
      await this.write(filePath, jobs);
    });
  }

  async removeForDocument(tenant: DocumentTenantContext, documentId: string) {
    const filePath = this.queueFile(tenant);
    assertSafeDocumentSegment(documentId, 'document id');

    await withFileLock(filePath, async () => {
      const jobs = await this.read(filePath);
      const retained = jobs.filter((job) => job.documentId !== documentId);
      if (retained.length !== jobs.length) {
        await this.write(filePath, retained);
      }
    });
  }

  async list(tenant: DocumentTenantContext) {
    const filePath = this.queueFile(tenant);
    return (await this.read(filePath)).map(toPublicJob);
  }

  private queueFile(tenant: DocumentTenantContext) {
    assertDocumentTenantContext(tenant);
    return path.join(
      this.dataDirectory,
      'document-tenants',
      tenant.companyId,
      'processing-queue.json',
    );
  }

  private async read(filePath: string): Promise<StoredDocumentProcessingJob[]> {
    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
      if (!Array.isArray(parsed)) return [];
      const jobs = parsed as StoredDocumentProcessingJob[];
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

  private async write(filePath: string, jobs: StoredDocumentProcessingJob[]) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryFile = `${filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(jobs, null, 2), 'utf8');
    await rename(temporaryFile, filePath);
  }

  private assertClaimOwner(job: StoredDocumentProcessingJob, workerId: string) {
    if (job.state !== 'CLAIMED' || job.workerId !== workerId) {
      throw new Error('Queue job is not claimed by this worker.');
    }
  }
}
