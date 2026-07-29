import { getPrisma } from '@avantime/database';

import type { DocumentTenantContext } from './document-model';
import type { DocumentType } from './document-intelligence-model';
import { assertDocumentTenantContext, assertSafeDocumentSegment } from './document-storage';

export type VectorRecord = {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  contentHash: string;
  contentPreview: string;
  pageStart: number | null;
  pageEnd: number | null;
  sourceSegmentIndex?: number | null;
  extractionMethod?: string | null;
  sourceCoordinates?: { x: number; y: number; width: number; height: number } | null;
  provenanceConfidence?: number | null;
  provenanceVersion?: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  dimensions: number;
  vector: readonly number[];
};

export type StoredVectorRecord = Omit<VectorRecord, 'vector'>;

export type VectorSearchRequest = {
  tenant: DocumentTenantContext;
  vector: readonly number[];
  embeddingModel: string;
  embeddingVersion: string;
  dimensions: number;
  topK: number;
  minimumSimilarity: number;
  filters?: {
    documentTypes?: readonly DocumentType[];
    createdFrom?: string;
    createdTo?: string;
  };
};

export type VectorSearchResult = StoredVectorRecord & {
  documentTitle: string;
  score: number;
};

export type VectorRepositoryReadiness = {
  ready: boolean;
  extension: boolean;
  storage: boolean;
  dimensionsCompatible: boolean;
};

export interface VectorRepository {
  upsert(tenant: DocumentTenantContext, records: readonly VectorRecord[]): Promise<void>;
  search(request: VectorSearchRequest): Promise<VectorSearchResult[]>;
  listByDocument(
    tenant: DocumentTenantContext,
    documentId: string,
    options?: {
      embeddingModel?: string;
      embeddingVersion?: string;
    },
  ): Promise<StoredVectorRecord[]>;
  deleteStale(
    tenant: DocumentTenantContext,
    documentId: string,
    activeChunkIds: ReadonlySet<string>,
    embeddingModel: string,
    embeddingVersion: string,
  ): Promise<number>;
  deleteOtherVersions(
    tenant: DocumentTenantContext,
    documentId: string,
    embeddingModel: string,
    embeddingVersion: string,
  ): Promise<number>;
  deleteDocument(tenant: DocumentTenantContext, documentId: string): Promise<number>;
  checkReadiness(expectation: {
    dimensions: number;
    embeddingModel: string;
    embeddingVersion: string;
  }): Promise<VectorRepositoryReadiness>;
}

export type VectorDatabaseClient = {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export type VectorDatabaseLoader = () => Promise<VectorDatabaseClient | null>;

function assertVector(vector: readonly number[], dimensions: number) {
  if (
    !Number.isSafeInteger(dimensions) ||
    dimensions <= 0 ||
    vector.length !== dimensions ||
    vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Vector dimension does not match the configured embedding model.');
  }
}

function assertHash(value: string) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Vector contentHash is invalid.');
}

function assertScore(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1.`);
  }
}

function toVectorLiteral(vector: readonly number[]) {
  return `[${vector.map((value) => Number(value).toString()).join(',')}]`;
}

function parseDate(value: string | undefined, name: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${name} must be a valid date.`);
  return date;
}

