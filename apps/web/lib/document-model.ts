import type { AppSession } from './session';

export const AVANTIME_DOCUMENT_COMPANY_ID = 'avantime';
export const UNVERIFIED_DOCUMENT_CHECKSUM = '0'.repeat(64);

export type DocumentTenantContext = {
  companyId: string;
  userId: string;
};

export type DocumentStatus = 'Обрабатывается' | 'Обработан' | 'Ошибка';

export type TextChunk = {
  id: string;
  index: number;
  text: string;
  start: number;
  end: number;
};

export type DocumentMetadata = {
  id: string;
  companyId: string;
  uploadedBy: string;
  status: DocumentStatus;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  pages?: number;
  textLength?: number;
  processedAt?: string;
  errorMessage?: string;
  chunksCount?: number;
};

export type DocumentApiItem = {
  id: string;
  name: string;
  originalName: string;
  storedName: string;
  type: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
  companyId: string;
  uploadedBy: string;
  textFile?: string;
  pages?: number;
  textLength?: number;
  processedAt?: string;
  errorMessage?: string;
  chunksFile?: string;
  chunksCount?: number;
};

export function getDocumentTenantContext(session: AppSession): DocumentTenantContext {
  const companyId = session.companyId?.trim() || AVANTIME_DOCUMENT_COMPANY_ID;

  return {
    companyId,
    userId: session.userId,
  };
}

export function toDocumentApiItem(document: DocumentMetadata): DocumentApiItem {
  const processed = document.status === 'Обработан';

  return {
    id: document.id,
    name: document.originalName,
    originalName: document.originalName,
    storedName: document.storedName,
    type: document.mimeType === 'application/pdf' ? 'PDF' : document.mimeType,
    mimeType: document.mimeType,
    size: document.size,
    status: document.status,
    uploadedAt: document.createdAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    companyId: document.companyId,
    uploadedBy: document.uploadedBy,
    textFile: processed ? `${document.id}.txt` : undefined,
    pages: document.pages,
    textLength: document.textLength,
    processedAt: document.processedAt,
    errorMessage: document.errorMessage,
    chunksFile: processed ? `${document.id}.json` : undefined,
    chunksCount: document.chunksCount,
  };
}
