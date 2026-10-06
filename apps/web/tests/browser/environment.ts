import path from 'node:path';

const webDirectory =
  path.basename(process.cwd()) === 'web' ? process.cwd() : path.resolve(process.cwd(), 'apps/web');
const durableDocumentKbSmoke = process.env.BROWSER_DOCUMENT_KB_SMOKE === '1';
const realAiDocumentKbSmoke = process.env.BROWSER_REAL_AI_KB_SMOKE === '1';

function realAiProviderEnvironment() {
  if (!realAiDocumentKbSmoke) return {};
  const environment: Record<string, string> = {};
  const drivers = [process.env.DOCUMENT_EMBEDDING_DRIVER, process.env.RAG_ANSWER_DRIVER];
  if (drivers.includes('openai') && process.env.OPENAI_API_KEY) {
    environment.OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  }
  if (drivers.includes('gemini') && process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    environment.GOOGLE_GENERATIVE_AI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  }
  return environment;
}

export const BROWSER_DATABASE_NAME =
  process.env.BROWSER_DATABASE_NAME ?? 'avantime_browser_integration';
export const BROWSER_BASE_URL = 'http://localhost:3410';
export const BROWSER_DATABASE_URL =
  process.env.BROWSER_DATABASE_URL ??
  `postgresql://avantime_test:avantime_test_only@127.0.0.1:55432/${BROWSER_DATABASE_NAME}?schema=public`;
export const BROWSER_DATA_DIRECTORY = process.env.BROWSER_DATA_DIRECTORY
  ? path.resolve(process.env.BROWSER_DATA_DIRECTORY)
  : path.resolve(webDirectory, '../../.tmp/browser-data');
export const BROWSER_ARTIFACT_DIRECTORY = process.env.BROWSER_ARTIFACT_DIRECTORY
  ? path.resolve(process.env.BROWSER_ARTIFACT_DIRECTORY)
  : path.resolve(webDirectory, '../../.artifacts/playwright-results');

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
  JIRA_INTEGRATION_ENABLED: 'true',
  JIRA_MODE: 'test',
  JIRA_BASE_URL: 'https://jira.test.invalid',
  JIRA_PROJECT_KEY: 'TEST',
  JIRA_ISSUE_TYPE: 'Task',
  JIRA_REQUEST_TIMEOUT_MS: '5000',
  JIRA_MAX_ATTEMPTS: '3',
  JIRA_BATCH_SIZE: '10',
  JIRA_LEASE_MS: '5000',
  JIRA_POLL_INTERVAL_MS: '250',
  JIRA_WORKER_ID: 'jira-browser-test',
  JIRA_WEBHOOK_MODE: 'test',
  JIRA_WEBHOOK_SECRET: 'browser-test-webhook-secret-at-least-32-characters',
  JIRA_WEBHOOK_ALLOWED_ORIGIN: 'https://jira.test.invalid',
  JIRA_WEBHOOK_TIMEOUT_MS: '5000',
  JIRA_WEBHOOK_REPLAY_WINDOW_MS: '300000',
  JIRA_WEBHOOK_MAX_PAYLOAD_BYTES: '262144',
  JIRA_WEBHOOK_ENABLED_EVENTS:
    'jira:issue_updated,jira:issue_deleted,comment_created,comment_updated',
  JIRA_INBOUND_MAX_ATTEMPTS: '3',
  JIRA_INBOUND_BATCH_SIZE: '10',
  JIRA_INBOUND_LEASE_MS: '5000',
  JIRA_INBOUND_POLL_INTERVAL_MS: '250',
  JIRA_INBOUND_RETENTION_DAYS: '30',
  JIRA_INBOUND_WORKER_ID: 'jira-inbound-browser-test',
  DOCUMENT_STORAGE_DRIVER: 'local',
  DOCUMENT_METADATA_DRIVER: 'postgresql',
  DOCUMENT_PROCESSING_QUEUE_DRIVER: 'local',
  DOCUMENT_DATA_DIR: BROWSER_DATA_DIRECTORY,
  DOCUMENT_OCR_DRIVER: 'disabled',
  DOCUMENT_OCR_REQUIRED_FOR_READINESS: 'false',
  DOCUMENT_EMBEDDING_DRIVER: 'fake',
  DOCUMENT_EMBEDDING_QUEUE_DRIVER: durableDocumentKbSmoke ? 'postgresql' : 'local',
  DOCUMENT_VECTOR_DRIVER: durableDocumentKbSmoke ? 'pgvector' : 'memory',
  DOCUMENT_ANSWER_DRIVER: 'fake',
  ...(realAiDocumentKbSmoke
    ? {
        DOCUMENT_EMBEDDING_DRIVER: process.env.DOCUMENT_EMBEDDING_DRIVER ?? 'fake',
        DOCUMENT_EMBEDDING_MODEL: process.env.DOCUMENT_EMBEDDING_MODEL ?? '',
        DOCUMENT_EMBEDDING_DIMENSIONS: process.env.DOCUMENT_EMBEDDING_DIMENSIONS ?? '',
        DOCUMENT_EMBEDDING_VERSION: 'browser-real-ai-v1',
        DOCUMENT_EMBEDDING_BATCH_SIZE: '4',
        DOCUMENT_EMBEDDING_MAX_ATTEMPTS: '1',
        DOCUMENT_EMBEDDING_QUEUE_DRIVER: 'postgresql',
        DOCUMENT_VECTOR_DRIVER: 'pgvector',
        BROWSER_REAL_AI_KB_SMOKE: '1',
        RAG_ANSWER_DRIVER: process.env.RAG_ANSWER_DRIVER ?? 'fake',
        RAG_ANSWER_MODEL: process.env.RAG_ANSWER_MODEL ?? '',
        RAG_MAX_CONTEXT_CHARACTERS: '1500',
        RAG_MAX_OUTPUT_TOKENS: '512',
        RAG_QUERY_MAX_CHARACTERS: '500',
        RAG_TIMEOUT_MS: '30000',
        BROWSER_REAL_AI_SESSION_ID: process.env.BROWSER_REAL_AI_SESSION_ID ?? '',
        BROWSER_REAL_AI_DIAGNOSTIC_MODE: process.env.BROWSER_REAL_AI_DIAGNOSTIC_MODE ?? '',
        BROWSER_ARTIFACT_DIRECTORY: process.env.BROWSER_ARTIFACT_DIRECTORY ?? '',
        BROWSER_REAL_AI_DIAGNOSTICS_FILE: process.env.BROWSER_REAL_AI_DIAGNOSTICS_FILE ?? '',
        AI_DAILY_BUDGET_EUR: process.env.AI_DAILY_BUDGET_EUR ?? '0.25',
        AI_MONTHLY_BUDGET_EUR: process.env.AI_MONTHLY_BUDGET_EUR ?? '1.00',
        AI_RATE_LIMIT_PER_MINUTE: '10',
        AI_RATE_LIMIT_PER_DAY: '5',
        AI_RATE_LIMIT_BURST: '3',
        AI_PROVIDER_MAX_ATTEMPTS: '1',
        DOCUMENT_PROCESSING_MAX_ATTEMPTS: '1',
        ...realAiProviderEnvironment(),
      }
    : {}),
};