function validateRecord(record: VectorRecord) {
  assertSafeDocumentSegment(record.documentId, 'document id');
  assertSafeDocumentSegment(record.chunkId, 'chunk id');
  assertSafeDocumentSegment(record.embeddingModel, 'embedding model');
  assertSafeDocumentSegment(record.embeddingVersion, 'embedding version');
  assertHash(record.contentHash);
  assertVector(record.vector, record.dimensions);
  if (!Number.isSafeInteger(record.chunkIndex) || record.chunkIndex < 0) {
    throw new Error('chunkIndex must be a non-negative integer.');
  }
  if (record.contentPreview.length > 1_000) {
    throw new Error('contentPreview must not exceed 1000 characters.');
  }
  for (const [name, value] of [
    ['pageStart', record.pageStart],
    ['pageEnd', record.pageEnd],
    ['sourceSegmentIndex', record.sourceSegmentIndex],
  ] as const) {
    if (value !== null && value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`${name} must be a non-negative integer or null.`);
    }
  }
  if (record.pageStart !== null && record.pageEnd !== null && record.pageStart > record.pageEnd) {
    throw new Error('pageStart must not be greater than pageEnd.');
  }
  if (
    record.provenanceConfidence !== null &&
    record.provenanceConfidence !== undefined &&
    (!Number.isFinite(record.provenanceConfidence) ||
      record.provenanceConfidence < 0 ||
      record.provenanceConfidence > 1)
  ) {
    throw new Error('provenanceConfidence must be between 0 and 1.');
  }
}

function cosineSimilarity(first: readonly number[], second: readonly number[]) {
  let product = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;
  for (let index = 0; index < first.length; index += 1) {
    product += first[index] * second[index];
    firstMagnitude += first[index] * first[index];
    secondMagnitude += second[index] * second[index];
  }
  if (firstMagnitude === 0 || secondMagnitude === 0) return 0;
  return product / Math.sqrt(firstMagnitude * secondMagnitude);
}

type MemoryVector = VectorRecord & {
  companyId: string;
  documentTitle: string;
  createdAt: string;
  documentType: DocumentType;
};

export class InMemoryVectorRepository implements VectorRepository {
  private readonly records = new Map<string, MemoryVector>();

  constructor(
    private readonly resolveDocument: (
      tenant: DocumentTenantContext,
      documentId: string,
    ) => Promise<{
      originalName: string;
      createdAt: string;
      detectedDocumentType: DocumentType;
      status: string;
      deletedAt: string | null;
      embeddingStatus: string;
    } | null>,
  ) {}

  async upsert(tenant: DocumentTenantContext, records: readonly VectorRecord[]) {
    assertDocumentTenantContext(tenant);
    for (const record of records) {
      validateRecord(record);
      const document = await this.resolveDocument(tenant, record.documentId);
      if (!document) throw new Error('Vector document is unavailable.');
      const key = this.key(
        tenant.companyId,
        record.documentId,
        record.chunkId,
        record.embeddingModel,
        record.embeddingVersion,
      );
      this.records.set(key, {
        ...record,
        vector: [...record.vector],
        companyId: tenant.companyId,
        documentTitle: document.originalName,
        createdAt: document.createdAt,
        documentType: document.detectedDocumentType,
      });
    }
  }

  async search(request: VectorSearchRequest) {
    this.validateSearch(request);
    const createdFrom = parseDate(request.filters?.createdFrom, 'createdFrom');
    const createdTo = parseDate(request.filters?.createdTo, 'createdTo');
    const eligible = await Promise.all(
      [...this.records.values()].map(async (record) => {
        if (
          record.companyId !== request.tenant.companyId ||
          record.embeddingModel !== request.embeddingModel ||
          record.embeddingVersion !== request.embeddingVersion ||
          record.dimensions !== request.dimensions
        ) {
          return null;
        }
        const document = await this.resolveDocument(request.tenant, record.documentId);
        return document?.status === 'COMPLETED' &&
          document.deletedAt === null &&
          document.embeddingStatus === 'COMPLETED'
          ? record
          : null;
      }),
    );
    return eligible
      .filter((record): record is MemoryVector => record !== null)
      .filter(
        (record) =>
          (!request.filters?.documentTypes?.length ||
            request.filters.documentTypes.includes(record.documentType)) &&
          (!createdFrom || new Date(record.createdAt) >= createdFrom) &&
          (!createdTo || new Date(record.createdAt) <= createdTo),
      )
      .map((record) => ({
        ...this.stored(record),
        documentTitle: record.documentTitle,
        score: cosineSimilarity(request.vector, record.vector),
      }))
      .filter((record) => record.score >= request.minimumSimilarity)
      .sort((first, second) => second.score - first.score)
      .slice(0, request.topK);
  }

