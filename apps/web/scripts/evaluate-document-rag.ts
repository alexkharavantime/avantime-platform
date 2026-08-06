import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import dataset from '../tests/fixtures/rag-evaluation.json';
import { enqueueDocumentEmbedding } from '../lib/document-embedding';
import { loadDocumentConfiguration } from '../lib/document-configuration';
import { createDocumentServices } from '../lib/document-services';
import { loadRagConfiguration } from '../lib/rag-configuration';

async function main() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-rag-evaluation-'));
  const environment = {
    NODE_ENV: 'test',
    DOCUMENT_DATA_DIR: dataDirectory,
    DOCUMENT_EMBEDDING_DRIVER: 'fake',
    DOCUMENT_EMBEDDING_MODEL: 'deterministic-evaluation-v1',
    DOCUMENT_EMBEDDING_DIMENSIONS: '64',
    DOCUMENT_EMBEDDING_VERSION: 'evaluation-v1',
    DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'local',
    DOCUMENT_VECTOR_DRIVER: 'memory',
    RAG_ANSWER_DRIVER: 'fake',
    HYBRID_TOP_K: '3',
    HYBRID_MAX_CHUNKS_PER_DOCUMENT: '2',
    HYBRID_MIN_SCORE: '0.20',
    SEMANTIC_SIMILARITY_THRESHOLD: '0.25',
    AI_RATE_LIMIT_PER_MINUTE: '1000',
  };
  const services = createDocumentServices(loadDocumentConfiguration(environment), {
    ragConfiguration: loadRagConfiguration(environment),
  });
  if (!services.rag) throw new Error('Evaluation RAG services are unavailable.');
  try {
    for (const document of dataset.documents) {
      const tenant = {
        companyId: document.tenantId,
        userId: 'evaluation-admin',
      };
      const now = new Date().toISOString();
      const chunks = document.chunks.map((chunk, index) => ({
        id: chunk.id,
        index,
        text: chunk.text,
        start: 0,
        end: chunk.text.length,
      }));
      await services.metadata.create(tenant, {
        id: document.id,
        status: 'COMPLETED',
        originalName: document.title,
        storedName: `${document.id}.pdf`,
        mimeType: 'application/pdf',
        size: chunks.reduce((total, chunk) => total + chunk.text.length, 0),
        checksum: 'e'.repeat(64),
        createdAt: now,
        updatedAt: now,
        processingCompletedAt: now,
        pages: 1,
        textLength: chunks.reduce((total, chunk) => total + chunk.text.length, 0),
        chunksCount: chunks.length,
        requiresManualReview: false,
      });
      await services.processing.save(tenant, document.id, {
        text: chunks.map((chunk) => chunk.text).join('\n'),
        chunks,
      });
      await enqueueDocumentEmbedding(tenant, document.id, services.rag.embedding);
      const indexed = await services.rag
        .createEmbeddingWorker()
        .runOnce(tenant, `evaluation-worker-${document.tenantId}`);
      if (!['COMPLETED', 'UP_TO_DATE'].includes(indexed.outcome)) {
        throw new Error(`Evaluation document ${document.id} was not indexed.`);
      }
    }

    let recall = 0;
    let reciprocalRank = 0;
    let relevantCases = 0;
    let citationRelevant = 0;
    let citationTotal = 0;
    let noAnswerCorrect = 0;
    let noAnswerCases = 0;
    let tenantLeakageCount = 0;

    for (const evaluationCase of dataset.cases) {
      const tenant = {
        companyId: evaluationCase.tenantId,
        userId: 'evaluation-admin',
      };
      const results = await services.rag.hybrid.retrieve({
        tenant,
        query: evaluationCase.question,
        correlationId: `evaluation-${evaluationCase.id}`,
      });
      const expected = new Set(evaluationCase.expectedChunkIds);
      const forbidden = new Set(
        'forbiddenDocumentIds' in evaluationCase ? (evaluationCase.forbiddenDocumentIds ?? []) : [],
      );
      tenantLeakageCount += results.filter(
        (result) =>
          result.sourceType === 'DOCUMENT' &&
          typeof result.documentId === 'string' &&
          forbidden.has(result.documentId),
        ).length;
      if (expected.size > 0) {
        relevantCases += 1;
        const found = new Set(
          results.map((result) => result.chunkId).filter((chunkId) => expected.has(chunkId)),
        );
        recall += found.size / expected.size;
        const firstRelevant = results.findIndex((result) => expected.has(result.chunkId));
        reciprocalRank += firstRelevant >= 0 ? 1 / (firstRelevant + 1) : 0;
      }
      const answer = await services.rag.answers.answer({
        tenant,
        question: evaluationCase.question,
        correlationId: `evaluation-answer-${evaluationCase.id}`,
      });
      if (evaluationCase.expectNoAnswer) {
        noAnswerCases += 1;
        if (answer.status === 'no_answer') noAnswerCorrect += 1;
      } else {
        for (const citation of answer.citations) {
          citationTotal += 1;
          if (expected.has(citation.chunkId)) citationRelevant += 1;
        }
      }
    }

    const metrics = {
      cases: dataset.cases.length,
      recallAtK: relevantCases > 0 ? recall / relevantCases : 1,
      meanReciprocalRank: relevantCases > 0 ? reciprocalRank / relevantCases : 1,
      citationPrecision: citationTotal > 0 ? citationRelevant / citationTotal : 0,
      noAnswerCorrectness: noAnswerCases > 0 ? noAnswerCorrect / noAnswerCases : 1,
      tenantLeakageCount,
    };
    console.info(JSON.stringify(metrics));
    if (
      metrics.recallAtK < 0.8 ||
      metrics.meanReciprocalRank < 0.7 ||
      metrics.citationPrecision < 0.8 ||
      metrics.noAnswerCorrectness < 1 ||
      metrics.tenantLeakageCount !== 0
    ) {
      process.exitCode = 1;
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
}

void main().catch(() => {
  console.error('Document RAG evaluation failed.');
  process.exitCode = 1;
});
