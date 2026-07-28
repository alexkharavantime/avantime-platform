import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getPrisma } from '@avantime/database';

import {
  AVANTIME_DOCUMENT_COMPANY_ID,
  UNVERIFIED_DOCUMENT_CHECKSUM,
  type DocumentMetadata,
  type DocumentTenantContext,
  type TextChunk,
} from './document-model';
import {
  defaultDocumentIntelligenceMetadata,
  isDocumentOcrStatus,
  isDocumentTextExtractionMethod,
  isDocumentType,
} from './document-intelligence-model';
import { isDocumentEmbeddingStatus } from './document-embedding-model';
import {
  assertDocumentProcessingStatus,
  assertDocumentStatusTransition,
  isDocumentProcessingStatus,
  type DocumentProcessingStatus,
} from './document-processing-state';
import {
  assertDocumentChecksum,
  assertDocumentTenantContext,
  assertSafeDocumentSegment,
  type DocumentStorage,
} from './document-storage';

export type CreateDocumentMetadata = Omit<
  DocumentMetadata,
  | 'companyId'
  | 'uploadedBy'
  | 'deletedAt'
  | 'processingAttempts'
  | 'lastErrorCode'
  | 'lastErrorMessage'
  | 'processingStartedAt'
  | 'processingCompletedAt'
  | 'nextRetryAt'
  | 'quarantinedAt'
  | 'workerId'
  | 'pages'
  | 'textLength'
  | 'chunksCount'
  | 'detectedDocumentType'
  | 'detectedMimeType'
  | 'detectionConfidence'
  | 'textExtractionMethod'
  | 'ocrStatus'
  | 'ocrProvider'
  | 'ocrLanguage'
  | 'ocrStartedAt'
  | 'ocrCompletedAt'
  | 'pageCount'
  | 'extractedCharacterCount'
  | 'requiresManualReview'
  | 'intelligenceVersion'
  | 'embeddingStatus'
  | 'embeddingModel'
  | 'embeddingDimensions'
  | 'embeddingVersion'
  | 'embeddedAt'
  | 'embeddingAttempts'
  | 'lastEmbeddingErrorCode'
  | 'embeddingContentHash'
> &
  Partial<
    Pick<
      DocumentMetadata,
      | 'processingAttempts'
      | 'lastErrorCode'
      | 'lastErrorMessage'
      | 'processingStartedAt'
      | 'processingCompletedAt'
      | 'nextRetryAt'
      | 'quarantinedAt'
      | 'workerId'
      | 'pages'
      | 'textLength'
      | 'chunksCount'
      | 'detectedDocumentType'
      | 'detectedMimeType'
      | 'detectionConfidence'
      | 'textExtractionMethod'
      | 'ocrStatus'
      | 'ocrProvider'
      | 'ocrLanguage'
      | 'ocrStartedAt'
      | 'ocrCompletedAt'
      | 'pageCount'
      | 'extractedCharacterCount'
      | 'requiresManualReview'
      | 'intelligenceVersion'
      | 'embeddingStatus'
      | 'embeddingModel'
      | 'embeddingDimensions'
      | 'embeddingVersion'
      | 'embeddedAt'
      | 'embeddingAttempts'
      | 'lastEmbeddingErrorCode'
      | 'embeddingContentHash'
    >
  >;
export type UpdateDocumentMetadata = Partial<
  Omit<
    DocumentMetadata,
    'id' | 'companyId' | 'uploadedBy' | 'status' | 'createdAt' | 'updatedAt' | 'deletedAt'
  >
>;

export interface DocumentMetadataRepository {
  list(tenant: DocumentTenantContext): Promise<DocumentMetadata[]>;
  findById(tenant: DocumentTenantContext, documentId: string): Promise<DocumentMetadata | null>;
  create(
    tenant: DocumentTenantContext,
    metadata: CreateDocumentMetadata,
  ): Promise<DocumentMetadata>;
  update(
    tenant: DocumentTenantContext,
    documentId: string,
    changes: UpdateDocumentMetadata,
  ): Promise<DocumentMetadata | null>;
  transitionStatus(
    tenant: DocumentTenantContext,
    documentId: string,
    expectedStatuses: readonly DocumentProcessingStatus[],
    nextStatus: DocumentProcessingStatus,
    changes?: UpdateDocumentMetadata,
  ): Promise<DocumentMetadata | null>;
  delete(tenant: DocumentTenantContext, documentId: string): Promise<DocumentMetadata | null>;
  listDeleted(tenant: DocumentTenantContext): Promise<DocumentMetadata[]>;
  findDeletedById(
    tenant: DocumentTenantContext,
    documentId: string,
  ): Promise<DocumentMetadata | null>;
  hardDelete(tenant: DocumentTenantContext, documentId: string): Promise<DocumentMetadata | null>;
}

export type DocumentProcessingResult = {
  text: string;
  chunks: TextChunk[];
};

export interface DocumentProcessingRepository {
  save(
    tenant: DocumentTenantContext,
    documentId: string,
    result: DocumentProcessingResult,
  ): Promise<void>;
  readText(tenant: DocumentTenantContext, documentId: string): Promise<string | null>;
  readChunks(tenant: DocumentTenantContext, documentId: string): Promise<TextChunk[]>;
  delete(tenant: DocumentTenantContext, documentId: string): Promise<void>;
}

export type DocumentHistorySource = {
  number: number;
  documentId: string;
  documentName: string;
  chunkId: string;
  score: number;
};

export type DocumentHistoryItem = {
  id: string;
  question: string;
  answer: string;
  sources: DocumentHistorySource[];
  createdAt: string;
};

export interface DocumentHistoryRepository {
  list(tenant: DocumentTenantContext): Promise<DocumentHistoryItem[]>;
  save(tenant: DocumentTenantContext, history: DocumentHistoryItem[]): Promise<void>;
}

