import { loadDocumentConfiguration, type DocumentConfiguration } from './document-configuration';
import type { DocumentTenantContext } from './document-model';
import {
  LocalDocumentProcessingQueue,
  type ExternalDocumentProcessingQueue,
  type DocumentProcessingQueue,
} from './document-processing-queue';
import {
  DefaultDocumentProcessingWorker,
  type DocumentExtractor,
} from './document-processing-worker';
import {
  LocalDocumentHistoryRepository,
  LocalDocumentMetadataRepository,
  LocalDocumentProcessingRepository,
  PostgreSQLDocumentMetadataRepository,
  type DocumentHistoryRepository,
  type DocumentMetadataDatabaseLoader,
  type DocumentMetadataRepository,
  type DocumentProcessingRepository,
} from './document-repositories';
import {
  LocalDocumentStorage,
  S3DocumentStorage,
  type DocumentStorage,
  type S3DocumentStorageClient,
} from './document-storage';

export type DocumentPersistenceServices = {
  storage: DocumentStorage;
  metadata: DocumentMetadataRepository;
  processing: DocumentProcessingRepository;
  history: DocumentHistoryRepository;
};

export type DocumentServices = DocumentPersistenceServices & {
  queue: DocumentProcessingQueue;
  retryPolicy: DocumentConfiguration['retryPolicy'];
  queueLeaseDurationMs: number;
  workerPollIntervalMs: number;
};

export type DocumentServiceDependencies = {
  loadDatabase?: DocumentMetadataDatabaseLoader;
  s3Client?: S3DocumentStorageClient;
  processingQueue?: DocumentProcessingQueue;
};

let configuredServices: DocumentServices | undefined;

export function createDocumentPersistenceServices(
  configuration: DocumentConfiguration,
  dependencies: DocumentServiceDependencies = {},
): DocumentPersistenceServices {
  let storage: DocumentStorage;
  if (configuration.storageDriver === 's3') {
    if (!configuration.s3) {
      throw new Error('S3 document storage configuration is required.');
    }
    storage = new S3DocumentStorage(configuration.s3, dependencies.s3Client);
  } else {
    storage = new LocalDocumentStorage(configuration.dataDirectory);
  }
  const metadata =
    configuration.metadataDriver === 'postgresql'
      ? new PostgreSQLDocumentMetadataRepository(dependencies.loadDatabase)
      : new LocalDocumentMetadataRepository(configuration.dataDirectory);
  return {
    storage,
    metadata,
    processing: new LocalDocumentProcessingRepository(storage),
    history: new LocalDocumentHistoryRepository(storage),
  };
}

export function createDocumentServices(
  configuration: DocumentConfiguration,
  dependencies: DocumentServiceDependencies = {},
): DocumentServices {
  const persistence = createDocumentPersistenceServices(configuration, dependencies);
  let queue: DocumentProcessingQueue;
  if (configuration.queueDriver === 'external') {
    if (!dependencies.processingQueue || dependencies.processingQueue.kind !== 'external') {
      throw new Error(
        'An external DocumentProcessingQueue adapter is required for this configuration.',
      );
    }
    const externalQueue = dependencies.processingQueue as ExternalDocumentProcessingQueue;
    if (externalQueue.queueName !== configuration.queueName) {
      throw new Error('External processing queue name does not match the configuration.');
    }
    queue = externalQueue;
  } else {
    if (dependencies.processingQueue?.kind === 'external') {
      throw new Error('External processing queue does not match the local queue configuration.');
    }
    queue =
      dependencies.processingQueue ?? new LocalDocumentProcessingQueue(configuration.dataDirectory);
  }

  return {
    ...persistence,
    queue,
    retryPolicy: configuration.retryPolicy,
    queueLeaseDurationMs: configuration.queueLeaseDurationMs,
    workerPollIntervalMs: configuration.workerPollIntervalMs,
  };
}

export function getDocumentServices() {
  configuredServices ??= createDocumentServices(loadDocumentConfiguration());
  return configuredServices;
}

export function createDocumentProcessingWorker(
  documentServices: DocumentServices = getDocumentServices(),
  dependencies: {
    extractor?: DocumentExtractor;
    now?: () => Date;
  } = {},
) {
  return new DefaultDocumentProcessingWorker({
    storage: documentServices.storage,
    metadata: documentServices.metadata,
    processing: documentServices.processing,
    queue: documentServices.queue,
    retryPolicy: documentServices.retryPolicy,
    leaseDurationMs: documentServices.queueLeaseDurationMs,
    ...dependencies,
  });
}

export async function deleteDocument(
  tenant: DocumentTenantContext,
  documentId: string,
  documentServices: DocumentServices = getDocumentServices(),
) {
  const document = await documentServices.metadata.delete(tenant, documentId);
  if (document) {
    await documentServices.queue.removeForDocument(tenant, documentId);
  }
  return document;
}

export async function enqueueUploadedDocument(
  tenant: DocumentTenantContext,
  documentId: string,
  documentServices: DocumentServices = getDocumentServices(),
) {
  const document = await documentServices.metadata.findById(tenant, documentId);
  if (!document) return null;
  if (document.status === 'QUEUED') {
    return {
      document,
      ...(await documentServices.queue.enqueue(tenant, document.id)),
    };
  }
  if (document.status !== 'UPLOADED') {
    throw new Error('Only an uploaded document can be enqueued.');
  }

  let enqueueResult;
  try {
    enqueueResult = await documentServices.queue.enqueue(tenant, document.id);
    const queued = await documentServices.metadata.transitionStatus(
      tenant,
      document.id,
      ['UPLOADED'],
      'QUEUED',
      {
        nextRetryAt: null,
        workerId: null,
      },
    );
    if (!queued) {
      if (enqueueResult.enqueued) {
        await documentServices.queue.removeForDocument(tenant, document.id);
      }
      throw new Error('Document metadata could not be moved to the queue.');
    }
    return {
      document: queued,
      ...enqueueResult,
    };
  } catch (error) {
    if (enqueueResult?.enqueued) {
      await documentServices.queue.removeForDocument(tenant, document.id);
    }
    await documentServices.metadata.transitionStatus(tenant, document.id, ['UPLOADED'], 'FAILED', {
      lastErrorCode: 'QUEUE_ENQUEUE_FAILED',
      lastErrorMessage: 'Не удалось поставить документ в очередь обработки.',
      processingCompletedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export type DocumentCleanupResult = {
  cleaned: string[];
  failed: string[];
};

export async function cleanupDeletedDocuments(
  tenant: DocumentTenantContext,
  documentServices: DocumentServices = getDocumentServices(),
): Promise<DocumentCleanupResult> {
  const result: DocumentCleanupResult = {
    cleaned: [],
    failed: [],
  };
  const documents = await documentServices.metadata.listDeleted(tenant);

  for (const document of documents) {
    try {
      await documentServices.storage.delete(tenant, 'original', document.storedName);
      await documentServices.processing.delete(tenant, document.id);
      const deleted = await documentServices.metadata.hardDelete(tenant, document.id);
      if (!deleted) throw new Error('Deleted document metadata was not found.');
      result.cleaned.push(document.id);
    } catch {
      result.failed.push(document.id);
    }
  }

  return result;
}
