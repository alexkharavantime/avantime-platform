import { NextResponse } from 'next/server';

import { governanceMutationOriginAllowed } from '../../../../../lib/governance-request-security';
import { createJiraProvider } from '../../../../../lib/jira';
import { loadJiraConfiguration } from '../../../../../lib/jira-configuration';
import { processJiraOperationBatch } from '../../../../../lib/jira-outbox';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';

export async function POST(request: Request) {
  if (process.env.IDENTITY_TEST_MODE !== 'browser' || process.env.JIRA_MODE !== 'test') {
    return NextResponse.json({ error: 'Ресурс не найден.' }, { status: 404 });
  }
  if (!governanceMutationOriginAllowed(request)) {
    return NextResponse.json({ error: 'Источник запроса не разрешён.' }, { status: 403 });
  }
  const authorization = await authorizeOrganizationApi('requests.create', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  const configuration = loadJiraConfiguration();
  const summary = await processJiraOperationBatch({
    provider: createJiraProvider(),
    batchSize: configuration.batchSize,
    leaseMs: configuration.leaseMs,
  });
  return NextResponse.json({ status: 'processed', summary });
}
