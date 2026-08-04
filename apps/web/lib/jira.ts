import { createHash } from 'node:crypto';

import { loadJiraConfiguration, type JiraConfiguration } from './jira-configuration';

const SAFE_PROJECT_KEY = /^[A-Z][A-Z0-9_]{1,49}$/u;
const SAFE_ISSUE_KEY = /^[A-Z][A-Z0-9_]{1,49}-[1-9][0-9]{0,19}$/u;
const SAFE_PROVIDER_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u;
const SAFE_OPTIONAL_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/u;
const SAFE_ISSUE_TYPE = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{0,99}$/u;
const CATEGORIES = new Set(['1С', 'Интеграция', 'Agent+', 'AI', 'Инфраструктура', 'Другое']);
const PRIORITY_NAMES = {
  LOW: 'Low',
  NORMAL: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Highest',
} as const;

export type JiraRequestPriority = keyof typeof PRIORITY_NAMES;

export type JiraIssueProjectionInput = {
  requestId: string;
  subject: string;
  description: string;
  category: string;
  priority: JiraRequestPriority;
  correlationId: string;
  projectKey: string;
  issueType: string;
  componentId?: string | null;
  requestType?: string | null;
  idempotencyKey: string;
};

export type JiraIssuePayload = {
  fields: {
    project: { key: string };
    issuetype: { name: string };
    summary: string;
    description: {
      type: 'doc';
      version: 1;
      content: Array<{
        type: 'paragraph';
        content: Array<{ type: 'text'; text: string }>;
      }>;
    };
    labels: string[];
    priority: { name: string };
    components?: Array<{ id: string }>;
  };
  marker: string;
  requestReference: string;
};

export type JiraCreateIssueResult = {
  issueId: string;
  issueKey: string;
  issueUrl: string;
};

export type JiraCommentPayload = {
  issueId: string;
  issueKey: string;
  body: string;
  marker: string;
  requestReference: string;
};

export type JiraAddCommentResult = { commentId: string };

export interface JiraProviderAdapter {
  readonly kind: 'disabled' | 'test' | 'cloud';
  checkReadiness(): Promise<boolean>;
  createIssue(payload: JiraIssuePayload, attempt: number): Promise<JiraCreateIssueResult>;
  addComment(payload: JiraCommentPayload, attempt: number): Promise<JiraAddCommentResult>;
}

export class JiraProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    if (!/^[A-Z0-9][A-Z0-9_-]{2,99}$/u.test(code)) {
      throw new Error('JIRA_PROVIDER_ERROR_CODE_INVALID');
    }
  }
}

function plainText(value: string, maximumLength: number, name: string) {
  const normalized = value
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new Error(`JIRA_PAYLOAD_${name}_INVALID`);
  }
  return normalized;
}

function safeMarker(idempotencyKey: string) {
  return `avantime-${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32)}`;
}

