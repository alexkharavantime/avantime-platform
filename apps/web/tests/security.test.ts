import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { addAttachment, getAttachmentFile } from '../lib/attachments';
import { authorizeSession } from '../lib/authorization';
import { getDemoIdentity, isDemoAuthEnabled } from '../lib/demo-auth';
import {
  authorizeDocumentReadSession,
  authorizeDocumentSession,
} from '../lib/document-authorization';
import { toClientDocumentApiItem, type DocumentMetadata } from '../lib/document-model';
import { appendCompatibilitySearchParams } from '../lib/compatibility-redirect';
import {
  appendPortalAudit,
  createPortalAuditEntry,
  type PortalAuditInput,
} from '../lib/portal-audit';
import { isSafePortalNotificationHref } from '../lib/portal-notifications';
import { authorizePortalSession, validatePortalSession } from '../lib/portal-session';
import { getRequest } from '../lib/requests-store';
import { safeReturnTo } from '../lib/safe-return-to';
import { getSessionSecret, type AppSession } from '../lib/session';
import { canInviteExistingMember } from '../lib/team';

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
  assert.throws(() => getSessionSecret({ SESSION_SECRET: 'too-short' }), /at least 32 characters/);
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

test('Document management requires an active privileged organization membership', () => {
  assert.equal(authorizeDocumentSession(null).response?.status, 401);
  assert.equal(authorizeDocumentSession(session()).response?.status, 403);
  assert.equal(
    authorizeDocumentSession(
      session({ role: 'ADMIN', organizationRole: 'ADMIN', membershipStatus: 'ACTIVE' }),
    ).session?.organizationRole,
    'ADMIN',
  );
  assert.equal(
    authorizeDocumentSession(session({ role: 'ADMIN', companyId: undefined })).response?.status,
    403,
  );
});

test('client document reads require an authenticated company membership', () => {
  assert.equal(authorizeDocumentReadSession(null).response?.status, 401);
  assert.equal(
    authorizeDocumentReadSession(session({ companyId: undefined })).response?.status,
    403,
  );
  assert.equal(authorizeDocumentReadSession(session()).session?.companyId, 'test-company');
  assert.equal(
    authorizeDocumentReadSession(session({ role: 'ADMIN', companyId: undefined })).response?.status,
    403,
  );
});

test('portal session validation rejects inactive and cross-tenant identities', async () => {
  const current = session();
  const validIdentity = {
    id: current.userId,
    email: current.email,
    role: current.role,
    active: true,
    disabledAt: null,
    memberships: [{ companyId: current.companyId!, active: true }],
  };
  const validated = await validatePortalSession(current, {
    databaseConfigured: true,
    loadIdentity: async () => validIdentity,
  });
  assert.equal(validated?.userId, current.userId);
  assert.equal(validated?.organizationRole, 'MEMBER');
  assert.equal(validated?.membershipStatus, 'ACTIVE');
  assert.equal(validated?.membershipVersion, 1);
  assert.equal(
    await validatePortalSession(current, {
      databaseConfigured: true,
      loadIdentity: async () => ({ ...validIdentity, active: false }),
    }),
    null,
  );
  assert.equal(
    await validatePortalSession(current, {
      databaseConfigured: true,
      loadIdentity: async () => ({
        ...validIdentity,
        memberships: [{ companyId: 'other-company', active: true }],
      }),
    }),
    null,
  );
  assert.equal(authorizePortalSession(session({ companyId: undefined })).response?.status, 403);
});

test('portal audit derives tenant and actor exclusively from the server session', () => {
  const entry = createPortalAuditEntry(
    session({ companyId: 'tenant-a', userId: 'actor-a' }),
    {
      action: 'portal.document.download',
      targetType: 'document',
      targetId: 'document-1',
      result: 'SUCCEEDED',
      metadata: {
        companyId: 'tenant-b',
        actorId: 'actor-b',
        sizeBytes: 42,
      },
    },
    'correlation-1',
  );

  assert.equal(entry.companyId, 'tenant-a');
  assert.equal(entry.actorId, 'actor-a');
  assert.equal(entry.correlationId, 'correlation-1');
  assert.deepEqual(entry.safeMetadata, { sizeBytes: 42 });
  assert.throws(
    () =>
      createPortalAuditEntry(
        session(),
        {
          action: 'portal.access',
          targetType: 'document',
          targetId: null,
          result: 'SUCCEEDED',
        },
        'correlation-2',
      ),
    /do not match/,
  );
});

