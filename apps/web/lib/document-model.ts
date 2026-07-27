import type { AppSession } from './session';
import type { DocumentProcessingStatus } from './document-processing-state';

export const AVANTIME_DOCUMENT_COMPANY_ID = 'avantime';
export const UNVERIFIED_DOCUMENT_CHECKSUM = '0'.repeat(64);

export type DocumentTenantContext = {
  companyId: string;
  userId: string;
};

export type DocumentApiStatus =
  'Загружен' | 'В очереди' | 'Обрабатывается' | 'Обработан' | 'Ошибка' | 'Карантин' | 'Удалён';

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
  status: DocumentProcessingStatus;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  checksum: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  processingAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  nextRetryAt: string | null;
  quarantinedAt: string | null;
  workerId: string | null;
  pages: number | null;
  textLength: number | null;
  chunksCount: number | null;
};

export type DocumentApiItem = {
  id: string;
  name: string;
  originalName: string;
  storedName: string;
  type: string;
  mimeType: string;
  size: number;
  status: DocumentApiStatus;
  processingStatus: DocumentProcessingStatus;
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
  processingAttempts: number;
  lastErrorCode?: string;
  processingStartedAt?: string;
  nextRetryAt?: string;
  quarantinedAt?: string;
  workerId?: string;
};

const API_STATUS_LABELS: Record<DocumentProcessingStatus, DocumentApiStatus> = {
  UPLOADED: 'Загружен',
  QUEUED: 'В очереди',
  PROCESSING: 'Обрабатывается',
  COMPLETED: 'Обработан',
  FAILED: 'Ошибка',
  QUARANTINED: 'Карантин',
  DELETED: 'Удалён',
};

export function getDocumentTenantContext(session: AppSession): DocumentTenantContext {
  const companyId = session.companyId?.trim() || AVANTIME_DOCUMENT_COMPANY_ID;

  return {
    companyId,
    userId: session.userId,
  };
}

export function toDocumentApiItem(document: DocumentMetadata): DocumentApiItem {
  const processed = document.status === 'COMPLETED';

  return {
    id: document.id,
    name: document.originalName,
    originalName: document.originalName,
    storedName: document.storedName,
    type: document.mimeType === 'application/pdf' ? 'PDF' : document.mimeType,
    mimeType: document.mimeType,
    size: document.size,
    status: API_STATUS_LABELS[document.status],
    processingStatus: document.status,
    uploadedAt: document.createdAt,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    companyId: document.companyId,
    uploadedBy: document.uploadedBy,
    textFile: processed ? `${document.id}.txt` : undefined,
    pages: document.pages ?? undefined,
    textLength: document.textLength ?? undefined,
    processedAt: document.processingCompletedAt ?? undefined,
    errorMessage: document.lastErrorMessage ?? undefined,
    chunksFile: processed ? `${document.id}.json` : undefined,
    chunksCount: document.chunksCount ?? undefined,
    processingAttempts: document.processingAttempts,
    lastErrorCode: document.lastErrorCode ?? undefined,
    processingStartedAt: document.processingStartedAt ?? undefined,
    nextRetryAt: document.nextRetryAt ?? undefined,
    quarantinedAt: document.quarantinedAt ?? undefined,
    workerId: document.workerId ?? undefined,
  };
}
