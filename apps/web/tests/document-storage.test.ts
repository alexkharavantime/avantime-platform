import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { DocumentMetadata, DocumentTenantContext } from '../lib/document-model';
import {
  LocalDocumentHistoryRepository,
  LocalDocumentMetadataRepository,
  LocalDocumentProcessingRepository,
} from '../lib/document-repositories';
import { deleteDocument, type DocumentServices } from '../lib/document-services';
import { LocalDocumentStorage } from '../lib/document-storage';

const companyA: DocumentTenantContext = {
  companyId: 'company-a',
  userId: 'user-a',
};
const companyB: DocumentTenantContext = {
  companyId: 'company-b',
  userId: 'user-b',
};

async function createFixture() {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'avantime-documents-'));
  const storage = new LocalDocumentStorage(dataDirectory);
  const services: DocumentServices = {
    storage,
    metadata: new LocalDocumentMetadataRepository(dataDirectory),
    processing: new LocalDocumentProcessingRepository(storage),
    history: new LocalDocumentHistoryRepository(storage),
  };

  return {
    dataDirectory,
    services,
    cleanup: () => rm(dataDirectory, { recursive: true, force: true }),
  };
}

function metadata(
  id: string,
  storedName = `${id}.pdf`,
): Omit<DocumentMetadata, 'companyId' | 'uploadedBy' | 'deletedAt'> {
  const now = new Date().toISOString();

  return {
    id,
    status: 'Обработан',
    originalName: 'document.pdf',
    storedName,
    mimeType: 'application/pdf',
    size: 12,
    checksum: '9e244f28c5b80c7ac58255d4a9888d4b9454068ac7c8e2779236c6095fa8b8b5',
    createdAt: now,
    updatedAt: now,
    pages: 1,
    textLength: 12,
    processedAt: now,
    chunksCount: 1,
  };
}

test('a document owned by company A is unavailable to company B', async () => {
  const fixture = await createFixture();

  try {
    await fixture.services.metadata.create(companyA, metadata('document-a'));
    await fixture.services.storage.write(
      companyA,
      'original',
      'document-a.pdf',
      Buffer.from('company A'),
    );
    await fixture.services.processing.save(companyA, 'document-a', {
      text: 'company A text',
      chunks: [
        {
          id: '0',
          index: 0,
          text: 'company A text',
          start: 0,
          end: 14,
        },
      ],
    });

    assert.equal(
      (await fixture.services.metadata.findById(companyA, 'document-a'))?.companyId,
      'company-a',
    );
    assert.equal(await fixture.services.metadata.findById(companyB, 'document-a'), null);
    assert.equal(await fixture.services.storage.read(companyB, 'original', 'document-a.pdf'), null);
    assert.equal(await fixture.services.processing.readText(companyB, 'document-a'), null);
    assert.deepEqual(await fixture.services.processing.readChunks(companyB, 'document-a'), []);
  } finally {
    await fixture.cleanup();
  }
});

test('created document metadata always contains companyId from tenant context', async () => {
  const fixture = await createFixture();

  try {
    const created = await fixture.services.metadata.create(companyA, metadata('metadata-company'));
    const listed = await fixture.services.metadata.list(companyA);

    assert.equal(created.companyId, 'company-a');
    assert.equal(created.uploadedBy, 'user-a');
    assert.equal(listed.length, 1);
    assert.equal(listed[0]?.companyId, 'company-a');
  } finally {
    await fixture.cleanup();
  }
});

test('a file cannot be read without tenant context', async () => {
  const fixture = await createFixture();

  try {
    await assert.rejects(
      fixture.services.storage.read(
        undefined as unknown as DocumentTenantContext,
        'original',
        'document.pdf',
      ),
      /tenant context is required/i,
    );
  } finally {
    await fixture.cleanup();
  }
});

test('soft-deleting a document hides only metadata for the current tenant', async () => {
  const fixture = await createFixture();
  const documentId = 'shared-document';
  const storedName = 'shared-document.pdf';

  try {
    for (const tenant of [companyA, companyB]) {
      await fixture.services.metadata.create(tenant, metadata(documentId, storedName));
      await fixture.services.storage.write(
        tenant,
        'original',
        storedName,
        Buffer.from(tenant.companyId),
      );
      await fixture.services.processing.save(tenant, documentId, {
        text: tenant.companyId,
        chunks: [
          {
            id: '0',
            index: 0,
            text: tenant.companyId,
            start: 0,
            end: tenant.companyId.length,
          },
        ],
      });
    }

    await deleteDocument(companyA, documentId, fixture.services);

    assert.equal(await fixture.services.metadata.findById(companyA, documentId), null);
    assert.equal(
      (await fixture.services.metadata.findDeletedById(companyA, documentId))?.companyId,
      'company-a',
    );
    assert.equal(
      (await fixture.services.storage.read(companyA, 'original', storedName))?.toString('utf8'),
      'company-a',
    );
    assert.equal(
      (await fixture.services.metadata.findById(companyB, documentId))?.companyId,
      'company-b',
    );
    assert.equal(
      (await fixture.services.storage.read(companyB, 'original', storedName))?.toString('utf8'),
      'company-b',
    );
    assert.equal(await fixture.services.processing.readText(companyB, documentId), 'company-b');
    assert.equal(
      (await fixture.services.processing.readChunks(companyB, documentId))[0]?.text,
      'company-b',
    );
  } finally {
    await fixture.cleanup();
  }
});

test('LocalDocumentStorage rejects path traversal', async () => {
  const fixture = await createFixture();

  try {
    await assert.rejects(
      fixture.services.storage.write(
        companyA,
        'original',
        '../outside.pdf',
        Buffer.from('blocked'),
      ),
      /unsafe path segment/i,
    );
    await assert.rejects(
      fixture.services.storage.read(
        { companyId: '../company-b', userId: 'user-a' },
        'original',
        'document.pdf',
      ),
      /unsafe path segment/i,
    );
  } finally {
    await fixture.cleanup();
  }
});
