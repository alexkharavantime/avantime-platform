import { createHash } from 'node:crypto';

export type PortalRequestStatus =
  'NEW' | 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';

export type NormalizedJiraInboundPayload =
  | {
      kind: 'STATUS';
      statusId: string;
      statusName: string;
      jiraUpdatedAt: string;
    }
  | {
      kind: 'COMMENT';
      commentId: string;
      body: string;
      authorName: string;
      public: boolean;
      automation: boolean;
      jiraUpdatedAt: string;
    }
  | { kind: 'ISSUE_DELETED'; jiraUpdatedAt: string };

const DEFAULT_STATUS_MAPPING: Readonly<Record<string, PortalRequestStatus>> = {
  'to do': 'OPEN',
  todo: 'OPEN',
  open: 'OPEN',
  new: 'OPEN',
  'in progress': 'IN_PROGRESS',
  'waiting for customer': 'WAITING_CUSTOMER',
  'waiting customer': 'WAITING_CUSTOMER',
  resolved: 'RESOLVED',
  done: 'RESOLVED',
  closed: 'CLOSED',
};

const PORTAL_STATUSES = new Set<PortalRequestStatus>([
  'NEW',
  'OPEN',
  'IN_PROGRESS',
  'WAITING_CUSTOMER',
  'RESOLVED',
  'CLOSED',
]);
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u;
const EMAIL = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/gu;
const HTML_TAG = /<\/?[a-z][^>]*>/iu;
const HTML_TAG_GLOBAL = /<\/?[a-z][^>]*>/giu;
const WEB_URL = /\bhttps?:\/\/[^\s<>{}\[\]]+/giu;

function scrubProviderText(value: string) {
  return value.replace(HTML_TAG_GLOBAL, '').replace(WEB_URL, '[link removed]');
}

function normalizedText(value: string, maximumLength: number, code: string) {
  const text = value
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (!text) throw new Error(`${code}_REQUIRED`);
  if (text.length > maximumLength) throw new Error(`${code}_TOO_LONG`);
  return text;
}

export function validatePortalComment(value: unknown) {
  if (typeof value !== 'string') throw new Error('JIRA_COMMENT_BODY_REQUIRED');
  const body = normalizedText(value, 5_000, 'JIRA_COMMENT_BODY');
  if (HTML_TAG.test(body)) throw new Error('JIRA_COMMENT_HTML_DENIED');
  return body;
}

type AdfNode = {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  attrs?: unknown;
};

function projectAdfNode(node: unknown, output: string[], depth: number) {
  if (depth > 30 || !node || typeof node !== 'object' || Array.isArray(node)) return;
  const item = node as AdfNode;
  if (item.type === 'text' && typeof item.text === 'string') {
    output.push(scrubProviderText(item.text));
  }
  if (item.type === 'mention') output.push('@participant');
  if (item.type === 'hardBreak') output.push('\n');
  if (Array.isArray(item.content)) {
    for (const child of item.content.slice(0, 1_000)) projectAdfNode(child, output, depth + 1);
  }
  if (
    item.type === 'paragraph' ||
    item.type === 'heading' ||
    item.type === 'listItem' ||
    item.type === 'blockquote' ||
    item.type === 'codeBlock'
  ) {
    output.push('\n');
  }
}

export function projectAdfToSafeText(value: unknown) {
  if (typeof value === 'string') {
    return normalizedText(scrubProviderText(value), 5_000, 'JIRA_ADF');
  }
  const output: string[] = [];
  projectAdfNode(value, output, 0);
  return normalizedText(output.join(''), 5_000, 'JIRA_ADF');
}

export function safeJiraAuthor(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Jira specialist';
  const author = value as Record<string, unknown>;
  const displayName = typeof author.displayName === 'string' ? author.displayName : '';
  const accountType =
    typeof author.accountType === 'string' ? author.accountType.toLowerCase() : '';
  const automation =
    accountType === 'app' || /(?:automation|system|bot)/iu.test(displayName || 'unknown');
  const redactedName = displayName.replace(EMAIL, '').trim();
  const safeName = redactedName
    ? normalizedText(redactedName, 80, 'JIRA_AUTHOR')
    : 'Jira specialist';
  return automation ? 'Jira automation' : safeName;
}

export function isJiraAutomationAuthor(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const author = value as Record<string, unknown>;
  return (
    author.accountType === 'app' ||
    (typeof author.displayName === 'string' &&
      /(?:automation|system|bot)/iu.test(author.displayName))
  );
}

export function resolveJiraStatus(
  statusName: string,
  organizationMapping?: unknown,
): PortalRequestStatus | null {
  const custom: Record<string, PortalRequestStatus> = {};
  if (
    organizationMapping &&
    typeof organizationMapping === 'object' &&
    !Array.isArray(organizationMapping)
  ) {
    for (const [name, status] of Object.entries(organizationMapping)) {
      if (typeof status === 'string' && PORTAL_STATUSES.has(status as PortalRequestStatus)) {
        custom[name.trim().toLowerCase()] = status as PortalRequestStatus;
      }
    }
  }
  return (
    custom[statusName.trim().toLowerCase()] ??
    DEFAULT_STATUS_MAPPING[statusName.trim().toLowerCase()] ??
    null
  );
}

export function statusTransitionDecision(input: {
  currentStatus: PortalRequestStatus;
  currentJiraUpdatedAt: Date | null;
  incomingStatus: PortalRequestStatus;
  incomingJiraUpdatedAt: Date;
}) {
  if (input.currentJiraUpdatedAt && input.incomingJiraUpdatedAt <= input.currentJiraUpdatedAt) {
    return 'STALE' as const;
  }
  const terminal = input.currentStatus === 'RESOLVED' || input.currentStatus === 'CLOSED';
  const incomingTerminal = input.incomingStatus === 'RESOLVED' || input.incomingStatus === 'CLOSED';
  if (terminal && !incomingTerminal) return 'TERMINAL_CONFLICT' as const;
  if (input.currentStatus === input.incomingStatus) return 'UNCHANGED' as const;
  return 'APPLY' as const;
}

export function jiraEventFingerprint(origin: string, rawBody: string) {
  return createHash('sha256').update(origin).update('\0').update(rawBody).digest('hex');
}

export function safeProviderReference(value: unknown, code: string) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) throw new Error(code);
  return value;
}