test('portal audit metadata allowlist removes all sensitive document and AI fields', () => {
  const entry = createPortalAuditEntry(
    session(),
    {
      action: 'portal.document.download',
      targetType: 'document',
      targetId: 'document-1',
      result: 'SUCCEEDED',
      metadata: {
        sizeBytes: 1024,
        url: 'https://portal.example/documents/document-1?token=secret',
        query: 'customer name',
        pathname: '/portal/documents/customer-name',
        email: 'customer@example.com',
        name: 'Customer',
        invitation: 'invite-token',
        filename: 'customer-contract.pdf',
        documentText: 'private text',
        requestContent: 'private request',
        messageContent: 'private message',
        searchQuery: 'private search',
        prompt: 'private prompt',
        answer: 'private answer',
        excerpt: 'private excerpt',
        provider: 'provider-name',
        model: 'model-name',
        credentials: 'secret',
        rawError: 'database connection details',
      },
    },
    'correlation-3',
  );

  assert.deepEqual(entry.safeMetadata, { sizeBytes: 1024 });
  assert.equal(JSON.stringify(entry).includes('customer-contract.pdf'), false);
  assert.equal(JSON.stringify(entry).includes('private'), false);
});

test('portal access audit never stores a URL, query, or user-derived pathname', () => {
  const entry = createPortalAuditEntry(
    session(),
    {
      action: 'portal.access',
      targetType: 'portal',
      targetId: '/portal/documents/customer-value?search=secret',
      result: 'SUCCEEDED',
      metadata: {
        url: 'https://portal.example/portal?search=secret',
        query: 'secret',
        pathname: '/portal/customer-value',
      },
    },
    'correlation-4',
  );

  assert.equal(entry.targetId, null);
  assert.deepEqual(entry.safeMetadata, {});
});

test('company, team, and notification audit records contain no user content', () => {
  const inputs: PortalAuditInput[] = [
    {
      action: 'portal.company.update',
      targetType: 'company',
      targetId: 'test-company',
      result: 'SUCCEEDED',
      metadata: { companyName: 'Private Company', email: 'owner@example.com' },
    },
    {
      action: 'portal.team.invite',
      targetType: 'invitation',
      targetId: 'invitation-1',
      result: 'SUCCEEDED',
      metadata: { name: 'Invitee', email: 'invitee@example.com', invitation: 'token' },
    },
    {
      action: 'portal.notification.read',
      targetType: 'notification',
      targetId: 'notification-1',
      result: 'SUCCEEDED',
      metadata: { body: 'Private notification body' },
    },
  ];

  for (const [index, input] of inputs.entries()) {
    const entry = createPortalAuditEntry(session(), input, `correlation-${index + 5}`);
    assert.deepEqual(entry.safeMetadata, {});
    assert.equal(JSON.stringify(entry).includes('@example.com'), false);
    assert.equal(JSON.stringify(entry).includes('Private'), false);
  }
});

test('portal audit supports failure results without exposing audit sink errors', async () => {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => warnings.push(values);
  try {
    await assert.doesNotReject(
      appendPortalAudit(
        session(),
        {
          action: 'portal.notification.read',
          targetType: 'notification',
          targetId: 'notification-1',
          result: 'FAILED',
        },
        'correlation-8',
        {
          databaseConfigured: true,
          sink: {
            append: async () => {
              throw new Error('postgres://user:password@internal/audit');
            },
          },
        },
      ),
    );
  } finally {
    console.warn = originalWarn;
  }

  assert.deepEqual(warnings, [['Portal audit event could not be persisted.']]);
});

test('quarantine retry policy requires document management permission', () => {
  assert.equal(authorizeDocumentSession(null).response?.status, 401);
  assert.equal(authorizeDocumentSession(session({ role: 'CLIENT' })).response?.status, 403);
  assert.equal(
    authorizeDocumentSession(
      session({ role: 'ADMIN', organizationRole: 'ADMIN', membershipStatus: 'ACTIVE' }),
    ).response,
    undefined,
  );
});

test('document reprocess route derives tenant server-side and rejects client companyId', async () => {
  const route = await import('node:fs/promises').then(({ readFile }) =>
    readFile(path.join(process.cwd(), 'app/api/documents/reprocess/route.ts'), 'utf8'),
  );
  assert.match(route, /authorizeDocumentReprocessApi/);
  assert.match(route, /getDocumentTenantContext/);
  assert.doesNotMatch(route, /companyId/);
});

test('RAG APIs derive tenant server-side and explicitly reject client companyId', async () => {
  const routes = await Promise.all(
    ['search', 'ask', 'indexing', 'reindex'].map((name) =>
      import('node:fs/promises').then(({ readFile }) =>
        readFile(path.join(process.cwd(), `app/api/documents/${name}/route.ts`), 'utf8'),
      ),
    ),
  );
  for (const route of routes) {
    assert.match(route, /authorizeDocument(?:Read|Reprocess)Api/);
    assert.match(route, /getDocumentTenantContext/);
    assert.match(route, /TENANT_INPUT_REJECTED/);
  }
});

