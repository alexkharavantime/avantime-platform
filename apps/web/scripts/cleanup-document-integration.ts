import { rm } from 'node:fs/promises';
import path from 'node:path';

import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getPrisma } from '@avantime/database';

import { loadDocumentIntegrationEnvironment } from './document-integration-environment';

export async function cleanupDocumentIntegrationData() {
  const { repositoryRoot, environment } = await loadDocumentIntegrationEnvironment();
  Object.assign(process.env, environment);

  const database = await getPrisma();
  if (!database) throw new Error('Integration PostgreSQL is unavailable.');
  const deletedMetadata = await database.documentMetadata.deleteMany({
    where: {
      companyId: {
        startsWith: 'integration-',
      },
    },
  });

  const client = new S3Client({
    endpoint: environment.OBJECT_STORAGE_ENDPOINT,
    region: environment.OBJECT_STORAGE_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY!,
      secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY!,
    },
  });
  const bucket = environment.OBJECT_STORAGE_BUCKET!;
  let continuationToken: string | undefined;
  let deletedObjects = 0;

  do {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: 'documents/integration-',
        ContinuationToken: continuationToken,
      }),
    );
    const objects = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key))
      .map((key) => ({ Key: key }));
    if (objects.length > 0) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects,
            Quiet: true,
          },
        }),
      );
      deletedObjects += objects.length;
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);

  const dataDirectory = path.resolve(
    repositoryRoot,
    environment.DOCUMENT_DATA_DIR || '.data/integration',
  );
  const allowedDataRoot = path.join(repositoryRoot, '.data');
  if (
    path.basename(dataDirectory) !== 'integration' ||
    !dataDirectory.startsWith(`${allowedDataRoot}${path.sep}`)
  ) {
    throw new Error('Integration data directory is outside the allowed test path.');
  }
  await rm(dataDirectory, { recursive: true, force: true });
  await database.$disconnect();

  return {
    deletedMetadata: deletedMetadata.count,
    deletedObjects,
  };
}

void cleanupDocumentIntegrationData()
  .then((result) => {
    console.info(JSON.stringify(result));
  })
  .catch(() => {
    console.error('Document integration cleanup failed.');
    process.exitCode = 1;
  });
