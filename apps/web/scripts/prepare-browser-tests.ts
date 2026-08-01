import { createHash, pbkdf2Sync } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import { PrismaClient } from '@prisma/client';

import {
  BROWSER_DATA_DIRECTORY,
  BROWSER_DATABASE_NAME,
  BROWSER_DATABASE_URL,
  browserFixtureIds,
  browserIdentities,
} from '../tests/browser/environment';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const databaseDirectory = path.resolve(scriptDirectory, '../../../packages/database');
const repositoryRoot = path.resolve(scriptDirectory, '../../..');
const firstMigration = '20260727150000_document_metadata_persistence';
const FIXED_DATE = new Date('2026-01-15T10:00:00.000Z');
const DOCUMENT_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=',
  'base64',
);

function validateDatabaseUrl() {
  const url = new URL(BROWSER_DATABASE_URL);
  const databaseName = url.pathname.slice(1);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Browser tests may only reset a loopback PostgreSQL database.');
  }
  if (databaseName !== BROWSER_DATABASE_NAME) {
    throw new Error(`Browser tests may only reset ${BROWSER_DATABASE_NAME}.`);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Browser fixture preparation is forbidden in production.');
  }
  return url;
}

function deterministicPasswordHash(password: string, identity: string) {
  const salt = createHash('sha256').update(`browser-test:${identity}`).digest('hex').slice(0, 32);
  const digest = pbkdf2Sync(password, salt, 210_000, 32, 'sha256').toString('hex');
  return `pbkdf2$210000$${salt}$${digest}`;
}

function runPrisma(args: string[]) {
  const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), ...args], {
    cwd: databaseDirectory,
    env: { ...process.env, DATABASE_URL: BROWSER_DATABASE_URL },
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(
      `Prisma ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}.`,
    );
  }
}