type LegacyDocument = {
  id?: unknown;
  companyId?: unknown;
  uploadedBy?: unknown;
  status?: unknown;
  originalName?: unknown;
  name?: unknown;
  storedName?: unknown;
  mimeType?: unknown;
  type?: unknown;
  size?: unknown;
  createdAt?: unknown;
  uploadedAt?: unknown;
  updatedAt?: unknown;
  pages?: unknown;
  textLength?: unknown;
  processedAt?: unknown;
  errorMessage?: unknown;
  chunksCount?: unknown;
  checksum?: unknown;
  deletedAt?: unknown;
  processingAttempts?: unknown;
  lastErrorCode?: unknown;
  lastErrorMessage?: unknown;
  processingStartedAt?: unknown;
  processingCompletedAt?: unknown;
  nextRetryAt?: unknown;
  quarantinedAt?: unknown;
  workerId?: unknown;
  detectedDocumentType?: unknown;
  detectedMimeType?: unknown;
  detectionConfidence?: unknown;
  textExtractionMethod?: unknown;
  ocrStatus?: unknown;
  ocrProvider?: unknown;
  ocrLanguage?: unknown;
  ocrStartedAt?: unknown;
  ocrCompletedAt?: unknown;
  pageCount?: unknown;
  extractedCharacterCount?: unknown;
  requiresManualReview?: unknown;
  intelligenceVersion?: unknown;
  embeddingStatus?: unknown;
  embeddingModel?: unknown;
  embeddingDimensions?: unknown;
  embeddingVersion?: unknown;
  embeddedAt?: unknown;
  embeddingAttempts?: unknown;
  lastEmbeddingErrorCode?: unknown;
  embeddingContentHash?: unknown;
};

function isMissingFile(error: unknown) {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asDocumentChecksum(value: unknown) {
  const checksum = asString(value);
  return checksum && /^[a-f0-9]{64}$/.test(checksum) ? checksum : UNVERIFIED_DOCUMENT_CHECKSUM;
}

function asNullableString(value: unknown) {
  return asString(value) ?? null;
}

function normalizeLegacyStatus(value: unknown): DocumentProcessingStatus {
  if (isDocumentProcessingStatus(value)) return value;
  if (value === 'Обработан' || value === 'PROCESSED') return 'COMPLETED';
  if (value === 'Ошибка') return 'FAILED';
  if (value === 'Обрабатывается') return 'PROCESSING';
  return 'UPLOADED';
}

function parseDocumentDate(value: string, label: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be a valid date.`);
  }

  return date;
}

function validateDocumentMetadata(document: DocumentMetadata) {
  assertSafeDocumentSegment(document.id, 'document id');
  assertSafeDocumentSegment(document.companyId, 'companyId');
  assertSafeDocumentSegment(document.uploadedBy, 'uploadedBy');
  assertSafeDocumentSegment(document.storedName, 'storedName');
  assertDocumentProcessingStatus(document.status);
  assertDocumentChecksum(document.checksum);

  if (!document.originalName.trim() || document.originalName.length > 500) {
    throw new Error('Document originalName is required and must not exceed 500 characters.');
  }
  if (!document.mimeType.trim() || document.mimeType.length > 255) {
    throw new Error('Document mimeType is required and must not exceed 255 characters.');
  }
  if (!Number.isSafeInteger(document.size) || document.size < 0) {
    throw new Error('Document size must be a non-negative safe integer.');
  }

  parseDocumentDate(document.createdAt, 'createdAt');
  parseDocumentDate(document.updatedAt, 'updatedAt');
  if (!Number.isSafeInteger(document.processingAttempts) || document.processingAttempts < 0) {
    throw new Error('processingAttempts must be a non-negative safe integer.');
  }
  if (document.lastErrorCode && !/^[A-Z0-9_]{1,100}$/.test(document.lastErrorCode)) {
    throw new Error('lastErrorCode has an invalid format.');
  }
  if (document.lastErrorMessage && document.lastErrorMessage.length > 500) {
    throw new Error('lastErrorMessage must not exceed 500 characters.');
  }
  if (document.workerId) assertSafeDocumentSegment(document.workerId, 'workerId');
  if (document.processingStartedAt) {
    parseDocumentDate(document.processingStartedAt, 'processingStartedAt');
  }
  if (document.processingCompletedAt) {
    parseDocumentDate(document.processingCompletedAt, 'processingCompletedAt');
  }
  if (document.nextRetryAt) parseDocumentDate(document.nextRetryAt, 'nextRetryAt');
  if (document.quarantinedAt) parseDocumentDate(document.quarantinedAt, 'quarantinedAt');
  if (document.deletedAt) parseDocumentDate(document.deletedAt, 'deletedAt');
  if ((document.status === 'DELETED') !== Boolean(document.deletedAt)) {
    throw new Error('DELETED status and deletedAt must be set together.');
  }
  if (!isDocumentType(document.detectedDocumentType)) throw new Error('Invalid document type.');
  if (!isDocumentTextExtractionMethod(document.textExtractionMethod)) {
    throw new Error('Invalid text extraction method.');
  }
  if (!isDocumentOcrStatus(document.ocrStatus)) throw new Error('Invalid OCR status.');
  if (
    document.detectionConfidence !== null &&
    (!Number.isFinite(document.detectionConfidence) ||
      document.detectionConfidence < 0 ||
      document.detectionConfidence > 1)
  ) {
    throw new Error('detectionConfidence must be between 0 and 1.');
  }
  for (const [label, value] of [
    ['pageCount', document.pageCount],
    ['extractedCharacterCount', document.extractedCharacterCount],
  ] as const) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${label} must be a non-negative safe integer.`);
    }
  }
  if (document.ocrStartedAt) parseDocumentDate(document.ocrStartedAt, 'ocrStartedAt');
  if (document.ocrCompletedAt) parseDocumentDate(document.ocrCompletedAt, 'ocrCompletedAt');
  if (!document.intelligenceVersion.trim() || document.intelligenceVersion.length > 100) {
    throw new Error('intelligenceVersion is required and must not exceed 100 characters.');
  }
  if (!isDocumentEmbeddingStatus(document.embeddingStatus)) {
    throw new Error('Invalid document embedding status.');
  }
  if (
    document.embeddingDimensions !== null &&
    (!Number.isSafeInteger(document.embeddingDimensions) || document.embeddingDimensions <= 0)
  ) {
    throw new Error('embeddingDimensions must be a positive safe integer.');
  }
  if (!Number.isSafeInteger(document.embeddingAttempts) || document.embeddingAttempts < 0) {
    throw new Error('embeddingAttempts must be a non-negative safe integer.');
  }
  if (
    document.lastEmbeddingErrorCode &&
    !/^[A-Z0-9_]{1,100}$/.test(document.lastEmbeddingErrorCode)
  ) {
    throw new Error('lastEmbeddingErrorCode has an invalid format.');
  }
  if (document.embeddingContentHash && !/^[a-f0-9]{64}$/.test(document.embeddingContentHash)) {
    throw new Error('embeddingContentHash has an invalid format.');
  }
  if (document.embeddedAt) parseDocumentDate(document.embeddedAt, 'embeddedAt');
}

