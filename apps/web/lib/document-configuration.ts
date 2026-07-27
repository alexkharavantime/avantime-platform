import path from 'node:path';

import type { S3DocumentStorageConfig } from './document-storage';

export type DocumentStorageDriver = 'local' | 's3';
export type DocumentMetadataDriver = 'local' | 'postgresql';

export type DocumentConfiguration = {
  storageDriver: DocumentStorageDriver;
  metadataDriver: DocumentMetadataDriver;
  dataDirectory: string;
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

  if (production && storageDriver !== 's3') {
    throw new Error('Production document storage must use the s3 driver.');
  }
  if (production && metadataDriver !== 'postgresql') {
    throw new Error('Production document metadata must use the postgresql driver.');
  }
  if (metadataDriver === 'postgresql') {
    requireEnvironmentValue(environment, 'DATABASE_URL');
  }

  return {
    storageDriver,
    metadataDriver,
    dataDirectory: path.resolve(
      environment.DOCUMENT_DATA_DIR?.trim() || path.join(process.cwd(), '.data'),
    ),
    s3: storageDriver === 's3' ? loadS3Configuration(environment) : undefined,
  };
}
