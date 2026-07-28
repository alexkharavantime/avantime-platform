import type { DocumentTenantContext } from './document-model';
import {
  classifyDocumentProcessingError,
  DocumentProcessingError,
} from './document-processing-errors';
import type { DocumentProcessingJob, DocumentProcessingQueue } from './document-processing-queue';
import type {
  DocumentMetadataRepository,
  DocumentProcessingRepository,
} from './document-repositories';
import { decideDocumentRetry, type DocumentRetryPolicy } from './document-retry-policy';
import type { DocumentStorage } from './document-storage';
import { extractPdfText } from './pdf-extractor';
import type { DocumentIntelligenceService } from './document-intelligence';

export type DocumentExtractor = typeof extractPdfText;

export type DocumentWorkerRunResult =
  | {
      outcome: 'IDLE';
    }
  | {
      outcome: 'COMPLETED' | 'RETRY_SCHEDULED' | 'FAILED' | 'QUARANTINED' | 'SKIPPED';
      documentId: string;
      jobId: string;
      errorCode?: string;
    };

export interface DocumentProcessingWorker {
  runOnce(tenant: DocumentTenantContext, workerId: string): Promise<DocumentWorkerRunResult>;
}

export type DocumentProcessingWorkerDependencies = {
  storage: DocumentStorage;
  metadata: DocumentMetadataRepository;
  processing: DocumentProcessingRepository;
  queue: DocumentProcessingQueue;
  retryPolicy: DocumentRetryPolicy;
  extractor?: DocumentExtractor;
  intelligence?: DocumentIntelligenceService;
  now?: () => Date;
  leaseDurationMs?: number;
  afterCompleted?: (tenant: DocumentTenantContext, documentId: string) => Promise<void>;
};

export class DefaultDocumentProcessingWorker implements DocumentProcessingWorker {
  private readonly extractor: DocumentExtractor;
  private readonly now: () => Date;

  constructor(private readonly dependencies: DocumentProcessingWorkerDependencies) {
    this.extractor = dependencies.extractor ?? extractPdfText;
    this.now = dependencies.now ?? (() => new Date());
  }

  async runOnce(tenant: DocumentTenantContext, workerId: string): Promise<DocumentWorkerRunResult> {
    const job = await this.dependencies.queue.claim(tenant, workerId, {
      now: this.now(),
      leaseDurationMs: this.dependencies.leaseDurationMs,
    });
    if (!job) return { outcome: 'IDLE' };

    return this.processClaimedJob(tenant, workerId, job);
  }

