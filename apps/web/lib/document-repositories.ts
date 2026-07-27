import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  AVANTIME_DOCUMENT_COMPANY_ID,
  type DocumentMetadata,
  type DocumentTenantContext,
  type TextChunk,
} from './document-model';
import {
  assertDocumentTenantContext,
  type DocumentStorage,
} from './document-storage';

export type CreateDocumentMetadata = Omit<
  DocumentMetadata,
  'companyId' | 'uploadedBy'
>;
export type UpdateDocumentMetadata = Partial<
  Omit<DocumentMetadata, 'id' | 'companyId' | 'uploadedBy' | 'createdAt'>
>;

export interface DocumentMetadataRepository {
  list(tenant: DocumentTenantContext): Promise<DocumentMetadata[]>;
  findById(
    tenant: DocumentTenantContext,
    documentId: string,
  ): Promise<DocumentMetadata | null>;
  create(
    tenant: DocumentTenantContext,
    metadata: CreateDocumentMetadata,
  ): Promise<DocumentMetadata>;
  update(
    tenant: DocumentTenantContext,
    documentId: string,
    changes: UpdateDocumentMetadata,
  ): Promise<DocumentMetadata | null>;
  delete(
    tenant: DocumentTenantContext,
    documentId: string,
  ): Promise<DocumentMetadata | null>;
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
  readText(
    tenant: DocumentTenantContext,
    documentId: string,
  ): Promise<string | null>;
  readChunks(
    tenant: DocumentTenantContext,
    documentId: string,
  ): Promise<TextChunk[]>;
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
  save(
    tenant: DocumentTenantContext,
    history: DocumentHistoryItem[],
  ): Promise<void>;
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
};

function isMissingFile(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
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
  const status =
    item.status === 'Обработан' || item.status === 'Ошибка'
      ? item.status
      : 'Обрабатывается';

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
    createdAt,
    updatedAt:
      asString(item.updatedAt) ?? asString(item.processedAt) ?? createdAt,
    pages: typeof item.pages === 'number' ? item.pages : undefined,
    textLength: typeof item.textLength === 'number' ? item.textLength : undefined,
    processedAt: asString(item.processedAt),
    errorMessage: asString(item.errorMessage),
    chunksCount: typeof item.chunksCount === 'number' ? item.chunksCount : undefined,
  };
}

export class LocalDocumentMetadataRepository implements DocumentMetadataRepository {
  constructor(private readonly dataDirectory = path.join(process.cwd(), '.data')) {}

  async list(tenant: DocumentTenantContext) {
    const documents = await this.read(tenant);
    return documents.sort((first, second) => second.createdAt.localeCompare(first.createdAt));
  }

  async findById(tenant: DocumentTenantContext, documentId: string) {
    const documents = await this.read(tenant);
    return documents.find((item) => item.id === documentId) ?? null;
  }

  async create(tenant: DocumentTenantContext, metadata: CreateDocumentMetadata) {
    assertDocumentTenantContext(tenant);
    const documents = await this.read(tenant);
    const document: DocumentMetadata = {
      ...metadata,
      companyId: tenant.companyId,
      uploadedBy: tenant.userId,
    };

    if (!document.companyId) {
      throw new Error('Document metadata requires companyId.');
    }
    if (documents.some((item) => item.id === document.id)) {
      throw new Error('Document metadata already exists.');
    }

    documents.unshift(document);
    await this.write(tenant, documents);
    return document;
  }

  async update(
    tenant: DocumentTenantContext,
    documentId: string,
    changes: UpdateDocumentMetadata,
  ) {
    const documents = await this.read(tenant);
    const index = documents.findIndex((item) => item.id === documentId);
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
    documents[index] = updated;
    await this.write(tenant, documents);
    return updated;
  }

  async delete(tenant: DocumentTenantContext, documentId: string) {
    const documents = await this.read(tenant);
    const document = documents.find((item) => item.id === documentId);
    if (!document) return null;

    await this.write(
      tenant,
      documents.filter((item) => item.id !== documentId),
    );
    return document;
  }

  private metadataFile(tenant: DocumentTenantContext) {
    assertDocumentTenantContext(tenant);
    return path.join(
      this.dataDirectory,
      'document-tenants',
      tenant.companyId,
      'metadata.json',
    );
  }

  private async read(tenant: DocumentTenantContext): Promise<DocumentMetadata[]> {
    const filePath = this.metadataFile(tenant);

    try {
      const parsed: unknown = JSON.parse(await readFile(filePath, 'utf8'));
      if (!Array.isArray(parsed)) return [];

      return (parsed as LegacyDocument[])
        .map((item) => normalizeLegacyDocument(item, tenant))
        .filter(
          (item): item is DocumentMetadata =>
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
      if (migrated.length > 0) await this.write(tenant, migrated);
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

export class LocalDocumentProcessingRepository
  implements DocumentProcessingRepository
{
  constructor(private readonly storage: DocumentStorage) {}

  async save(
    tenant: DocumentTenantContext,
    documentId: string,
    result: DocumentProcessingResult,
  ) {
    await this.storage.write(
      tenant,
      'text',
      `${documentId}.txt`,
      Buffer.from(result.text, 'utf8'),
    );
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
