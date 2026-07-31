import { isIP } from 'node:net';

import { loadDocumentConfiguration } from './document-configuration';
import { getMfaEncryptionKey } from './mfa';
import { loadRagConfiguration } from './rag-configuration';

export type ProductionConfigurationSummary = {
  valid: true;
  database: { tls: true };
  objectStorage: { driver: 's3'; tls: true };
  coordination: { driver: 'redis'; tls: true };
  queues: { document: 'external'; embedding: 'redis' };
  rateLimiter: { driver: 'redis'; failureMode: 'closed' };
  costLedger: { driver: 'postgresql'; currency: 'EUR' };
  backups: { configured: true; encrypted: true };
  monitoring: { configured: true };
  identity: {
    sessions: 'postgresql';
    rateLimiter: 'redis';
    mfaEncryption: true;
    keyVersion: string;
    adminMfaRequired: true;
    emailDelivery: 'resend';
    oidcEgressAllowlist: true;
  };
  providers: { embedding: 'openai' | 'gemini'; answer: 'openai' | 'gemini' };
};

const PLACEHOLDER = /^(change[-_ ]?me|placeholder|example|test|secret|password|todo|xxx+)$/i;

function requireValue(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required in production.`);
  if (PLACEHOLDER.test(value)) throw new Error(`${name} must not use a placeholder value.`);
  return value;
}

function requireDriver(
  environment: Record<string, string | undefined>,
  name: string,
  expected: string,
) {
  if (requireValue(environment, name) !== expected) {
    throw new Error(`${name} must be ${expected} in production.`);
  }
}

function requireSecret(
  environment: Record<string, string | undefined>,
  name: string,
  minimumLength = 32,
) {
  const value = requireValue(environment, name);
  if (value.length < minimumLength) {
    throw new Error(`${name} must contain at least ${minimumLength} characters.`);
  }
}

function parseUrl(environment: Record<string, string | undefined>, name: string) {
  const raw = requireValue(environment, name);
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function assertPublicProviderUrl(url: URL, name: string) {
  if (url.protocol !== 'https:') throw new Error(`${name} must use HTTPS.`);
  const hostname = url.hostname.toLowerCase();
  const ip = isIP(hostname);
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === 'metadata.google.internal' ||
    (ip === 4 &&
      (/^10\./.test(hostname) ||
        /^127\./.test(hostname) ||
        /^169\.254\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname))) ||
    (ip === 6 && (hostname === '::1' || hostname.startsWith('fe80:') || hostname.startsWith('fc')))
  ) {
    throw new Error(`${name} must not target a loopback, metadata, or private network address.`);
  }
}

function assertDatabaseTls(environment: Record<string, string | undefined>) {
  const url = parseUrl(environment, 'DATABASE_URL');
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  const sslMode = url.searchParams.get('sslmode');
  if (!sslMode || !['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    throw new Error('DATABASE_URL must require TLS through sslmode.');
  }
}

function assertOidcHostAllowlist(environment: Record<string, string | undefined>) {
  const hosts = [
    ...new Set(
      requireValue(environment, 'OIDC_ALLOWED_HOSTS')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (hosts.length === 0 || hosts.length > 20) {
    throw new Error('OIDC_ALLOWED_HOSTS must contain 1 to 20 exact hosts.');
  }
  for (const host of hosts) {
    const url = new URL(`https://${host}`);
    if (url.hostname !== host || url.port || url.pathname !== '/') {
      throw new Error('OIDC_ALLOWED_HOSTS must contain exact hostnames only.');
    }
    assertPublicProviderUrl(url, 'OIDC_ALLOWED_HOSTS');
  }
}

