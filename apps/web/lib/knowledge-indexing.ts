import { createHash } from 'node:crypto';

import { getPrisma } from '@avantime/database';

import type { RedisCommandClient } from './redis-lease-queue';
import { stagingRedisKey } from './staging-redis';

export type KnowledgeIndexAudience =
  { kind: 'PUBLIC' } | { kind: 'ORGANIZATION'; companyId: string } | { kind: 'PLATFORM' };

export type KnowledgeIndexDocument = {
  articleId: string;
  sourceVersion: number;
  generation: number;
  ownerScope: 'PLATFORM' | 'ORGANIZATION' | 'SYSTEM' | 'LEGACY_UNCLASSIFIED';
  companyId: string | null;
  visibility: 'PRIVATE' | 'ORGANIZATION' | 'PLATFORM' | 'PUBLIC';
  lifecycleStatus: 'DRAFT' | 'REVIEW' | 'PUBLISHED' | 'ARCHIVED';
  title: string;
  summary: string;
  tags: string[];
  searchText: string;
};

function tenantKey(document: Pick<KnowledgeIndexDocument, 'ownerScope' | 'companyId'>) {
  return document.ownerScope === 'ORGANIZATION' ? (document.companyId ?? 'invalid') : 'platform';
}

function assertVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('KNOWLEDGE_VERSION_INVALID');
}

export function canReadKnowledgeIndex(
  document: Pick<
    KnowledgeIndexDocument,
    'ownerScope' | 'companyId' | 'visibility' | 'lifecycleStatus'
  >,
  audience: KnowledgeIndexAudience,
) {
  if (document.lifecycleStatus !== 'PUBLISHED' || document.visibility === 'PRIVATE') return false;
  if (audience.kind === 'PLATFORM') return document.ownerScope === 'PLATFORM';
  if (audience.kind === 'PUBLIC') return document.visibility === 'PUBLIC';
  return (
    (document.ownerScope === 'ORGANIZATION' &&
      document.companyId === audience.companyId &&
      ['ORGANIZATION', 'PUBLIC'].includes(document.visibility)) ||
    (document.ownerScope === 'PLATFORM' && ['PLATFORM', 'PUBLIC'].includes(document.visibility))
  );
}

export class RedisKnowledgeCacheAdapter {
  constructor(
    private readonly client: RedisCommandClient,
    private readonly namespace: string,
    private readonly ttlSeconds: number,
  ) {}

  key(
    document: Pick<
      KnowledgeIndexDocument,
      'articleId' | 'sourceVersion' | 'ownerScope' | 'companyId'
    >,
  ) {
    assertVersion(document.sourceVersion);
    return stagingRedisKey({
      namespace: this.namespace,
      area: 'cache',
      tenantId: tenantKey(document),
      resource: `knowledge-${document.articleId}-v${document.sourceVersion}`,
    });
  }

  async put(document: KnowledgeIndexDocument) {
    const value = JSON.stringify({
      articleId: document.articleId,
      sourceVersion: document.sourceVersion,
      ownerScope: document.ownerScope,
      companyId: document.companyId,
      visibility: document.visibility,
      lifecycleStatus: document.lifecycleStatus,
    });
    await this.client.sendCommand([
      'SET',
      this.key(document),
      value,
      'EX',
      String(this.ttlSeconds),
    ]);
  }

  async get(
    document: Pick<
      KnowledgeIndexDocument,
      'articleId' | 'sourceVersion' | 'ownerScope' | 'companyId'
    >,
  ) {
    const raw = await this.client.sendCommand(['GET', this.key(document)]);
    if (typeof raw !== 'string') return null;
    const parsed = JSON.parse(raw) as { articleId?: unknown; sourceVersion?: unknown };
    if (
      parsed.articleId !== document.articleId ||
      parsed.sourceVersion !== document.sourceVersion
    ) {
      await this.client.sendCommand(['DEL', this.key(document)]);
      return null;
    }
    return parsed;
  }

