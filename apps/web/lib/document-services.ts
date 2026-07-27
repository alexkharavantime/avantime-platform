import path from 'node:path';

import type { DocumentTenantContext } from './document-model';
import {
  LocalDocumentHistoryRepository,
  LocalDocumentMetadataRepository,
  LocalDocumentProcessingRepository,
  type DocumentHistoryRepository,
  type DocumentMetadataRepository,
  type DocumentProcessingRepository,
} from './document-repositories';
import {
  LocalDocumentStorage,
  type DocumentStorage,
} from './document-storage';

export type DocumentServices = {
  storage: DocumentStorage;
  metadata: DocumentMetadataRepository;
  processing: DocumentProcessingRepository;
  history: DocumentHistoryRepository;
};

const dataDirectory = path.join(process.cwd(), '.data');
const storage = new LocalDocumentStorage(dataDirectory);

const services: DocumentServices = {
  storage,
  metadata: new LocalDocumentMetadataRepository(dataDirectory),
  processing: new LocalDocumentProcessingRepository(storage),
  history: new LocalDocumentHistoryRepository(storage),
};

export function getDocumentServices() {
  return services;
}

export async function deleteDocument(
  tenant: DocumentTenantContext,
  documentId: string,
  documentServices: DocumentServices = services,
) {
  const document = await documentServices.metadata.findById(tenant, documentId);
  if (!document) return null;

  await documentServices.storage.delete(
    tenant,
    'original',
    document.storedName,
  );
  await documentServices.processing.delete(tenant, document.id);
  await documentServices.metadata.delete(tenant, document.id);

  return document;
}
