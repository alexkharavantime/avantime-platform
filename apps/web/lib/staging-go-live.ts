import { createHash } from 'node:crypto';
import { isIP } from 'node:net';

export type EnvironmentMap = Record<string, string | undefined>;

export type StagingConfiguration = {
  environmentId: string;
  label: string;
  tenantAllowlist: string[];
  hostname: string;
  appUrl: string;
  providerMode: 'fake' | 'openai' | 'gemini';
  secretsSource: 'environment' | 'file' | 'external';
  backupTarget: string;
  alertDestination: string;
  observabilityEndpoint: string;
  internalPlaintext: boolean;
};

export type GateStatus = 'passed' | 'failed' | 'pending' | 'accepted_risk';

export type GoLiveGate = {
  id: string;
  status: GateStatus;
  blocking: boolean;
  evidence?: string;
  reason?: string;
};

export type GoLiveStatus = 'READY' | 'READY_WITH_ACCEPTED_RISKS' | 'BLOCKED' | 'NOT_EVALUATED';

export type GoLiveApproval = {
  role:
    | 'Product Owner'
    | 'Technical Owner'
    | 'Security Owner'
    | 'Operations Owner'
    | 'Data Protection/Compliance Owner'
    | 'Business Owner';
  name: string | null;
  date: string | null;
  environment: string;
  evidenceReference: string | null;
  status: 'approved' | 'rejected' | 'pending';
  comments: string | null;
  reviewDate: string | null;
};

const PLACEHOLDER =
  /(?:^|[-_ ])(?:change[-_ ]?me|placeholder|replace[-_ ]?me|example|todo|xxx+)(?:$|[-_ ])/i;
const FORBIDDEN_EVIDENCE_KEY =
  /content|text|prompt|answer|embedding|credential|password|secret|api.?key|authorization|cookie/i;
const SECRET_VALUE =
  /(?:sk-[a-zA-Z0-9_-]{16,}|AIza[a-zA-Z0-9_-]{16,}|bearer\s+[a-zA-Z0-9._-]{12,}|postgres(?:ql)?:\/\/[^/\s:@]+:[^@\s]+@|redis(?:s)?:\/\/[^/\s:@]*:[^@\s]+@)/i;

