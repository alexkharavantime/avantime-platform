import { isIP } from 'node:net';

import { loadJiraConfiguration, type JiraConfiguration } from './jira-configuration';

export type StagingMode = 'local' | 'managed';
export type NotificationProviderMode = 'test' | 'resend';

export type StagingConfiguration = {
  appEnvironment: 'staging';
  mode: StagingMode;
  baseUrl: URL;
  database: {
    url: URL;
    applicationName: string;
    connectionLimit: number;
    poolTimeoutSeconds: number;
    statementTimeoutMs: number;
    transactionTimeoutMs: number;
  };
  redis: {
    url: URL;
    namespace: string;
    requiredForReadiness: boolean;
    connectTimeoutMs: number;
    defaultTtlSeconds: number;
  };
  objectStorage: {
    endpoint: URL;
    region: string;
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    forcePathStyle: boolean;
    maximumObjectBytes: number;
  };
  notifications: {
    provider: NotificationProviderMode;
    senderIdentity: string;
    maximumAttempts: number;
    batchSize: number;
    leaseMs: number;
  };
  jira: JiraConfiguration;
  knowledge: {
    cacheDriver: 'redis';
    searchDriver: 'postgresql';
    vectorDriver: 'pgvector';
    embeddingModel: string;
    embeddingVersion: string;
  };
  versions: {
    application: string;
    commitSha: string;
    migration: string;
    deploymentGeneration: string;
  };
  backup: { driver: 'local' | 's3'; destinationReference: string; retentionDays: number };
  observability: { serviceName: string; environment: 'staging' };
};

export type SafeStagingConfigurationSummary = {
  valid: true;
  environment: 'staging';
  mode: StagingMode;
  baseOrigin: string;
  database: { host: string; name: string; applicationName: string; tls: boolean };
  redis: { host: string; namespace: string; tls: boolean; readiness: 'required' | 'degraded' };
  objectStorage: { host: string; region: string; bucket: string; public: false };
  notifications: { provider: NotificationProviderMode; senderConfigured: true };
  jira: { enabled: boolean; mode: JiraConfiguration['mode'] };
  knowledge: { cache: 'redis'; search: 'postgresql'; vector: 'pgvector' };
  versions: StagingConfiguration['versions'];
  backup: { destinationConfigured: true; retentionDays: number };
  observability: StagingConfiguration['observability'];
};

const PLACEHOLDER = /(?:change.?me|example|placeholder|your[-_ ]|todo|xxx|<[^>]+>)/iu;
const SAFE_REFERENCE = /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,199}$/u;
const SAFE_NAMESPACE = /^[a-z0-9][a-z0-9:_-]{2,119}$/u;

function required(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`STAGING_CONFIG_${name}_REQUIRED`);
  if (PLACEHOLDER.test(value)) throw new Error(`STAGING_CONFIG_${name}_PLACEHOLDER`);
  return value;
}

function secret(environment: Record<string, string | undefined>, name: string, minimumLength = 24) {
  const value = required(environment, name);
  if (value.length < minimumLength) throw new Error(`STAGING_CONFIG_${name}_WEAK`);
  return value;
}

function integer(
  environment: Record<string, string | undefined>,
  name: string,
  minimum: number,
  maximum: number,
) {
  const value = Number(required(environment, name));
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`STAGING_CONFIG_${name}_INVALID`);
  }
  return value;
}

function boolean(environment: Record<string, string | undefined>, name: string) {
  const value = required(environment, name);
  if (value !== 'true' && value !== 'false') throw new Error(`STAGING_CONFIG_${name}_INVALID`);
  return value === 'true';
}

function url(environment: Record<string, string | undefined>, name: string) {
  try {
    return new URL(required(environment, name));
  } catch {
    throw new Error(`STAGING_CONFIG_${name}_INVALID`);
  }
}