  async invalidate(input: {
    articleId: string;
    ownerScope: KnowledgeIndexDocument['ownerScope'];
    companyId: string | null;
  }) {
    const prefix = stagingRedisKey({
      namespace: this.namespace,
      area: 'cache',
      tenantId: tenantKey(input),
      resource: `knowledge-${input.articleId}-versions`,
    });
    const pattern = `${prefix.slice(0, -'versions'.length)}v*`;
    let cursor = '0';
    let scanned = 0;
    do {
      const response = await this.client.sendCommand([
        'SCAN',
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        '100',
      ]);
      if (!Array.isArray(response) || response.length !== 2 || !Array.isArray(response[1])) {
        throw new Error('KNOWLEDGE_CACHE_SCAN_INVALID');
      }
      cursor = String(response[0]);
      const keys = response[1].map(String);
      if (keys.length > 0) await this.client.sendCommand(['DEL', ...keys]);
      scanned += keys.length;
      if (scanned > 1_000) throw new Error('KNOWLEDGE_CACHE_INVALIDATION_BOUNDED');
    } while (cursor !== '0');
    return scanned;
  }
}

export class PostgreSQLKnowledgeSearchAdapter {
  async upsert(document: KnowledgeIndexDocument) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('KNOWLEDGE_SEARCH_DATABASE_UNAVAILABLE');
    await prisma.$executeRaw`
      INSERT INTO "KnowledgeSearchIndex" (
        "articleId", "sourceVersion", "generation", "ownerScope", "companyId",
        "visibility", "lifecycleStatus", "title", "summary", "tags", "searchText",
        "operationalStatus", "indexedAt", "updatedAt"
      ) VALUES (
        ${document.articleId}, ${document.sourceVersion}, ${document.generation},
        ${document.ownerScope}::"KnowledgeOwnerScope", ${document.companyId},
        ${document.visibility}::"KnowledgeVisibility", ${document.lifecycleStatus}::"ArticleStatus",
        ${document.title}, ${document.summary}, ${document.tags}, ${document.searchText},
        'READY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("articleId") DO UPDATE SET
        "sourceVersion" = EXCLUDED."sourceVersion", "generation" = EXCLUDED."generation",
        "ownerScope" = EXCLUDED."ownerScope", "companyId" = EXCLUDED."companyId",
        "visibility" = EXCLUDED."visibility", "lifecycleStatus" = EXCLUDED."lifecycleStatus",
        "title" = EXCLUDED."title", "summary" = EXCLUDED."summary", "tags" = EXCLUDED."tags",
        "searchText" = EXCLUDED."searchText", "operationalStatus" = 'READY',
        "indexedAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP
      WHERE "KnowledgeSearchIndex"."sourceVersion" <= EXCLUDED."sourceVersion"
    `;
  }

  async remove(articleId: string, maximumVersion: number) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('KNOWLEDGE_SEARCH_DATABASE_UNAVAILABLE');
    return prisma.knowledgeSearchIndex.deleteMany({
      where: { articleId, sourceVersion: { lte: maximumVersion } },
    });
  }

  async search(query: string, audience: KnowledgeIndexAudience) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('KNOWLEDGE_SEARCH_DATABASE_UNAVAILABLE');
    const rows = (await prisma.$queryRaw`
      SELECT index.*
      FROM "KnowledgeSearchIndex" index
      JOIN "KnowledgeArticle" article ON article."id" = index."articleId"
      WHERE article."version" = index."sourceVersion"
        AND article."quarantinedAt" IS NULL
        AND index."lifecycleStatus" = 'PUBLISHED'
        AND index."visibility" <> 'PRIVATE'
        AND to_tsvector('simple', index."searchText") @@ plainto_tsquery('simple', ${query})
      ORDER BY ts_rank(
        to_tsvector('simple', index."searchText"), plainto_tsquery('simple', ${query})
      ) DESC
      LIMIT 50
    `) as KnowledgeIndexDocument[];
    return rows.filter((row) => canReadKnowledgeIndex(row, audience));
  }
}
export type KnowledgeVectorSearchResult = Pick<
  KnowledgeIndexDocument,
  | 'articleId'
  | 'sourceVersion'
  | 'generation'
  | 'ownerScope'
  | 'companyId'
  | 'visibility'
  | 'lifecycleStatus'
  | 'title'
  | 'summary'
  | 'tags'
