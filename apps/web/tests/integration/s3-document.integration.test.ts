import assert from 'node:assert/strict';
import test from 'node:test';

import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { loadDocumentConfiguration } from '../../lib/document-configuration';
import { LocalDocumentProcessingRepository } from '../../lib/document-repositories';
import { calculateDocumentChecksum, createDocumentObjectKey } from '../../lib/document-storage';
import { integrationStorage, integrationTenant } from './integration-test-environment';

test('S3DocumentStorage works against MinIO without cross-tenant access', async (t) => {
  const configuration = loadDocumentConfiguration();
  assert.ok(configuration.s3);
  const storage = integrationStorage();
  const processing = new LocalDocumentProcessingRepository(storage);
  const tenantA = integrationTenant('s3-a');
  const tenantB = integrationTenant('s3-b');
  const originalKey = `original-${crypto.randomUUID()}.pdf`;
  const documentId = `document-${crypto.randomUUID()}`;
  const original = Buffer.from('Avantime MinIO integration original');
  const checksum = calculateDocumentChecksum(original);
  const client = new S3Client({
    endpoint: configuration.s3.endpoint,
    region: configuration.s3.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: configuration.s3.accessKeyId,
      secretAccessKey: configuration.s3.secretAccessKey,
    },
  });

  t.after(async () => {
    await storage.delete(tenantA, 'original', originalKey);
    await processing.delete(tenantA, documentId);
    await processing.delete(tenantB, documentId);
  });

  await t.test('writes and reads an original with a tenant-prefixed key', async () => {
    const written = await storage.write(tenantA, 'original', originalKey, original, {
      checksum,
      contentType: 'application/pdf',
    });
    assert.equal(written.checksum, checksum);
    assert.deepEqual(
      await storage.read(tenantA, 'original', originalKey, {
        expectedChecksum: checksum,
      }),
      original,
    );

    const objectKey = createDocumentObjectKey(tenantA, 'original', originalKey);
    await client.send(
      new HeadObjectCommand({
        Bucket: configuration.s3!.bucket,
        Key: objectKey,
      }),
    );
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: configuration.s3!.bucket,
        Prefix: `documents/${tenantA.companyId}/`,
      }),
    );
    assert.equal(
      listed.Contents?.some((item) => item.Key === objectKey),
      true,
    );
  });

  await t.test('blocks cross-tenant reads and deletes', async () => {
    assert.equal(await storage.read(tenantB, 'original', originalKey), null);
    await storage.delete(tenantB, 'original', originalKey);
    assert.deepEqual(await storage.read(tenantA, 'original', originalKey), original);
  });

  await t.test('stores extracted text and chunks', async () => {
    await processing.save(tenantA, documentId, {
      text: 'Avantime extracted integration text',
      chunks: [
        {
          id: '0',
          index: 0,
          text: 'Avantime extracted integration text',
          start: 0,
          end: 35,
        },
      ],
    });
    assert.equal(
      await processing.readText(tenantA, documentId),
      'Avantime extracted integration text',
    );
    assert.equal((await processing.readChunks(tenantA, documentId)).length, 1);
    assert.equal(await processing.readText(tenantB, documentId), null);
  });

  await t.test('cleanup deletes only the selected tenant document', async () => {
    await processing.save(tenantB, documentId, {
      text: 'Tenant B integration text',
      chunks: [
        {
          id: '0',
          index: 0,
          text: 'Tenant B integration text',
          start: 0,
          end: 25,
        },
      ],
    });
    await processing.delete(tenantA, documentId);

    assert.equal(await processing.readText(tenantA, documentId), null);
    assert.equal(await processing.readText(tenantB, documentId), 'Tenant B integration text');
  });

  await t.test('detects checksum mismatch, traversal and missing objects', async () => {
    await assert.rejects(
      storage.read(tenantA, 'original', originalKey, {
        expectedChecksum: '0'.repeat(64),
      }),
      /checksum verification failed/i,
    );
    await assert.rejects(
      storage.write(tenantA, 'original', '../outside.pdf', Buffer.from('blocked')),
      /unsafe path segment/i,
    );
    assert.equal(
      await storage.read(tenantA, 'original', `missing-${crypto.randomUUID()}.pdf`),
      null,
    );
  });

  await t.test('defines repeated writes as last-write-wins', async () => {
    const replacement = Buffer.from('Avantime replacement object');
    await storage.write(tenantA, 'original', originalKey, replacement);
    assert.deepEqual(await storage.read(tenantA, 'original', originalKey), replacement);
  });
});
