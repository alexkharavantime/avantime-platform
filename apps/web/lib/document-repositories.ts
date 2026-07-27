import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { getPrisma } from '@avantime/database';

import {
  AVANTIME_DOCUMENT_COMPANY_ID,
  UNVERIFIED_DOCUMENT_CHECKSUM,
  type DocumentStatus,
  type DocumentMetadata,
  type DocumentTenantContext,
  type TextChunk,
} from './document-model';
import {
  assertDocumentChecksum,
  assertDocumentTenantContext,
  assertSafeDocumentSegment,
  type DocumentStorage,
} from './document-storage';

export type CreateDocumentMetadata = Omit<
  DocumentMetadata,
  'companyId' | 'uploadedBy' | 'deletedAt'
>;
export type UpdateDocumentMetadata = Partial<
  Omit<DocumentMetadata, 'id' | 'companyId' | 'uploadedBy' | 'createdAt' | 'deletedAt'>
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

function assertDocumentStatus(status: unknown): asserts status is DocumentStatus {
  if (status !== 'Обрабатывается' && status !== 'Обработан' && status !== 'Ошибка') {
    throw new Error('Unsupported document status.');
  }
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
  assertDocumentStatus(document.status);
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
  if (document.processedAt) parseDocumentDate(document.processedAt, 'processedAt');
  if (document.deletedAt) parseDocumentDate(document.deletedAt, 'deletedAt');
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
    item.status === 'Обработан' || item.status === 'Ошибка' ? item.status : 'Обрабатывается';

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
    updatedAt: asString(item.updatedAt) ?? asString(item.processedAt) ?? createdAt,
    deletedAt: asString(item.deletedAt) ?? null,
    pages: typeof item.pages === 'number' ? item.pages : undefined,
    textLength: typeof item.textLength === 'number' ? item.textLength : undefined,
    processedAt: asString(item.processedAt),
    errorMessage: asString(item.errorMessage),
    chunksCount: typeof item.chunksCount === 'number' ? item.chunksCount : undefined,
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
    const document: DocumentMetadata = {
      ...metadata,
      companyId: tenant.companyId,
      uploadedBy: tenant.userId,
      deletedAt: null,
    };

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

  async delete(tenant: DocumentTenantContext, documentId: string) {
    const documents = await this.read(tenant);
    const index = documents.findIndex((item) => item.id === documentId && !item.deletedAt);
    if (index === -1) return null;

    const now = new Date().toISOString();
    const document = {
      ...documents[index],
      updatedAt: now,
      deletedAt: now,
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
  pages: number | null;
  textLength: number | null;
  processedAt: Date | null;
  errorMessage: string | null;
  chunksCount: number | null;
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

function toDatabaseStatus(status: DocumentStatus) {
  if (status === 'Обработан') return 'PROCESSED';
  if (status === 'Ошибка') return 'FAILED';
  return 'PROCESSING';
}

function fromDatabaseStatus(status: string): DocumentStatus {
  if (status === 'PROCESSED') return 'Обработан';
  if (status === 'FAILED') return 'Ошибка';
  if (status === 'PROCESSING') return 'Обрабатывается';
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
    pages: record.pages ?? undefined,
    textLength: record.textLength ?? undefined,
    processedAt: record.processedAt?.toISOString(),
    errorMessage: record.errorMessage ?? undefined,
    chunksCount: record.chunksCount ?? undefined,
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
    const document: DocumentMetadata = {
      ...metadata,
      companyId: tenant.companyId,
      uploadedBy: tenant.userId,
      deletedAt: null,
    };
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
        status: toDatabaseStatus(document.status),
        checksum: document.checksum,
        pages: document.pages,
        textLength: document.textLength,
        processedAt: document.processedAt
          ? parseDocumentDate(document.processedAt, 'processedAt')
          : null,
        errorMessage: document.errorMessage,
        chunksCount: document.chunksCount,
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

    if (changes.status !== undefined) {
      assertDocumentStatus(changes.status);
      data.status = toDatabaseStatus(changes.status);
    }
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
    if (changes.pages !== undefined) data.pages = changes.pages;
    if (changes.textLength !== undefined) data.textLength = changes.textLength;
    if (changes.processedAt !== undefined) {
      data.processedAt = parseDocumentDate(changes.processedAt, 'processedAt');
    }
    if (changes.errorMessage !== undefined) data.errorMessage = changes.errorMessage;
    if (changes.chunksCount !== undefined) data.chunksCount = changes.chunksCount;

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

  async delete(tenant: DocumentTenantContext, documentId: string) {
    const delegate = await this.delegate(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const deletedAt = new Date();
    const result = await delegate.updateMany({
      where: {
        companyId: tenant.companyId,
        id: documentId,
        deletedAt: null,
      },
      data: {
        deletedAt,
        updatedAt: deletedAt,
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
