import path from 'node:path';

const webDirectory =
  path.basename(process.cwd()) === 'web' ? process.cwd() : path.resolve(process.cwd(), 'apps/web');

export const BROWSER_DATABASE_NAME = 'avantime_browser_integration';
export const BROWSER_BASE_URL = 'http://127.0.0.1:3410';
export const BROWSER_DATABASE_URL =
  process.env.BROWSER_DATABASE_URL ??
  `postgresql://avantime_test:avantime_test_only@127.0.0.1:55432/${BROWSER_DATABASE_NAME}?schema=public`;
export const BROWSER_DATA_DIRECTORY = path.resolve(webDirectory, '../../.tmp/browser-data');
export const BROWSER_ARTIFACT_DIRECTORY = path.resolve(
  webDirectory,
  '../../.artifacts/playwright-results',
);

export const browserIdentities = {
  tenantA: {
    email: 'browser.user.a@example.test',
    password: 'browser-user-a-password',
    companyId: 'browser-tenant-a',
  },
  tenantB: {
    email: 'browser.user.b@example.test',
    password: 'browser-user-b-password',
    companyId: 'browser-tenant-b',
  },
  admin: {
    email: 'browser.admin@example.test',
    password: 'browser-admin-password',
    companyId: 'avantime',
  },
  identityClient: {
    email: 'browser.identity.client@example.test',
    password: 'browser-identity-client-password',
    companyId: 'browser-identity-tenant',
  },
  identityAdmin: {
    email: 'browser.identity.admin@example.test',
    password: 'browser-identity-admin-password',
    companyId: 'browser-identity-tenant',
  },
  identityOwner: {
    email: 'browser.identity.owner@example.test',
    password: 'browser-identity-owner-password',
    companyId: 'browser-identity-tenant',
  },
  identityManager: {
    email: 'browser.identity.manager@example.test',
    password: 'browser-identity-manager-password',
    companyId: 'browser-identity-tenant',
  },
  identityViewer: {
    email: 'browser.identity.viewer@example.test',
    password: 'browser-identity-viewer-password',
    companyId: 'browser-identity-tenant',
  },
} as const;

export const browserFixtureIds = {
  requestA: 'browser-request-a',
  requestB: 'browser-request-b',
  requestPublicA: 'BROWSER-A-001',
  requestPublicB: 'BROWSER-B-001',
  documentA: 'browser-doc-a',
  documentB: 'browser-doc-b',
  adminDocument: 'browser-doc-admin',
  notificationA: 'browser-notification-a',
  notificationB: 'browser-notification-b',
} as const;

export const browserServerEnvironment: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: BROWSER_DATABASE_URL,
  SESSION_SECRET: 'browser-tests-only-session-secret-32-characters-minimum',
  AUTH_PUBLIC_ORIGIN: BROWSER_BASE_URL,
  AUTH_ADMIN_MFA_REQUIRED: 'false',
  MFA_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  MFA_ENCRYPTION_KEY_VERSION: 'browser-v1',
  ENABLE_DEMO_AUTH: 'false',
  IDENTITY_TEST_MODE: 'browser',
  DOCUMENT_STORAGE_DRIVER: 'local',
  DOCUMENT_METADATA_DRIVER: 'postgresql',
  DOCUMENT_PROCESSING_QUEUE_DRIVER: 'local',
  DOCUMENT_DATA_DIR: BROWSER_DATA_DIRECTORY,
  DOCUMENT_OCR_DRIVER: 'disabled',
  DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'false',
  DOCUMENT_EMBEDDING_DRIVER: 'fake',
  DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'local',
  DOCUMENT_VECTOR_DRIVER: 'memory',
  DOCUMENT_ANSWER_DRIVER: 'fake',
};
