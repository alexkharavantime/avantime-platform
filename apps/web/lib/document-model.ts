import type { AppSession } from './session';
import type { DocumentProcessingStatus } from './document-processing-state';
import type {
  DocumentIntelligenceMetadata,
  DocumentOcrStatus,
  DocumentTextExtractionMethod,
  DocumentType,
} from './document-intelligence-model';
import type { DocumentEmbeddingStatus } from './document-embedding-model';

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

export type DocumentMetadata = DocumentIntelligenceMetadata & {
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
  embeddingStatus: DocumentEmbeddingStatus;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  embeddingVersion: string | null;
  embeddedAt: string | null;
  embeddingAttempts: number;
  lastEmbeddingErrorCode: string | null;
  embeddingContentHash: string | null;
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
  detectedDocumentType: DocumentType;
  detectedMimeType?: string;
  detectionConfidence?: number;
  textExtractionMethod: DocumentTextExtractionMethod;
  ocrStatus: DocumentOcrStatus;
  ocrLanguage?: string;
  ocrStartedAt?: string;
  ocrCompletedAt?: string;
  pageCount?: number;
  extractedCharacterCount?: number;
  requiresManualReview: boolean;
  intelligenceVersion: string;
  embeddingStatus: DocumentEmbeddingStatus;
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingVersion?: string;
  embeddedAt?: string;
  embeddingAttempts: number;
  lastEmbeddingErrorCode?: string;
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
    detectedDocumentType: document.detectedDocumentType,
    detectedMimeType: document.detectedMimeType ?? undefined,
    detectionConfidence: document.detectionConfidence ?? undefined,
    textExtractionMethod: document.textExtractionMethod,
    ocrStatus: document.ocrStatus,
    ocrLanguage: document.ocrLanguage ?? undefined,
    ocrStartedAt: document.ocrStartedAt ?? undefined,
    ocrCompletedAt: document.ocrCompletedAt ?? undefined,
    pageCount: document.pageCount ?? undefined,
    extractedCharacterCount: document.extractedCharacterCount ?? undefined,
    requiresManualReview: document.requiresManualReview,
    intelligenceVersion: document.intelligenceVersion,
    embeddingStatus: document.embeddingStatus,
    embeddingModel: document.embeddingModel ?? undefined,
    embeddingDimensions: document.embeddingDimensions ?? undefined,
    embeddingVersion: document.embeddingVersion ?? undefined,
    embeddedAt: document.embeddedAt ?? undefined,
    embeddingAttempts: document.embeddingAttempts,
    lastEmbeddingErrorCode: document.lastEmbeddingErrorCode ?? undefined,
  };
}
