import { NextResponse } from 'next/server';

import { identityCorrelationId, parseIdentityMutation } from '../../../../../lib/identity-route';
import {
  createOidcProvider,
  listOidcProviders,
} from '../../../../../lib/oidc-provider-configuration';
import { parseOidcProviderConfiguration } from '../../../../../lib/oidc-provider-route';
import { authorizeOrganizationApi } from '../../../../../lib/organization-authorization';

export async function GET(request: Request) {
  const authorization = await authorizeOrganizationApi('identity.providers.manage', {
    correlationId: request.headers.get('x-avantime-correlation-id'),
  });
  if (authorization.response) return authorization.response;
  try {
    const response = NextResponse.json(await listOidcProviders(authorization.session));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'Недостаточно прав.' }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const authorization = await authorizeOrganizationApi('identity.providers.manage', {
    correlationId: identityCorrelationId(request),
  });
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const configuration = parseOidcProviderConfiguration(parsed.body);
  if (!configuration) {
    return NextResponse.json({ error: 'Некорректная конфигурация OIDC.' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await createOidcProvider({
        session: authorization.session,
        configuration,
        correlationId: identityCorrelationId(request),
      }),
      { status: 201 },
    );
  } catch {
    return NextResponse.json({ error: 'Конфигурация OIDC не сохранена.' }, { status: 400 });
  }
}