> & {
  score: number;
};
export type KnowledgeVectorSearchRequest = {
  audience: KnowledgeIndexAudience;
  vector: number[];
  embeddingModel: string;
  embeddingVersion: string;
  topK: number;
  minimumSimilarity: number;
};


export class PostgreSQLKnowledgeVectorAdapter {
  async upsert(input: {
    document: KnowledgeIndexDocument;
    vector: number[];
    model: string;
    embeddingVersion: string;
  }) {
    if (input.vector.length === 0 || input.vector.some((value) => !Number.isFinite(value))) {
      throw new Error('KNOWLEDGE_VECTOR_INVALID');
    }
    const prisma = await getPrisma();
    if (!prisma) throw new Error('KNOWLEDGE_VECTOR_DATABASE_UNAVAILABLE');
    const vector = `[${input.vector.join(',')}]`;
    const contentHash = createHash('sha256').update(input.document.searchText).digest('hex');
    await prisma.$executeRaw`
      INSERT INTO "KnowledgeVectorIndex" (
        "articleId", "sourceVersion", "generation", "ownerScope", "companyId",
        "visibility", "lifecycleStatus", "contentHash", "embeddingModel",
        "embeddingVersion", "embedding", "operationalStatus", "indexedAt", "updatedAt"
      ) VALUES (
        ${input.document.articleId}, ${input.document.sourceVersion}, ${input.document.generation},
        ${input.document.ownerScope}::"KnowledgeOwnerScope", ${input.document.companyId},
        ${input.document.visibility}::"KnowledgeVisibility",
        ${input.document.lifecycleStatus}::"ArticleStatus", ${contentHash}, ${input.model},
        ${input.embeddingVersion}, ${vector}::vector, 'READY', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT ("articleId") DO UPDATE SET
        "sourceVersion" = EXCLUDED."sourceVersion", "generation" = EXCLUDED."generation",
        "ownerScope" = EXCLUDED."ownerScope", "companyId" = EXCLUDED."companyId",
        "visibility" = EXCLUDED."visibility", "lifecycleStatus" = EXCLUDED."lifecycleStatus",
        "contentHash" = EXCLUDED."contentHash", "embeddingModel" = EXCLUDED."embeddingModel",
        "embeddingVersion" = EXCLUDED."embeddingVersion", "embedding" = EXCLUDED."embedding",
        "operationalStatus" = 'READY', "indexedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "KnowledgeVectorIndex"."sourceVersion" <= EXCLUDED."sourceVersion"
    `;
  }