function required(environment: EnvironmentMap, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required for staging.`);
  if (PLACEHOLDER.test(value) || /^<.+>$/.test(value)) {
    throw new Error(`${name} must not use a placeholder value.`);
  }
  return value;
}

function requiredChoice<T extends string>(
  environment: EnvironmentMap,
  name: string,
  choices: readonly T[],
) {
  const value = required(environment, name);
  if (!choices.includes(value as T)) {
    throw new Error(`${name} must be one of: ${choices.join(', ')}.`);
  }
  return value as T;
}

function parseBoolean(environment: EnvironmentMap, name: string, fallback = false) {
  const value = environment[name]?.trim();
  if (!value) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

function parseUrl(environment: EnvironmentMap, name: string) {
  const raw = required(environment, name);
  try {
    return new URL(raw);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function isPrivateHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  const ip = isIP(normalized);
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    (ip === 4 &&
      (/^10\./.test(normalized) ||
        /^127\./.test(normalized) ||
        /^169\.254\./.test(normalized) ||
        /^192\.168\./.test(normalized) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(normalized))) ||
    (ip === 6 &&
      (normalized === '::1' ||
        normalized.startsWith('fe80:') ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd')))
  );
}

function assertNotProductionHost(hostname: string, forbiddenHosts: readonly string[]) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (
    /(^|[.-])prod(?:uction)?([.-]|$)/i.test(normalized) ||
    forbiddenHosts.some((host) => normalized === host || normalized.endsWith(`.${host}`))
  ) {
    throw new Error('Staging configuration must not target a production hostname.');
  }
}

function parseForbiddenHosts(environment: EnvironmentMap) {
  return required(environment, 'STAGING_FORBIDDEN_PRODUCTION_HOSTS')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => {
      if (host === 'localhost' || host.includes('/') || host.includes(':') || !host.includes('.')) {
        throw new Error('STAGING_FORBIDDEN_PRODUCTION_HOSTS contains an invalid hostname.');
      }
      return host;
    });
}

function assertStagingUrl(
  environment: EnvironmentMap,
  name: string,
  forbiddenHosts: readonly string[],
  options: { internalPlaintext: boolean; protocols: readonly string[] },
) {
  const url = parseUrl(environment, name);
  assertNotProductionHost(url.hostname, forbiddenHosts);
  if (!options.protocols.includes(url.protocol)) {
    throw new Error(`${name} uses a protocol that is not allowed in staging.`);
  }
  if (
    (url.protocol === 'http:' || url.protocol === 'redis:') &&
    (!options.internalPlaintext || !isPrivateHost(url.hostname))
  ) {
    throw new Error(`${name} may use plaintext only for an explicitly allowed private service.`);
  }
  return url;
}

export function validateStagingConfiguration(
  environment: EnvironmentMap = process.env,
): StagingConfiguration {
  if (required(environment, 'DEPLOYMENT_ENVIRONMENT') !== 'staging') {
    throw new Error('DEPLOYMENT_ENVIRONMENT must be staging.');
  }
  const environmentId = required(environment, 'STAGING_ENVIRONMENT_ID');
  if (!/^staging-[a-z0-9][a-z0-9-]{2,48}$/.test(environmentId)) {
    throw new Error('STAGING_ENVIRONMENT_ID must use the staging-<id> format.');
  }
  const label = required(environment, 'STAGING_LABEL');
  if (!/^staging[-_:a-z0-9 ]+$/i.test(label)) {
    throw new Error('STAGING_LABEL must clearly identify staging.');
  }
  const forbiddenHosts = parseForbiddenHosts(environment);
  const internalPlaintext = parseBoolean(environment, 'STAGING_ALLOW_INTERNAL_PLAINTEXT');
  const hostname = required(environment, 'STAGING_TLS_HOSTNAME').toLowerCase();
  assertNotProductionHost(hostname, forbiddenHosts);
  if (
    hostname === 'localhost' ||
    isIP(hostname) !== 0 ||
    !/^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(hostname)
  ) {
    throw new Error('STAGING_TLS_HOSTNAME must be a valid non-local DNS hostname.');
  }
  const appUrl = assertStagingUrl(environment, 'APP_URL', forbiddenHosts, {
    internalPlaintext: false,
    protocols: ['https:'],
  });
  if (appUrl.hostname.toLowerCase() !== hostname) {
    throw new Error('APP_URL hostname must match STAGING_TLS_HOSTNAME.');
  }

  const tenantAllowlist = required(environment, 'STAGING_TENANT_ALLOWLIST')
    .split(',')
    .map((tenant) => tenant.trim())
    .filter(Boolean);
  if (
    tenantAllowlist.length < 2 ||
    new Set(tenantAllowlist).size !== tenantAllowlist.length ||
    tenantAllowlist.some((tenant) => !/^staging-[a-z0-9][a-z0-9-]{2,63}$/.test(tenant))
  ) {
    throw new Error('STAGING_TENANT_ALLOWLIST must contain at least two unique staging-* tenants.');
  }

  const providerMode = requiredChoice(environment, 'STAGING_PROVIDER_MODE', [
    'fake',
    'openai',
    'gemini',
  ] as const);
  if (providerMode === 'fake' && !parseBoolean(environment, 'STAGING_ALLOW_FAKE_PROVIDER')) {
    throw new Error('Fake provider requires STAGING_ALLOW_FAKE_PROVIDER=true.');
  }
  const secretsSource = requiredChoice(environment, 'STAGING_SECRETS_SOURCE', [
    'environment',
    'file',
    'external',
  ] as const);

  assertStagingUrl(environment, 'DATABASE_URL', forbiddenHosts, {
    internalPlaintext,
    protocols: internalPlaintext ? ['postgresql:', 'postgres:'] : ['postgresql:'],
  });
  assertStagingUrl(environment, 'REDIS_URL', forbiddenHosts, {
    internalPlaintext,
    protocols: internalPlaintext ? ['rediss:', 'redis:'] : ['rediss:'],
  });
  assertStagingUrl(environment, 'OBJECT_STORAGE_ENDPOINT', forbiddenHosts, {
    internalPlaintext,
    protocols: internalPlaintext ? ['https:', 'http:'] : ['https:'],
  });
  const observability = assertStagingUrl(
    environment,
    'OTEL_EXPORTER_OTLP_ENDPOINT',
    forbiddenHosts,
    {
      internalPlaintext,
      protocols: internalPlaintext ? ['https:', 'http:'] : ['https:'],
    },
  );
  const alert = assertStagingUrl(environment, 'STAGING_ALERT_DESTINATION', forbiddenHosts, {
    internalPlaintext,
    protocols: internalPlaintext ? ['https:', 'http:'] : ['https:'],
  });
  const backupTarget = required(environment, 'BACKUP_OBJECT_STORAGE_BUCKET');
  const objectBucket = required(environment, 'OBJECT_STORAGE_BUCKET');
  for (const [name, value] of [
    ['OBJECT_STORAGE_BUCKET', objectBucket],
    ['BACKUP_OBJECT_STORAGE_BUCKET', backupTarget],
  ]) {
    if (!value.toLowerCase().includes('staging')) {
      throw new Error(`${name} must be explicitly staging-scoped.`);
    }
  }
  if (backupTarget === objectBucket) {
    throw new Error('Backup and source object buckets must be different.');
  }

  for (const [name, expected] of [
    ['DOCUMENT_STORAGE_DRIVER', 's3'],
    ['DOCUMENT_METADATA_DRIVER', 'postgresql'],
    ['DOCUMENT_PROCESSING_QUEUE_DRIVER', 'external'],
    ['DOCUMENT_EMBEDDING_QUEUE_DRIVER', 'redis'],
    ['DOCUMENT_VECTOR_DRIVER', 'pgvector'],
    ['AI_RATE_LIMIT_DRIVER', 'redis'],
    ['AI_COST_LEDGER_DRIVER', 'postgresql'],
  ] as const) {
    if (required(environment, name) !== expected) {
      throw new Error(`${name} must be ${expected} in staging.`);
    }
  }

  return {
    environmentId,
    label,
    tenantAllowlist,
    hostname,
    appUrl: appUrl.origin,
    providerMode,
    secretsSource,
    backupTarget,
    alertDestination: alert.origin,
    observabilityEndpoint: observability.origin,
    internalPlaintext,
  };
}

export function validateStagingExample(environment: EnvironmentMap) {
  const requiredNames = [
    'DEPLOYMENT_ENVIRONMENT',
    'STAGING_ENVIRONMENT_ID',
    'STAGING_LABEL',
    'STAGING_TENANT_ALLOWLIST',
    'STAGING_TLS_HOSTNAME',
    'STAGING_FORBIDDEN_PRODUCTION_HOSTS',
    'STAGING_PROVIDER_MODE',
    'STAGING_SECRETS_SOURCE',
    'APP_URL',
    'DATABASE_URL',
    'REDIS_URL',
    'OBJECT_STORAGE_ENDPOINT',
    'OBJECT_STORAGE_BUCKET',
    'BACKUP_OBJECT_STORAGE_BUCKET',
    'STAGING_ALERT_DESTINATION',
    'OTEL_EXPORTER_OTLP_ENDPOINT',
  ];
  const missing = requiredNames.filter((name) => environment[name] === undefined);
  if (missing.length > 0) {
    throw new Error(`Staging example is missing variables: ${missing.join(', ')}.`);
  }
  if (environment.DEPLOYMENT_ENVIRONMENT !== 'staging') {
    throw new Error('Staging example must set DEPLOYMENT_ENVIRONMENT=staging.');
  }
  return { valid: true as const, deployable: false as const, placeholders: true as const };
}

export function secretFingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function assertNoProductionSecretReuse(
  stagingSecrets: Record<string, string>,
  productionFingerprints: ReadonlySet<string>,
) {
  for (const [name, value] of Object.entries(stagingSecrets)) {
    if (!value || PLACEHOLDER.test(value) || /^<.+>$/.test(value)) {
      throw new Error(`${name} must not use a placeholder value.`);
    }
    if (productionFingerprints.has(secretFingerprint(value))) {
      throw new Error(`${name} reuses a production secret.`);
    }
  }
}

export function createPendingApprovals(environmentId: string): GoLiveApproval[] {
  const roles: GoLiveApproval['role'][] = [
    'Product Owner',
    'Technical Owner',
    'Security Owner',
    'Operations Owner',
    'Data Protection/Compliance Owner',
    'Business Owner',
  ];
  return roles.map((role) => ({
    role,
    name: null,
    date: null,
    environment: environmentId,
    evidenceReference: null,
    status: 'pending',
    comments: null,
    reviewDate: null,
  }));
}

export function assertApprovalWasExternallyRecorded(
  approval: GoLiveApproval,
  externallyVerified: boolean,
) {
  if (approval.status !== 'pending' && !externallyVerified) {
    throw new Error('Approval cannot be marked automatically.');
  }
  if (
    approval.status !== 'pending' &&
    (!approval.name ||
      !approval.date ||
      !approval.evidenceReference ||
      approval.environment.length === 0)
  ) {
    throw new Error('Recorded approval is incomplete.');
  }
  return approval;
}

export function evaluateGoLive(gates: readonly GoLiveGate[]): {
  status: GoLiveStatus;
  blockers: string[];
} {
  if (gates.length === 0) return { status: 'NOT_EVALUATED', blockers: [] };
  const blockers = gates
    .filter((gate) => gate.blocking && (gate.status === 'failed' || gate.status === 'pending'))
    .map((gate) => gate.id);
  if (blockers.length > 0) return { status: 'BLOCKED', blockers };
  if (gates.every((gate) => gate.status === 'pending')) {
    return { status: 'NOT_EVALUATED', blockers: [] };
  }
  if (gates.some((gate) => gate.status === 'accepted_risk')) {
    return { status: 'READY_WITH_ACCEPTED_RISKS', blockers: [] };
  }
  return { status: 'READY', blockers: [] };
}

export function validateVulnerabilityException(
  exception: { id: string; expiresAt: string; approved: boolean },
  now = new Date(),
) {
  if (!exception.approved) throw new Error(`${exception.id} is not approved.`);
  const expiresAt = new Date(exception.expiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    throw new Error(`${exception.id} has expired.`);
  }
  return { ...exception, status: 'active' as const };
}

export function calculateSha256(content: string | Buffer) {
  return createHash('sha256').update(content).digest('hex');
}

export function validateSbomChecksum(content: string | Buffer, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected) || calculateSha256(content) !== expected) {
    throw new Error('SBOM checksum validation failed.');
  }
  return true;
}

export function sanitizeEvidence<T>(value: T): T {
  function sanitize(current: unknown, key = ''): unknown {
    if (FORBIDDEN_EVIDENCE_KEY.test(key)) return '[REDACTED]';
    if (typeof current === 'string') {
      if (SECRET_VALUE.test(current)) return '[REDACTED]';
      return current.length > 2_000 ? `${current.slice(0, 2_000)}[TRUNCATED]` : current;
    }
    if (Array.isArray(current)) return current.map((entry) => sanitize(entry));
    if (current && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current).map(([name, entry]) => [name, sanitize(entry, name)]),
      );
    }
    return current;
  }
  return sanitize(value) as T;
}
