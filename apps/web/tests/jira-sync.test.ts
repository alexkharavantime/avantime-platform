import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createJiraWebhookSignature,
  ingestJiraWebhook,
  JiraWebhookError,
  verifyJiraWebhookSignature,
} from '../lib/jira-webhook';
import {
  loadJiraWebhookConfiguration,
  summarizeJiraWebhookConfiguration,
} from '../lib/jira-webhook-configuration';
import {
  projectAdfToSafeText,
  resolveJiraStatus,
  safeJiraAuthor,
  statusTransitionDecision,
  validatePortalComment,
} from '../lib/jira-sync-policy';

function environment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    JIRA_WEBHOOK_MODE: 'test',
    JIRA_WEBHOOK_SECRET: 'unit-test-webhook-secret-at-least-32-characters',
    JIRA_WEBHOOK_ALLOWED_ORIGIN: 'https://jira.test.invalid',
    JIRA_WEBHOOK_REPLAY_WINDOW_MS: '300000',
    JIRA_WEBHOOK_MAX_PAYLOAD_BYTES: '4096',
    JIRA_WEBHOOK_ENABLED_EVENTS:
      'jira:issue_updated,jira:issue_deleted,comment_created,comment_updated',
    JIRA_INBOUND_MAX_ATTEMPTS: '3',
    JIRA_INBOUND_BATCH_SIZE: '10',
    JIRA_INBOUND_LEASE_MS: '5000',
    JIRA_INBOUND_POLL_INTERVAL_MS: '250',
    JIRA_INBOUND_RETENTION_DAYS: '30',
  };
}

function payload(timestamp = Date.now()) {
  return JSON.stringify({
    timestamp,
    webhookEvent: 'jira:issue_updated',
    issue: {
      id: '10001',
      key: 'TEST-10001',
      self: 'https://jira.test.invalid/rest/api/3/issue/10001',
      fields: {
        status: { id: '3', name: 'In Progress' },
        updated: new Date(timestamp).toISOString(),
      },
    },
    changelog: { id: '20001' },
  });
}

test('Jira webhook configuration is disabled by default and never summarizes its secret', () => {
  assert.equal(loadJiraWebhookConfiguration({}).mode, 'disabled');
  const configured = loadJiraWebhookConfiguration(environment());
  assert.equal(configured.enabled, true);
  assert.equal(configured.enabledEvents.has('comment_created'), true);
  assert.doesNotMatch(JSON.stringify(summarizeJiraWebhookConfiguration(configured)), /secret/iu);
  assert.throws(
    () => loadJiraWebhookConfiguration({ ...environment(), JIRA_WEBHOOK_SECRET: 'short' }),
    /SECRET_WEAK/u,
  );
  assert.throws(
    () =>
      loadJiraWebhookConfiguration({
        ...environment(),
        JIRA_WEBHOOK_MODE: 'cloud',
        JIRA_WEBHOOK_ALLOWED_ORIGIN: 'http://tenant.atlassian.net',
      }),
    /HTTPS_REQUIRED/u,
  );
  assert.throws(
    () =>
      loadJiraWebhookConfiguration({
        ...environment(),
        JIRA_WEBHOOK_ENABLED_EVENTS: 'jira:issue_updated,unsupported',
      }),
    /EVENTS_INVALID/u,
  );
});

test('Jira webhook HMAC validates raw UTF-8 bytes with constant-time comparison contract', () => {
  const signature = createJiraWebhookSignature("It's a Secret to Everybody", 'Hello World!');
  assert.equal(
    signature,
    'sha256=a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9',
  );
  const signedPayload = payload();
  assert.doesNotThrow(() =>
    verifyJiraWebhookSignature({
      secret: environment().JIRA_WEBHOOK_SECRET!,
      rawBody: signedPayload,
      signature: createJiraWebhookSignature(environment().JIRA_WEBHOOK_SECRET!, signedPayload),
    }),
  );
  assert.throws(
    () =>
      verifyJiraWebhookSignature({
        secret: environment().JIRA_WEBHOOK_SECRET!,
        rawBody: payload(),
        signature: `sha256=${'0'.repeat(64)}`,
      }),
    (error: unknown) => error instanceof JiraWebhookError && error.httpStatus === 401,
  );
});

