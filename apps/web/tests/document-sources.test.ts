import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveKnowledgeSources } from '../lib/document-sources';
import type { DocumentServices } from '../lib/document-services';

const tenant = { companyId: 'sources-tenant', userId: 'sources-user' };

test('saved history keeps every cited source up to the retrieval top-K', async () => {
  const chunks = Array.from({ length: 14 }, (_, index) => ({
    id: `chunk-${index + 1}`,
    index,
    text: `Фрагмент номер ${index + 1}.`,
    start: 0,
    end: 0,
    pageStart: index + 1,
    pageEnd: index + 1,
  }));
  const services = {
    metadata: {
      findById: async () => ({
        id: 'document-1',
        originalName: 'document.pdf',
        status: 'COMPLETED',
        deletedAt: null,
      }),
    },
    processing: {
      readChunks: async () => chunks,
      readText: async () => null,
    },
  } as unknown as DocumentServices;

  const resolved = await resolveKnowledgeSources(
    tenant,
    chunks.map((chunk) => ({ sourceType: 'DOCUMENT', documentId: 'document-1', chunkId: chunk.id })),
    services,
  );

  assert.equal(resolved.length, 12);
  assert.equal(resolved[8]?.chunkId, 'chunk-9');
  assert.equal(resolved[8]?.pageStart, 9);
});
