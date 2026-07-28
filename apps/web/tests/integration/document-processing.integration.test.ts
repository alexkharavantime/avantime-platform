import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadDocumentConfiguration } from '../../lib/document-configuration';
import { checkDocumentReadiness } from '../../lib/document-health';
import type { TextChunk } from '../../lib/document-model';
import { LocalDocumentProcessingQueue } from '../../lib/document-processing-queue';
import { extractPdfText } from '../../lib/pdf-extractor';
import {
  cleanupDeletedDocuments,
  createDocumentProcessingWorker,
  createDocumentServices,
  deleteDocument,
  enqueueUploadedDocument,
} from '../../lib/document-services';
import { calculateDocumentChecksum } from '../../lib/document-storage';
import {
  integrationDatabase,
  integrationMetadata,
  integrationTenant,
} from './integration-test-environment';

function createPdf(text: string) {
  const escaped = text.replace(/([\\()])/g, '\\$1');
  const stream = `BT /F1 18 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'ascii');
}

test('document pipeline integrates PostgreSQL, MinIO and the local queue', async () => {
  const database = await integrationDatabase();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-integration-queue-'));
  const tenantA = integrationTenant('pipeline-a');
  const tenantB = integrationTenant('pipeline-b');
  const configuration = {
    ...loadDocumentConfiguration(),
    dataDirectory,
  };
  const services = createDocumentServices(configuration, {
    loadDatabase: async () => database,
    processingQueue: new LocalDocumentProcessingQueue(dataDirectory),
  });
  const documentId = `document-${crypto.randomUUID()}`;
  const storedName = `${documentId}.pdf`;
  const pdf = createPdf('Avantime integration pipeline');
  const checksum = calculateDocumentChecksum(pdf);

  try {
    const readiness = await checkDocumentReadiness({
      loadConfiguration: () => configuration,
      loadWorkerConfiguration: () => ({
        tenantId: tenantA.companyId,
        workerId: 'integration-pipeline-worker',
      }),
      loadServices: () => services,
    });
    assert.equal(readiness.status, 'ready');

    await services.storage.write(tenantA, 'original', storedName, pdf, {
      checksum,
      contentType: 'application/pdf',
    });
    await services.metadata.create(tenantA, integrationMetadata(documentId, checksum));
    const queued = await enqueueUploadedDocument(tenantA, documentId, services);
    assert.equal(queued?.document.status, 'QUEUED');

    const observedStatuses: string[] = [];
    const worker = createDocumentProcessingWorker(services, {
      extractor: async (buffer) => {
        observedStatuses.push(
          (await services.metadata.findById(tenantA, documentId))?.status ?? 'MISSING',
        );
        return extractPdfText(buffer);
      },
    });
    const result = await worker.runOnce(tenantA, 'integration-pipeline-worker');
    assert.equal(result.outcome, 'COMPLETED');
    assert.deepEqual(observedStatuses, ['PROCESSING']);

    const completed = await services.metadata.findById(tenantA, documentId);
    assert.equal(completed?.status, 'COMPLETED');
    assert.equal(completed?.checksum, checksum);
    assert.match((await services.processing.readText(tenantA, documentId)) ?? '', /Avantime/);
    const chunks = await services.processing.readChunks(tenantA, documentId);
    assert.ok(chunks.length > 0);
    assert.equal((chunks[0] as TextChunk).text.includes('Avantime'), true);
    assert.equal(await services.metadata.findById(tenantB, documentId), null);
    assert.equal(await services.storage.read(tenantB, 'original', storedName), null);

    await deleteDocument(tenantA, documentId, services);
    assert.equal(await services.metadata.findById(tenantA, documentId), null);
    assert.equal((await services.metadata.findDeletedById(tenantA, documentId))?.status, 'DELETED');
    const cleanup = await cleanupDeletedDocuments(tenantA, services);
    assert.deepEqual(cleanup, {
      cleaned: [documentId],
      failed: [],
    });
    assert.equal(await services.metadata.findDeletedById(tenantA, documentId), null);
    assert.equal(await services.storage.read(tenantA, 'original', storedName), null);
  } finally {
    await database.documentMetadata.deleteMany({
      where: {
        companyId: tenantA.companyId,
      },
    });
    await rm(dataDirectory, { recursive: true, force: true });
    await database.$disconnect();
  }
});

test('checksum corruption fails permanently without cross-tenant effects', async () => {
  const database = await integrationDatabase();
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-integration-failure-'));
  const tenant = integrationTenant('pipeline-failure');
  const configuration = {
    ...loadDocumentConfiguration(),
    dataDirectory,
  };
  const services = createDocumentServices(configuration, {
    loadDatabase: async () => database,
    processingQueue: new LocalDocumentProcessingQueue(dataDirectory),
  });
  const documentId = `document-${crypto.randomUUID()}`;
  const storedName = `${documentId}.pdf`;
  const pdf = createPdf('Avantime checksum failure');

  try {
    await services.storage.write(tenant, 'original', storedName, pdf);
    await services.metadata.create(tenant, integrationMetadata(documentId, '0'.repeat(64)));
    await enqueueUploadedDocument(tenant, documentId, services);

    const result = await createDocumentProcessingWorker(services).runOnce(
      tenant,
      'integration-failure-worker',
    );
    assert.equal(result.outcome, 'FAILED');
    const failed = await services.metadata.findById(tenant, documentId);
    assert.equal(failed?.status, 'FAILED');
    assert.equal(failed?.lastErrorCode, 'CHECKSUM_MISMATCH');
    assert.equal((await services.queue.list(tenant)).length, 0);
  } finally {
    await services.storage.delete(tenant, 'original', storedName);
    await services.processing.delete(tenant, documentId);
    await database.documentMetadata.deleteMany({
      where: {
        companyId: tenant.companyId,
      },
    });
    await rm(dataDirectory, { recursive: true, force: true });
    await database.$disconnect();
  }
});