function withProcessingDefaults(
  metadata: CreateDocumentMetadata,
  tenant: DocumentTenantContext,
): DocumentMetadata {
  const intelligence = defaultDocumentIntelligenceMetadata();
  return {
    ...intelligence,
    ...metadata,
    companyId: tenant.companyId,
    uploadedBy: tenant.userId,
    deletedAt: null,
    processingAttempts: metadata.processingAttempts ?? 0,
    lastErrorCode: metadata.lastErrorCode ?? null,
    lastErrorMessage: metadata.lastErrorMessage ?? null,
    processingStartedAt: metadata.processingStartedAt ?? null,
    processingCompletedAt: metadata.processingCompletedAt ?? null,
    nextRetryAt: metadata.nextRetryAt ?? null,
    quarantinedAt: metadata.quarantinedAt ?? null,
    workerId: metadata.workerId ?? null,
    pages: metadata.pages ?? null,
    textLength: metadata.textLength ?? null,
    chunksCount: metadata.chunksCount ?? null,
    detectedDocumentType: metadata.detectedDocumentType ?? intelligence.detectedDocumentType,
    detectedMimeType: metadata.detectedMimeType ?? intelligence.detectedMimeType,
    detectionConfidence: metadata.detectionConfidence ?? intelligence.detectionConfidence,
    textExtractionMethod: metadata.textExtractionMethod ?? intelligence.textExtractionMethod,
    ocrStatus: metadata.ocrStatus ?? intelligence.ocrStatus,
    ocrProvider: metadata.ocrProvider ?? intelligence.ocrProvider,
    ocrLanguage: metadata.ocrLanguage ?? intelligence.ocrLanguage,
    ocrStartedAt: metadata.ocrStartedAt ?? intelligence.ocrStartedAt,
    ocrCompletedAt: metadata.ocrCompletedAt ?? intelligence.ocrCompletedAt,
    pageCount: metadata.pageCount ?? intelligence.pageCount,
    extractedCharacterCount:
      metadata.extractedCharacterCount ?? intelligence.extractedCharacterCount,
    requiresManualReview: metadata.requiresManualReview ?? intelligence.requiresManualReview,
    intelligenceVersion: metadata.intelligenceVersion ?? intelligence.intelligenceVersion,
    embeddingStatus: metadata.embeddingStatus ?? 'PENDING',
    embeddingModel: metadata.embeddingModel ?? null,
    embeddingDimensions: metadata.embeddingDimensions ?? null,
    embeddingVersion: metadata.embeddingVersion ?? null,
    embeddedAt: metadata.embeddedAt ?? null,
    embeddingAttempts: metadata.embeddingAttempts ?? 0,
    lastEmbeddingErrorCode: metadata.lastEmbeddingErrorCode ?? null,
    embeddingContentHash: metadata.embeddingContentHash ?? null,
  };
}

