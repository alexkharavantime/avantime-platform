import { randomUUID } from 'node:crypto';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { StagingConfiguration } from './staging-configuration';

export function createStagingProbeObjectKey(environment: string, tenantId: string) {
  if (environment !== 'staging') throw new Error('OBJECT_PROBE_ENVIRONMENT_INVALID');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/u.test(tenantId)) {
    throw new Error('OBJECT_PROBE_TENANT_INVALID');
  }
  return `staging/${tenantId}/readiness/${randomUUID()}.txt`;
}

export async function probeStagingObjectStorage(
  configuration: StagingConfiguration['objectStorage'],
) {
  const client = new S3Client({
    endpoint: configuration.endpoint.toString(),
    region: configuration.region,
    forcePathStyle: configuration.forcePathStyle,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const key = createStagingProbeObjectKey('staging', 'system');
  const body = Buffer.from(`avantime-staging-readiness:${randomUUID()}`, 'utf8');
  try {
    await client.send(new HeadBucketCommand({ Bucket: configuration.bucket }));
    await client.send(
      new PutObjectCommand({
        Bucket: configuration.bucket,
        Key: key,
        Body: body,
        ContentType: 'text/plain; charset=utf-8',
      }),
    );
    const stored = await client.send(
      new GetObjectCommand({ Bucket: configuration.bucket, Key: key }),
    );
    const bytes = Buffer.from(await stored.Body!.transformToByteArray());
    if (!bytes.equals(body)) throw new Error('OBJECT_STORAGE_READINESS_CONTENT_MISMATCH');
    return { ready: true as const };
  } finally {
    await client
      .send(new DeleteObjectCommand({ Bucket: configuration.bucket, Key: key }))
      .catch(() => undefined);
    client.destroy();
  }
}