  private async processClaimedJob(
    tenant: DocumentTenantContext,
    workerId: string,
    job: DocumentProcessingJob,
  ): Promise<DocumentWorkerRunResult> {
    let document = await this.dependencies.metadata.findById(tenant, job.documentId);
    if (!document) {
      await this.dependencies.queue.acknowledge(tenant, job.id, workerId);
      return {
        outcome: 'SKIPPED',
        documentId: job.documentId,
        jobId: job.id,
      };
    }

    if (
      document.status === 'COMPLETED' ||
      document.status === 'FAILED' ||
      document.status === 'QUARANTINED'
    ) {
      await this.dependencies.queue.acknowledge(tenant, job.id, workerId);
      return {
        outcome: 'SKIPPED',
        documentId: document.id,
        jobId: job.id,
      };
    }

    if (document.status === 'UPLOADED') {
      document = await this.dependencies.metadata.transitionStatus(
        tenant,
        document.id,
        ['UPLOADED'],
        'QUEUED',
      );
      if (!document) {
        await this.dependencies.queue.acknowledge(tenant, job.id, workerId);
        return {
          outcome: 'SKIPPED',
          documentId: job.documentId,
          jobId: job.id,
        };
      }
    }

    const processingStartedAt = this.now().toISOString();
    const claimed = await this.dependencies.metadata.transitionStatus(
      tenant,
      document.id,
      ['QUEUED', 'PROCESSING'],
      'PROCESSING',
      {
        processingAttempts: document.processingAttempts + 1,
        processingStartedAt,
        processingCompletedAt: null,
        nextRetryAt: null,
        quarantinedAt: null,
        workerId,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    );
    if (!claimed) {
      await this.dependencies.queue.acknowledge(tenant, job.id, workerId);
      return {
        outcome: 'SKIPPED',
        documentId: document.id,
        jobId: job.id,
      };
    }

    let completedSuccessfully = false;
    try {
      const original = await this.dependencies.storage.read(
        tenant,
        'original',
        claimed.storedName,
        {
          expectedChecksum: claimed.checksum,
        },
      );
      if (!original) {
        throw new DocumentProcessingError(
          'ORIGINAL_NOT_FOUND',
          false,
          'Исходный файл документа не найден.',
        );
      }

      const extracted = this.dependencies.intelligence
        ? await this.dependencies.intelligence.process(claimed, original)
        : await this.extractor(original);
      await this.dependencies.processing.save(tenant, claimed.id, {
        text: extracted.text,
        chunks: extracted.chunks,
      });

      const completed = await this.dependencies.metadata.transitionStatus(
        tenant,
        claimed.id,
        ['PROCESSING'],
        'COMPLETED',
        {
          pages: 'pages' in extracted ? extracted.pages : extracted.intelligence.pageCount,
          textLength: extracted.text.length,
          chunksCount: extracted.chunksCount,
          ...('intelligence' in extracted ? extracted.intelligence : {}),
          processingCompletedAt: this.now().toISOString(),
          nextRetryAt: null,
          quarantinedAt: null,
          workerId: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      );
      if (!completed) {
        await this.dependencies.processing.delete(tenant, claimed.id);
        throw new DocumentProcessingError(
          'PROCESSING_STATE_CONFLICT',
          true,
          'Состояние документа изменилось во время обработки.',
        );
      }

      completedSuccessfully = true;
      try {
        await this.dependencies.afterCompleted?.(tenant, completed.id);
      } catch {
        // Indexing has its own lifecycle and must not roll back completed extraction.
      }
      await this.dependencies.queue.acknowledge(tenant, job.id, workerId);
      return {
        outcome: 'COMPLETED',
        documentId: claimed.id,
        jobId: job.id,
      };
    } catch (error) {
      if (completedSuccessfully) {
        throw error;
      }

      try {
        await this.dependencies.processing.delete(tenant, claimed.id);
      } catch {
        // A partial derivative must never change the document to COMPLETED.
      }

      const classified = classifyDocumentProcessingError(error);
      const decision = decideDocumentRetry(
        claimed.processingAttempts,
        classified,
        this.dependencies.retryPolicy,
        this.now(),
      );
      const commonChanges = {
        lastErrorCode: classified.code,
        lastErrorMessage: classified.safeMessage,
        processingCompletedAt: this.now().toISOString(),
        workerId: null,
        ...(classified.code.startsWith('OCR_')
          ? {
              ocrStatus:
                classified.code === 'OCR_RUNTIME_UNAVAILABLE'
                  ? ('UNAVAILABLE' as const)
                  : ('FAILED' as const),
              ocrCompletedAt: this.now().toISOString(),
            }
          : {}),
      };

      if (decision.action === 'RETRY') {
        const queued = await this.dependencies.metadata.transitionStatus(
          tenant,
          claimed.id,
          ['PROCESSING'],
          'QUEUED',
          {
            ...commonChanges,
            nextRetryAt: decision.nextRetryAt,
            quarantinedAt: null,
          },
        );
        if (!queued) throw new Error('Unable to schedule document processing retry.');
        await this.dependencies.queue.release(tenant, job.id, workerId, decision.nextRetryAt);
        return {
          outcome: 'RETRY_SCHEDULED',
          documentId: claimed.id,
          jobId: job.id,
          errorCode: classified.code,
        };
      }

      const status = decision.action === 'QUARANTINE' ? 'QUARANTINED' : 'FAILED';
      const updated = await this.dependencies.metadata.transitionStatus(
        tenant,
        claimed.id,
        ['PROCESSING'],
        status,
        {
          ...commonChanges,
          nextRetryAt: null,
          quarantinedAt: status === 'QUARANTINED' ? this.now().toISOString() : null,
        },
      );
      if (!updated) throw new Error('Unable to persist document processing failure.');
      await this.dependencies.queue.acknowledge(tenant, job.id, workerId);
      return {
        outcome: status === 'QUARANTINED' ? 'QUARANTINED' : 'FAILED',
        documentId: claimed.id,
        jobId: job.id,
        errorCode: classified.code,
      };
    }
  }
}
