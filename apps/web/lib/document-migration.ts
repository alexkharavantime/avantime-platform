import type { DocumentMetadata, DocumentTenantContext } from './document-model';
import type { CreateDocumentMetadata } from './document-repositories';
import type { DocumentPersistenceServices } from './document-services';
import { calculateDocumentChecksum, type DocumentObjectKind } from './document-storage';

export type DocumentMigrationReport = {
  dryRun: boolean;
  migrated: string[];
  skipped: string[];
  failed: string[];
  objectsCopied: number;
};

type MigrationOptions = {
  tenant: DocumentTenantContext;
  source: DocumentPersistenceServices;
  target: DocumentPersistenceServices;
  dryRun: boolean;
};

function createTargetMetadata(
  document: DocumentMetadata,
  checksum: string,
): CreateDocumentMetadata {
  return {
    id: document.id,
    status: document.status,
    originalName: document.originalName,
    storedName: document.storedName,
    mimeType: document.mimeType,
    size: document.size,
    checksum,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    processingAttempts: document.processingAttempts,
    lastErrorCode: document.lastErrorCode,
    lastErrorMessage: document.lastErrorMessage,
    processingStartedAt: document.processingStartedAt,
    processingCompletedAt: document.processingCompletedAt,
    nextRetryAt: document.nextRetryAt,
    quarantinedAt: document.quarantinedAt,
    workerId: null,
    pages: document.pages,
    textLength: document.textLength,
    chunksCount: document.chunksCount,
  };
}

async function copyObject(
  tenant: DocumentTenantContext,
  kind: DocumentObjectKind,
  key: string,
  data: Buffer,
  target: DocumentPersistenceServices,
  dryRun: boolean,
  contentType?: string,
) {
  const checksum = calculateDocumentChecksum(data);
  const existing = await target.storage.read(tenant, kind, key, {
    expectedChecksum: checksum,
  });
  if (existing) return false;
  if (dryRun) return true;

  await target.storage.write(tenant, kind, key, data, {
    checksum,
    contentType,
  });
  const verified = await target.storage.read(tenant, kind, key, {
    expectedChecksum: checksum,
  });
  if (!verified) {
    throw new Error('Migrated document object is not readable after write.');
  }

  return true;
}

async function migrateProcessingObjects(
  tenant: DocumentTenantContext,
  document: DocumentMetadata,
  source: DocumentPersistenceServices,
  target: DocumentPersistenceServices,
  dryRun: boolean,
) {
  let copied = 0;
  const text = await source.storage.read(tenant, 'text', `${document.id}.txt`);
  if (
    text &&
    (await copyObject(
      tenant,
      'text',
      `${document.id}.txt`,
      text,
      target,
      dryRun,
      'text/plain; charset=utf-8',
    ))
  ) {
    copied += 1;
  }

  const chunks = await source.storage.read(tenant, 'chunks', `${document.id}.json`);
  if (
    chunks &&
    (await copyObject(
      tenant,
      'chunks',
      `${document.id}.json`,
      chunks,
      target,
      dryRun,
      'application/json',
    ))
  ) {
    copied += 1;
  }

  return copied;
}

export async function migrateDocuments(
  options: MigrationOptions,
): Promise<DocumentMigrationReport> {
  const report: DocumentMigrationReport = {
    dryRun: options.dryRun,
    migrated: [],
    skipped: [],
    failed: [],
    objectsCopied: 0,
  };
  const documents = await options.source.metadata.list(options.tenant);

  for (const document of documents) {
    try {
      const original = await options.source.storage.read(
        options.tenant,
        'original',
        document.storedName,
      );
      if (!original) {
        throw new Error('Legacy document object is missing.');
      }

      const checksum = calculateDocumentChecksum(original);
      const existing =
        (await options.target.metadata.findById(options.tenant, document.id)) ??
        (await options.target.metadata.findDeletedById(options.tenant, document.id));
      if (existing && existing.checksum !== checksum) {
        throw new Error('Target metadata checksum does not match source data.');
      }

      let copied = 0;
      if (
        await copyObject(
          options.tenant,
          'original',
          document.storedName,
          original,
          options.target,
          options.dryRun,
          document.mimeType,
        )
      ) {
        copied += 1;
      }
      copied += await migrateProcessingObjects(
        options.tenant,
        document,
        options.source,
        options.target,
        options.dryRun,
      );

      if (!existing && !options.dryRun) {
        await options.target.metadata.create(
          {
            ...options.tenant,
            userId: document.uploadedBy,
          },
          createTargetMetadata(document, checksum),
        );
      }

      report.objectsCopied += copied;
      if (existing && copied === 0) {
        report.skipped.push(document.id);
      } else {
        report.migrated.push(document.id);
      }
    } catch {
      report.failed.push(document.id);
    }
  }

  try {
    const history = await options.source.storage.read(
      options.tenant,
      'history',
      'knowledge-history.json',
    );
    if (
      history &&
      (await copyObject(
        options.tenant,
        'history',
        'knowledge-history.json',
        history,
        options.target,
        options.dryRun,
        'application/json',
      ))
    ) {
      report.objectsCopied += 1;
    }
  } catch {
    report.failed.push('knowledge-history');
  }

  return report;
}
