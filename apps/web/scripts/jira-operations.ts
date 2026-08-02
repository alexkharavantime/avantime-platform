import { getPrisma } from '@avantime/database';

import { createJiraProvider } from '../lib/jira';
import { loadJiraConfiguration, summarizeJiraConfiguration } from '../lib/jira-configuration';
import {
  inspectJiraOperations,
  moveFailedJiraOperationToDeadLetter,
  retryJiraOperation,
} from '../lib/jira-outbox';
import { runJiraWorker } from '../lib/jira-worker-runtime';

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
  if (command === 'dead-letter' && argument) {
    assertMutationAllowed();
    await moveFailedJiraOperationToDeadLetter(argument);
    console.info(JSON.stringify({ status: 'passed', operation: 'dead-letter', id: argument }));
    return;
  }
  if (command === 'worker-once') {
    console.info(
      JSON.stringify({ status: 'passed', summary: await runJiraWorker({ once: true }) }),
    );
    return;
  }
  if (command === 'connectivity') {
    const ready = await createJiraProvider().checkReadiness();
    if (!ready) throw new Error('JIRA_PROVIDER_UNAVAILABLE');
    console.info(
      JSON.stringify({
        status: 'passed',
        configuration: summarizeJiraConfiguration(configuration),
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