test('Jira webhook rejects expired, unknown-tenant and oversized events before persistence', async () => {
  const expired = payload(Date.now() - 600_000);
  await assert.rejects(
    () =>
      ingestJiraWebhook({
        rawBody: expired,
        signature: createJiraWebhookSignature(environment().JIRA_WEBHOOK_SECRET!, expired),
        environment: environment(),
      }),
    (error: unknown) =>
      error instanceof JiraWebhookError && error.code === 'JIRA_WEBHOOK_REPLAY_EXPIRED',
  );
  const wrongTenant = payload().replaceAll('jira.test.invalid', 'foreign.test.invalid');
  await assert.rejects(
    () =>
      ingestJiraWebhook({
        rawBody: wrongTenant,
        signature: createJiraWebhookSignature(environment().JIRA_WEBHOOK_SECRET!, wrongTenant),
        environment: environment(),
      }),
    (error: unknown) =>
      error instanceof JiraWebhookError && error.code === 'JIRA_WEBHOOK_TENANT_DENIED',
  );
  const oversizedEnvironment: Record<string, string> = {
    ...environment(),
    JIRA_WEBHOOK_MAX_PAYLOAD_BYTES: '1024',
  };
  const oversized = `${payload()}${'x'.repeat(2_000)}`;
  await assert.rejects(
    () =>
      ingestJiraWebhook({
        rawBody: oversized,
        signature: createJiraWebhookSignature(oversizedEnvironment.JIRA_WEBHOOK_SECRET, oversized),
        environment: oversizedEnvironment,
      }),
    (error: unknown) => error instanceof JiraWebhookError && error.httpStatus === 413,
  );
});

test('status mapping is explicit, organization-overridable and fences stale or terminal rollback', () => {
  assert.equal(resolveJiraStatus('Open'), 'OPEN');
  assert.equal(resolveJiraStatus('Done'), 'RESOLVED');
  assert.equal(resolveJiraStatus('Custom QA'), null);
  assert.equal(
    resolveJiraStatus('Custom QA', { 'custom qa': 'WAITING_CUSTOMER' }),
    'WAITING_CUSTOMER',
  );
  const latest = new Date('2026-08-03T12:00:00.000Z');
  assert.equal(
    statusTransitionDecision({
      currentStatus: 'IN_PROGRESS',
      currentJiraUpdatedAt: latest,
      incomingStatus: 'OPEN',
      incomingJiraUpdatedAt: new Date('2026-08-03T11:59:59.000Z'),
    }),
    'STALE',
  );
  assert.equal(
    statusTransitionDecision({
      currentStatus: 'RESOLVED',
      currentJiraUpdatedAt: latest,
      incomingStatus: 'IN_PROGRESS',
      incomingJiraUpdatedAt: new Date('2026-08-03T12:00:01.000Z'),
    }),
    'TERMINAL_CONFLICT',
  );
});

test('ADF and portal comments project to bounded text without HTML, links, IDs or email', () => {
  const text = projectAdfToSafeText({
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Safe ' },
          { type: 'mention', attrs: { id: 'private-account-id', text: 'Person' } },
          {
            type: 'text',
            text: ' link <script>alert(1)</script> https://internal.invalid/path',
            marks: [{ type: 'link', attrs: { href: 'https://internal.invalid' } }],
          },
        ],
      },
    ],
  });
  assert.equal(text, 'Safe @participant link alert(1) [link removed]');
  assert.doesNotMatch(text, /private-account-id|internal\.invalid|<script>/u);
  assert.equal(validatePortalComment('  Plain\r\ncomment  '), 'Plain\ncomment');
  assert.throws(() => validatePortalComment('<script>alert(1)</script>'), /HTML_DENIED/u);
  assert.throws(() => validatePortalComment('x'.repeat(5_001)), /TOO_LONG/u);
  assert.equal(safeJiraAuthor({ displayName: 'person@example.test' }), 'Jira specialist');
});
