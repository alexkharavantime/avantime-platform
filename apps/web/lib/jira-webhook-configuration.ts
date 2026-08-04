import { isIP } from 'node:net';

export const JIRA_WEBHOOK_EVENTS = [
  'jira:issue_updated',
  'jira:issue_deleted',
  'comment_created',
  'comment_updated',
] as const;

export type JiraWebhookEventType = (typeof JIRA_WEBHOOK_EVENTS)[number];
export type JiraWebhookMode = 'disabled' | 'test' | 'cloud';

export type JiraWebhookConfiguration = {
  enabled: boolean;
  mode: JiraWebhookMode;
  secret: string | null;
  allowedOrigin: string | null;
  timeoutMs: number;
  replayWindowMs: number;
  maximumPayloadBytes: number;
  enabledEvents: ReadonlySet<JiraWebhookEventType>;
  maximumAttempts: number;
  batchSize: number;
  leaseMs: number;
  pollIntervalMs: number;
  retentionDays: number;
};

const PLACEHOLDER = /(?:change.?me|example|placeholder|your[-_ ]|todo|xxx|<[^>]+>)/iu;

function integer(
  environment: Record<string, string | undefined>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`JIRA_WEBHOOK_CONFIG_${name}_INVALID`);
  }
  return value;
}

function required(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`JIRA_WEBHOOK_CONFIG_${name}_REQUIRED`);
  if (PLACEHOLDER.test(value)) throw new Error(`JIRA_WEBHOOK_CONFIG_${name}_PLACEHOLDER`);
  return value;
}

function allowedOrigin(environment: Record<string, string | undefined>, mode: JiraWebhookMode) {
  const url = new URL(required(environment, 'JIRA_WEBHOOK_ALLOWED_ORIGIN'));
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('JIRA_WEBHOOK_CONFIG_ORIGIN_INVALID');
  }
  if (mode === 'cloud') {
    if (url.protocol !== 'https:') throw new Error('JIRA_WEBHOOK_CONFIG_HTTPS_REQUIRED');
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith('.atlassian.net') || hostname === 'atlassian.net' || isIP(hostname)) {
      throw new Error('JIRA_WEBHOOK_CONFIG_TENANT_DENIED');
    }
  }
  return url.origin;
}

function enabledEvents(environment: Record<string, string | undefined>) {
  const configured = environment.JIRA_WEBHOOK_ENABLED_EVENTS?.split(',').map((item) =>
    item.trim(),
  ) ?? [...JIRA_WEBHOOK_EVENTS];
  const allowed = new Set<string>(JIRA_WEBHOOK_EVENTS);
  if (!configured.length || configured.some((event) => !allowed.has(event))) {
    throw new Error('JIRA_WEBHOOK_CONFIG_EVENTS_INVALID');
  }
  return new Set(configured as JiraWebhookEventType[]);
}

export function loadJiraWebhookConfiguration(
  environment: Record<string, string | undefined> = process.env,
): JiraWebhookConfiguration {
  const mode = environment.JIRA_WEBHOOK_MODE?.trim() || 'disabled';
  if (mode !== 'disabled' && mode !== 'test' && mode !== 'cloud') {
    throw new Error('JIRA_WEBHOOK_CONFIG_MODE_INVALID');
  }
  const shared = {
    timeoutMs: integer(environment, 'JIRA_WEBHOOK_TIMEOUT_MS', 5_000, 500, 30_000),
    replayWindowMs: integer(
      environment,
      'JIRA_WEBHOOK_REPLAY_WINDOW_MS',
      5 * 60_000,
      30_000,
      24 * 60 * 60_000,
    ),
    maximumPayloadBytes: integer(
      environment,
      'JIRA_WEBHOOK_MAX_PAYLOAD_BYTES',
      256 * 1024,
      1_024,
      1024 * 1024,
    ),
    maximumAttempts: integer(environment, 'JIRA_INBOUND_MAX_ATTEMPTS', 5, 1, 20),
    batchSize: integer(environment, 'JIRA_INBOUND_BATCH_SIZE', 10, 1, 100),
    leaseMs: integer(environment, 'JIRA_INBOUND_LEASE_MS', 60_000, 1_000, 600_000),
    pollIntervalMs: integer(environment, 'JIRA_INBOUND_POLL_INTERVAL_MS', 1_000, 100, 60_000),
    retentionDays: integer(environment, 'JIRA_INBOUND_RETENTION_DAYS', 30, 1, 365),
  };
  if (mode === 'disabled') {
    return {
      enabled: false,
      mode,
      secret: null,
      allowedOrigin: null,
      enabledEvents: new Set(),
      ...shared,
    };
  }
  if (
    mode === 'test' &&
    environment.NODE_ENV === 'production' &&
    environment.STAGING_MODE !== 'local'
  ) {
    throw new Error('JIRA_WEBHOOK_CONFIG_TEST_MODE_DENIED');
  }
  const secret = required(environment, 'JIRA_WEBHOOK_SECRET');
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JIRA_WEBHOOK_CONFIG_SECRET_WEAK');
  return {
    enabled: true,
    mode,
    secret,
    allowedOrigin: allowedOrigin(environment, mode),
    enabledEvents: enabledEvents(environment),
    ...shared,
  };
}

export function summarizeJiraWebhookConfiguration(configuration: JiraWebhookConfiguration) {
  return {
    enabled: configuration.enabled,
    mode: configuration.mode,
    allowedOrigin: configuration.allowedOrigin,
    timeoutMs: configuration.timeoutMs,
    replayWindowMs: configuration.replayWindowMs,
    maximumPayloadBytes: configuration.maximumPayloadBytes,
    enabledEvents: [...configuration.enabledEvents],
    retentionDays: configuration.retentionDays,
  };
}