function normalizeLegacyDocument(
  item: LegacyDocument,
  tenant: DocumentTenantContext,
): DocumentMetadata | null {
  const id = asString(item.id);
  const originalName = asString(item.originalName) ?? asString(item.name);
  const storedName = asString(item.storedName);
  if (!id || !originalName || !storedName) return null;

  const declaredCompanyId = asString(item.companyId);
  if (declaredCompanyId && declaredCompanyId !== tenant.companyId) return null;

  const createdAt =
    asString(item.createdAt) ?? asString(item.uploadedAt) ?? new Date(0).toISOString();
  const deletedAt = asString(item.deletedAt) ?? null;
  const status = deletedAt ? 'DELETED' : normalizeLegacyStatus(item.status);
  const processingCompletedAt =
    asString(item.processingCompletedAt) ?? asString(item.processedAt) ?? null;

  return {
    id,
    companyId: tenant.companyId,
    uploadedBy: asString(item.uploadedBy) ?? 'legacy-import',
    status,
    originalName,
    storedName,
    mimeType:
      asString(item.mimeType) ??
      (item.type === 'PDF' ? 'application/pdf' : 'application/octet-stream'),
    size: typeof item.size === 'number' && item.size >= 0 ? item.size : 0,
    checksum: asDocumentChecksum(item.checksum),
    createdAt,
    updatedAt: asString(item.updatedAt) ?? processingCompletedAt ?? createdAt,
    deletedAt,
    processingAttempts:
      typeof item.processingAttempts === 'number' && item.processingAttempts >= 0
        ? item.processingAttempts
        : status === 'COMPLETED' || status === 'FAILED'
          ? 1
          : 0,
    lastErrorCode:
      asNullableString(item.lastErrorCode) ??
      (status === 'FAILED' ? 'LEGACY_PROCESSING_ERROR' : null),
    lastErrorMessage:
      status === 'FAILED'
        ? 'Не удалось обработать документ.'
        : asNullableString(item.lastErrorMessage),
    processingStartedAt: asNullableString(item.processingStartedAt),
    processingCompletedAt,
    nextRetryAt: asNullableString(item.nextRetryAt),
    quarantinedAt: asNullableString(item.quarantinedAt),
    workerId: asNullableString(item.workerId),
    pages: typeof item.pages === 'number' ? item.pages : null,
    textLength: typeof item.textLength === 'number' ? item.textLength : null,
    chunksCount: typeof item.chunksCount === 'number' ? item.chunksCount : null,
    detectedDocumentType: isDocumentType(item.detectedDocumentType)
      ? item.detectedDocumentType
      : 'UNKNOWN',
    detectedMimeType: asNullableString(item.detectedMimeType),
    detectionConfidence:
      typeof item.detectionConfidence === 'number' &&
      item.detectionConfidence >= 0 &&
      item.detectionConfidence <= 1
        ? item.detectionConfidence
        : null,
    textExtractionMethod: isDocumentTextExtractionMethod(item.textExtractionMethod)
      ? item.textExtractionMethod
      : status === 'COMPLETED'
        ? 'PDF_TEXT'
        : 'NONE',
    ocrStatus: isDocumentOcrStatus(item.ocrStatus)
      ? item.ocrStatus
      : status === 'COMPLETED'
        ? 'NOT_REQUIRED'
        : 'PENDING',
    ocrProvider: asNullableString(item.ocrProvider),
    ocrLanguage: asNullableString(item.ocrLanguage),
    ocrStartedAt: asNullableString(item.ocrStartedAt),
    ocrCompletedAt: asNullableString(item.ocrCompletedAt),
    pageCount:
      typeof item.pageCount === 'number'
        ? item.pageCount
        : typeof item.pages === 'number'
          ? item.pages
          : null,
    extractedCharacterCount:
      typeof item.extractedCharacterCount === 'number'
        ? item.extractedCharacterCount
        : typeof item.textLength === 'number'
          ? item.textLength
          : null,
    requiresManualReview:
      typeof item.requiresManualReview === 'boolean' ? item.requiresManualReview : true,
    intelligenceVersion: asString(item.intelligenceVersion) ?? 'legacy-task-002',
    embeddingStatus: isDocumentEmbeddingStatus(item.embeddingStatus)
      ? item.embeddingStatus
      : 'PENDING',
    embeddingModel: asNullableString(item.embeddingModel),
    embeddingDimensions:
      typeof item.embeddingDimensions === 'number' && item.embeddingDimensions > 0
        ? item.embeddingDimensions
        : null,
    embeddingVersion: asNullableString(item.embeddingVersion),
    embeddedAt: asNullableString(item.embeddedAt),
    embeddingAttempts:
      typeof item.embeddingAttempts === 'number' && item.embeddingAttempts >= 0
        ? item.embeddingAttempts
        : 0,
    lastEmbeddingErrorCode: asNullableString(item.lastEmbeddingErrorCode),
    embeddingContentHash:
      typeof item.embeddingContentHash === 'string' &&
      /^[a-f0-9]{64}$/.test(item.embeddingContentHash)
        ? item.embeddingContentHash
        : null,
  };
}

export class LocalDocumentMetadataRepository implements DocumentMetadataRepository {
  constructor(
    private readonly dataDirectory = path.join(process.cwd(), '.data'),
    private readonly options: {
      persistLegacyOnRead?: boolean;
    } = {},
  ) {}

