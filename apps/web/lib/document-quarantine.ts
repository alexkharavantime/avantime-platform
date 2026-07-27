import type { DocumentMetadata, DocumentTenantContext } from './document-model';
import type { DocumentServices } from './document-services';

export async function listQuarantinedDocuments(
  tenant: DocumentTenantContext,
  services: DocumentServices,
) {
  return (await services.metadata.list(tenant)).filter(
    (document) => document.status === 'QUARANTINED',
  );
}

export type RetryDocumentResult = {
  document: DocumentMetadata;
  enqueued: boolean;
  dryRun: boolean;
};

export async function retryDocumentProcessing(
  tenant: DocumentTenantContext,
  documentId: string,
  services: DocumentServices,
  options: {
    dryRun?: boolean;
    expectedStatuses?: readonly ('FAILED' | 'QUARANTINED')[];
  } = {},
): Promise<RetryDocumentResult | null> {
  const expectedStatuses = options.expectedStatuses ?? ['FAILED', 'QUARANTINED'];
  const document = await services.metadata.findById(tenant, documentId);
  if (!document || !expectedStatuses.includes(document.status as 'FAILED' | 'QUARANTINED')) {
    return null;
  }
  if (options.dryRun) {
    return {
      document,
      enqueued: false,
      dryRun: true,
    };
  }

  const enqueueResult = await services.queue.enqueue(tenant, document.id);
  try {
    const queued = await services.metadata.transitionStatus(
      tenant,
      document.id,
      expectedStatuses,
      'QUEUED',
      {
        nextRetryAt: null,
        quarantinedAt: null,
        workerId: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        processingCompletedAt: null,
      },
    );
    if (!queued) {
      if (enqueueResult.enqueued) {
        await services.queue.removeForDocument(tenant, document.id);
      }
      return null;
    }

    return {
      document: queued,
      enqueued: enqueueResult.enqueued,
      dryRun: false,
    };
  } catch (error) {
    if (enqueueResult.enqueued) {
      await services.queue.removeForDocument(tenant, document.id);
    }
    throw error;
  }
}

export async function resolveQuarantinedDocument(
  tenant: DocumentTenantContext,
  documentId: string,
  services: DocumentServices,
) {
  const text = await services.processing.readText(tenant, documentId);
  const chunks = await services.processing.readChunks(tenant, documentId);
  if (!text || chunks.length === 0) {
    throw new Error('A quarantined document cannot be resolved without complete derivatives.');
  }

  return services.metadata.transitionStatus(tenant, documentId, ['QUARANTINED'], 'COMPLETED', {
    textLength: text.length,
    chunksCount: chunks.length,
    processingCompletedAt: new Date().toISOString(),
    nextRetryAt: null,
    quarantinedAt: null,
    workerId: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
}

export function permanentlyFailQuarantinedDocument(
  tenant: DocumentTenantContext,
  documentId: string,
  services: DocumentServices,
) {
  return services.metadata.transitionStatus(tenant, documentId, ['QUARANTINED'], 'FAILED', {
    nextRetryAt: null,
    workerId: null,
    lastErrorCode: 'PERMANENTLY_FAILED',
    lastErrorMessage: 'Документ отмечен администратором как необрабатываемый.',
    processingCompletedAt: new Date().toISOString(),
  });
}
