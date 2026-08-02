import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JiraCloudProvider,
  JiraProviderError,
  projectJiraCreateIssue,
  TestJiraProvider,
} from '../lib/jira';
import { loadJiraConfiguration } from '../lib/jira-configuration';
import { validateJiraMapping } from '../lib/jira-mapping';
import { jiraBackoffMs } from '../lib/jira-outbox';
import {
  validateRequestCreationPayload,
  validateRequestIdempotencyKey,
} from '../lib/request-creation';

function testEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'test',
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
  };
}

function payload() {
  return projectJiraCreateIssue({
    requestId: 'AV-TEST-001',
    subject: '  Ошибка обмена\u0000  ',
    description: 'Строка <strong>остаётся текстом</strong>.\r\nБез HTML-интерпретации.',
    category: 'Интеграция',
    priority: 'HIGH',
    correlationId: 'correlation-1',
    projectKey: 'TEST',
    issueType: 'Task',
    componentId: '10001',
    requestType: 'support',
    idempotencyKey: 'jira:create:request-1',
  });
}

test('Jira configuration is disabled by default and validates test/cloud contracts', () => {
  assert.deepEqual(loadJiraConfiguration({}).mode, 'disabled');
  assert.equal(loadJiraConfiguration(testEnvironment()).enabled, true);

  const mismatch = testEnvironment();
  mismatch.JIRA_INTEGRATION_ENABLED = 'false';
  assert.throws(() => loadJiraConfiguration(mismatch), /MODE_ENABLED_MISMATCH/u);

  const cloudHttp: Record<string, string> = {
    ...testEnvironment(),
    JIRA_MODE: 'cloud',
    JIRA_BASE_URL: 'http://jira.test',
  };
  cloudHttp.JIRA_EMAIL = 'service@avantime.lv';
  cloudHttp.JIRA_API_TOKEN = 'safe-test-token-with-adequate-length';
  assert.throws(() => loadJiraConfiguration(cloudHttp), /HTTPS_REQUIRED/u);

  const unapprovedCloudHost = {
    ...cloudHttp,
    JIRA_BASE_URL: 'https://jira.vendor.test',
  };
  assert.throws(() => loadJiraConfiguration(unapprovedCloudHost), /CLOUD_HOST_NOT_ALLOWED/u);

  const cloudPlaceholder = {
    ...cloudHttp,
    JIRA_BASE_URL: 'https://jira.example.com',
    JIRA_API_TOKEN: '<secret-store-reference>',
  };
  assert.throws(() => loadJiraConfiguration(cloudPlaceholder), /PLACEHOLDER/u);
});

test('safe Jira payload projection enforces exact allowlists and plain-text limits', () => {
  const projected = payload();
  assert.equal(projected.fields.project.key, 'TEST');
  assert.equal(projected.fields.summary, 'Ошибка обмена');
  assert.equal(projected.fields.priority.name, 'High');
  assert.deepEqual(projected.fields.components, [{ id: '10001' }]);
  assert.equal(
    projected.fields.description.content[0]?.content[0]?.text.includes('<strong>'),
    true,
  );
  assert.deepEqual(projected.fields.labels.length, 2);
  assert.doesNotMatch(JSON.stringify(projected), /correlation-1|credential|token/iu);
  assert.throws(() =>
    projectJiraCreateIssue({
      requestId: 'AV-1',
      subject: 'x'.repeat(161),
      description: 'description',
      category: 'Другое',
      priority: 'NORMAL',
      correlationId: 'correlation-1',
      projectKey: 'TEST',
      issueType: 'Task',
      idempotencyKey: 'jira:create:too-long',
    }),
  );
  assert.throws(() =>
    projectJiraCreateIssue({
      requestId: 'AV-1',
      subject: 'subject',
      description: 'description',
      category: 'client-selected-project',
      priority: 'NORMAL',
      correlationId: 'correlation-1',
      projectKey: 'TEST',
      issueType: 'Task',
      idempotencyKey: 'jira:create:invalid-category',
    }),
  );
});

test('test Jira adapter is deterministic, idempotent and supports transient/permanent errors', async () => {
  const configuration = loadJiraConfiguration(testEnvironment());
  const adapter = new TestJiraProvider(configuration);
  const first = await adapter.createIssue(payload(), 1);
  const second = await adapter.createIssue(payload(), 2);
  assert.deepEqual(first, second);
  assert.match(first.issueKey, /^TEST-[0-9]+$/u);
  assert.match(first.issueUrl, /^https:\/\/jira\.test\.invalid\/browse\/TEST-/u);

  const transient = new TestJiraProvider(configuration, { transientFailures: 1 });
  await assert.rejects(
    () => transient.createIssue(payload(), 1),
    (error: unknown) => error instanceof JiraProviderError && error.retryable,
  );
  assert.match((await transient.createIssue(payload(), 2)).issueKey, /^TEST-/u);

  const permanent = new TestJiraProvider(configuration, { permanentFailure: true });
  await assert.rejects(
    () => permanent.createIssue(payload(), 1),
    (error: unknown) => error instanceof JiraProviderError && !error.retryable,
  );
});

test('Jira Cloud adapter normalizes provider errors without exposing response content', async () => {
  const environment = {
    ...testEnvironment(),
    JIRA_MODE: 'cloud',
    JIRA_BASE_URL: 'https://tenant.atlassian.net',
    JIRA_EMAIL: 'service@avantime.lv',
    JIRA_API_TOKEN: 'safe-test-token-with-adequate-length',
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('raw provider secret body', { status: 503 });
  try {
    const adapter = new JiraCloudProvider(loadJiraConfiguration(environment));
    await assert.rejects(
      () => adapter.createIssue(payload()),
      (error: unknown) =>
        error instanceof JiraProviderError &&
        error.message === 'JIRA_HTTP_503' &&
        !error.message.includes('secret'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mapping, request validation and retry scheduling fail closed', () => {
  assert.deepEqual(
    [1, 2, 3, 20].map((attempt) => jiraBackoffMs(attempt)),
    [1_000, 2_000, 4_000, 300_000],
  );
  assert.throws(() => jiraBackoffMs(0));
  assert.throws(() =>
    validateJiraMapping({
      companyId: 'company-1',
      projectKey: 'client supplied',
      enabled: true,
      actorId: 'actor-1',
      correlationId: 'correlation-1',
    }),
  );
  assert.equal(
    validateJiraMapping({
      companyId: 'company-1',
      projectKey: 'SUP',
      issueType: 'Service Request',
      enabled: true,
      actorId: 'actor-1',
      correlationId: 'correlation-1',
    }).projectKey,
    'SUP',
  );
  assert.deepEqual(
    validateRequestCreationPayload({
      title: ' Request subject ',
      description: 'Safe plain-text description',
      category: '1С',
      priority: 'CRITICAL',
    }),
    {
      title: 'Request subject',
      description: 'Safe plain-text description',
      category: '1С',
      priority: 'CRITICAL',
    },
  );
  assert.equal(validateRequestIdempotencyKey('request:12345678'), 'request:12345678');
  assert.throws(() => validateRequestIdempotencyKey('short'));
});