  async list(tenant: DocumentTenantContext) {
    const documents = await this.read(tenant);
    return documents
      .filter((item) => !item.deletedAt)
      .sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  async findById(tenant: DocumentTenantContext, documentId: string) {
    const documents = await this.read(tenant);
    return documents.find((item) => item.id === documentId && !item.deletedAt) ?? null;
  }

  async create(tenant: DocumentTenantContext, metadata: CreateDocumentMetadata) {
    assertDocumentTenantContext(tenant);
    const documents = await this.read(tenant);
    const document = withProcessingDefaults(metadata, tenant);

    validateDocumentMetadata(document);
    if (documents.some((item) => item.id === document.id)) {
      throw new Error('Document metadata already exists.');
    }

    documents.unshift(document);
    await this.write(tenant, documents);
    return document;
  }

  async update(tenant: DocumentTenantContext, documentId: string, changes: UpdateDocumentMetadata) {
    const documents = await this.read(tenant);
    const index = documents.findIndex((item) => item.id === documentId && !item.deletedAt);
    if (index === -1) return null;

    const updated: DocumentMetadata = {
      ...documents[index],
      ...changes,
      id: documents[index].id,
      companyId: tenant.companyId,
      uploadedBy: documents[index].uploadedBy,
      createdAt: documents[index].createdAt,
      updatedAt: new Date().toISOString(),
    };
    validateDocumentMetadata(updated);
    documents[index] = updated;
    await this.write(tenant, documents);
    return updated;
  }

  async transitionStatus(
    tenant: DocumentTenantContext,
    documentId: string,
    expectedStatuses: readonly DocumentProcessingStatus[],
    nextStatus: DocumentProcessingStatus,
    changes: UpdateDocumentMetadata = {},
  ) {
    assertDocumentTenantContext(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    assertDocumentProcessingStatus(nextStatus);
    for (const expectedStatus of expectedStatuses) {
      assertDocumentStatusTransition(expectedStatus, nextStatus);
    }

    const documents = await this.read(tenant);
    const index = documents.findIndex(
      (item) => item.id === documentId && !item.deletedAt && expectedStatuses.includes(item.status),
    );
    if (index === -1) return null;

    assertDocumentStatusTransition(documents[index].status, nextStatus);
    const updated: DocumentMetadata = {
      ...documents[index],
      ...changes,
      id: documents[index].id,
      companyId: tenant.companyId,
      uploadedBy: documents[index].uploadedBy,
      status: nextStatus,
      createdAt: documents[index].createdAt,
      updatedAt: new Date().toISOString(),
      deletedAt: documents[index].deletedAt,
    };
    validateDocumentMetadata(updated);
    documents[index] = updated;
    await this.write(tenant, documents);
    return updated;
  }

  async delete(tenant: DocumentTenantContext, documentId: string) {
    const documents = await this.read(tenant);
    const index = documents.findIndex((item) => item.id === documentId && !item.deletedAt);
    if (index === -1) return null;

    const now = new Date().toISOString();
    assertDocumentStatusTransition(documents[index].status, 'DELETED');
    const document = {
      ...documents[index],
      status: 'DELETED' as const,
      updatedAt: now,
      deletedAt: now,
      workerId: null,
      nextRetryAt: null,
    };
    documents[index] = document;
    await this.write(tenant, documents);
    return document;
  }

  async listDeleted(tenant: DocumentTenantContext) {
    const documents = await this.read(tenant);
    return documents
      .filter((item) => Boolean(item.deletedAt))
      .sort((first, second) => (first.deletedAt ?? '').localeCompare(second.deletedAt ?? ''));
  }

  async findDeletedById(tenant: DocumentTenantContext, documentId: string) {
    const documents = await this.read(tenant);
    return documents.find((item) => item.id === documentId && item.deletedAt) ?? null;
  }

  async hardDelete(tenant: DocumentTenantContext, documentId: string) {
    const documents = await this.read(tenant);
    const document = documents.find((item) => item.id === documentId && item.deletedAt);
    if (!document) return null;

    await this.write(
      tenant,
      documents.filter((item) => item !== document),
    );
    return document;
  }

  private metadataFile(tenant: DocumentTenantContext) {
    assertDocumentTenantContext(tenant);
    return path.join(this.dataDirectory, 'document-tenants', tenant.companyId, 'metadata.json');
  }

  private async read(tenant: DocumentTenantContext): Promise<DocumentMetadata[]> {
    const filePath = this.metadataFile(tenant);

    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
      if (!Array.isArray(parsed)) return [];

      return (parsed as LegacyDocument[])
        .map((item) => normalizeLegacyDocument(item, tenant))
        .filter((item): item is DocumentMetadata =>
          Boolean(item && item.companyId === tenant.companyId),
        );
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    if (tenant.companyId !== AVANTIME_DOCUMENT_COMPANY_ID) return [];
    const legacyFile = path.join(this.dataDirectory, 'documents.json');

    try {
      const parsed: unknown = JSON.parse(await readFile(legacyFile, 'utf8'));
      if (!Array.isArray(parsed)) return [];

      const migrated = (parsed as LegacyDocument[])
        .map((item) => normalizeLegacyDocument(item, tenant))
        .filter((item): item is DocumentMetadata => Boolean(item));
      if (migrated.length > 0 && this.options.persistLegacyOnRead !== false) {
        await this.write(tenant, migrated);
      }
      return migrated;
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
  }

  private async write(tenant: DocumentTenantContext, documents: DocumentMetadata[]) {
    const filePath = this.metadataFile(tenant);
    await mkdir(path.dirname(filePath), { recursive: true });

    const temporaryFile = `${filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryFile, JSON.stringify(documents, null, 2), 'utf8');
    await rename(temporaryFile, filePath);
  }
}

type DatabaseDocumentRecord = {
  id: string;
  companyId: string;
  uploadedBy: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  status: string;
  checksum: string;
  processingAttempts: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  processingStartedAt: Date | null;
  processingCompletedAt: Date | null;
  nextRetryAt: Date | null;
  quarantinedAt: Date | null;
  workerId: string | null;
  pages: number | null;
  textLength: number | null;
  chunksCount: number | null;
  detectedDocumentType: string;
  detectedMimeType: string | null;
  detectionConfidence: number | null;
  textExtractionMethod: string;
  ocrStatus: string;
  ocrProvider: string | null;
  ocrLanguage: string | null;
  ocrStartedAt: Date | null;
  ocrCompletedAt: Date | null;
  pageCount: number | null;
  extractedCharacterCount: number | null;
  requiresManualReview: boolean;
  intelligenceVersion: string;
  embeddingStatus: string;
  embeddingModel: string | null;
  embeddingDimensions: number | null;
  embeddingVersion: string | null;
  embeddedAt: Date | null;
  embeddingAttempts: number;
  lastEmbeddingErrorCode: string | null;
  embeddingContentHash: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
};

type DocumentMetadataDatabaseDelegate = {
  findMany(args: Record<string, unknown>): Promise<DatabaseDocumentRecord[]>;
  findFirst(args: Record<string, unknown>): Promise<DatabaseDocumentRecord | null>;
  create(args: Record<string, unknown>): Promise<DatabaseDocumentRecord>;
  updateMany(args: Record<string, unknown>): Promise<{ count: number }>;
  deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
};

export type DocumentMetadataDatabaseClient = {
  documentMetadata: DocumentMetadataDatabaseDelegate;
};

export type DocumentMetadataDatabaseLoader = () => Promise<DocumentMetadataDatabaseClient | null>;

function fromDatabaseStatus(status: string): DocumentProcessingStatus {
  if (status === 'PROCESSED') return 'COMPLETED';
  if (isDocumentProcessingStatus(status)) return status;
  throw new Error('Database returned an unsupported document status.');
}

function mapDatabaseDocument(record: DatabaseDocumentRecord): DocumentMetadata {
  const document: DocumentMetadata = {
    id: record.id,
    companyId: record.companyId,
    uploadedBy: record.uploadedBy,
    originalName: record.originalName,
    storedName: record.storedName,
    mimeType: record.mimeType,
    size: record.size,
    status: fromDatabaseStatus(record.status),
    checksum: record.checksum,
    processingAttempts: record.processingAttempts,
    lastErrorCode: record.lastErrorCode,
    lastErrorMessage: record.lastErrorMessage,
    processingStartedAt: record.processingStartedAt?.toISOString() ?? null,
    processingCompletedAt: record.processingCompletedAt?.toISOString() ?? null,
    nextRetryAt: record.nextRetryAt?.toISOString() ?? null,
    quarantinedAt: record.quarantinedAt?.toISOString() ?? null,
    workerId: record.workerId,
    pages: record.pages,
    textLength: record.textLength,
    chunksCount: record.chunksCount,
    detectedDocumentType: isDocumentType(record.detectedDocumentType)
      ? record.detectedDocumentType
      : 'UNKNOWN',
    detectedMimeType: record.detectedMimeType,
    detectionConfidence: record.detectionConfidence,
    textExtractionMethod: isDocumentTextExtractionMethod(record.textExtractionMethod)
      ? record.textExtractionMethod
      : 'NONE',
    ocrStatus: isDocumentOcrStatus(record.ocrStatus) ? record.ocrStatus : 'PENDING',
    ocrProvider: record.ocrProvider,
    ocrLanguage: record.ocrLanguage,
    ocrStartedAt: record.ocrStartedAt?.toISOString() ?? null,
    ocrCompletedAt: record.ocrCompletedAt?.toISOString() ?? null,
    pageCount: record.pageCount,
    extractedCharacterCount: record.extractedCharacterCount,
    requiresManualReview: record.requiresManualReview,
    intelligenceVersion: record.intelligenceVersion,
    embeddingStatus: isDocumentEmbeddingStatus(record.embeddingStatus)
      ? record.embeddingStatus
      : 'PENDING',
    embeddingModel: record.embeddingModel ?? null,
    embeddingDimensions: record.embeddingDimensions ?? null,
    embeddingVersion: record.embeddingVersion ?? null,
    embeddedAt: record.embeddedAt?.toISOString() ?? null,
    embeddingAttempts:
      Number.isSafeInteger(record.embeddingAttempts) && record.embeddingAttempts >= 0
        ? record.embeddingAttempts
        : 0,
    lastEmbeddingErrorCode: record.lastEmbeddingErrorCode ?? null,
    embeddingContentHash: record.embeddingContentHash ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    deletedAt: record.deletedAt?.toISOString() ?? null,
  };
  validateDocumentMetadata(document);
  return document;
}

export class PostgreSQLDocumentMetadataRepository implements DocumentMetadataRepository {
  constructor(
    private readonly loadDatabase: DocumentMetadataDatabaseLoader = async () =>
      (await getPrisma()) as DocumentMetadataDatabaseClient | null,
  ) {}

  async list(tenant: DocumentTenantContext) {
    const delegate = await this.delegate(tenant);
    const records = await delegate.findMany({
      where: {
        companyId: tenant.companyId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    return records.map(mapDatabaseDocument);
  }

  async findById(tenant: DocumentTenantContext, documentId: string) {
    const delegate = await this.delegate(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const record = await delegate.findFirst({
      where: {
        companyId: tenant.companyId,
        id: documentId,
        deletedAt: null,
      },
    });
    return record ? mapDatabaseDocument(record) : null;
  }

  async create(tenant: DocumentTenantContext, metadata: CreateDocumentMetadata) {
    const delegate = await this.delegate(tenant);
    const document = withProcessingDefaults(metadata, tenant);
    validateDocumentMetadata(document);

    const record = await delegate.create({
      data: {
        id: document.id,
        companyId: document.companyId,
        uploadedBy: document.uploadedBy,
        originalName: document.originalName,
        storedName: document.storedName,
        mimeType: document.mimeType,
        size: document.size,
        status: document.status,
        checksum: document.checksum,
        processingAttempts: document.processingAttempts,
        lastErrorCode: document.lastErrorCode,
        lastErrorMessage: document.lastErrorMessage,
        processingStartedAt: document.processingStartedAt
          ? parseDocumentDate(document.processingStartedAt, 'processingStartedAt')
          : null,
        processingCompletedAt: document.processingCompletedAt
          ? parseDocumentDate(document.processingCompletedAt, 'processingCompletedAt')
          : null,
        nextRetryAt: document.nextRetryAt
          ? parseDocumentDate(document.nextRetryAt, 'nextRetryAt')
          : null,
        quarantinedAt: document.quarantinedAt
          ? parseDocumentDate(document.quarantinedAt, 'quarantinedAt')
          : null,
        workerId: document.workerId,
        pages: document.pages,
        textLength: document.textLength,
        chunksCount: document.chunksCount,
        detectedDocumentType: document.detectedDocumentType,
        detectedMimeType: document.detectedMimeType,
        detectionConfidence: document.detectionConfidence,
        textExtractionMethod: document.textExtractionMethod,
        ocrStatus: document.ocrStatus,
        ocrProvider: document.ocrProvider,
        ocrLanguage: document.ocrLanguage,
        ocrStartedAt: document.ocrStartedAt
          ? parseDocumentDate(document.ocrStartedAt, 'ocrStartedAt')
          : null,
        ocrCompletedAt: document.ocrCompletedAt
          ? parseDocumentDate(document.ocrCompletedAt, 'ocrCompletedAt')
          : null,
        pageCount: document.pageCount,
        extractedCharacterCount: document.extractedCharacterCount,
        requiresManualReview: document.requiresManualReview,
        intelligenceVersion: document.intelligenceVersion,
        embeddingStatus: document.embeddingStatus,
        embeddingModel: document.embeddingModel,
        embeddingDimensions: document.embeddingDimensions,
        embeddingVersion: document.embeddingVersion,
        embeddedAt: document.embeddedAt
          ? parseDocumentDate(document.embeddedAt, 'embeddedAt')
          : null,
        embeddingAttempts: document.embeddingAttempts,
        lastEmbeddingErrorCode: document.lastEmbeddingErrorCode,
        embeddingContentHash: document.embeddingContentHash,
        createdAt: parseDocumentDate(document.createdAt, 'createdAt'),
        updatedAt: parseDocumentDate(document.updatedAt, 'updatedAt'),
        deletedAt: null,
      },
    });
    return mapDatabaseDocument(record);
  }

  async update(tenant: DocumentTenantContext, documentId: string, changes: UpdateDocumentMetadata) {
    const delegate = await this.delegate(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const data: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (changes.originalName !== undefined) {
      if (!changes.originalName.trim() || changes.originalName.length > 500) {
        throw new Error('Document originalName is required and must not exceed 500 characters.');
      }
      data.originalName = changes.originalName;
    }
    if (changes.storedName !== undefined) {
      assertSafeDocumentSegment(changes.storedName, 'storedName');
      data.storedName = changes.storedName;
    }
    if (changes.mimeType !== undefined) {
      if (!changes.mimeType.trim() || changes.mimeType.length > 255) {
        throw new Error('Document mimeType is required and must not exceed 255 characters.');
      }
      data.mimeType = changes.mimeType;
    }
    if (changes.size !== undefined) {
      if (!Number.isSafeInteger(changes.size) || changes.size < 0) {
        throw new Error('Document size must be a non-negative safe integer.');
      }
      data.size = changes.size;
    }
    if (changes.checksum !== undefined) {
      assertDocumentChecksum(changes.checksum);
      data.checksum = changes.checksum;
    }
    this.applyProcessingChanges(data, changes);

    const result = await delegate.updateMany({
      where: {
        companyId: tenant.companyId,
        id: documentId,
        deletedAt: null,
      },
      data,
    });
    if (result.count === 0) return null;
    return this.findById(tenant, documentId);
  }

  async transitionStatus(
    tenant: DocumentTenantContext,
    documentId: string,
    expectedStatuses: readonly DocumentProcessingStatus[],
    nextStatus: DocumentProcessingStatus,
    changes: UpdateDocumentMetadata = {},
  ) {
    const delegate = await this.delegate(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    assertDocumentProcessingStatus(nextStatus);
    for (const expectedStatus of expectedStatuses) {
      assertDocumentStatusTransition(expectedStatus, nextStatus);
    }

    const data: Record<string, unknown> = {
      status: nextStatus,
      updatedAt: new Date(),
    };
    this.applyProcessingChanges(data, changes);

    const result = await delegate.updateMany({
      where: {
        companyId: tenant.companyId,
        id: documentId,
        status: {
          in: [...expectedStatuses],
        },
        deletedAt: null,
      },
      data,
    });
    if (result.count === 0) return null;
    return this.findById(tenant, documentId);
  }

  async delete(tenant: DocumentTenantContext, documentId: string) {
    const current = await this.findById(tenant, documentId);
    if (!current) return null;
    assertDocumentStatusTransition(current.status, 'DELETED');

    const delegate = await this.delegate(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const deletedAt = new Date();
    const result = await delegate.updateMany({
      where: {
        companyId: tenant.companyId,
        id: documentId,
        status: current.status,
        deletedAt: null,
      },
      data: {
        status: 'DELETED',
        deletedAt,
        updatedAt: deletedAt,
        workerId: null,
        nextRetryAt: null,
      },
    });
    if (result.count === 0) return null;
    return this.findDeletedById(tenant, documentId);
  }

  async listDeleted(tenant: DocumentTenantContext) {
    const delegate = await this.delegate(tenant);
    const records = await delegate.findMany({
      where: {
        companyId: tenant.companyId,
        deletedAt: {
          not: null,
        },
      },
      orderBy: {
        deletedAt: 'asc',
      },
    });
    return records.map(mapDatabaseDocument);
  }

  async findDeletedById(tenant: DocumentTenantContext, documentId: string) {
    const delegate = await this.delegate(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const record = await delegate.findFirst({
      where: {
        companyId: tenant.companyId,
        id: documentId,
        deletedAt: {
          not: null,
        },
      },
    });
    return record ? mapDatabaseDocument(record) : null;
  }

  async hardDelete(tenant: DocumentTenantContext, documentId: string) {
    const document = await this.findDeletedById(tenant, documentId);
    if (!document) return null;

    const delegate = await this.delegate(tenant);
    const result = await delegate.deleteMany({
      where: {
        companyId: tenant.companyId,
        id: documentId,
        deletedAt: {
          not: null,
        },
      },
    });
    return result.count > 0 ? document : null;
  }

  private async delegate(tenant: DocumentTenantContext) {
    assertDocumentTenantContext(tenant);
    const database = await this.loadDatabase();
    if (!database?.documentMetadata) {
      throw new Error('PostgreSQL document metadata repository is unavailable.');
    }

    return database.documentMetadata;
  }

  private applyProcessingChanges(data: Record<string, unknown>, changes: UpdateDocumentMetadata) {
    if (changes.processingAttempts !== undefined) {
      data.processingAttempts = changes.processingAttempts;
    }
    if (changes.lastErrorCode !== undefined) data.lastErrorCode = changes.lastErrorCode;
    if (changes.lastErrorMessage !== undefined) {
      data.lastErrorMessage = changes.lastErrorMessage;
    }
    if (changes.processingStartedAt !== undefined) {
      data.processingStartedAt = changes.processingStartedAt
        ? parseDocumentDate(changes.processingStartedAt, 'processingStartedAt')
        : null;
    }
    if (changes.processingCompletedAt !== undefined) {
      data.processingCompletedAt = changes.processingCompletedAt
        ? parseDocumentDate(changes.processingCompletedAt, 'processingCompletedAt')
        : null;
    }
    if (changes.nextRetryAt !== undefined) {
      data.nextRetryAt = changes.nextRetryAt
        ? parseDocumentDate(changes.nextRetryAt, 'nextRetryAt')
        : null;
    }
    if (changes.quarantinedAt !== undefined) {
      data.quarantinedAt = changes.quarantinedAt
        ? parseDocumentDate(changes.quarantinedAt, 'quarantinedAt')
        : null;
    }
    if (changes.workerId !== undefined) data.workerId = changes.workerId;
    if (changes.pages !== undefined) data.pages = changes.pages;
    if (changes.textLength !== undefined) data.textLength = changes.textLength;
    if (changes.chunksCount !== undefined) data.chunksCount = changes.chunksCount;
    if (changes.detectedDocumentType !== undefined) {
      data.detectedDocumentType = changes.detectedDocumentType;
    }
    if (changes.detectedMimeType !== undefined) data.detectedMimeType = changes.detectedMimeType;
    if (changes.detectionConfidence !== undefined) {
      data.detectionConfidence = changes.detectionConfidence;
    }
    if (changes.textExtractionMethod !== undefined) {
      data.textExtractionMethod = changes.textExtractionMethod;
    }
    if (changes.ocrStatus !== undefined) data.ocrStatus = changes.ocrStatus;
    if (changes.ocrProvider !== undefined) data.ocrProvider = changes.ocrProvider;
    if (changes.ocrLanguage !== undefined) data.ocrLanguage = changes.ocrLanguage;
    if (changes.ocrStartedAt !== undefined) {
      data.ocrStartedAt = changes.ocrStartedAt
        ? parseDocumentDate(changes.ocrStartedAt, 'ocrStartedAt')
        : null;
    }
    if (changes.ocrCompletedAt !== undefined) {
      data.ocrCompletedAt = changes.ocrCompletedAt
        ? parseDocumentDate(changes.ocrCompletedAt, 'ocrCompletedAt')
        : null;
    }
    if (changes.pageCount !== undefined) data.pageCount = changes.pageCount;
    if (changes.extractedCharacterCount !== undefined) {
      data.extractedCharacterCount = changes.extractedCharacterCount;
    }
    if (changes.requiresManualReview !== undefined) {
      data.requiresManualReview = changes.requiresManualReview;
    }
    if (changes.intelligenceVersion !== undefined) {
      data.intelligenceVersion = changes.intelligenceVersion;
    }
    if (changes.embeddingStatus !== undefined) data.embeddingStatus = changes.embeddingStatus;
    if (changes.embeddingModel !== undefined) data.embeddingModel = changes.embeddingModel;
    if (changes.embeddingDimensions !== undefined) {
      data.embeddingDimensions = changes.embeddingDimensions;
    }
    if (changes.embeddingVersion !== undefined) data.embeddingVersion = changes.embeddingVersion;
    if (changes.embeddedAt !== undefined) {
      data.embeddedAt = changes.embeddedAt
        ? parseDocumentDate(changes.embeddedAt, 'embeddedAt')
        : null;
    }
    if (changes.embeddingAttempts !== undefined) {
      data.embeddingAttempts = changes.embeddingAttempts;
    }
    if (changes.lastEmbeddingErrorCode !== undefined) {
      data.lastEmbeddingErrorCode = changes.lastEmbeddingErrorCode;
    }
    if (changes.embeddingContentHash !== undefined) {
      data.embeddingContentHash = changes.embeddingContentHash;
    }
  }
}

export class LocalDocumentProcessingRepository implements DocumentProcessingRepository {
  constructor(private readonly storage: DocumentStorage) {}

  async save(tenant: DocumentTenantContext, documentId: string, result: DocumentProcessingResult) {
    await this.storage.write(tenant, 'text', `${documentId}.txt`, Buffer.from(result.text, 'utf8'));
    await this.storage.write(
      tenant,
      'chunks',
      `${documentId}.json`,
      Buffer.from(JSON.stringify(result.chunks, null, 2), 'utf8'),
    );
  }

  async readText(tenant: DocumentTenantContext, documentId: string) {
    const content = await this.storage.read(tenant, 'text', `${documentId}.txt`);
    return content?.toString('utf8') ?? null;
  }

  async readChunks(tenant: DocumentTenantContext, documentId: string) {
    const content = await this.storage.read(tenant, 'chunks', `${documentId}.json`);
    if (!content) return [];

    try {
      const parsed: unknown = JSON.parse(content.toString('utf8'));
      return Array.isArray(parsed) ? (parsed as TextChunk[]) : [];
    } catch {
      return [];
    }
  }

  async delete(tenant: DocumentTenantContext, documentId: string) {
    await this.storage.delete(tenant, 'text', `${documentId}.txt`);
    await this.storage.delete(tenant, 'chunks', `${documentId}.json`);
  }
}

export class LocalDocumentHistoryRepository implements DocumentHistoryRepository {
  private readonly historyKey = 'knowledge-history.json';

  constructor(private readonly storage: DocumentStorage) {}

  async list(tenant: DocumentTenantContext) {
    const content = await this.storage.read(tenant, 'history', this.historyKey);
    if (!content) return [];

    try {
      const parsed: unknown = JSON.parse(content.toString('utf8'));
      return Array.isArray(parsed) ? (parsed as DocumentHistoryItem[]) : [];
    } catch {
      return [];
    }
  }

  async save(tenant: DocumentTenantContext, history: DocumentHistoryItem[]) {
    await this.storage.write(
      tenant,
      'history',
      this.historyKey,
      Buffer.from(JSON.stringify(history, null, 2), 'utf8'),
    );
  }
}