export function projectJiraCreateIssue(input: JiraIssueProjectionInput): JiraIssuePayload {
  if (!SAFE_PROJECT_KEY.test(input.projectKey)) throw new Error('JIRA_PAYLOAD_PROJECT_INVALID');
  if (!SAFE_ISSUE_TYPE.test(input.issueType)) throw new Error('JIRA_PAYLOAD_ISSUE_TYPE_INVALID');
  if (input.componentId && !SAFE_OPTIONAL_ID.test(input.componentId)) {
    throw new Error('JIRA_PAYLOAD_COMPONENT_INVALID');
  }
  if (input.requestType && !SAFE_OPTIONAL_ID.test(input.requestType)) {
    throw new Error('JIRA_PAYLOAD_REQUEST_TYPE_INVALID');
  }
  if (!CATEGORIES.has(input.category)) throw new Error('JIRA_PAYLOAD_CATEGORY_INVALID');
  const subject = plainText(input.subject, 160, 'SUMMARY');
  const description = plainText(input.description, 5_000, 'DESCRIPTION');
  const requestReference = plainText(input.requestId, 100, 'REQUEST_REFERENCE');
  const marker = safeMarker(input.idempotencyKey);
  const metadata = [
    `Avantime request: ${requestReference}`,
    `Category: ${input.category}`,
    `Priority: ${input.priority}`,
    input.requestType ? `Request type: ${input.requestType}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    fields: {
      project: { key: input.projectKey },
      issuetype: { name: input.issueType },
      summary: subject,
      description: {
        type: 'doc',
        version: 1,
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: description }] },
          { type: 'paragraph', content: [{ type: 'text', text: metadata }] },
        ],
      },
      labels: [
        marker,
        `avantime-request-${createHash('sha256').update(requestReference).digest('hex').slice(0, 16)}`,
      ],
      priority: { name: PRIORITY_NAMES[input.priority] },
      ...(input.componentId ? { components: [{ id: input.componentId }] } : {}),
    },
    marker,
    requestReference,
  };
}

export function projectJiraComment(input: {
  issueId: string;
  issueKey: string;
  requestReference: string;
  body: string;
  idempotencyKey: string;
}): JiraCommentPayload {
  if (!SAFE_PROVIDER_ID.test(input.issueId)) throw new Error('JIRA_COMMENT_ISSUE_ID_INVALID');
  if (!SAFE_ISSUE_KEY.test(input.issueKey)) throw new Error('JIRA_COMMENT_ISSUE_KEY_INVALID');
  const body = plainText(input.body, 5_000, 'COMMENT');
  const requestReference = plainText(input.requestReference, 100, 'REQUEST_REFERENCE');
  return {
    issueId: input.issueId,
    issueKey: input.issueKey,
    body,
    marker: `avantime-comment-${createHash('sha256').update(input.idempotencyKey).digest('hex').slice(0, 32)}`,
    requestReference,
  };
}

function safeIssueResult(configuration: JiraConfiguration, issueId: unknown, issueKey: unknown) {
  if (
    typeof issueId !== 'string' ||
    !SAFE_PROVIDER_ID.test(issueId) ||
    typeof issueKey !== 'string' ||
    !SAFE_ISSUE_KEY.test(issueKey) ||
    !configuration.baseUrl
  ) {
    throw new JiraProviderError('JIRA_RESPONSE_INVALID', false);
  }
  return {
    issueId,
    issueKey,
    issueUrl: new URL(`/browse/${encodeURIComponent(issueKey)}`, configuration.baseUrl).toString(),
  };
}

export class DisabledJiraProvider implements JiraProviderAdapter {
  readonly kind = 'disabled' as const;

  async checkReadiness() {
    return true;
  }

  async createIssue(): Promise<JiraCreateIssueResult> {
    throw new JiraProviderError('JIRA_DISABLED', false);
  }

  async addComment(): Promise<JiraAddCommentResult> {
    throw new JiraProviderError('JIRA_DISABLED', false);
  }
}

export class TestJiraProvider implements JiraProviderAdapter {
  readonly kind = 'test' as const;
  private readonly receipts = new Map<string, JiraCreateIssueResult>();
  private readonly commentReceipts = new Map<string, JiraAddCommentResult>();

  constructor(
    private readonly configuration: JiraConfiguration,
    private readonly behavior: { transientFailures?: number; permanentFailure?: boolean } = {},
  ) {}

  async checkReadiness() {
    return true;
  }

  async createIssue(payload: JiraIssuePayload, attempt: number) {
    const previous = this.receipts.get(payload.marker);
    if (previous) return previous;
    if (this.behavior.permanentFailure) {
      throw new JiraProviderError('JIRA_TEST_PERMANENT_REJECTION', false);
    }
    if (attempt <= (this.behavior.transientFailures ?? 0)) {
      throw new JiraProviderError('JIRA_TEST_TRANSIENT_REJECTION', true);
    }
    const sequence = Number.parseInt(
      createHash('sha256').update(payload.marker).digest('hex').slice(0, 10),
      16,
    );
    const issueKey = `${payload.fields.project.key}-${(sequence % 9_000_000) + 1_000_000}`;
    const result = safeIssueResult(this.configuration, `test-${payload.marker}`, issueKey);
    this.receipts.set(payload.marker, result);
    return result;
  }

  async addComment(payload: JiraCommentPayload, attempt: number) {
    const previous = this.commentReceipts.get(payload.marker);
    if (previous) return previous;
    if (this.behavior.permanentFailure) {
      throw new JiraProviderError('JIRA_TEST_PERMANENT_REJECTION', false);
    }
    if (attempt <= (this.behavior.transientFailures ?? 0)) {
      throw new JiraProviderError('JIRA_TEST_TRANSIENT_REJECTION', true);
    }
    const result = { commentId: `test-${payload.marker}` };
    this.commentReceipts.set(payload.marker, result);
    return result;
  }
}

export class JiraCloudProvider implements JiraProviderAdapter {
  readonly kind = 'cloud' as const;

  constructor(private readonly configuration: JiraConfiguration) {}

  async checkReadiness() {
    return Boolean(
      this.configuration.baseUrl &&
      this.configuration.serviceAccountIdentifier &&
      this.configuration.apiToken,
    );
  }

  private headers() {
    const credentials = `${this.configuration.serviceAccountIdentifier}:${this.configuration.apiToken}`;
    return {
      Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  private async request(path: string, body?: unknown, method: 'GET' | 'POST' = 'POST') {
    const response = await fetch(new URL(path, this.configuration.baseUrl!), {
      method,
      headers: this.headers(),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: 'error',
      signal: AbortSignal.timeout(this.configuration.requestTimeoutMs),
    }).catch((error: unknown) => {
      if (error instanceof JiraProviderError) throw error;
      throw new JiraProviderError('JIRA_NETWORK_FAILURE', true);
    });
    if (!response.ok) {
      const retryable =
        response.status === 408 || response.status === 429 || response.status >= 500;
      throw new JiraProviderError(`JIRA_HTTP_${response.status}`, retryable);
    }
    return (await response.json().catch(() => null)) as unknown;
  }

  async createIssue(payload: JiraIssuePayload) {
    const search = (await this.request('/rest/api/3/search/jql', {
      jql: `project = "${payload.fields.project.key}" AND labels = "${payload.marker}"`,
      fields: ['id', 'key'],
      maxResults: 2,
    })) as { issues?: Array<{ id?: unknown; key?: unknown }> } | null;
    if ((search?.issues?.length ?? 0) > 1) {
      throw new JiraProviderError('JIRA_RECONCILIATION_AMBIGUOUS', false);
    }
    const existing = search?.issues?.[0];
    if (existing) return safeIssueResult(this.configuration, existing.id, existing.key);

    const created = (await this.request('/rest/api/3/issue', { fields: payload.fields })) as {
      id?: unknown;
      key?: unknown;
    } | null;
    return safeIssueResult(this.configuration, created?.id, created?.key);
  }

  async addComment(payload: JiraCommentPayload) {
    const marker = `Avantime reference: ${payload.requestReference}/${payload.marker}`;
    const existing = (await this.request(
      `/rest/servicedeskapi/request/${encodeURIComponent(payload.issueKey)}/comment?public=true&limit=100`,
      undefined,
      'GET',
    )) as { values?: Array<{ id?: unknown; body?: unknown }> } | null;
    const matched =
      existing?.values?.filter(
        (comment) => typeof comment.body === 'string' && comment.body.endsWith(marker),
      ) ?? [];
    if (matched.length > 1)
      throw new JiraProviderError('JIRA_COMMENT_RECONCILIATION_AMBIGUOUS', false);
    if (matched[0]) {
      return { commentId: safeProviderReference(matched[0].id) };
    }
    const created = (await this.request(
      `/rest/servicedeskapi/request/${encodeURIComponent(payload.issueKey)}/comment`,
      { body: `${payload.body}\n\n${marker}`, public: true },
    )) as { id?: unknown } | null;
    return { commentId: safeProviderReference(created?.id) };
  }
}

function safeProviderReference(value: unknown) {
  if (typeof value !== 'string' || !SAFE_PROVIDER_ID.test(value)) {
    throw new JiraProviderError('JIRA_COMMENT_RESPONSE_INVALID', false);
  }
  return value;
}

export function createJiraProvider(
  environment: Record<string, string | undefined> = process.env,
): JiraProviderAdapter {
  const configuration = loadJiraConfiguration(environment);
  if (configuration.mode === 'disabled') return new DisabledJiraProvider();
  if (configuration.mode === 'test') return new TestJiraProvider(configuration);
  return new JiraCloudProvider(configuration);
}

export function jiraFailure(error: unknown) {
  return error instanceof JiraProviderError
    ? { code: error.code, retryable: error.retryable }
    : { code: 'JIRA_PROVIDER_FAILURE', retryable: true };
}