function assertManagedEndpoint(input: URL, name: string) {
  if (input.protocol !== 'https:' && input.protocol !== 'rediss:') {
    throw new Error(`STAGING_CONFIG_${name}_TLS_REQUIRED`);
  }
  const hostname = input.hostname.toLowerCase();
  const ip = isIP(hostname);
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    (ip === 4 &&
      (/^127\./u.test(hostname) ||
        /^10\./u.test(hostname) ||
        /^192\.168\./u.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./u.test(hostname))) ||
    (ip === 6 && (hostname === '::1' || hostname.startsWith('fe80:')))
  ) {
    throw new Error(`STAGING_CONFIG_${name}_PUBLIC_ENDPOINT_REQUIRED`);
  }
}

function assertReference(value: string, name: string) {
  if (!SAFE_REFERENCE.test(value)) throw new Error(`STAGING_CONFIG_${name}_INVALID`);
  return value;
}

export function loadStagingConfiguration(
  environment: Record<string, string | undefined> = process.env,
): StagingConfiguration {
  if (environment.APP_ENV !== 'staging') throw new Error('STAGING_CONFIG_APP_ENV_REQUIRED');
  if (environment.NODE_ENV !== 'production' && environment.NODE_ENV !== 'test') {
    throw new Error('STAGING_CONFIG_NODE_ENV_INVALID');
  }
  const mode = required(environment, 'STAGING_MODE');
  if (mode !== 'local' && mode !== 'managed') throw new Error('STAGING_CONFIG_MODE_INVALID');

  const baseUrl = url(environment, 'APP_BASE_URL');
  const databaseUrl = url(environment, 'DATABASE_URL');
  const redisUrl = url(environment, 'REDIS_URL');
  const objectStorageEndpoint = url(environment, 'OBJECT_STORAGE_ENDPOINT');
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('STAGING_CONFIG_DATABASE_URL_PROTOCOL');
  }
  if (!['redis:', 'rediss:'].includes(redisUrl.protocol) || !redisUrl.password) {
    throw new Error('STAGING_CONFIG_REDIS_URL_AUTH_REQUIRED');
  }

  const databaseName = databaseUrl.pathname.replace(/^\//u, '');
  if (!databaseName.toLowerCase().includes('staging')) {
    throw new Error('STAGING_CONFIG_DATABASE_NAME_NOT_STAGING');
  }
  const bucket = required(environment, 'OBJECT_STORAGE_BUCKET');
  if (!bucket.toLowerCase().includes('staging')) {
    throw new Error('STAGING_CONFIG_OBJECT_STORAGE_BUCKET_NOT_STAGING');
  }
  const namespace = required(environment, 'REDIS_NAMESPACE');
  if (!SAFE_NAMESPACE.test(namespace) || !namespace.includes(':staging:')) {
    throw new Error('STAGING_CONFIG_REDIS_NAMESPACE_NOT_STAGING');
  }

  if (mode === 'managed') {
    assertManagedEndpoint(baseUrl, 'APP_BASE_URL');
    if (!baseUrl.hostname.toLowerCase().includes('staging')) {
      throw new Error('STAGING_CONFIG_APP_BASE_URL_NOT_STAGING');
    }
    assertManagedEndpoint(objectStorageEndpoint, 'OBJECT_STORAGE_ENDPOINT');
    if (redisUrl.protocol !== 'rediss:') throw new Error('STAGING_CONFIG_REDIS_TLS_REQUIRED');
    const sslMode = databaseUrl.searchParams.get('sslmode');
    if (!sslMode || !['require', 'verify-ca', 'verify-full'].includes(sslMode)) {
      throw new Error('STAGING_CONFIG_DATABASE_TLS_REQUIRED');
    }
  } else if (
    !['localhost', '127.0.0.1', 'postgres', 'redis', 'minio', 'web'].includes(databaseUrl.hostname)
  ) {
    throw new Error('STAGING_CONFIG_LOCAL_DATABASE_HOST_INVALID');
  }

  const notificationProvider = required(environment, 'NOTIFICATION_PROVIDER_MODE');
  if (notificationProvider !== 'test' && notificationProvider !== 'resend') {
    throw new Error('STAGING_CONFIG_NOTIFICATION_PROVIDER_INVALID');
  }
  if (mode === 'managed' && notificationProvider === 'test') {
    throw new Error('STAGING_CONFIG_MANAGED_NOTIFICATION_PROVIDER_REQUIRED');
  }
  if (notificationProvider === 'resend') secret(environment, 'RESEND_API_KEY', 20);

  const backupDriver = required(environment, 'BACKUP_DRIVER');
  if (backupDriver !== 'local' && backupDriver !== 's3') {
    throw new Error('STAGING_CONFIG_BACKUP_DRIVER_INVALID');
  }
  if (mode === 'managed' && backupDriver !== 's3') {
    throw new Error('STAGING_CONFIG_MANAGED_BACKUP_DRIVER_REQUIRED');
  }
  if (backupDriver === 's3') {
    const backupEndpoint = url(environment, 'BACKUP_STORAGE_ENDPOINT');
    if (mode === 'managed') assertManagedEndpoint(backupEndpoint, 'BACKUP_STORAGE_ENDPOINT');
    const backupBucket = required(environment, 'BACKUP_OBJECT_STORAGE_BUCKET');
    if (!backupBucket.toLowerCase().includes('staging') || backupBucket === bucket) {
      throw new Error('STAGING_CONFIG_BACKUP_BUCKET_INVALID');
    }
  }

  const jira = loadJiraConfiguration(environment);
  if (mode === 'managed' && jira.enabled && jira.mode !== 'cloud') {
    throw new Error('STAGING_CONFIG_MANAGED_JIRA_CLOUD_REQUIRED');
  }

  secret(environment, 'SESSION_SECRET', 32);
  secret(environment, 'MFA_ENCRYPTION_KEY', 32);
  secret(environment, 'AUDIT_INTEGRITY_KEY', 32);

  const cacheDriver = required(environment, 'KNOWLEDGE_CACHE_DRIVER');
  const searchDriver = required(environment, 'KNOWLEDGE_SEARCH_DRIVER');
  const vectorDriver = required(environment, 'KNOWLEDGE_VECTOR_DRIVER');
  if (cacheDriver !== 'redis' || searchDriver !== 'postgresql' || vectorDriver !== 'pgvector') {
    throw new Error('STAGING_CONFIG_KNOWLEDGE_DRIVERS_INVALID');
  }

  return {
    appEnvironment: 'staging',
    mode,
    baseUrl,
    database: {
      url: databaseUrl,
      applicationName: assertReference(
        required(environment, 'DATABASE_APPLICATION_NAME'),
        'DATABASE_APPLICATION_NAME',
      ),
      connectionLimit: integer(environment, 'DATABASE_CONNECTION_LIMIT', 1, 100),
      poolTimeoutSeconds: integer(environment, 'DATABASE_POOL_TIMEOUT_SECONDS', 1, 120),
      statementTimeoutMs: integer(environment, 'DATABASE_STATEMENT_TIMEOUT_MS', 100, 300_000),
      transactionTimeoutMs: integer(environment, 'DATABASE_TRANSACTION_TIMEOUT_MS', 100, 300_000),
    },
    redis: {
      url: redisUrl,
      namespace,
      requiredForReadiness: boolean(environment, 'REDIS_REQUIRED_FOR_READINESS'),
      connectTimeoutMs: integer(environment, 'REDIS_CONNECT_TIMEOUT_MS', 100, 30_000),
      defaultTtlSeconds: integer(environment, 'REDIS_DEFAULT_TTL_SECONDS', 30, 86_400),
    },
    objectStorage: {
      endpoint: objectStorageEndpoint,
      region: required(environment, 'OBJECT_STORAGE_REGION'),
      bucket,
      accessKeyId: secret(environment, 'OBJECT_STORAGE_ACCESS_KEY', 8),
      secretAccessKey: secret(environment, 'OBJECT_STORAGE_SECRET_KEY', 16),
      forcePathStyle: boolean(environment, 'OBJECT_STORAGE_FORCE_PATH_STYLE'),
      maximumObjectBytes: integer(environment, 'OBJECT_STORAGE_MAX_BYTES', 1_024, 104_857_600),
    },
    notifications: {
      provider: notificationProvider,
      senderIdentity: required(environment, 'NOTIFICATION_SENDER_IDENTITY'),
      maximumAttempts: integer(environment, 'NOTIFICATION_MAX_ATTEMPTS', 1, 20),
      batchSize: integer(environment, 'NOTIFICATION_BATCH_SIZE', 1, 100),
      leaseMs: integer(environment, 'NOTIFICATION_LEASE_MS', 1_000, 600_000),
    },
    jira,
    knowledge: {
      cacheDriver,
      searchDriver,
      vectorDriver,
      embeddingModel: assertReference(
        required(environment, 'KNOWLEDGE_EMBEDDING_MODEL'),
        'KNOWLEDGE_EMBEDDING_MODEL',
      ),
      embeddingVersion: assertReference(
        required(environment, 'KNOWLEDGE_EMBEDDING_VERSION'),
        'KNOWLEDGE_EMBEDDING_VERSION',
      ),
    },
    versions: {
      application: assertReference(required(environment, 'APP_VERSION'), 'APP_VERSION'),
      commitSha: assertReference(required(environment, 'COMMIT_SHA'), 'COMMIT_SHA'),
      migration: assertReference(required(environment, 'MIGRATION_VERSION'), 'MIGRATION_VERSION'),
      deploymentGeneration: assertReference(
        required(environment, 'DEPLOYMENT_GENERATION'),
        'DEPLOYMENT_GENERATION',
      ),
    },
    backup: {
      driver: backupDriver,
      destinationReference: assertReference(
        required(environment, 'BACKUP_DESTINATION_REFERENCE'),
        'BACKUP_DESTINATION_REFERENCE',
      ),
      retentionDays: integer(environment, 'BACKUP_RETENTION_DAYS', 1, 365),
    },
    observability: {
      serviceName: assertReference(required(environment, 'OTEL_SERVICE_NAME'), 'OTEL_SERVICE_NAME'),
      environment: 'staging',
    },
  };
}

