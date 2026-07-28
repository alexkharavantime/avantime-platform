import { createHash } from 'node:crypto';

import { AiGatewayError, type AiGateway } from './ai-gateway';
import type { AiOperationalEventSink } from './ai-observability';
import { NoopAiOperationalEventSink } from './ai-observability';
import type { EmbeddingJobQueue } from './embedding-queue';
import type { DocumentTenantContext, TextChunk } from './document-model';
import type {
  DocumentMetadataRepository,
  DocumentProcessingRepository,
} from './document-repositories';
import type { RagConfiguration } from './rag-configuration';
import type { VectorRepository } from './vector-repository';

export type EmbeddingWorkerRunResult =
  | { outcome: 'IDLE' }
  | {
      outcome:
        'COMPLETED' | 'UP_TO_DATE' | 'RETRY_SCHEDULED' | 'FAILED' | 'QUARANTINED' | 'SKIPPED';
      documentId: string;
      jobId: string;
      embeddedChunks?: number;
      errorCode?: string;
    };

export interface DocumentEmbeddingWorker {
  runOnce(tenant: DocumentTenantContext, workerId: string): Promise<EmbeddingWorkerRunResult>;
}

export type ReindexPlan = {
  documentId: string;
  outcome:
    'NOT_FOUND' | 'NOT_ELIGIBLE' | 'UP_TO_DATE' | 'WOULD_REINDEX' | 'QUEUED' | 'ALREADY_QUEUED';
  dryRun: boolean;
  totalChunks: number;
  changedChunks: number;
  staleVectors: number;
  model: string;
  version: string;
  dimensions: number;
};

export type DocumentEmbeddingServices = {
  metadata: DocumentMetadataRepository;
  processing: DocumentProcessingRepository;
  vectors: VectorRepository;
  queue: EmbeddingJobQueue;
  gateway: AiGateway;
  configuration: RagConfiguration;
  events?: AiOperationalEventSink;
  now?: () => Date;
};

export function hashChunkContent(text: string) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashDocumentChunks(chunks: readonly TextChunk[]) {
  const hash = createHash('sha256');
  for (const chunk of [...chunks].sort((first, second) => first.index - second.index)) {
    hash.update(chunk.id);
    hash.update(':');
    hash.update(hashChunkContent(chunk.text));
    hash.update('\n');
  }
  return hash.digest('hex');
}

function compactPreview(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, 1_000);
}

export async function enqueueDocumentEmbedding(
  tenant: DocumentTenantContext,
  documentId: string,
  services: DocumentEmbeddingServices,
) {
  const document = await services.metadata.findById(tenant, documentId);
  if (!document || document.status !== 'COMPLETED') {
    return { outcome: 'NOT_ELIGIBLE' as const, enqueued: false };
  }
  if (services.configuration.embedding.driver === 'disabled') {
    await services.metadata.update(tenant, documentId, {
      embeddingStatus: 'DISABLED',
      lastEmbeddingErrorCode: null,
    });
    return { outcome: 'DISABLED' as const, enqueued: false };
  }
  const chunks = await services.processing.readChunks(tenant, documentId);
  const contentHash = hashDocumentChunks(chunks);
  if (
    document.embeddingStatus === 'COMPLETED' &&
    document.embeddingModel === services.configuration.embedding.model &&
    document.embeddingVersion === services.configuration.embedding.version &&
    document.embeddingDimensions === services.configuration.embedding.dimensions &&
    document.embeddingContentHash === contentHash
  ) {
    return { outcome: 'UP_TO_DATE' as const, enqueued: false };
  }
  const result = await services.queue.enqueue(tenant, documentId);
  await services.metadata.update(tenant, documentId, {
    embeddingStatus: 'QUEUED',
    lastEmbeddingErrorCode: null,
  });
  services.events?.record({
    name: 'embedding_job_queued',
    occurredAt: new Date().toISOString(),
    companyId: tenant.companyId,
    correlationId: result.job.id,
    outcome: 'success',
    count: chunks.length,
  });
  return {
    outcome: result.enqueued ? ('QUEUED' as const) : ('ALREADY_QUEUED' as const),
    enqueued: result.enqueued,
    job: result.job,
  };
}

