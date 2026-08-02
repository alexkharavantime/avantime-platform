import { isIP } from 'node:net';

export type JiraMode = 'disabled' | 'test' | 'cloud';

export type JiraConfiguration = {
  enabled: boolean;
  mode: JiraMode;
  baseUrl: URL | null;
  serviceAccountIdentifier: string | null;
  apiToken: string | null;
  defaultProjectKey: string | null;
  defaultIssueType: string;
  requestTimeoutMs: number;
  maximumAttempts: number;
  batchSize: number;
  leaseMs: number;
  pollIntervalMs: number;
};

const PLACEHOLDER = /(?:change.?me|example|placeholder|your[-_ ]|todo|xxx|<[^>]+>)/iu;
const PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,49}$/u;
const ISSUE_TYPE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,99}$/u;

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
    throw new Error(`JIRA_CONFIG_${name}_INVALID`);
  }
  return value;
}

function required(environment: Record<string, string | undefined>, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`JIRA_CONFIG_${name}_REQUIRED`);
  if (PLACEHOLDER.test(value)) throw new Error(`JIRA_CONFIG_${name}_PLACEHOLDER`);
  return value;
}

function assertPublicCloudUrl(url: URL) {
  if (url.protocol !== 'https:') throw new Error('JIRA_CONFIG_CLOUD_HTTPS_REQUIRED');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('JIRA_CONFIG_BASE_URL_INVALID');
  }
  const hostname = url.hostname.toLowerCase();
  if (!hostname.endsWith('.atlassian.net') || hostname === 'atlassian.net') {
    throw new Error('JIRA_CONFIG_CLOUD_HOST_NOT_ALLOWED');
  }
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
    throw new Error('JIRA_CONFIG_CLOUD_PUBLIC_HOST_REQUIRED');
  }
}

export function loadJiraConfiguration(
  environment: Record<string, string | undefined> = process.env,
): JiraConfiguration {
  const mode = environment.JIRA_MODE?.trim() || 'disabled';
  if (mode !== 'disabled' && mode !== 'test' && mode !== 'cloud') {
    throw new Error('JIRA_CONFIG_MODE_INVALID');
  }
  const enabledValue = environment.JIRA_INTEGRATION_ENABLED?.trim() || 'false';
  if (enabledValue !== 'true' && enabledValue !== 'false') {
    throw new Error('JIRA_CONFIG_ENABLED_INVALID');
  }
  const enabled = enabledValue === 'true';
  if (!enabled || mode === 'disabled') {
    if (enabled || mode !== 'disabled') throw new Error('JIRA_CONFIG_MODE_ENABLED_MISMATCH');
    return {
      enabled: false,
      mode: 'disabled',
      baseUrl: null,
      serviceAccountIdentifier: null,
      apiToken: null,
      defaultProjectKey: null,
      defaultIssueType: 'Task',
      requestTimeoutMs: integer(environment, 'JIRA_REQUEST_TIMEOUT_MS', 10_000, 1_000, 30_000),
      maximumAttempts: integer(environment, 'JIRA_MAX_ATTEMPTS', 5, 1, 20),
      batchSize: integer(environment, 'JIRA_BATCH_SIZE', 10, 1, 100),
      leaseMs: integer(environment, 'JIRA_LEASE_MS', 60_000, 1_000, 600_000),
      pollIntervalMs: integer(environment, 'JIRA_POLL_INTERVAL_MS', 1_000, 100, 60_000),
    };
  }

  if (
    mode === 'test' &&
    environment.NODE_ENV === 'production' &&
    environment.STAGING_MODE !== 'local'
  ) {
    throw new Error('JIRA_CONFIG_TEST_MODE_DENIED');
  }
  if (mode === 'test' && (environment.JIRA_API_TOKEN || environment.JIRA_EMAIL)) {
    throw new Error('JIRA_CONFIG_TEST_CREDENTIALS_DENIED');
  }
  const baseUrl = new URL(required(environment, 'JIRA_BASE_URL'));
  if (mode === 'cloud') assertPublicCloudUrl(baseUrl);
  const projectKey = required(environment, 'JIRA_PROJECT_KEY');
  if (!PROJECT_KEY.test(projectKey)) throw new Error('JIRA_CONFIG_PROJECT_KEY_INVALID');
  const issueType = required(environment, 'JIRA_ISSUE_TYPE');
  if (!ISSUE_TYPE.test(issueType)) throw new Error('JIRA_CONFIG_ISSUE_TYPE_INVALID');
  const serviceAccountIdentifier =
    mode === 'cloud' ? required(environment, 'JIRA_EMAIL') : environment.JIRA_EMAIL?.trim() || null;
  const apiToken = mode === 'cloud' ? required(environment, 'JIRA_API_TOKEN') : null;
  if (apiToken && apiToken.length < 20) throw new Error('JIRA_CONFIG_API_TOKEN_WEAK');

  return {
    enabled: true,
    mode,
    baseUrl,
    serviceAccountIdentifier,
    apiToken,
    defaultProjectKey: projectKey,
    defaultIssueType: issueType,
    requestTimeoutMs: integer(environment, 'JIRA_REQUEST_TIMEOUT_MS', 10_000, 1_000, 30_000),
    maximumAttempts: integer(environment, 'JIRA_MAX_ATTEMPTS', 5, 1, 20),
    batchSize: integer(environment, 'JIRA_BATCH_SIZE', 10, 1, 100),
    leaseMs: integer(environment, 'JIRA_LEASE_MS', 60_000, 1_000, 600_000),
    pollIntervalMs: integer(environment, 'JIRA_POLL_INTERVAL_MS', 1_000, 100, 60_000),
  };
}

export function summarizeJiraConfiguration(configuration: JiraConfiguration) {
  return {
    enabled: configuration.enabled,
    mode: configuration.mode,
    origin: configuration.baseUrl?.origin ?? null,
    defaultProjectKey: configuration.defaultProjectKey,
    defaultIssueType: configuration.defaultIssueType,
    requestTimeoutMs: configuration.requestTimeoutMs,
    maximumAttempts: configuration.maximumAttempts,
  };
}
