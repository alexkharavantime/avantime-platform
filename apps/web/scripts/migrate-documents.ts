import path from 'node:path';

import { AVANTIME_DOCUMENT_COMPANY_ID, type DocumentTenantContext } from '../lib/document-model';
import { migrateDocuments } from '../lib/document-migration';
import {
  LocalDocumentHistoryRepository,
  LocalDocumentMetadataRepository,
  LocalDocumentProcessingRepository,
} from '../lib/document-repositories';
import { createDocumentServices, type DocumentServices } from '../lib/document-services';
import { LocalDocumentStorage } from '../lib/document-storage';
import { loadDocumentConfiguration } from '../lib/document-configuration';

function argumentValue(name: string) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function createLegacyServices(dataDirectory: string): DocumentServices {
  const storage = new LocalDocumentStorage(dataDirectory);
  return {
    storage,
    metadata: new LocalDocumentMetadataRepository(dataDirectory, {
      persistLegacyOnRead: false,
    }),
    processing: new LocalDocumentProcessingRepository(storage),
    history: new LocalDocumentHistoryRepository(storage),
  };
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const companyId =
    argumentValue('tenant') ?? process.env.MIGRATION_TENANT_ID ?? AVANTIME_DOCUMENT_COMPANY_ID;
  const tenant: DocumentTenantContext = {
    companyId,
    userId: 'legacy-import',
  };
  const targetConfiguration = loadDocumentConfiguration();
  if (
    targetConfiguration.storageDriver !== 's3' ||
    targetConfiguration.metadataDriver !== 'postgresql'
  ) {
    throw new Error(
      'Document migration target requires s3 storage and postgresql metadata drivers.',
    );
  }

  const legacyDirectory = path.resolve(
    process.env.LEGACY_DOCUMENT_DATA_DIR?.trim() || path.join(process.cwd(), '.data'),
  );
  const report = await migrateDocuments({
    tenant,
    source: createLegacyServices(legacyDirectory),
    target: createDocumentServices(targetConfiguration),
    dryRun,
  });

  console.info(
    JSON.stringify({
      tenant: tenant.companyId,
      dryRun: report.dryRun,
      migrated: report.migrated,
      skipped: report.skipped,
      failed: report.failed,
      objectsCopied: report.objectsCopied,
    }),
  );
  if (report.failed.length > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Document migration failed.');
  process.exitCode = 1;
});