export async function planDocumentReindex(
  tenant: DocumentTenantContext,
  documentId: string,
  dryRun: boolean,
  services: DocumentEmbeddingServices,
): Promise<ReindexPlan> {
  const document = await services.metadata.findById(tenant, documentId);
  const base = {
    documentId,
    dryRun,
    model: services.configuration.embedding.model,
    version: services.configuration.embedding.version,
    dimensions: services.configuration.embedding.dimensions,
  };
  if (!document) {
    return {
      ...base,
      outcome: 'NOT_FOUND',
      totalChunks: 0,
      changedChunks: 0,
      staleVectors: 0,
    };
  }
  if (document.status !== 'COMPLETED') {
    return {
      ...base,
      outcome: 'NOT_ELIGIBLE',
      totalChunks: 0,
      changedChunks: 0,
      staleVectors: 0,
    };
  }
  const chunks = await services.processing.readChunks(tenant, documentId);
  const existing = await services.vectors.listByDocument(tenant, documentId, {
    embeddingModel: base.model,
    embeddingVersion: base.version,
  });
  const currentByChunk = new Map(existing.map((record) => [record.chunkId, record]));
  const activeIds = new Set(chunks.map((chunk) => chunk.id));
  const changedChunks = chunks.filter(
    (chunk) => currentByChunk.get(chunk.id)?.contentHash !== hashChunkContent(chunk.text),
  ).length;
  const staleVectors = existing.filter((record) => !activeIds.has(record.chunkId)).length;
  const metadataCurrent =
    document.embeddingStatus === 'COMPLETED' &&
    document.embeddingModel === base.model &&
    document.embeddingVersion === base.version &&
    document.embeddingDimensions === base.dimensions &&
    document.embeddingContentHash === hashDocumentChunks(chunks);
  if (metadataCurrent && changedChunks === 0 && staleVectors === 0) {
    return {
      ...base,
      outcome: 'UP_TO_DATE',
      totalChunks: chunks.length,
      changedChunks,
      staleVectors,
    };
  }
  if (dryRun) {
    return {
      ...base,
      outcome: 'WOULD_REINDEX',
      totalChunks: chunks.length,
      changedChunks,
      staleVectors,
    };
  }
  const queued = await enqueueDocumentEmbedding(tenant, documentId, services);
  return {
    ...base,
    outcome: queued.outcome === 'ALREADY_QUEUED' ? 'ALREADY_QUEUED' : 'QUEUED',
    totalChunks: chunks.length,
    changedChunks,
    staleVectors,
  };
}

export class DefaultDocumentEmbeddingWorker implements DocumentEmbeddingWorker {
  private readonly events: AiOperationalEventSink;
  private readonly now: () => Date;

  constructor(private readonly services: DocumentEmbeddingServices) {
    this.events = services.events ?? new NoopAiOperationalEventSink();
    this.now = services.now ?? (() => new Date());
  }

  async runOnce(
    tenant: DocumentTenantContext,
    workerId: string,
  ): Promise<EmbeddingWorkerRunResult> {
    const job = await this.services.queue.claim(tenant, workerId, {
      now: this.now(),
      leaseDurationMs: this.services.configuration.embeddingQueue.leaseMs,
    });
    if (!job) return { outcome: 'IDLE' };
    const document = await this.services.metadata.findById(tenant, job.documentId);
    if (!document || document.status !== 'COMPLETED') {
      await this.services.vectors.deleteDocument(tenant, job.documentId);
      await this.services.queue.acknowledge(tenant, job.id, workerId);
      return {
        outcome: 'SKIPPED',
        documentId: job.documentId,
        jobId: job.id,
      };
    }
    await this.services.metadata.update(tenant, document.id, {
      embeddingStatus: 'PROCESSING',
      embeddingAttempts: job.attempts,
      lastEmbeddingErrorCode: null,
    });
    try {
      const result = await this.embedDocument(tenant, document.id, job.id);
      await this.services.metadata.update(tenant, document.id, {
        embeddingStatus: 'COMPLETED',
        embeddingModel: this.services.configuration.embedding.model,
        embeddingVersion: this.services.configuration.embedding.version,
        embeddingDimensions: this.services.configuration.embedding.dimensions,
        embeddingContentHash: result.contentHash,
        embeddedAt: this.now().toISOString(),
        embeddingAttempts: job.attempts,
        lastEmbeddingErrorCode: null,
      });
      await this.services.vectors.deleteOtherVersions(
        tenant,
        document.id,
        this.services.configuration.embedding.model,
        this.services.configuration.embedding.version,
      );
      await this.services.queue.acknowledge(tenant, job.id, workerId);
      this.events.record({
        name: 'embedding_job_completed',
        occurredAt: this.now().toISOString(),
        companyId: tenant.companyId,
        correlationId: job.id,
        outcome: 'success',
        count: result.embeddedChunks,
      });
      return {
        outcome: result.embeddedChunks === 0 ? 'UP_TO_DATE' : 'COMPLETED',
        documentId: document.id,
        jobId: job.id,
        embeddedChunks: result.embeddedChunks,
      };
    } catch (error) {
      const normalized = normalizeEmbeddingError(error);
      const retry =
        normalized.transient && job.attempts < this.services.configuration.embedding.maxAttempts;
      if (retry) {
        const delay = Math.min(
          this.services.configuration.embedding.initialRetryMs * 2 ** Math.max(0, job.attempts - 1),
          this.services.configuration.embedding.maximumRetryMs,
        );
        const availableAt = new Date(this.now().getTime() + delay).toISOString();
        await this.services.metadata.update(tenant, document.id, {
          embeddingStatus: 'QUEUED',
          embeddingAttempts: job.attempts,
          lastEmbeddingErrorCode: normalized.code,
        });
        await this.services.queue.release(tenant, job.id, workerId, availableAt);
        return {
          outcome: 'RETRY_SCHEDULED',
          documentId: document.id,
          jobId: job.id,
          errorCode: normalized.code,
        };
      }
      const quarantined =
        normalized.transient && job.attempts >= this.services.configuration.embedding.maxAttempts;
      await this.services.metadata.update(tenant, document.id, {
        embeddingStatus: quarantined ? 'QUARANTINED' : 'FAILED',
        embeddingAttempts: job.attempts,
        lastEmbeddingErrorCode: normalized.code,
      });
      await this.services.queue.acknowledge(tenant, job.id, workerId);
      this.events.record({
        name: 'embedding_job_failed',
        occurredAt: this.now().toISOString(),
        companyId: tenant.companyId,
        correlationId: job.id,
        outcome: 'failure',
        errorCode: normalized.code,
      });
      return {
        outcome: quarantined ? 'QUARANTINED' : 'FAILED',
        documentId: document.id,
        jobId: job.id,
        errorCode: normalized.code,
      };
    }
  }

