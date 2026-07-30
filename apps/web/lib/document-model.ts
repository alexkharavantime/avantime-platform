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
  pageStart?: number | null;
  pageEnd?: number | null;
  sourceSegmentIndex?: number | null;
  extractionMethod?: 'PDF_TEXT' | 'OCR' | 'UNKNOWN';
  sourceCoordinates?: { x: number; y: number; width: number; height: number } | null;
  provenanceConfidence?: number | null;
  provenanceVersion?: 'page-provenance-v1';
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
  workerVersion?: string | null;
  deploymentGeneration?: string | null;
  processingFencingToken?: number;
  workerHeartbeatAt?: string | null;
  processingLeaseUntil?: string | null;
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
  embeddingWorkerId?: string | null;
  embeddingWorkerVersion?: string | null;
  embeddingDeploymentGeneration?: string | null;
  embeddingFencingToken?: number;
  embeddingHeartbeatAt?: string | null;
  embeddingLeaseUntil?: string | null;
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

export type ClientDocumentApiItem = Pick<
  DocumentApiItem,
  | 'id'
  | 'name'
  | 'type'
  | 'mimeType'
  | 'size'
  | 'status'
  | 'processingStatus'
  | 'uploadedAt'
  | 'createdAt'
  | 'updatedAt'
  | 'pages'
  | 'processedAt'
  | 'chunksCount'
  | 'detectedDocumentType'
  | 'textExtractionMethod'
  | 'ocrStatus'
  | 'pageCount'
  | 'requiresManualReview'
  | 'embeddingStatus'
>;

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

export function toClientDocumentApiItem(document: DocumentMetadata): ClientDocumentApiItem {
  const item = toDocumentApiItem(document);
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    mimeType: item.mimeType,
    size: item.size,
    status: item.status,
    processingStatus: item.processingStatus,
    uploadedAt: item.uploadedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    pages: item.pages,
    processedAt: item.processedAt,
    chunksCount: item.chunksCount,
    detectedDocumentType: item.detectedDocumentType,
    textExtractionMethod: item.textExtractionMethod,
    ocrStatus: item.ocrStatus,
    pageCount: item.pageCount,
    requiresManualReview: item.requiresManualReview,
    embeddingStatus: item.embeddingStatus,
  };
}
