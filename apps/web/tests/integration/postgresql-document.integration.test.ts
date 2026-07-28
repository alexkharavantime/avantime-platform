import assert from 'node:assert/strict';
import test from 'node:test';

import type { DocumentTenantContext } from '../../lib/document-model';
import { calculateDocumentChecksum } from '../../lib/document-storage';
import {
  integrationMetadata,
  integrationMetadataRepository,
  integrationTenant,
} from './integration-test-environment';

test('PostgreSQLDocumentMetadataRepository works against real PostgreSQL', async (t) => {
  const { database, repository } = await integrationMetadataRepository();
  const tenantA = integrationTenant('postgres-a');
  const tenantB = integrationTenant('postgres-b');
  const checksum = calculateDocumentChecksum(Buffer.from('postgres integration document'));
  const documentId = `document-${crypto.randomUUID()}`;

  t.after(async () => {
    await database.documentMetadata.deleteMany({
      where: {
        companyId: {
          in: [tenantA.companyId, tenantB.companyId],
        },
      },
    });
    await database.$disconnect();
  });

  await t.test('creates metadata and isolates tenants', async () => {
    const created = await repository.create(tenantA, integrationMetadata(documentId, checksum));
    await repository.create(tenantB, integrationMetadata(documentId, checksum));

    assert.equal(created.companyId, tenantA.companyId);
    assert.equal(created.uploadedBy, tenantA.userId);
    assert.equal((await repository.findById(tenantA, documentId))?.companyId, tenantA.companyId);
    assert.equal((await repository.findById(tenantB, documentId))?.companyId, tenantB.companyId);
    assert.equal(
      await repository.findById(
        {
          companyId: 'integration-unrelated-tenant',
          userId: 'integration-user',
        },
        documentId,
      ),
      null,
    );
    await assert.rejects(
      repository.findById(
        {
          companyId: '../invalid',
          userId: 'integration-user',
        } as DocumentTenantContext,
        documentId,
      ),
      /unsafe path segment/i,
    );
  });

  await t.test('conditionally lets only one worker claim QUEUED metadata', async () => {
    const queued = await repository.transitionStatus(tenantA, documentId, ['UPLOADED'], 'QUEUED');
    assert.equal(queued?.status, 'QUEUED');

    const startedAt = new Date().toISOString();
    const claims = await Promise.all([
      repository.transitionStatus(tenantA, documentId, ['QUEUED'], 'PROCESSING', {
        processingAttempts: 1,
        processingStartedAt: startedAt,
        workerId: 'integration-worker-a',
      }),
      repository.transitionStatus(tenantA, documentId, ['QUEUED'], 'PROCESSING', {
        processingAttempts: 1,
        processingStartedAt: startedAt,
        workerId: 'integration-worker-b',
      }),
    ]);

    assert.equal(claims.filter(Boolean).length, 1);
    const processing = await repository.findById(tenantA, documentId);
    assert.equal(processing?.status, 'PROCESSING');
    assert.equal(processing?.processingAttempts, 1);
    assert.equal(new Date(processing!.processingStartedAt!).toISOString(), startedAt);
  });

  await t.test('persists quarantine and retry metadata', async () => {
    const quarantinedAt = new Date().toISOString();
    const quarantined = await repository.transitionStatus(
      tenantA,
      documentId,
      ['PROCESSING'],
      'QUARANTINED',
      {
        processingAttempts: 3,
        lastErrorCode: 'INTEGRATION_TRANSIENT_ERROR',
        lastErrorMessage: 'Временная ошибка обработки документа.',
        processingCompletedAt: quarantinedAt,
        quarantinedAt,
        workerId: null,
      },
    );
    assert.equal(quarantined?.status, 'QUARANTINED');
    assert.equal(quarantined?.processingAttempts, 3);
    assert.equal(quarantined?.quarantinedAt, quarantinedAt);

    const retryAt = new Date(Date.now() + 1_000).toISOString();
    const retried = await repository.transitionStatus(
      tenantA,
      documentId,
      ['QUARANTINED'],
      'QUEUED',
      {
        nextRetryAt: retryAt,
        quarantinedAt: null,
        workerId: null,
      },
    );
    assert.equal(retried?.status, 'QUEUED');
    assert.equal(retried?.nextRetryAt, retryAt);
  });

  await t.test('database constraint rejects negative attempts', async () => {
    await database.$executeRawUnsafe(
      `DO $constraint_check$
       BEGIN
         BEGIN
           UPDATE "DocumentMetadata"
           SET "processingAttempts" = -1
           WHERE ("companyId", "id") = (
             SELECT "companyId", "id"
             FROM "DocumentMetadata"
             WHERE "processingAttempts" = 3
             LIMIT 1
           );
           RAISE EXCEPTION 'processingAttempts constraint accepted a negative value';
         EXCEPTION
           WHEN check_violation THEN NULL;
         END;
       END
       $constraint_check$`,
    );
    assert.equal((await repository.findById(tenantA, documentId))?.processingAttempts, 3);
  });

  await t.test('soft delete hides only the selected tenant record', async () => {
    const deleted = await repository.delete(tenantA, documentId);
    assert.equal(deleted?.status, 'DELETED');
    assert.ok(deleted?.deletedAt);
    assert.equal(await repository.findById(tenantA, documentId), null);
    assert.equal(
      (await repository.list(tenantA)).some((item) => item.id === documentId),
      false,
    );
    assert.equal((await repository.findDeletedById(tenantA, documentId))?.status, 'DELETED');
    assert.equal((await repository.findById(tenantB, documentId))?.companyId, tenantB.companyId);
  });

  await t.test('migration schema contains repository columns, indexes and constraint', async () => {
    const columns = await database.$queryRawUnsafe<Array<{ column_name: string }>>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'DocumentMetadata'`,
    );
    const columnNames = new Set(columns.map((column) => column.column_name));
    for (const column of [
      'companyId',
      'status',
      'checksum',
      'processingAttempts',
      'lastErrorCode',
      'processingStartedAt',
      'processingCompletedAt',
      'nextRetryAt',
      'quarantinedAt',
      'workerId',
      'deletedAt',
    ]) {
      assert.equal(columnNames.has(column), true, `Missing column ${column}`);
    }

    const indexes = await database.$queryRawUnsafe<Array<{ indexname: string }>>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'DocumentMetadata'`,
    );
    const indexNames = new Set(indexes.map((index) => index.indexname));
    assert.equal(indexNames.has('DocumentMetadata_companyId_status_idx'), true);
    assert.equal(indexNames.has('DocumentMetadata_companyId_nextRetryAt_idx'), true);
    assert.equal(indexNames.has('DocumentMetadata_companyId_quarantinedAt_idx'), true);

    const constraints = await database.$queryRawUnsafe<Array<{ conname: string }>>(
      `SELECT conname
       FROM pg_constraint
       WHERE conrelid = '"DocumentMetadata"'::regclass`,
    );
    assert.equal(
      constraints.some(
        (constraint) => constraint.conname === 'DocumentMetadata_processingAttempts_check',
      ),
      true,
    );
  });
});
