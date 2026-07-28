import path from 'node:path';

import {
  DEFAULT_DOCUMENT_RETRY_POLICY,
  validateDocumentRetryPolicy,
  type DocumentRetryPolicy,
} from './document-retry-policy';
import { assertSafeDocumentSegment, type S3DocumentStorageConfig } from './document-storage';

export type DocumentStorageDriver = 'local' | 's3';
export type DocumentMetadataDriver = 'local' | 'postgresql';
export type DocumentProcessingQueueDriver = 'local' | 'external';

export type DocumentConfiguration = {
  storageDriver: DocumentStorageDriver;
  metadataDriver: DocumentMetadataDriver;
  queueDriver: DocumentProcessingQueueDriver;
  queueName?: string;
  dataDirectory: string;
  retryPolicy: DocumentRetryPolicy;
  queueLeaseDurationMs: number;
  workerPollIntervalMs: number;
  s3?: S3DocumentStorageConfig;
};

function requireEnvironmentValue(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the selected document configuration.`);
  }

  return value;
}

function parseDriver<T extends string>(
  value: string | undefined,
  fallback: T,
  supported: readonly T[],
  name: string,
) {
  const driver = (value?.trim() || fallback) as T;
  if (!supported.includes(driver)) {
    throw new Error(`${name} has an unsupported value.`);
  }

  return driver;
}

function parsePositiveInteger(value: string | undefined, fallback: number, name: string) {
  if (!value?.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function loadS3Configuration(
  environment: Record<string, string | undefined>,
): S3DocumentStorageConfig {
  const endpoint = requireEnvironmentValue(environment, 'OBJECT_STORAGE_ENDPOINT');
  const region = requireEnvironmentValue(environment, 'OBJECT_STORAGE_REGION');
  const bucket = requireEnvironmentValue(environment, 'OBJECT_STORAGE_BUCKET');
  const accessKeyId = requireEnvironmentValue(environment, 'OBJECT_STORAGE_ACCESS_KEY');
  const secretAccessKey = requireEnvironmentValue(environment, 'OBJECT_STORAGE_SECRET_KEY');

  const parsedEndpoint = new URL(endpoint);
  if (parsedEndpoint.protocol !== 'https:' && parsedEndpoint.protocol !== 'http:') {
    throw new Error('OBJECT_STORAGE_ENDPOINT must use HTTP or HTTPS.');
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error('OBJECT_STORAGE_BUCKET has an invalid bucket name.');
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
  };
}

export function loadDocumentConfiguration(
  environment: Record<string, string | undefined> = process.env,
): DocumentConfiguration {
  const production = environment.NODE_ENV === 'production';
  const storageDriver = parseDriver(
    environment.DOCUMENT_STORAGE_DRIVER,
    production ? 's3' : 'local',
    ['local', 's3'] as const,
    'DOCUMENT_STORAGE_DRIVER',
  );
  const metadataDriver = parseDriver(
    environment.DOCUMENT_METADATA_DRIVER,
    production ? 'postgresql' : 'local',
    ['local', 'postgresql'] as const,
    'DOCUMENT_METADATA_DRIVER',
  );
  const queueDriver = parseDriver(
    environment.DOCUMENT_PROCESSING_QUEUE_DRIVER,
    production ? 'external' : 'local',
    ['local', 'external'] as const,
    'DOCUMENT_PROCESSING_QUEUE_DRIVER',
  );

  if (production && storageDriver !== 's3') {
    throw new Error('Production document storage must use the s3 driver.');
  }
  if (production && metadataDriver !== 'postgresql') {
    throw new Error('Production document metadata must use the postgresql driver.');
  }
  if (production && queueDriver !== 'external') {
    throw new Error('Production document processing must use an external queue adapter.');
  }
  if (metadataDriver === 'postgresql') {
    requireEnvironmentValue(environment, 'DATABASE_URL');
  }
  const queueName =
    queueDriver === 'external'
      ? requireEnvironmentValue(environment, 'DOCUMENT_PROCESSING_QUEUE_NAME')
      : undefined;
  const retryPolicy = validateDocumentRetryPolicy({
    maxAttempts: parsePositiveInteger(
      environment.DOCUMENT_PROCESSING_MAX_ATTEMPTS,
      DEFAULT_DOCUMENT_RETRY_POLICY.maxAttempts,
      'DOCUMENT_PROCESSING_MAX_ATTEMPTS',
    ),
    initialDelayMs: parsePositiveInteger(
      environment.DOCUMENT_PROCESSING_INITIAL_RETRY_MS,
      DEFAULT_DOCUMENT_RETRY_POLICY.initialDelayMs,
      'DOCUMENT_PROCESSING_INITIAL_RETRY_MS',
    ),
    maxDelayMs: parsePositiveInteger(
      environment.DOCUMENT_PROCESSING_MAX_RETRY_MS,
      DEFAULT_DOCUMENT_RETRY_POLICY.maxDelayMs,
      'DOCUMENT_PROCESSING_MAX_RETRY_MS',
    ),
  });

  return {
    storageDriver,
    metadataDriver,
    queueDriver,
    queueName,
    dataDirectory: path.resolve(
      environment.DOCUMENT_DATA_DIR?.trim() || path.join(process.cwd(), '.data'),
    ),
    retryPolicy,
    queueLeaseDurationMs: parsePositiveInteger(
      environment.DOCUMENT_PROCESSING_LEASE_MS,
      5 * 60_000,
      'DOCUMENT_PROCESSING_LEASE_MS',
    ),
    workerPollIntervalMs: parsePositiveInteger(
      environment.DOCUMENT_PROCESSING_POLL_MS,
      1_000,
      'DOCUMENT_PROCESSING_POLL_MS',
    ),
    s3: storageDriver === 's3' ? loadS3Configuration(environment) : undefined,
  };
}

export type DocumentWorkerConfiguration = {
  tenantId: string;
  workerId: string;
};

export function loadDocumentWorkerConfiguration(
  environment: Record<string, string | undefined> = process.env,
): DocumentWorkerConfiguration {
  const production = environment.NODE_ENV === 'production';
  const tenantId =
    environment.DOCUMENT_WORKER_TENANT_ID?.trim() ||
    (production ? requireEnvironmentValue(environment, 'DOCUMENT_WORKER_TENANT_ID') : 'avantime');
  const workerId =
    environment.DOCUMENT_WORKER_ID?.trim() ||
    (production
      ? requireEnvironmentValue(environment, 'DOCUMENT_WORKER_ID')
      : `local-worker-${process.pid}`);
  assertSafeDocumentSegment(tenantId, 'DOCUMENT_WORKER_TENANT_ID');
  assertSafeDocumentSegment(workerId, 'DOCUMENT_WORKER_ID');

  return {
    tenantId,
    workerId,
  };
}
