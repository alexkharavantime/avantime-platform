import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';

export type ObjectBackupManifestEntry = {
  keyHash: string;
  size: number;
  etag: string | null;
};

export type ObjectBackupResult = {
  sourceBucket: string;
  destinationBucket: string;
  objectCount: number;
  totalBytes: number;
  manifestChecksum: string;
  dryRun: boolean;
  encryption: 'AES256' | 'integration-only-disabled';
};

function requireValue(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function assertBucket(value: string, name: string) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(value)) {
    throw new Error(`${name} is invalid.`);
  }
}

function encodeCopySource(bucket: string, key: string) {
  return `${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

function resolveBackupEncryption(environment: Record<string, string | undefined>) {
  const configured = environment.BACKUP_OBJECT_STORAGE_SSE?.trim() || 'AES256';
  if (configured === 'AES256') return 'AES256' as const;
  if (
    configured === 'none' &&
    environment.NODE_ENV !== 'production' &&
    environment.RUN_DOCUMENT_INTEGRATION_TESTS === '1' &&
    environment.BACKUP_ENVIRONMENT === 'integration'
  ) {
    return undefined;
  }
  throw new Error(
    'BACKUP_OBJECT_STORAGE_SSE must be AES256; none is restricted to the guarded integration environment.',
  );
}

export async function backupObjectStorage(
  environment: Record<string, string | undefined>,
  options: { execute: boolean; client?: S3Client },
): Promise<ObjectBackupResult> {
  const sourceBucket = requireValue(environment, 'OBJECT_STORAGE_BUCKET');
  const destinationBucket = requireValue(environment, 'BACKUP_OBJECT_STORAGE_BUCKET');
  assertBucket(sourceBucket, 'OBJECT_STORAGE_BUCKET');
  assertBucket(destinationBucket, 'BACKUP_OBJECT_STORAGE_BUCKET');
  if (sourceBucket === destinationBucket) {
    throw new Error('Object backup destination must differ from the source bucket.');
  }
  if (
    options.execute &&
    environment.BACKUP_CONFIRMATION !== `BACKUP:${environment.BACKUP_ENVIRONMENT}`
  ) {
    throw new Error('BACKUP_CONFIRMATION does not match the selected environment.');
  }
  const serverSideEncryption = resolveBackupEncryption(environment);
  const client =
    options.client ??
    new S3Client({
      endpoint: requireValue(environment, 'OBJECT_STORAGE_ENDPOINT'),
      region: requireValue(environment, 'OBJECT_STORAGE_REGION'),
      forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE !== 'false',
      credentials: {
        accessKeyId: requireValue(environment, 'OBJECT_STORAGE_ACCESS_KEY'),
        secretAccessKey: requireValue(environment, 'OBJECT_STORAGE_SECRET_KEY'),
      },
    });
  const prefix = `${requireValue(environment, 'BACKUP_ENVIRONMENT')}/${new Date()
    .toISOString()
    .slice(0, 10)}/`;
  let continuationToken: string | undefined;
  const manifest: ObjectBackupManifestEntry[] = [];
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: sourceBucket,
        ContinuationToken: continuationToken,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (!object.Key || object.Size === undefined) continue;
      if (options.execute) {
        const destinationKey = `${prefix}${object.Key}`;
        await client.send(
          new CopyObjectCommand({
            Bucket: destinationBucket,
            Key: destinationKey,
            CopySource: encodeCopySource(sourceBucket, object.Key),
            ServerSideEncryption: serverSideEncryption,
            MetadataDirective: 'REPLACE',
            Metadata: {
              'source-etag': (object.ETag ?? '').replaceAll('"', ''),
              'source-size': String(object.Size),
            },
          }),
        );
        const copied = await client.send(
          new HeadObjectCommand({ Bucket: destinationBucket, Key: destinationKey }),
        );
        if (
          copied.ContentLength !== object.Size ||
          copied.Metadata?.['source-size'] !== String(object.Size) ||
          (serverSideEncryption === 'AES256' && copied.ServerSideEncryption !== 'AES256')
        ) {
          throw new Error('Object backup verification failed.');
        }
      }
      manifest.push({
        keyHash: createHash('sha256').update(object.Key).digest('hex'),
        size: object.Size,
        etag: object.ETag?.replaceAll('"', '') ?? null,
      });
    }
    continuationToken = page.NextContinuationToken;
  } while (continuationToken);
  const manifestChecksum = createHash('sha256')
    .update(
      JSON.stringify(manifest.sort((first, second) => first.keyHash.localeCompare(second.keyHash))),
    )
    .digest('hex');
  return {
    sourceBucket,
    destinationBucket,
    objectCount: manifest.length,
    totalBytes: manifest.reduce((total, entry) => total + entry.size, 0),
    manifestChecksum,
    dryRun: !options.execute,
    encryption: serverSideEncryption ?? 'integration-only-disabled',
  };
}
