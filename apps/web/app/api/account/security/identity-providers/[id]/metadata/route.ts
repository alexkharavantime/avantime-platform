import { NextResponse } from 'next/server';

import {
  identityCorrelationId,
  parseIdentityMutation,
} from '../../../../../../../lib/identity-route';
import { refreshOidcProviderMetadata } from '../../../../../../../lib/oidc-provider-configuration';
import { authorizePortalApi } from '../../../../../../../lib/portal-session';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  if (!Number.isSafeInteger(parsed.body.expectedVersion)) {
    return NextResponse.json({ error: 'Некорректная версия конфигурации.' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await refreshOidcProviderMetadata({
        session: authorization.session,
        providerId: (await context.params).id,
        expectedVersion: parsed.body.expectedVersion as number,
        correlationId: identityCorrelationId(request),
      }),
    );
  } catch {
    return NextResponse.json({ error: 'OIDC metadata не подтверждены.' }, { status: 400 });
  }
}
