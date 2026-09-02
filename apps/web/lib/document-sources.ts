import type { DocumentTenantContext } from './document-model';
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
    if (!chunks.some((item) => item.id === reference.chunkId)) continue;
    seen.add(key);
    resolved.push({
      sourceType: 'DOCUMENT',
      sourceId: document.id,
      sourceTitle: document.originalName,
      documentId: document.id,
      documentName: document.originalName,
      chunkId: reference.chunkId,
      link: `/portal/documents/${encodeURIComponent(document.id)}?chunk=${encodeURIComponent(reference.chunkId)}`,
    });
  }

  return resolved;
}