export function validateProductionConfiguration(
  environment: Record<string, string | undefined> = process.env,
): ProductionConfigurationSummary {
  if (environment.NODE_ENV !== 'production') {
    throw new Error('Production configuration check requires NODE_ENV=production.');
  }
  const documents = loadDocumentConfiguration(environment);
  const rag = loadRagConfiguration(environment);

  assertDatabaseTls(environment);
  const objectStorage = parseUrl(environment, 'OBJECT_STORAGE_ENDPOINT');
  if (objectStorage.protocol !== 'https:') {
    throw new Error('OBJECT_STORAGE_ENDPOINT must use HTTPS in production.');
  }
  const redis = parseUrl(environment, 'REDIS_URL');
  if (redis.protocol !== 'rediss:') throw new Error('REDIS_URL must use TLS (rediss).');
  if (!redis.password) throw new Error('REDIS_URL must include authentication.');

  requireDriver(environment, 'AI_RATE_LIMIT_DRIVER', 'redis');
  requireDriver(environment, 'AI_COST_LEDGER_DRIVER', 'postgresql');
  requireDriver(environment, 'BACKUP_DRIVER', 's3');
  requireDriver(environment, 'BACKUP_ENCRYPTION_REQUIRED', 'true');
  requireDriver(environment, 'BACKUP_OBJECT_STORAGE_SSE', 'AES256');
  const backupUrl = parseUrl(environment, 'BACKUP_STORAGE_ENDPOINT');
  if (backupUrl.protocol !== 'https:') {
    throw new Error('BACKUP_STORAGE_ENDPOINT must use HTTPS.');
  }
  const monitoringUrl = parseUrl(environment, 'OTEL_EXPORTER_OTLP_ENDPOINT');
  if (monitoringUrl.protocol !== 'https:') {
    throw new Error('OTEL_EXPORTER_OTLP_ENDPOINT must use HTTPS.');
  }

  requireSecret(environment, 'SESSION_SECRET');
  getMfaEncryptionKey(environment);
  const identityKeyVersion = requireValue(environment, 'MFA_ENCRYPTION_KEY_VERSION');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,31}$/u.test(identityKeyVersion)) {
    throw new Error('MFA_ENCRYPTION_KEY_VERSION is invalid.');
  }
  requireDriver(environment, 'AUTH_ADMIN_MFA_REQUIRED', 'true');
  requireDriver(environment, 'IDENTITY_EMAIL_DRIVER', 'resend');
  requireValue(environment, 'MAIL_FROM');
  requireSecret(environment, 'RESEND_API_KEY', 20);
  const authOrigin = parseUrl(environment, 'AUTH_PUBLIC_ORIGIN');
  assertPublicProviderUrl(authOrigin, 'AUTH_PUBLIC_ORIGIN');
  assertOidcHostAllowlist(environment);
  requireSecret(environment, 'BACKUP_ENCRYPTION_KEY');
  requireSecret(environment, 'AUDIT_INTEGRITY_KEY');
  if (rag.embedding.driver === 'openai' || rag.answer.driver === 'openai') {
    requireSecret(environment, 'OPENAI_API_KEY', 20);
  }
  if (rag.embedding.driver === 'gemini' || rag.answer.driver === 'gemini') {
    requireSecret(environment, 'GOOGLE_GENERATIVE_AI_API_KEY', 20);
  }

  for (const [name, defaultUrl] of [
    ['OPENAI_BASE_URL', 'https://api.openai.com'],
    ['GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'],
  ] as const) {
    const configured = environment[name]?.trim();
    assertPublicProviderUrl(new URL(configured || defaultUrl), name);
  }

  if (
    documents.storageDriver !== 's3' ||
    documents.metadataDriver !== 'postgresql' ||
    documents.queueDriver !== 'external' ||
    rag.embeddingQueue.driver !== 'redis'
  ) {
    throw new Error('Production persistence and queue drivers are inconsistent.');
  }

  return {
    valid: true,
    database: { tls: true },
    objectStorage: { driver: 's3', tls: true },
    coordination: { driver: 'redis', tls: true },
    queues: { document: 'external', embedding: 'redis' },
    rateLimiter: { driver: 'redis', failureMode: 'closed' },
    costLedger: { driver: 'postgresql', currency: 'EUR' },
    backups: { configured: true, encrypted: true },
    monitoring: { configured: true },
    identity: {
      sessions: 'postgresql',
      rateLimiter: 'redis',
      mfaEncryption: true,
      keyVersion: identityKeyVersion,
      adminMfaRequired: true,
      emailDelivery: 'resend',
      oidcEgressAllowlist: true,
    },
    providers: {
      embedding: rag.embedding.driver as 'openai' | 'gemini',
      answer: rag.answer.driver as 'openai' | 'gemini',
    },
  };
}