  private async embedDocument(
    tenant: DocumentTenantContext,
    documentId: string,
    correlationId: string,
  ) {
    const chunks = await this.services.processing.readChunks(tenant, documentId);
    const model = this.services.configuration.embedding.model;
    const version = this.services.configuration.embedding.version;
    const dimensions = this.services.configuration.embedding.dimensions;
    const existing = await this.services.vectors.listByDocument(tenant, documentId, {
      embeddingModel: model,
      embeddingVersion: version,
    });
    const existingByChunk = new Map(existing.map((record) => [record.chunkId, record]));
    const changed = chunks.filter(
      (chunk) => existingByChunk.get(chunk.id)?.contentHash !== hashChunkContent(chunk.text),
    );
    const batchSize = this.services.configuration.embedding.batchSize;
    let embeddedChunks = 0;
    for (let index = 0; index < changed.length; index += batchSize) {
      const batch = changed.slice(index, index + batchSize);
      const result = await this.services.gateway.createDocumentEmbeddings({
        tenant,
        texts: batch.map((chunk) => chunk.text),
        purpose: 'document',
        correlationId,
      });
      await this.services.vectors.upsert(
        tenant,
        batch.map((chunk, batchIndex) => ({
          documentId,
          chunkId: chunk.id,
          chunkIndex: chunk.index,
          contentHash: hashChunkContent(chunk.text),
          contentPreview: compactPreview(chunk.text),
          pageStart: null,
          pageEnd: null,
          embeddingModel: model,
          embeddingVersion: version,
          dimensions,
          vector: result.vectors[batchIndex],
        })),
      );
      embeddedChunks += batch.length;
      this.events.record({
        name: 'chunks_embedded',
        occurredAt: this.now().toISOString(),
        companyId: tenant.companyId,
        correlationId,
        outcome: 'success',
        count: batch.length,
        inputTokens: result.usage.inputTokens,
        estimatedCostEur: result.usage.estimatedCostEur,
      });
    }
    await this.services.vectors.deleteStale(
      tenant,
      documentId,
      new Set(chunks.map((chunk) => chunk.id)),
      model,
      version,
    );
    return {
      embeddedChunks,
      contentHash: hashDocumentChunks(chunks),
    };
  }
}

function normalizeEmbeddingError(error: unknown) {
  if (error instanceof AiGatewayError) {
    return {
      code: error.code,
      transient: error.transient,
    };
  }
  if (error instanceof Error && /dimension|contentHash|chunkIndex|invalid/i.test(error.message)) {
    return {
      code: 'EMBEDDING_INVALID_DATA',
      transient: false,
    };
  }
  return {
    code: 'EMBEDDING_STORAGE_UNAVAILABLE',
    transient: true,
  };
}