  async listByDocument(
    tenant: DocumentTenantContext,
    documentId: string,
    options: {
      embeddingModel?: string;
      embeddingVersion?: string;
    } = {},
  ) {
    assertDocumentTenantContext(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    return [...this.records.values()]
      .filter(
        (record) =>
          record.companyId === tenant.companyId &&
          record.documentId === documentId &&
          (!options.embeddingModel || record.embeddingModel === options.embeddingModel) &&
          (!options.embeddingVersion || record.embeddingVersion === options.embeddingVersion),
      )
      .map((record) => this.stored(record));
  }

  async deleteStale(
    tenant: DocumentTenantContext,
    documentId: string,
    activeChunkIds: ReadonlySet<string>,
    embeddingModel: string,
    embeddingVersion: string,
  ) {
    return this.deleteMatching(
      (record) =>
        record.companyId === tenant.companyId &&
        record.documentId === documentId &&
        record.embeddingModel === embeddingModel &&
        record.embeddingVersion === embeddingVersion &&
        !activeChunkIds.has(record.chunkId),
    );
  }

  async deleteOtherVersions(
    tenant: DocumentTenantContext,
    documentId: string,
    embeddingModel: string,
    embeddingVersion: string,
  ) {
    return this.deleteMatching(
      (record) =>
        record.companyId === tenant.companyId &&
        record.documentId === documentId &&
        (record.embeddingModel !== embeddingModel || record.embeddingVersion !== embeddingVersion),
    );
  }

  async deleteDocument(tenant: DocumentTenantContext, documentId: string) {
    return this.deleteMatching(
      (record) => record.companyId === tenant.companyId && record.documentId === documentId,
    );
  }

  async checkReadiness(expectation: {
    dimensions: number;
    embeddingModel: string;
    embeddingVersion: string;
  }) {
    const dimensionsCompatible = [...this.records.values()].every(
      (record) =>
        record.dimensions === record.vector.length &&
        (record.embeddingModel !== expectation.embeddingModel ||
          record.embeddingVersion !== expectation.embeddingVersion ||
          record.dimensions === expectation.dimensions),
    );
    return {
      ready: dimensionsCompatible,
      extension: true,
      storage: true,
      dimensionsCompatible,
    };
  }

  private validateSearch(request: VectorSearchRequest) {
    assertDocumentTenantContext(request.tenant);
    assertVector(request.vector, request.dimensions);
    assertScore(request.minimumSimilarity, 'minimumSimilarity');
    if (!Number.isSafeInteger(request.topK) || request.topK <= 0 || request.topK > 100) {
      throw new Error('topK must be an integer between 1 and 100.');
    }
  }

  private key(
    companyId: string,
    documentId: string,
    chunkId: string,
    model: string,
    version: string,
  ) {
    return [companyId, documentId, chunkId, model, version].join(':');
  }

  private stored(record: MemoryVector): StoredVectorRecord {
    return {
      documentId: record.documentId,
      chunkId: record.chunkId,
      chunkIndex: record.chunkIndex,
      contentHash: record.contentHash,
      contentPreview: record.contentPreview,
      pageStart: record.pageStart,
      pageEnd: record.pageEnd,
      sourceSegmentIndex: record.sourceSegmentIndex ?? null,
      extractionMethod: record.extractionMethod ?? null,
      sourceCoordinates: record.sourceCoordinates ?? null,
      provenanceConfidence: record.provenanceConfidence ?? null,
      provenanceVersion: record.provenanceVersion ?? null,
      embeddingModel: record.embeddingModel,
      embeddingVersion: record.embeddingVersion,
      dimensions: record.dimensions,
    };
  }

  private deleteMatching(predicate: (record: MemoryVector) => boolean) {
    let deleted = 0;
    for (const [key, record] of this.records) {
      if (predicate(record)) {
        this.records.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }
}

type DatabaseVectorRow = {
  documentId: string;
  chunkId: string;
  chunkIndex: number;
  contentHash: string;
  contentPreview: string;
  pageStart: number | null;
  pageEnd: number | null;
  sourceSegmentIndex: number | null;
  extractionMethod: string | null;
  sourceCoordinates: { x: number; y: number; width: number; height: number } | null;
  provenanceConfidence: number | null;
  provenanceVersion: string | null;
  embeddingModel: string;
  embeddingVersion: string;
  dimensions: number;
  documentTitle?: string;
  score?: number | string;
};

export class PostgreSQLVectorRepository implements VectorRepository {
  constructor(
    private readonly loadDatabase: VectorDatabaseLoader = async () =>
      (await getPrisma()) as VectorDatabaseClient | null,
  ) {}

  async upsert(tenant: DocumentTenantContext, records: readonly VectorRecord[]) {
    const database = await this.database(tenant);
    for (const record of records) {
      validateRecord(record);
      await database.$executeRawUnsafe(
        `INSERT INTO "DocumentChunkEmbedding" (
          "companyId", "documentId", "chunkId", "chunkIndex", "contentHash",
          "contentPreview", "pageStart", "pageEnd", "sourceSegmentIndex",
          "extractionMethod", "sourceCoordinates", "provenanceConfidence",
          "provenanceVersion", "embeddingModel", "embeddingVersion", "dimensions",
          "embedding", "createdAt", "updatedAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13,
          $14, $15, $16, $17::vector,
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT (
          "companyId", "documentId", "chunkId", "embeddingModel", "embeddingVersion"
        ) DO UPDATE SET
          "chunkIndex" = EXCLUDED."chunkIndex",
          "contentHash" = EXCLUDED."contentHash",
          "contentPreview" = EXCLUDED."contentPreview",
          "pageStart" = EXCLUDED."pageStart",
          "pageEnd" = EXCLUDED."pageEnd",
          "sourceSegmentIndex" = EXCLUDED."sourceSegmentIndex",
          "extractionMethod" = EXCLUDED."extractionMethod",
          "sourceCoordinates" = EXCLUDED."sourceCoordinates",
          "provenanceConfidence" = EXCLUDED."provenanceConfidence",
          "provenanceVersion" = EXCLUDED."provenanceVersion",
          "dimensions" = EXCLUDED."dimensions",
          "embedding" = EXCLUDED."embedding",
          "updatedAt" = CURRENT_TIMESTAMP`,
        tenant.companyId,
        record.documentId,
        record.chunkId,
        record.chunkIndex,
        record.contentHash,
        record.contentPreview,
        record.pageStart,
        record.pageEnd,
        record.sourceSegmentIndex ?? null,
        record.extractionMethod ?? null,
        record.sourceCoordinates ? JSON.stringify(record.sourceCoordinates) : null,
        record.provenanceConfidence ?? null,
        record.provenanceVersion ?? null,
        record.embeddingModel,
        record.embeddingVersion,
        record.dimensions,
        toVectorLiteral(record.vector),
      );
    }
  }

  async search(request: VectorSearchRequest) {
    assertDocumentTenantContext(request.tenant);
    assertVector(request.vector, request.dimensions);
    assertScore(request.minimumSimilarity, 'minimumSimilarity');
    if (!Number.isSafeInteger(request.topK) || request.topK <= 0 || request.topK > 100) {
      throw new Error('topK must be an integer between 1 and 100.');
    }
    const database = await this.database(request.tenant);
    const values: unknown[] = [
      toVectorLiteral(request.vector),
      request.tenant.companyId,
      request.embeddingModel,
      request.embeddingVersion,
      request.dimensions,
      request.minimumSimilarity,
      request.topK,
    ];
    const filters: string[] = [];
    const documentTypes = request.filters?.documentTypes ?? [];
    if (documentTypes.length > 0) {
      const placeholders = documentTypes.map((type) => {
        values.push(type);
        return `$${values.length}::"DocumentType"`;
      });
      filters.push(`d."detectedDocumentType" IN (${placeholders.join(', ')})`);
    }
    const createdFrom = parseDate(request.filters?.createdFrom, 'createdFrom');
    if (createdFrom) {
      values.push(createdFrom);
      filters.push(`d."createdAt" >= $${values.length}`);
    }
    const createdTo = parseDate(request.filters?.createdTo, 'createdTo');
    if (createdTo) {
      values.push(createdTo);
      filters.push(`d."createdAt" <= $${values.length}`);
    }
    const extraFilters = filters.length > 0 ? `AND ${filters.join(' AND ')}` : '';
    const rows = await database.$queryRawUnsafe<DatabaseVectorRow[]>(
      `SELECT
        e."documentId",
        e."chunkId",
        e."chunkIndex",
        e."contentHash",
        e."contentPreview",
        e."pageStart",
        e."pageEnd",
        e."sourceSegmentIndex",
        e."extractionMethod",
        e."sourceCoordinates",
        e."provenanceConfidence",
        e."provenanceVersion",
        e."embeddingModel",
        e."embeddingVersion",
        e."dimensions",
        d."originalName" AS "documentTitle",
        1 - (e."embedding" <=> $1::vector) AS "score"
      FROM "DocumentChunkEmbedding" e
      INNER JOIN "DocumentMetadata" d
        ON d."companyId" = e."companyId" AND d."id" = e."documentId"
      WHERE e."companyId" = $2
        AND e."embeddingModel" = $3
        AND e."embeddingVersion" = $4
        AND e."dimensions" = $5
        AND d."status" = 'COMPLETED'
        AND d."deletedAt" IS NULL
        AND d."embeddingStatus" = 'COMPLETED'
        AND 1 - (e."embedding" <=> $1::vector) >= $6
        ${extraFilters}
      ORDER BY e."embedding" <=> $1::vector
      LIMIT $7`,
      ...values,
    );
    return rows.map((row) => ({
      ...this.stored(row),
      documentTitle: row.documentTitle ?? '',
      score: Number(row.score ?? 0),
    }));
  }

  async listByDocument(
    tenant: DocumentTenantContext,
    documentId: string,
    options: {
      embeddingModel?: string;
      embeddingVersion?: string;
    } = {},
  ) {
    const database = await this.database(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    const values: unknown[] = [tenant.companyId, documentId];
    const filters: string[] = [];
    if (options.embeddingModel) {
      values.push(options.embeddingModel);
      filters.push(`"embeddingModel" = $${values.length}`);
    }
    if (options.embeddingVersion) {
      values.push(options.embeddingVersion);
      filters.push(`"embeddingVersion" = $${values.length}`);
    }
    const rows = await database.$queryRawUnsafe<DatabaseVectorRow[]>(
      `SELECT
        "documentId", "chunkId", "chunkIndex", "contentHash", "contentPreview",
        "pageStart", "pageEnd", "sourceSegmentIndex", "extractionMethod",
        "sourceCoordinates", "provenanceConfidence", "provenanceVersion",
        "embeddingModel", "embeddingVersion", "dimensions"
      FROM "DocumentChunkEmbedding"
      WHERE "companyId" = $1 AND "documentId" = $2
      ${filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''}
      ORDER BY "chunkIndex" ASC`,
      ...values,
    );
    return rows.map((row) => this.stored(row));
  }

  async deleteStale(
    tenant: DocumentTenantContext,
    documentId: string,
    activeChunkIds: ReadonlySet<string>,
    embeddingModel: string,
    embeddingVersion: string,
  ) {
    const current = await this.listByDocument(tenant, documentId, {
      embeddingModel,
      embeddingVersion,
    });
    let deleted = 0;
    const database = await this.database(tenant);
    for (const record of current) {
      if (activeChunkIds.has(record.chunkId)) continue;
      deleted += await database.$executeRawUnsafe(
        `DELETE FROM "DocumentChunkEmbedding"
         WHERE "companyId" = $1 AND "documentId" = $2 AND "chunkId" = $3
           AND "embeddingModel" = $4 AND "embeddingVersion" = $5`,
        tenant.companyId,
        documentId,
        record.chunkId,
        embeddingModel,
        embeddingVersion,
      );
    }
    return deleted;
  }

  async deleteOtherVersions(
    tenant: DocumentTenantContext,
    documentId: string,
    embeddingModel: string,
    embeddingVersion: string,
  ) {
    const database = await this.database(tenant);
    return database.$executeRawUnsafe(
      `DELETE FROM "DocumentChunkEmbedding"
       WHERE "companyId" = $1 AND "documentId" = $2
         AND ("embeddingModel" <> $3 OR "embeddingVersion" <> $4)`,
      tenant.companyId,
      documentId,
      embeddingModel,
      embeddingVersion,
    );
  }

  async deleteDocument(tenant: DocumentTenantContext, documentId: string) {
    const database = await this.database(tenant);
    assertSafeDocumentSegment(documentId, 'document id');
    return database.$executeRawUnsafe(
      `DELETE FROM "DocumentChunkEmbedding"
       WHERE "companyId" = $1 AND "documentId" = $2`,
      tenant.companyId,
      documentId,
    );
  }

  async checkReadiness(expectation: {
    dimensions: number;
    embeddingModel: string;
    embeddingVersion: string;
  }) {
    try {
      const database = await this.database();
      const rows = await database.$queryRawUnsafe<
        Array<{
          extension: boolean;
          storage: boolean;
          dimensionsCompatible: boolean;
        }>
      >(
        `SELECT
          EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS "extension",
          to_regclass('"DocumentChunkEmbedding"') IS NOT NULL AS "storage",
          NOT EXISTS (
            SELECT 1 FROM "DocumentChunkEmbedding"
            WHERE (
              "embeddingModel" = $2
              AND "embeddingVersion" = $3
              AND "dimensions" <> $1
            ) OR vector_dims("embedding") <> "dimensions"
          ) AS "dimensionsCompatible"`,
        expectation.dimensions,
        expectation.embeddingModel,
        expectation.embeddingVersion,
      );
      const result = rows[0] ?? {
        extension: false,
        storage: false,
        dimensionsCompatible: false,
      };
      return {
        ready: result.extension && result.storage && result.dimensionsCompatible,
        ...result,
      };
    } catch {
      return {
        ready: false,
        extension: false,
        storage: false,
        dimensionsCompatible: false,
      };
    }
  }

  private async database(tenant?: DocumentTenantContext) {
    if (tenant) assertDocumentTenantContext(tenant);
    const database = await this.loadDatabase();
    if (!database) throw new Error('PostgreSQL vector repository is unavailable.');
    return database;
  }

  private stored(row: DatabaseVectorRow): StoredVectorRecord {
    return {
      documentId: row.documentId,
      chunkId: row.chunkId,
      chunkIndex: row.chunkIndex,
      contentHash: row.contentHash,
      contentPreview: row.contentPreview,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      sourceSegmentIndex: row.sourceSegmentIndex,
      extractionMethod: row.extractionMethod,
      sourceCoordinates: row.sourceCoordinates,
      provenanceConfidence: row.provenanceConfidence,
      provenanceVersion: row.provenanceVersion,
      embeddingModel: row.embeddingModel,
      embeddingVersion: row.embeddingVersion,
      dimensions: row.dimensions,
    };
  }
}
