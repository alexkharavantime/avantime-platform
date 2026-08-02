import { NextResponse } from 'next/server';
import { governanceMutationOriginAllowed } from '../../../lib/governance-request-security';
import { authorizeOrganizationApi } from '../../../lib/organization-authorization';
import {
  validateRequestCreationPayload,
  validateRequestIdempotencyKey,
} from '../../../lib/request-creation';
import { createRequest, listRequests } from '../../../lib/requests-store';

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('requests.view', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  return NextResponse.json({ requests: await listRequests(authorization.session) });
}

export async function POST(request: Request) {
  if (!governanceMutationOriginAllowed(request)) {
    return NextResponse.json({ error: 'Источник запроса не разрешён.' }, { status: 403 });
  }
  const requestedCorrelationId = request.headers.get('x-avantime-correlation-id');
  const correlationId =
    requestedCorrelationId && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,199}$/u.test(requestedCorrelationId)
      ? requestedCorrelationId
      : crypto.randomUUID();
  const authorization = await authorizeOrganizationApi('requests.create', {
    correlationId,
  });
  if (authorization.response) return authorization.response;
  const session = authorization.session;
  if (!session.companyId)
    return NextResponse.json({ error: 'Для пользователя не указана компания.' }, { status: 403 });
  let input;
  let idempotencyKey;
  try {
    input = validateRequestCreationPayload(await request.json());
    idempotencyKey = validateRequestIdempotencyKey(request.headers.get('idempotency-key'));
  } catch {
    return NextResponse.json({ error: 'Проверьте заполнение формы.' }, { status: 400 });
  }
  try {
    const created = await createRequest(input, session, {
      correlationId,
      idempotencyKey,
    });
    return NextResponse.json(
      {
        request: created,
        integrationStatus: created.jiraIntegrationStatus,
      },
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Не удалось создать обращение.' }, { status: 503 });
  }
}
