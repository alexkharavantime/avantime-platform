import { loadDocumentConfiguration, type DocumentConfiguration } from './document-configuration';
import type { DocumentTenantContext } from './document-model';
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

export type DocumentServices = {
  storage: DocumentStorage;
  metadata: DocumentMetadataRepository;
  processing: DocumentProcessingRepository;
  history: DocumentHistoryRepository;
};

export type DocumentServiceDependencies = {
  loadDatabase?: DocumentMetadataDatabaseLoader;
  s3Client?: S3DocumentStorageClient;
};

let configuredServices: DocumentServices | undefined;

export function createDocumentServices(
  configuration: DocumentConfiguration,
  dependencies: DocumentServiceDependencies = {},
): DocumentServices {
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

export function getDocumentServices() {
  configuredServices ??= createDocumentServices(loadDocumentConfiguration());
  return configuredServices;
}

export async function deleteDocument(
  tenant: DocumentTenantContext,
  documentId: string,
  documentServices: DocumentServices = getDocumentServices(),
) {
  return documentServices.metadata.delete(tenant, documentId);
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
