import { getPrisma } from '@avantime/database';

import { createJiraProvider } from '../lib/jira';
import { loadJiraConfiguration, summarizeJiraConfiguration } from '../lib/jira-configuration';
import {
  inspectJiraOperations,
  moveFailedJiraOperationToDeadLetter,
  retryJiraOperation,
} from '../lib/jira-outbox';
import { runJiraWorker } from '../lib/jira-worker-runtime';
import {
  inspectJiraInboundEvents,
  moveJiraInboundEventToDeadLetter,
  retryJiraInboundEvent,
} from '../lib/jira-inbound';
import { runJiraInboundWorker } from '../lib/jira-inbound-worker-runtime';
import { createJiraWebhookSignature, ingestJiraWebhook } from '../lib/jira-webhook';
import {
  loadJiraWebhookConfiguration,
  summarizeJiraWebhookConfiguration,
} from '../lib/jira-webhook-configuration';

function assertMutationAllowed() {
  if (process.env.APP_ENV === 'production' && !process.argv.includes('--confirm-production')) {
    throw new Error('JIRA_PRODUCTION_OPERATION_DENIED');
  }
}

async function main() {
  const [command, argument] = process.argv
    .slice(2)
    .filter((value) => value !== '--confirm-production');
  const configuration = loadJiraConfiguration();
  if (command === 'inspect') {
    const allowed = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DEAD_LETTER'] as const;
    const status = allowed.find((value) => value === argument);
    console.info(
      JSON.stringify({ status: 'passed', operations: await inspectJiraOperations(status) }),
    );
    return;
  }
  if (command === 'inspect-inbound') {
    const allowed = [
      'PENDING',
      'PROCESSING',
      'COMPLETED',
      'IGNORED',
      'FAILED',
      'DEAD_LETTER',
    ] as const;
    const status = allowed.find((value) => value === argument);
    console.info(
      JSON.stringify({ status: 'passed', events: await inspectJiraInboundEvents(status) }),
    );
    return;
  }
  if (command === 'mapping' && argument) {
    const prisma = await getPrisma();
    if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
    const mapping = await prisma.jiraOrganizationMapping.findUnique({
      where: { companyId: argument },
      select: {
        id: true,
        companyId: true,
        projectKey: true,
        issueType: true,
        componentId: true,
        requestType: true,
        statusMapping: true,
        enabled: true,
        version: true,
        updatedAt: true,
      },
    });
    console.info(JSON.stringify({ status: 'passed', mapping }));
    return;
  }
  if (command === 'retry' && argument) {
    assertMutationAllowed();
    await retryJiraOperation(argument);
    console.info(JSON.stringify({ status: 'passed', operation: 'retry', id: argument }));
    return;
  }
  if (command === 'retry-inbound' && argument) {
    assertMutationAllowed();
    await retryJiraInboundEvent(argument);
    console.info(JSON.stringify({ status: 'passed', operation: 'retry-inbound', id: argument }));
    return;
  }
  if (command === 'dead-letter' && argument) {
    assertMutationAllowed();
    await moveFailedJiraOperationToDeadLetter(argument);
    console.info(JSON.stringify({ status: 'passed', operation: 'dead-letter', id: argument }));
    return;
  }
  if (command === 'dead-letter-inbound' && argument) {
    assertMutationAllowed();
    await moveJiraInboundEventToDeadLetter(argument);
    console.info(
      JSON.stringify({ status: 'passed', operation: 'dead-letter-inbound', id: argument }),
    );
    return;
  }
  if (command === 'worker-once') {
    console.info(
      JSON.stringify({ status: 'passed', summary: await runJiraWorker({ once: true }) }),
    );
    return;
  }
  if (command === 'inbound-worker-once') {
    console.info(
      JSON.stringify({ status: 'passed', summary: await runJiraInboundWorker({ once: true }) }),
    );
    return;
  }
  if (command === 'replay-test' && argument) {
    assertMutationAllowed();
    const webhook = loadJiraWebhookConfiguration();
    if (webhook.mode !== 'test' || !webhook.secret || !webhook.allowedOrigin) {
      throw new Error('JIRA_WEBHOOK_TEST_MODE_REQUIRED');
    }
    const prisma = await getPrisma();
    if (!prisma) throw new Error('JIRA_DATABASE_UNAVAILABLE');
    const request = await prisma.supportRequest.findUnique({ where: { publicId: argument } });
    if (!request?.jiraIssueId || !request.jiraKey) throw new Error('JIRA_LINKED_REQUEST_NOT_FOUND');
    const timestamp = Date.now();
    const rawBody = JSON.stringify({
      timestamp,
      webhookEvent: 'jira:issue_updated',
      issue: {
        id: request.jiraIssueId,
        key: request.jiraKey,
        self: `${webhook.allowedOrigin}/rest/api/3/issue/${encodeURIComponent(request.jiraIssueId)}`,
        fields: {
          status: { id: 'test-in-progress', name: 'In Progress' },
          updated: new Date(timestamp).toISOString(),
        },
      },
      changelog: { id: `test-${timestamp}` },
    });
    const result = await ingestJiraWebhook({
      rawBody,
      signature: createJiraWebhookSignature(webhook.secret, rawBody),
    });
    console.info(JSON.stringify({ status: 'passed', outcome: result.outcome }));
    return;
  }
  if (command === 'connectivity') {
    const ready = await createJiraProvider().checkReadiness();
    if (!ready) throw new Error('JIRA_PROVIDER_UNAVAILABLE');
    console.info(
      JSON.stringify({
        status: 'passed',
        configuration: summarizeJiraConfiguration(configuration),
        webhook: summarizeJiraWebhookConfiguration(loadJiraWebhookConfiguration()),
      }),
    );
    return;
  }
  throw new Error('JIRA_OPERATION_USAGE_INVALID');
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      status: 'failed',
      code: error instanceof Error ? error.message : 'JIRA_OPERATION_FAILED',
    }),
  );
  process.exitCode = 1;
});
