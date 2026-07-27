import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { addAttachment, getAttachmentFile } from '../lib/attachments';
import { authorizeSession } from '../lib/authorization';
import { getDemoIdentity, isDemoAuthEnabled } from '../lib/demo-auth';
import { authorizeDocumentSession } from '../lib/document-authorization';
import { getRequest } from '../lib/requests-store';
import { safeReturnTo } from '../lib/safe-return-to';
import { getSessionSecret, type AppSession } from '../lib/session';

function session(overrides: Partial<AppSession> = {}): AppSession {
  return {
    userId: 'test-user',
    name: 'Test User',
    company: 'Test Company',
    companyId: 'test-company',
    email: 'test@example.com',
    role: 'CLIENT',
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

test('SESSION_SECRET is required and must be sufficiently long', () => {
  assert.throws(() => getSessionSecret({}), /SESSION_SECRET is required/);
  assert.throws(
    () => getSessionSecret({ SESSION_SECRET: 'too-short' }),
    /at least 32 characters/,
  );
  assert.equal(getSessionSecret({ SESSION_SECRET: 'x'.repeat(32) }), 'x'.repeat(32));
});

test('demo authentication is explicit and always denied in production', () => {
  assert.equal(isDemoAuthEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(
    getDemoIdentity('admin@avantime.lv', 'admin', {
      NODE_ENV: 'development',
      ENABLE_DEMO_AUTH: 'true',
    })?.role,
    'ADMIN',
  );
  assert.equal(
    getDemoIdentity('admin@avantime.lv', 'admin', {
      NODE_ENV: 'production',
      ENABLE_DEMO_AUTH: 'true',
    }),
    null,
  );
});

test('protected API authorization denies anonymous access with 401', () => {
  const authorization = authorizeSession(null);

  assert.ok(authorization.response);
  assert.equal(authorization.response.status, 401);
});

test('protected API authorization distinguishes unauthenticated and forbidden access', () => {
  const unauthenticated = authorizeSession(null, ['ADMIN']);
  const forbidden = authorizeSession(session(), ['ADMIN']);
  const allowed = authorizeSession(session({ role: 'ADMIN', companyId: undefined }), ['ADMIN']);

  assert.equal(unauthenticated.response?.status, 401);
  assert.equal(forbidden.response?.status, 403);
  assert.equal(allowed.session?.role, 'ADMIN');
});

test('Document API denies access unless the session belongs to an ADMIN', () => {
  assert.equal(authorizeDocumentSession(null).response?.status, 401);
  assert.equal(authorizeDocumentSession(session()).response?.status, 403);
  assert.equal(
    authorizeDocumentSession(session({ role: 'ADMIN', companyId: undefined })).session?.role,
    'ADMIN',
  );
});

test('a client cannot read a request owned by another company', async () => {
  const sameCompany = await getRequest('AV-1042', session({ companyId: 'demo-company' }));
  const otherCompany = await getRequest('AV-1042', session({ companyId: 'other-company' }));

  assert.equal(sameCompany?.id, 'AV-1042');
  assert.equal(otherCompany, null);
});

test('a client cannot download an attachment owned by another company', async () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousUploadDir = process.env.UPLOAD_DIR;
  const uploadDir = await mkdtemp(path.join(os.tmpdir(), 'avantime-attachments-'));

  delete process.env.DATABASE_URL;
  process.env.UPLOAD_DIR = uploadDir;

  try {
    const bytes = Buffer.from('test attachment');
    const file = {
      name: 'evidence.txt',
      type: 'text/plain',
      size: bytes.byteLength,
      arrayBuffer: async () =>
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    } as File;
    const attachment = await addAttachment('AV-1042', file);

    const denied = await getAttachmentFile(
      attachment.id,
      session({ companyId: 'other-company' }),
    );
    const allowed = await getAttachmentFile(
      attachment.id,
      session({ companyId: 'demo-company' }),
    );

    assert.equal(denied, null);
    assert.equal(allowed?.name, 'evidence.txt');
    assert.equal(allowed?.data.toString('utf8'), 'test attachment');
  } finally {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
    await rm(uploadDir, { recursive: true, force: true });
  }
});

test('returnTo accepts only local application paths', () => {
  assert.equal(safeReturnTo('/dashboard?tab=ai'), '/dashboard?tab=ai');
  assert.equal(safeReturnTo('https://attacker.example'), undefined);
  assert.equal(safeReturnTo('//attacker.example/path'), undefined);
  assert.equal(safeReturnTo('/\\attacker.example/path'), undefined);
  assert.equal(safeReturnTo('javascript:alert(1)'), undefined);
});
