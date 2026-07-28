import { getPrisma } from '@avantime/database';

import { loadDocumentConfiguration } from '../../lib/document-configuration';
import type {
  CreateDocumentMetadata,
  DocumentMetadataDatabaseClient,
} from '../../lib/document-repositories';
import { PostgreSQLDocumentMetadataRepository } from '../../lib/document-repositories';
import { S3DocumentStorage } from '../../lib/document-storage';
import { assertSafeDocumentIntegrationEnvironment } from '../../scripts/document-integration-environment';

assertSafeDocumentIntegrationEnvironment(process.env);

export function integrationTenant(label: string) {
  return {
    companyId: `integration-${label}-${crypto.randomUUID()}`,
    userId: `integration-${label}-user`,
  };
}

export function integrationMetadata(
  id: string,
  checksum: string,
  status: CreateDocumentMetadata['status'] = 'UPLOADED',
): CreateDocumentMetadata {
  const now = new Date().toISOString();
  return {
    id,
    status,
    originalName: `${id}.pdf`,
    storedName: `${id}.pdf`,
    mimeType: 'application/pdf',
    size: 128,
    checksum,
    createdAt: now,
    updatedAt: now,
  };
}

export async function integrationDatabase() {
  const database = await getPrisma();
  if (!database) throw new Error('Integration PostgreSQL is unavailable.');
  return database as DocumentMetadataDatabaseClient & {
    documentMetadata: DocumentMetadataDatabaseClient['documentMetadata'] & {
      deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
    };
    $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
    $disconnect(): Promise<void>;
  };
}

export async function integrationMetadataRepository() {
  const database = await integrationDatabase();
  return {
    database,
    repository: new PostgreSQLDocumentMetadataRepository(async () => database),
  };
}

export function integrationStorage() {
  const configuration = loadDocumentConfiguration();
  if (!configuration.s3) throw new Error('Integration S3 configuration is unavailable.');
  return new S3DocumentStorage(configuration.s3);
}
