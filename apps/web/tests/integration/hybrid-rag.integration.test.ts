import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { enqueueDocumentEmbedding, planDocumentReindex } from '../../lib/document-embedding';
import { loadDocumentConfiguration } from '../../lib/document-configuration';
import type { DocumentTenantContext, TextChunk } from '../../lib/document-model';
import { LocalDocumentProcessingQueue } from '../../lib/document-processing-queue';
import { createDocumentServices } from '../../lib/document-services';
import { loadRagConfiguration } from '../../lib/rag-configuration';
import type { VectorDatabaseClient } from '../../lib/vector-repository';
import { integrationDatabase, integrationTenant } from './integration-test-environment';

function chunks(documentId: string, texts: readonly string[]): TextChunk[] {
  return texts.map((text, index) => ({
    id: `${documentId}-chunk-${index}`,
    index,
    text,
    start: 0,
    end: text.length,
  }));
}

async function addDocument(
  services: ReturnType<typeof createDocumentServices>,
  tenant: DocumentTenantContext,
  documentId: string,
  texts: readonly string[],
) {
  const now = new Date().toISOString();
  const documentChunks = chunks(documentId, texts);
  await services.metadata.create(tenant, {
    id: documentId,
    status: 'COMPLETED',
    originalName: `${documentId}.pdf`,
    storedName: `${documentId}.pdf`,
    mimeType: 'application/pdf',
    size: texts.join('').length,
    checksum: 'c'.repeat(64),
    createdAt: now,
    updatedAt: now,
    processingCompletedAt: now,
    pages: 1,
    textLength: texts.join('\n').length,
    chunksCount: documentChunks.length,
    detectedDocumentType: 'REPORT',
    requiresManualReview: false,
  });
  await services.processing.save(tenant, documentId, {
    text: texts.join('\n'),
    chunks: documentChunks,
  });
}

test('pgvector embedding worker, hybrid retrieval, citations and reindex work end to end', async () => {
  const database = await integrationDatabase();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-rag-integration-'));
  const tenantA = integrationTenant('rag-a');
  const tenantB = integrationTenant('rag-b');
  const documentA = `rag-a-${crypto.randomUUID()}`;
  const documentB = `rag-b-${crypto.randomUUID()}`;
  const configuration = {
    ...loadDocumentConfiguration(),
    dataDirectory,
  };
  const ragConfiguration = {
    ...loadRagConfiguration(),
    dataDirectory,
  };
  const services = createDocumentServices(configuration, {
    loadDatabase: async () => database,
    processingQueue: new LocalDocumentProcessingQueue(dataDirectory),
    ragConfiguration,
    rag: {
      loadDatabase: async () => database as unknown as VectorDatabaseClient,
    },
  });

  try {
    assert.ok(services.rag);
    const extension = await database.$queryRawUnsafe<Array<{ installed: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) AS "installed"`,
    );
    assert.equal(extension[0]?.installed, true);

    await addDocument(services, tenantA, documentA, [
      'Avantime cloud automation reduces manual accounting work.',
      'Hybrid retrieval combines lexical and semantic evidence.',
    ]);
    await addDocument(services, tenantB, documentB, [
      'Avantime cloud automation private tenant B information.',
    ]);
    for (const [tenant, documentId] of [
      [tenantA, documentA],
      [tenantB, documentB],
    ] as const) {
      await enqueueDocumentEmbedding(tenant, documentId, services.rag.embedding);
      const result = await services.rag
        .createEmbeddingWorker()
        .runOnce(tenant, `integration-${tenant.companyId}`);
      assert.equal(result.outcome, 'COMPLETED');
    }

    const storedA = await services.rag.vectors.listByDocument(tenantA, documentA);
    assert.equal(storedA.length, 2);
    assert.equal((await services.rag.vectors.listByDocument(tenantA, documentB)).length, 0);

    const semantic = await services.rag.semantic.retrieve({
      tenant: tenantA,
      query: 'cloud automation accounting',
      correlationId: 'integration-semantic',
    });
    assert.ok(semantic.some((result) => result.documentId === documentA));
    assert.equal(
      semantic.some((result) => result.documentId === documentB),
      false,
    );

    const hybrid = await services.rag.hybrid.retrieve({
      tenant: tenantA,
      query: 'hybrid lexical semantic retrieval',
      correlationId: 'integration-hybrid',
    });
    assert.ok(hybrid.length > 0);
    assert.equal(hybrid[0].documentId, documentA);
    assert.ok(hybrid[0].scoreComponents.lexical >= 0);
    assert.ok(hybrid[0].scoreComponents.semantic >= 0);

    const answer = await services.rag.answers.answer({
      tenant: tenantA,
      question: 'How does hybrid retrieval work?',
      correlationId: 'integration-rag-answer',
    });
    assert.equal(answer.status, 'answered');
    assert.ok(answer.citations.length > 0);
    assert.ok(answer.citations.every((citation) => citation.documentId === documentA));
    assert.match(answer.citations[0].link, /^\/portal\/documents\//);

    const currentPlan = await planDocumentReindex(tenantA, documentA, true, services.rag.embedding);
    assert.equal(currentPlan.outcome, 'UP_TO_DATE');
    await services.processing.save(tenantA, documentA, {
      text: 'Changed reindex content.',
      chunks: chunks(documentA, ['Changed reindex content.']),
    });
    const changedPlan = await planDocumentReindex(tenantA, documentA, true, services.rag.embedding);
    assert.equal(changedPlan.outcome, 'WOULD_REINDEX');
    assert.equal(changedPlan.changedChunks, 1);
    assert.equal(changedPlan.staleVectors, 1);
    assert.equal(
      (await planDocumentReindex(tenantA, documentA, false, services.rag.embedding)).outcome,
      'QUEUED',
    );
    assert.equal(
      (await services.rag.createEmbeddingWorker().runOnce(tenantA, 'integration-reindex-worker'))
        .outcome,
      'COMPLETED',
    );
    assert.equal((await services.rag.vectors.listByDocument(tenantA, documentA)).length, 1);

    const readiness = await services.rag.vectors.checkReadiness({
      dimensions: ragConfiguration.embedding.dimensions,
      embeddingModel: ragConfiguration.embedding.model,
      embeddingVersion: ragConfiguration.embedding.version,
    });
    assert.deepEqual(readiness, {
      ready: true,
      extension: true,
      storage: true,
      dimensionsCompatible: true,
    });
  } finally {
    await services.processing.delete(tenantA, documentA);
    await services.processing.delete(tenantB, documentB);
    await database.documentMetadata.deleteMany({
      where: {
        companyId: {
          in: [tenantA.companyId, tenantB.companyId],
        },
      },
    });
    await rm(dataDirectory, { recursive: true, force: true });
    await database.$disconnect();
  }
});