  async search(
  request: KnowledgeVectorSearchRequest,
): Promise<KnowledgeVectorSearchResult[]> {
  if (
    request.vector.length === 0 ||
    request.vector.some((value) => !Number.isFinite(value))
  ) {
    throw new Error('KNOWLEDGE_VECTOR_INVALID');
  }

  if (
    !Number.isInteger(request.topK) ||
    request.topK <= 0 ||
    !Number.isFinite(request.minimumSimilarity)
  ) {
    throw new Error('KNOWLEDGE_VECTOR_SEARCH_INVALID');
  }

  const prisma = await getPrisma();
  if (!prisma) {
    throw new Error('KNOWLEDGE_VECTOR_DATABASE_UNAVAILABLE');
  }

  const vector = `[${request.vector.join(',')}]`;

  const audienceClause =
    request.audience.kind === 'PLATFORM'
      ? `v."ownerScope" = 'PLATFORM'`
      : request.audience.kind === 'PUBLIC'
        ? `v."visibility" = 'PUBLIC'`
        : `(
            (
              v."ownerScope" = 'ORGANIZATION'
              AND v."companyId" = $5
              AND v."visibility" IN ('ORGANIZATION', 'PUBLIC')
            )
            OR
            (
              v."ownerScope" = 'PLATFORM'
              AND v."visibility" IN ('PLATFORM', 'PUBLIC')
            )
          )`;

  const values: unknown[] = [
    vector,
    request.embeddingModel,
    request.embeddingVersion,
    request.minimumSimilarity,
  ];

  if (request.audience.kind === 'ORGANIZATION') {
    values.push(request.audience.companyId);
  }

  values.push(request.topK);

  const limitParameter = `$${values.length}`;

  const rows = (await prisma.$queryRawUnsafe(
    `
      SELECT
        v."articleId",
        v."sourceVersion",
        v."generation",
        v."ownerScope",
        v."companyId",
        v."visibility",
        v."lifecycleStatus",
        a."title",
        a."summary",
        a."tags",
        1 - (v."embedding" <=> $1::vector) AS "score"
      FROM "KnowledgeVectorIndex" v
      INNER JOIN "KnowledgeArticle" a
        ON a."id" = v."articleId"
       AND a."version" = v."sourceVersion"
      WHERE
        v."embeddingModel" = $2
        AND v."embeddingVersion" = $3
        AND v."operationalStatus" = 'READY'
        AND v."lifecycleStatus" = 'PUBLISHED'
        AND v."visibility" <> 'PRIVATE'
        AND a."status" = 'PUBLISHED'
        AND a."quarantinedAt" IS NULL
        AND ${audienceClause}
        AND 1 - (v."embedding" <=> $1::vector) >= $4
      ORDER BY
        v."embedding" <=> $1::vector,
        v."articleId" ASC
      LIMIT ${limitParameter}
    `,
    ...values,
  )) as KnowledgeVectorSearchResult[];

  return rows.filter((row) =>
    canReadKnowledgeIndex(row, request.audience),
  );
}

  async remove(articleId: string, maximumVersion: number) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('KNOWLEDGE_VECTOR_DATABASE_UNAVAILABLE');
    return prisma.knowledgeVectorIndex.deleteMany({
      where: { articleId, sourceVersion: { lte: maximumVersion } },
    });
  }

  async getForAudience(articleId: string, audience: KnowledgeIndexAudience) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('KNOWLEDGE_VECTOR_DATABASE_UNAVAILABLE');
    const row = await prisma.knowledgeVectorIndex.findUnique({ where: { articleId } });
    if (!row) return null;
    const article = await prisma.knowledgeArticle.findUnique({
      where: { id: articleId },
      select: { version: true, quarantinedAt: true },
    });
    if (!article || article.quarantinedAt || article.version !== row.sourceVersion) return null;
    return canReadKnowledgeIndex(row, audience) ? row : null;
  }
}

export function knowledgeDocumentFromArticle(article: {
  id: string;
  version: number;
  ownerScope: KnowledgeIndexDocument['ownerScope'];
  companyId: string | null;
  visibility: KnowledgeIndexDocument['visibility'];
  status: KnowledgeIndexDocument['lifecycleStatus'];
  title: string;
  summary: string;
  tags: string[];
  content: unknown;
}): KnowledgeIndexDocument {
  const content = JSON.stringify(article.content);
  return {
    articleId: article.id,
    sourceVersion: article.version,
    generation: article.version,
    ownerScope: article.ownerScope,
    companyId: article.companyId,
    visibility: article.visibility,
    lifecycleStatus: article.status,
    title: article.title,
    summary: article.summary,
    tags: article.tags,
    searchText: `${article.title}\n${article.summary}\n${article.tags.join(' ')}\n${content}`,
  };
}
