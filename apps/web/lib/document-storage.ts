import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  AVANTIME_DOCUMENT_COMPANY_ID,
  type DocumentTenantContext,
} from './document-model';

export type DocumentObjectKind = 'original' | 'text' | 'chunks' | 'history';

export interface DocumentStorage {
  readonly kind: string;
  write(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    data: Buffer,
  ): Promise<void>;
  read(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
  ): Promise<Buffer | null>;
  delete(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
  ): Promise<boolean>;
}

export interface S3DocumentStorage extends DocumentStorage {
  readonly kind: 's3';
}

function isMissingFile(error: unknown) {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

function assertSafeSegment(value: string, label: string) {
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

  assertSafeSegment(tenant.companyId, 'companyId');
  assertSafeSegment(tenant.userId, 'userId');
}

export class LocalDocumentStorage implements DocumentStorage {
  readonly kind = 'local';

  constructor(private readonly dataDirectory = path.join(process.cwd(), '.data')) {}

  async write(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
    data: Buffer,
  ) {
    const filePath = this.resolvePath(tenant, kind, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, data);
  }

  async read(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
  ) {
    const filePath = this.resolvePath(tenant, kind, key);

    try {
      return await readFile(filePath);
    } catch (error) {
      if (!isMissingFile(error)) throw error;
    }

    const legacyPath = this.resolveLegacyPath(tenant, kind, key);
    if (!legacyPath) return null;

    try {
      return await readFile(legacyPath);
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async delete(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
  ) {
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

  private resolvePath(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
  ) {
    assertDocumentTenantContext(tenant);
    assertSafeSegment(kind, 'kind');
    assertSafeSegment(key, 'storage key');

    return path.join(
      this.dataDirectory,
      'document-tenants',
      tenant.companyId,
      'objects',
      kind,
      key,
    );
  }

  private resolveLegacyPath(
    tenant: DocumentTenantContext,
    kind: DocumentObjectKind,
    key: string,
  ) {
    assertDocumentTenantContext(tenant);
    assertSafeSegment(key, 'storage key');

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
