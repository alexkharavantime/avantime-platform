import type { DocumentTenantContext } from './document-model';
import { getDocumentServices, type DocumentServices } from './document-services';

export type DocumentSourceReference = {
  documentId?: unknown;
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