export function summarizeStagingConfiguration(
  configuration: StagingConfiguration,
): SafeStagingConfigurationSummary {
  return {
    valid: true,
    environment: 'staging',
    mode: configuration.mode,
    baseOrigin: configuration.baseUrl.origin,
    database: {
      host: configuration.database.url.hostname,
      name: configuration.database.url.pathname.replace(/^\//u, ''),
      applicationName: configuration.database.applicationName,
      tls: Boolean(configuration.database.url.searchParams.get('sslmode')),
    },
    redis: {
      host: configuration.redis.url.hostname,
      namespace: configuration.redis.namespace,
      tls: configuration.redis.url.protocol === 'rediss:',
      readiness: configuration.redis.requiredForReadiness ? 'required' : 'degraded',
    },
    objectStorage: {
      host: configuration.objectStorage.endpoint.hostname,
      region: configuration.objectStorage.region,
      bucket: configuration.objectStorage.bucket,
      public: false,
    },
    notifications: {
      provider: configuration.notifications.provider,
      senderConfigured: true,
    },
    jira: { enabled: configuration.jira.enabled, mode: configuration.jira.mode },
    knowledge: { cache: 'redis', search: 'postgresql', vector: 'pgvector' },
    versions: configuration.versions,
    backup: {
      destinationConfigured: true,
      retentionDays: configuration.backup.retentionDays,
    },
    observability: configuration.observability,
  };
}
