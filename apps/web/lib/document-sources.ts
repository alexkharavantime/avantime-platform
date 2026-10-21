import {
  CITATION_EXCERPT_MAXIMUM_CHARACTERS,
  citationExcerptBoundaryContext,
  formatCitationExcerpt,
} from './citation-excerpt';
import type { DocumentTenantContext, TextChunk } from './document-model';
import type { DocumentHistoryItem } from './document-repositories';
import { getDocumentServices, type DocumentServices } from './document-services';
import {
  PostgreSQLKnowledgeCitationResolver,
  type KnowledgeCitationResolver,
} from './knowledge-indexing';

export type DocumentSourceReference = {
  sourceType?: unknown;
  documentId?: unknown;
  articleId?: unknown;
  chunkId?: unknown;
};

export type ResolvedDocumentSource = {
  documentId: string;
  documentName: string;
  chunkId: string;
  snippet: string;
};

export async function resolveDocumentSources(
  tenant: DocumentTenantContext,
  references: DocumentSourceReference[],
  services: DocumentServices = getDocumentServices(),
): Promise<ResolvedDocumentSource[]> {
  const resolved: ResolvedDocumentSource[] = [];
  const seen = new Set<string>();

  for (const reference of references.slice(0, 6)) {
    if (
      typeof reference.documentId !== 'string' ||
      typeof reference.chunkId !== 'string' ||
      reference.documentId.length > 128 ||
      reference.chunkId.length > 128
    ) {
      continue;
    }

    const key = `${reference.documentId}:${reference.chunkId}`;
    if (seen.has(key)) continue;

    const document = await services.metadata.findById(tenant, reference.documentId);
    if (!document || document.status !== 'COMPLETED') continue;

    const chunks = await services.processing.readChunks(tenant, document.id);
    const chunk = chunks.find(
      (item) => item.id === reference.chunkId && typeof item.text === 'string',
    );
    if (!chunk) continue;

    seen.add(key);
    resolved.push({
      documentId: document.id,
      documentName: document.originalName,
      chunkId: chunk.id,
      snippet: chunk.text.slice(0, 4_000),
    });
  }

  return resolved;
}

export type ResolvedKnowledgeSource = {
  sourceType: 'DOCUMENT' | 'ARTICLE';
  sourceId: string;
  sourceTitle: string;
  documentId?: string;
  documentName?: string;
  articleId?: string;
  articleSlug?: string;
  chunkId: string;
  link: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  excerpt: string;
};

export async function resolveKnowledgeSources(
  tenant: DocumentTenantContext,
  references: DocumentSourceReference[],
  services: DocumentServices = getDocumentServices(),
  knowledge: KnowledgeCitationResolver = new PostgreSQLKnowledgeCitationResolver(),
): Promise<ResolvedKnowledgeSource[]> {
  const resolved: ResolvedKnowledgeSource[] = [];
  const seen = new Set<string>();

  for (const reference of references.slice(0, 6)) {
    if (reference.sourceType === 'ARTICLE') {
      if (
        typeof reference.articleId !== 'string' ||
        typeof reference.chunkId !== 'string' ||
        reference.articleId.length > 200 ||
        reference.chunkId !== `${reference.articleId}:article`
      ) {
        continue;
      }
      const article = await knowledge.resolve(reference.articleId, {
        kind: 'ORGANIZATION',
        companyId: tenant.companyId,
      });
      if (!article || article.chunkId !== reference.chunkId) continue;
      const key = `ARTICLE:${article.articleId}:${article.chunkId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      resolved.push({
        sourceType: 'ARTICLE',
        sourceId: article.articleId,
        sourceTitle: article.title,
        articleId: article.articleId,
        articleSlug: article.slug,
        chunkId: article.chunkId,
        link: `/portal/knowledge/${encodeURIComponent(article.slug)}`,
        excerpt: formatCitationExcerpt(article.excerpt, CITATION_EXCERPT_MAXIMUM_CHARACTERS, {
          before: '',
        }),
      });
      continue;
    }

    if (
      typeof reference.documentId !== 'string' ||
      typeof reference.chunkId !== 'string' ||
      reference.documentId.length > 128 ||
      reference.chunkId.length > 128
    ) {
      continue;
    }
    const key = `DOCUMENT:${reference.documentId}:${reference.chunkId}`;
    if (seen.has(key)) continue;
    const document = await services.metadata.findById(tenant, reference.documentId);
    if (!document || document.status !== 'COMPLETED' || document.deletedAt) continue;
    const chunks = await services.processing.readChunks(tenant, document.id);
    const chunk = chunks.find((item) => item.id === reference.chunkId);
    if (!chunk) continue;
    const fullText = await services.processing.readText(tenant, document.id).catch(() => null);
    seen.add(key);
    resolved.push({
      sourceType: 'DOCUMENT',
      sourceId: document.id,
      sourceTitle: document.originalName,
      documentId: document.id,
      documentName: document.originalName,
      chunkId: reference.chunkId,
      link: `/portal/documents/${encodeURIComponent(document.id)}?chunk=${encodeURIComponent(reference.chunkId)}`,
      pageStart: chunk.pageStart ?? null,
      pageEnd: chunk.pageEnd ?? null,
      excerpt: formatCitationExcerpt(
        chunk.text,
        CITATION_EXCERPT_MAXIMUM_CHARACTERS,
        citationExcerptBoundaryContext(fullText, chunk),
      ),
    });
  }

  return resolved;
}

// Rebuilds display excerpts of saved document sources from the tenant's current chunks.
export async function refreshHistorySourceExcerpts(
  tenant: DocumentTenantContext,
  history: DocumentHistoryItem[],
  services: DocumentServices = getDocumentServices(),
): Promise<DocumentHistoryItem[]> {
  const documents = new Map<
    string,
    Promise<{ chunks: TextChunk[]; fullText: string | null } | null>
  >();
  const loadDocument = (documentId: string) => {
    if (!documents.has(documentId)) {
      documents.set(
        documentId,
        (async () => {
          const document = await services.metadata.findById(tenant, documentId);
          if (!document || document.status !== 'COMPLETED' || document.deletedAt) return null;
          const [chunks, fullText] = await Promise.all([
            services.processing.readChunks(tenant, document.id),
            services.processing.readText(tenant, document.id).catch(() => null),
          ]);
          return { chunks, fullText };
        })().catch(() => null),
      );
    }
    return documents.get(documentId)!;
  };

  return Promise.all(
    history.map(async (item) => ({
      ...item,
      sources: await Promise.all(
        item.sources.map(async (source) => {
          if (
            source.sourceType === 'ARTICLE' ||
            typeof source.documentId !== 'string' ||
            typeof source.chunkId !== 'string'
          ) {
            return source;
          }
          const loaded = await loadDocument(source.documentId);
          const chunk = loaded?.chunks.find((candidate) => candidate.id === source.chunkId);
          if (!loaded || !chunk) return source;
          const excerpt = formatCitationExcerpt(
            chunk.text,
            CITATION_EXCERPT_MAXIMUM_CHARACTERS,
            citationExcerptBoundaryContext(loaded.fullText, chunk),
          );
          return excerpt ? { ...source, excerpt } : source;
        }),
      ),
    })),
  );
}