test('client document projection excludes tenant and worker internals', () => {
  const document = {
    id: 'doc-1',
    companyId: 'test-company',
    uploadedBy: 'test-user',
    originalName: 'document.pdf',
    storedName: 'internal-name.pdf',
    mimeType: 'application/pdf',
    size: 100,
    status: 'FAILED',
    checksum: '0'.repeat(64),
    createdAt: '2026-07-29T10:00:00.000Z',
    updatedAt: '2026-07-29T10:00:00.000Z',
    deletedAt: null,
    processingAttempts: 2,
    lastErrorCode: 'INTERNAL_ERROR',
    lastErrorMessage: 'provider detail',
    processingStartedAt: null,
    processingCompletedAt: null,
    nextRetryAt: null,
    quarantinedAt: null,
    workerId: 'worker-secret',
    pages: null,
    textLength: null,
    chunksCount: null,
    detectedDocumentType: 'UNKNOWN',
    detectedMimeType: 'application/pdf',
    detectionConfidence: null,
    textExtractionMethod: 'NONE',
    ocrStatus: 'FAILED',
    ocrProvider: 'internal-provider',
    ocrLanguage: null,
    ocrStartedAt: null,
    ocrCompletedAt: null,
    pageCount: null,
    extractedCharacterCount: null,
    requiresManualReview: true,
    intelligenceVersion: 'v1',
    embeddingStatus: 'FAILED',
    embeddingModel: 'internal-model',
    embeddingDimensions: null,
    embeddingVersion: null,
    embeddedAt: null,
    embeddingAttempts: 1,
    lastEmbeddingErrorCode: 'INTERNAL_EMBEDDING_ERROR',
    embeddingContentHash: null,
  } satisfies DocumentMetadata;
  const clientItem = toClientDocumentApiItem(document);
  assert.equal('companyId' in clientItem, false);
  assert.equal('workerId' in clientItem, false);
  assert.equal('errorMessage' in clientItem, false);
  assert.equal('ocrProvider' in clientItem, false);
  assert.equal(clientItem.requiresManualReview, true);
});

test('dashboard compatibility preserves repeated query parameters', () => {
  assert.equal(
    appendCompatibilitySearchParams('/portal/knowledge', {
      q: 'invoice',
      tag: ['one', 'two'],
    }),
    '/portal/knowledge?q=invoice&tag=one&tag=two',
  );
});

test('notification links are restricted to approved portal resources', () => {
  assert.equal(isSafePortalNotificationHref('/portal/requests/AV-1042'), true);
  assert.equal(isSafePortalNotificationHref('/portal/documents/doc-1'), true);
  assert.equal(isSafePortalNotificationHref('/admin'), false);
  assert.equal(isSafePortalNotificationHref('//attacker.example'), false);
});

test('team invitation cannot reassign an identity from another tenant', () => {
  const current = session();
  assert.equal(canInviteExistingMember(current, null), true);
  assert.equal(canInviteExistingMember(current, { companyId: 'test-company' }), true);
  assert.equal(canInviteExistingMember(current, { companyId: 'other-company' }), false);
  assert.equal(
    canInviteExistingMember(session({ companyId: undefined }), { companyId: null }),
    false,
  );
});

test('portal shell contains role-aware and mobile navigation controls', async () => {
  const [source, layout] = await Promise.all([
    import('node:fs/promises').then(({ readFile }) =>
      readFile(path.join(process.cwd(), 'components/portal/portal-shell.tsx'), 'utf8'),
    ),
    import('node:fs/promises').then(({ readFile }) =>
      readFile(path.join(process.cwd(), 'app/portal/layout.tsx'), 'utf8'),
    ),
  ]);
  assert.match(source, /navigation\.map/);
  assert.doesNotMatch(source, /role === 'ADMIN'/);
  assert.match(layout, /buildPortalNavigation/);
  assert.match(source, /aria-expanded=/);
  assert.match(source, /Перейти к содержимому/);
  assert.match(source, /aria-current=/);
});

test('client portal requests do not accept a client-supplied companyId', async () => {
  const routes = await Promise.all(
    [
      'app/api/requests/route.ts',
      'app/api/team/route.ts',
      'app/api/account/route.ts',
      'app/api/portal/notifications/route.ts',
    ].map((file) =>
      import('node:fs/promises').then(({ readFile }) =>
        readFile(path.join(process.cwd(), file), 'utf8'),
      ),
    ),
  );
  for (const route of routes) {
    assert.doesNotMatch(route, /searchParams\.get\(['"]companyId/);
  }
  assert.match(routes[3], /TENANT_INPUT_REJECTED/);
});

test('AI usage summary derives tenant server-side and rejects client companyId', async () => {
  const route = await import('node:fs/promises').then(({ readFile }) =>
    readFile(path.join(process.cwd(), 'app/api/admin/ai/usage/route.ts'), 'utf8'),
  );
  assert.match(route, /authorizeApi\(\['ADMIN'\]\)/);
  assert.match(route, /getDocumentTenantContext/);
  assert.match(route, /TENANT_INPUT_REJECTED/);
  assert.doesNotMatch(route, /searchParams\.get\('companyId'\)/);
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

    const denied = await getAttachmentFile(attachment.id, session({ companyId: 'other-company' }));
    const allowed = await getAttachmentFile(attachment.id, session({ companyId: 'demo-company' }));

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