async function resetDatabase(databaseUrl: URL) {
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    await admin.$queryRaw`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = ${BROWSER_DATABASE_NAME} AND pid <> pg_backend_pid()`;
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${BROWSER_DATABASE_NAME}"`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${BROWSER_DATABASE_NAME}"`);
  } finally {
    await admin.$disconnect();
  }
}

async function seedDatabase() {
  const prisma = new PrismaClient({ datasourceUrl: BROWSER_DATABASE_URL });
  const checksum = createHash('sha256').update(DOCUMENT_BYTES).digest('hex');
  try {
    await prisma.company.createMany({
      data: [
        { id: browserIdentities.tenantA.companyId, name: 'Browser Tenant Alpha' },
        { id: browserIdentities.tenantB.companyId, name: 'Browser Tenant Beta' },
        { id: browserIdentities.identityClient.companyId, name: 'Browser Identity Tenant' },
        { id: browserIdentities.admin.companyId, name: 'Avantime' },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: 'browser-user-a',
          email: browserIdentities.tenantA.email,
          emailNormalized: browserIdentities.tenantA.email,
          name: 'Browser User Alpha',
          role: 'CLIENT',
          companyId: browserIdentities.tenantA.companyId,
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-user-b',
          email: browserIdentities.tenantB.email,
          emailNormalized: browserIdentities.tenantB.email,
          name: 'Browser User Beta',
          role: 'CLIENT',
          companyId: browserIdentities.tenantB.companyId,
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-admin',
          email: browserIdentities.admin.email,
          emailNormalized: browserIdentities.admin.email,
          name: 'Browser Administrator',
          role: 'ADMIN',
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-identity-client',
          email: browserIdentities.identityClient.email,
          emailNormalized: browserIdentities.identityClient.email,
          emailVerifiedAt: FIXED_DATE,
          name: 'Browser Identity Client',
          role: 'CLIENT',
          companyId: browserIdentities.identityClient.companyId,
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-identity-admin',
          email: browserIdentities.identityAdmin.email,
          emailNormalized: browserIdentities.identityAdmin.email,
          emailVerifiedAt: FIXED_DATE,
          name: 'Browser Identity Administrator',
          role: 'ADMIN',
          companyId: browserIdentities.identityAdmin.companyId,
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-identity-owner',
          email: browserIdentities.identityOwner.email,
          emailNormalized: browserIdentities.identityOwner.email,
          emailVerifiedAt: FIXED_DATE,
          name: 'Browser Identity Owner',
          role: 'CLIENT',
          companyId: browserIdentities.identityOwner.companyId,
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-identity-manager',
          email: browserIdentities.identityManager.email,
          emailNormalized: browserIdentities.identityManager.email,
          emailVerifiedAt: FIXED_DATE,
          name: 'Browser Identity Manager',
          role: 'CLIENT',
          companyId: browserIdentities.identityManager.companyId,
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-identity-viewer',
          email: browserIdentities.identityViewer.email,
          emailNormalized: browserIdentities.identityViewer.email,
          emailVerifiedAt: FIXED_DATE,
          name: 'Browser Identity Viewer',
          role: 'CLIENT',
          companyId: browserIdentities.identityViewer.companyId,
          active: true,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        {
          id: 'browser-membership-a',
          userId: 'browser-user-a',
          companyId: browserIdentities.tenantA.companyId,
          role: 'CLIENT',
          organizationRole: 'MEMBER',
        },
        {
          id: 'browser-membership-b',
          userId: 'browser-user-b',
          companyId: browserIdentities.tenantB.companyId,
          role: 'CLIENT',
          organizationRole: 'MEMBER',
        },
        {
          id: 'browser-membership-admin',
          userId: 'browser-admin',
          companyId: browserIdentities.admin.companyId,
          role: 'ADMIN',
          organizationRole: 'ADMIN',
        },
        {
          id: 'browser-membership-identity-client',
          userId: 'browser-identity-client',
          companyId: browserIdentities.identityClient.companyId,
          role: 'CLIENT',
          organizationRole: 'MEMBER',
        },
        {
          id: 'browser-membership-identity-admin',
          userId: 'browser-identity-admin',
          companyId: browserIdentities.identityAdmin.companyId,
          role: 'ADMIN',
          organizationRole: 'ADMIN',
        },
        {
          id: 'browser-membership-identity-owner',
          userId: 'browser-identity-owner',
          companyId: browserIdentities.identityOwner.companyId,
          role: 'CLIENT',
          organizationRole: 'OWNER',
        },
        {
          id: 'browser-membership-identity-manager',
          userId: 'browser-identity-manager',
          companyId: browserIdentities.identityManager.companyId,
          role: 'CLIENT',
          organizationRole: 'MANAGER',
        },
        {
          id: 'browser-membership-identity-viewer',
          userId: 'browser-identity-viewer',
          companyId: browserIdentities.identityViewer.companyId,
          role: 'CLIENT',
          organizationRole: 'VIEWER',
        },
      ],
    });
    await prisma.platformRoleAssignment.createMany({
      data: [
        {
          id: 'browser-platform-admin-assignment',
          userId: 'browser-admin',
          role: 'PLATFORM_ADMIN',
          active: true,
          version: 1,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-platform-owner-assignment',
          userId: 'browser-identity-owner',
          role: 'PLATFORM_OWNER',
          active: true,
          version: 1,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
      ],
    });
    await prisma.userCredential.createMany({
      data: [
        {
          id: 'browser-credential-a',
          userId: 'browser-user-a',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.tenantA.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.tenantA.password,
            browserIdentities.tenantA.email,
          ),
        },
        {
          id: 'browser-credential-b',
          userId: 'browser-user-b',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.tenantB.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.tenantB.password,
            browserIdentities.tenantB.email,
          ),
        },
        {
          id: 'browser-credential-admin',
          userId: 'browser-admin',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.admin.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.admin.password,
            browserIdentities.admin.email,
          ),
        },
        {
          id: 'browser-credential-identity-client',
          userId: 'browser-identity-client',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.identityClient.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.identityClient.password,
            browserIdentities.identityClient.email,
          ),
        },
        {
          id: 'browser-credential-identity-admin',
          userId: 'browser-identity-admin',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.identityAdmin.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.identityAdmin.password,
            browserIdentities.identityAdmin.email,
          ),
        },
        {
          id: 'browser-credential-identity-owner',
          userId: 'browser-identity-owner',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.identityOwner.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.identityOwner.password,
            browserIdentities.identityOwner.email,
          ),
        },
        {
          id: 'browser-credential-identity-manager',
          userId: 'browser-identity-manager',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.identityManager.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.identityManager.password,
            browserIdentities.identityManager.email,
          ),
        },
        {
          id: 'browser-credential-identity-viewer',
          userId: 'browser-identity-viewer',
          kind: 'PASSWORD',
          identifierNormalized: browserIdentities.identityViewer.email,
          passwordHash: deterministicPasswordHash(
            browserIdentities.identityViewer.password,
            browserIdentities.identityViewer.email,
          ),
        },
      ],
    });
    await prisma.supportRequest.createMany({
      data: [
        {
          id: browserFixtureIds.requestA,
          publicId: browserFixtureIds.requestPublicA,
          title: 'Alpha browser request',
          description: 'Deterministic tenant Alpha browser fixture.',
          category: 'Browser',
          requesterId: 'browser-user-a',
          companyId: browserIdentities.tenantA.companyId,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: browserFixtureIds.requestB,
          publicId: browserFixtureIds.requestPublicB,
          title: 'Beta confidential browser request',
          description: 'Deterministic tenant Beta browser fixture.',
          category: 'Browser',
          requesterId: 'browser-user-b',
          companyId: browserIdentities.tenantB.companyId,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
      ],
    });
    await prisma.requestMessage.createMany({
      data: [
        {
          id: 'browser-message-a',
          body: 'Alpha fixture message.',
          authorId: 'browser-user-a',
          requestId: browserFixtureIds.requestA,
          createdAt: FIXED_DATE,
        },
        {
          id: 'browser-message-b',
          body: 'Beta confidential fixture message.',
          authorId: 'browser-user-b',
          requestId: browserFixtureIds.requestB,
          createdAt: FIXED_DATE,
        },
      ],
    });
    await prisma.portalNotification.createMany({
      data: [
        {
          id: browserFixtureIds.notificationA,
          userId: 'browser-user-a',
          companyId: browserIdentities.tenantA.companyId,
          category: 'REQUEST',
          title: 'Alpha browser notification',
          href: `/portal/requests/${browserFixtureIds.requestPublicA}`,
          createdAt: FIXED_DATE,
        },
        {
          id: browserFixtureIds.notificationB,
          userId: 'browser-user-b',
          companyId: browserIdentities.tenantB.companyId,
          category: 'REQUEST',
          title: 'Beta confidential notification',
          href: `/portal/requests/${browserFixtureIds.requestPublicB}`,
          createdAt: FIXED_DATE,
        },
      ],
    });
    await prisma.notificationPreference.createMany({
      data: [{ userId: 'browser-user-a' }, { userId: 'browser-user-b' }],
    });
    await prisma.knowledgeArticle.create({
      data: {
        id: 'browser-article',
        slug: 'browser-accessibility-fixture',
        title: 'Browser accessibility fixture',
        summary: 'Deterministic article for browser automation.',
        category: 'Testing',
        tags: ['browser'],
        content: [{ type: 'paragraph', text: 'Safe deterministic browser fixture.' }],
        status: 'PUBLISHED',
        ownerScope: 'PLATFORM',
        visibility: 'PUBLIC',
        classificationEvidence: 'browser-platform-article-v1',
        authorId: 'browser-admin',
        publishedAt: FIXED_DATE,
        createdAt: FIXED_DATE,
        updatedAt: FIXED_DATE,
      },
    });
    await prisma.knowledgeArticle.createMany({
      data: [
        {
          id: 'browser-article-tenant-a',
          slug: 'browser-tenant-a-knowledge',
          title: 'Alpha organization knowledge',
          summary: 'Tenant Alpha only.',
          category: 'Testing',
          content: [{ title: 'Alpha', paragraphs: ['Alpha organization material.'] }],
          status: 'PUBLISHED',
          ownerScope: 'ORGANIZATION',
          companyId: browserIdentities.tenantA.companyId,
          visibility: 'ORGANIZATION',
          classificationEvidence: 'browser-organization-created-v1',
          authorId: 'browser-user-a',
          publishedAt: FIXED_DATE,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-article-tenant-b',
          slug: 'browser-tenant-b-knowledge',
          title: 'Beta confidential knowledge',
          summary: 'Tenant Beta only.',
          category: 'Testing',
          content: [{ title: 'Beta', paragraphs: ['Beta confidential material.'] }],
          status: 'PUBLISHED',
          ownerScope: 'ORGANIZATION',
          companyId: browserIdentities.tenantB.companyId,
          visibility: 'ORGANIZATION',
          classificationEvidence: 'browser-organization-created-v1',
          authorId: 'browser-user-b',
          publishedAt: FIXED_DATE,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-article-publication-review',
          slug: 'browser-publication-review',
          title: 'Governance publication review',
          summary: 'Non-confidential publication ceremony fixture.',
          category: 'Testing',
          content: [{ title: 'Review', paragraphs: ['Safe synthetic content.'] }],
          status: 'REVIEW',
          ownerScope: 'ORGANIZATION',
          companyId: browserIdentities.identityOwner.companyId,
          visibility: 'PRIVATE',
          classificationEvidence: 'browser-organization-reviewed-v1',
          authorId: 'browser-identity-owner',
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
      ],
    });

    await prisma.governanceApprovalRequest.createMany({
      data: [
        {
          id: 'browser-approval-rejected',
          actionType: 'PLATFORM_AUDIT_EXPORT',
          scope: 'PLATFORM',
          safeParameters: { from: '2026-01-01', to: '2026-01-02', format: 'json' },
          payloadFingerprint: '1'.repeat(64),
          requesterId: 'browser-admin',
          status: 'REJECTED',
          expiresAt: new Date('2026-01-15T10:10:00.000Z'),
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-approval-cancelled',
          actionType: 'PLATFORM_AUDIT_EXPORT',
          scope: 'PLATFORM',
          safeParameters: { from: '2026-01-03', to: '2026-01-04', format: 'json' },
          payloadFingerprint: '2'.repeat(64),
          requesterId: 'browser-admin',
          status: 'CANCELLED',
          expiresAt: new Date('2026-01-15T10:10:00.000Z'),
          cancelledAt: FIXED_DATE,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
        {
          id: 'browser-approval-expired',
          actionType: 'PLATFORM_AUDIT_EXPORT',
          scope: 'PLATFORM',
          safeParameters: { from: '2026-01-05', to: '2026-01-06', format: 'json' },
          payloadFingerprint: '3'.repeat(64),
          requesterId: 'browser-admin',
          status: 'EXPIRED',
          expiresAt: new Date('2026-01-15T10:10:00.000Z'),
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
      ],
    });

    const documents = [
      {
        id: browserFixtureIds.documentA,
        companyId: browserIdentities.tenantA.companyId,
        uploadedBy: 'browser-user-a',
        originalName: 'alpha-browser-fixture.png',
        storedName: 'alpha-browser-fixture.png',
      },
      {
        id: browserFixtureIds.documentB,
        companyId: browserIdentities.tenantB.companyId,
        uploadedBy: 'browser-user-b',
        originalName: 'beta-confidential-fixture.png',
        storedName: 'beta-confidential-fixture.png',
      },
      {
        id: browserFixtureIds.adminDocument,
        companyId: browserIdentities.admin.companyId,
        uploadedBy: 'browser-admin',
        originalName: 'admin-browser-fixture.png',
        storedName: 'admin-browser-fixture.png',
      },
    ];
    for (const document of documents) {
      await prisma.documentMetadata.create({
        data: {
          ...document,
          mimeType: 'image/png',
          size: DOCUMENT_BYTES.length,
          checksum,
          status: 'COMPLETED',
          detectedDocumentType: 'IMAGE',
          detectedMimeType: 'image/png',
          textExtractionMethod: 'NONE',
          ocrStatus: 'NOT_REQUIRED',
          embeddingStatus: 'DISABLED',
          requiresManualReview: false,
          processingCompletedAt: FIXED_DATE,
          createdAt: FIXED_DATE,
          updatedAt: FIXED_DATE,
        },
      });
      const documentPath = path.join(
        BROWSER_DATA_DIRECTORY,
        'document-tenants',
        document.companyId,
        'objects',
        'original',
        document.storedName,
      );
      await mkdir(path.dirname(documentPath), { recursive: true });
      await writeFile(documentPath, DOCUMENT_BYTES);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const databaseUrl = validateDatabaseUrl();
  await rm(BROWSER_DATA_DIRECTORY, { recursive: true, force: true });
  await resetDatabase(databaseUrl);
  runPrisma([
    'db',
    'execute',
    '--file',
    path.join(repositoryRoot, 'apps/web/tests/fixtures/legacy-account-baseline.sql'),
    '--schema',
    'prisma/schema.prisma',
  ]);
  runPrisma([
    'db',
    'execute',
    '--file',
    path.join(
      repositoryRoot,
      'packages/database/prisma/migrations',
      firstMigration,
      'migration.sql',
    ),
    '--schema',
    'prisma/schema.prisma',
  ]);
  runPrisma(['migrate', 'resolve', '--applied', firstMigration]);
  runPrisma(['migrate', 'deploy']);
  runPrisma(['db', 'push', '--skip-generate']);
  await seedDatabase();
  console.log(`Browser fixtures prepared in isolated database ${BROWSER_DATABASE_NAME}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Browser fixture preparation failed.');
  process.exitCode = 1;
});
