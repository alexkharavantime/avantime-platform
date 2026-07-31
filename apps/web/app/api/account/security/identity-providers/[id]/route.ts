import { NextResponse } from 'next/server';

import { identityCorrelationId, parseIdentityMutation } from '../../../../../../lib/identity-route';
import {
  getOidcProvider,
  updateOidcProvider,
} from '../../../../../../lib/oidc-provider-configuration';
import { parseOidcProviderConfiguration } from '../../../../../../lib/oidc-provider-route';
import { authorizePortalApi } from '../../../../../../lib/portal-session';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  try {
    return NextResponse.json(
      await getOidcProvider(authorization.session, (await context.params).id),
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Провайдер не найден.' }, { status: 404 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  const configuration = parseOidcProviderConfiguration(parsed.body);
  if (
    !configuration ||
    !Number.isSafeInteger(parsed.body.expectedVersion) ||
    typeof parsed.body.controlledIssuerRevalidation !== 'boolean'
  ) {
    return NextResponse.json({ error: 'Некорректная конфигурация OIDC.' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await updateOidcProvider({
        session: authorization.session,
        providerId: (await context.params).id,
        expectedVersion: parsed.body.expectedVersion as number,
        configuration,
        controlledIssuerRevalidation: parsed.body.controlledIssuerRevalidation,
        correlationId: identityCorrelationId(request),
      }),
    );
  } catch {
    return NextResponse.json({ error: 'Конфигурация OIDC не обновлена.' }, { status: 409 });
  }
}
