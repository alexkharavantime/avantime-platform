import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';

import { AVANTIME_DOCUMENT_COMPANY_ID, type DocumentTenantContext } from './document-model';

export type DocumentObjectKind = 'original' | 'text' | 'chunks' | 'history';

export type DocumentStorageWriteOptions = {
  checksum?: string;
  contentType?: string;
};

export type DocumentStorageReadOptions = {
  expectedChecksum?: string;
};

export type DocumentStorageWriteResult = {
  checksum: string;
};

export interface DocumentStorage {
  readonly kind: 'local' | 's3';
  write(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    data: Buffer,
    options?: DocumentStorageWriteOptions,
  ): Promise<DocumentStorageWriteResult>;
  read(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    options?: DocumentStorageReadOptions,
  ): Promise<Buffer | null>;
  delete(tenant: DocumentTenantContext, kind: DocumentObjectKind, key: string): Promise<boolean>;
}

export type S3DocumentStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export interface S3DocumentStorageClient {
  send(command: object): Promise<unknown>;
}

function isMissingFile(error: unknown) {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function isMissingObject(error: unknown) {
  if (!(error instanceof Error)) return false;

  const statusCode =
    '$metadata' in error
      ? (error as Error & { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;

  return error.name === 'NoSuchKey' || error.name === 'NotFound' || statusCode === 404;
}

export function assertSafeDocumentSegment(value: string, label: string) {
  if (
    !value ||
    value === '.' ||
    value === '..' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,199}$/.test(value)
  ) {
    throw new Error(`${label} contains an unsafe path segment.`);
  }
}

export function assertDocumentTenantContext(
  tenant: DocumentTenantContext | null | undefined,
): asserts tenant is DocumentTenantContext {
  if (!tenant || typeof tenant.companyId !== 'string' || typeof tenant.userId !== 'string') {
    throw new Error('Document tenant context is required.');
  }

  assertSafeDocumentSegment(tenant.companyId, 'companyId');
  assertSafeDocumentSegment(tenant.userId, 'userId');
}

export function calculateDocumentChecksum(data: Buffer) {
  return createHash('sha256').update(data).digest('hex');
}

export function assertDocumentChecksum(checksum: string) {
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new Error('Document checksum must be a SHA-256 hex digest.');
  }
}

function verifyChecksum(data: Buffer, expectedChecksum?: string) {
  const checksum = calculateDocumentChecksum(data);
  if (expectedChecksum) {
    assertDocumentChecksum(expectedChecksum);
    if (checksum !== expectedChecksum) {
      throw new Error('Document checksum verification failed.');
    }
  }

  return checksum;
}

export function createDocumentObjectKey(
  tenant: DocumentTenantContext,
  kind: DocumentObjectKind,
  key: string,
) {
  assertDocumentTenantContext(tenant);
  assertSafeDocumentSegment(kind, 'kind');
  assertSafeDocumentSegment(key, 'storage key');

  return `documents/${tenant.companyId}/${kind}/${key}`;
}

export class LocalDocumentStorage implements DocumentStorage {
  readonly kind = 'local';

  constructor(private readonly dataDirectory = path.join(process.cwd(), '.data')) {}

  async write(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    data: Buffer,
    options: DocumentStorageWriteOptions = {},
  ) {
    const filePath = this.resolvePath(tenant, kind, key);
    const checksum = verifyChecksum(data, options.checksum);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
    return { checksum };
  }

  async read(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    options: DocumentStorageReadOptions = {},
  ) {
    const filePath = this.resolvePath(tenant, kind, key);

    try {
      const data = await readFile(filePath);
      verifyChecksum(data, options.expectedChecksum);
      return data;
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    const legacyPath = this.resolveLegacyPath(tenant, kind, key);
    if (!legacyPath) return null;

    try {
      const data = await readFile(legacyPath);
      verifyChecksum(data, options.expectedChecksum);
      return data;
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async delete(tenant: DocumentTenantContext, kind: DocumentObjectKind, key: string) {
    const paths = [this.resolvePath(tenant, kind, key)];
    const legacyPath = this.resolveLegacyPath(tenant, kind, key);
    if (legacyPath) paths.push(legacyPath);

    let deleted = false;
    for (const filePath of paths) {
      try {
        await unlink(filePath);
        deleted = true;
      } catch (error) {
        if (!isMissingFile(error)) throw error;
      }
    }

    return deleted;
  }

  private resolvePath(tenant: DocumentTenantContext, kind: DocumentObjectKind, key: string) {
    assertDocumentTenantContext(tenant);
    assertSafeDocumentSegment(kind, 'kind');
    assertSafeDocumentSegment(key, 'storage key');

    return path.join(
      this.dataDirectory,
      'document-tenants',
      tenant.companyId,
      'objects',
      kind,
      key,
    );
  }

  private resolveLegacyPath(tenant: DocumentTenantContext, kind: DocumentObjectKind, key: string) {
    assertDocumentTenantContext(tenant);
    assertSafeDocumentSegment(key, 'storage key');

    if (tenant.companyId !== AVANTIME_DOCUMENT_COMPANY_ID) return null;
    if (kind === 'original') {
      return path.join(this.dataDirectory, 'uploads', 'documents', key);
    }
    if (kind === 'text') return path.join(this.dataDirectory, 'text', key);
    if (kind === 'chunks') return path.join(this.dataDirectory, 'chunks', key);
    if (kind === 'history') {
      return path.join(this.dataDirectory, 'knowledge-history.json');
    }

    return null;
  }
}

export class S3DocumentStorage implements DocumentStorage {
  readonly kind = 's3';
  private readonly client: S3DocumentStorageClient;

  constructor(
    private readonly config: S3DocumentStorageConfig,
    client?: S3DocumentStorageClient,
  ) {
    this.client =
      client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: config.forcePathStyle,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async write(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    data: Buffer,
    options: DocumentStorageWriteOptions = {},
  ) {
    const checksum = verifyChecksum(data, options.checksum);
    const objectKey = createDocumentObjectKey(tenant, kind, key);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
        Body: data,
        ContentType: options.contentType,
        ChecksumSHA256: Buffer.from(checksum, 'hex').toString('base64'),
        Metadata: {
          sha256: checksum,
        },
      }),
    );

    return { checksum };
  }

  async read(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    options: DocumentStorageReadOptions = {},
  ) {
    const objectKey = createDocumentObjectKey(tenant, kind, key);

    try {
      const output = (await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: objectKey,
        }),
      )) as GetObjectCommandOutput;

      if (!output.Body) return null;
      const data = Buffer.from(await output.Body.transformToByteArray());
      verifyChecksum(data, options.expectedChecksum);
      return data;
    } catch (error) {
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async delete(tenant: DocumentTenantContext, kind: DocumentObjectKind, key: string) {
    const objectKey = createDocumentObjectKey(tenant, kind, key);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: objectKey,
      }),
    );

    return true;
  }
}
