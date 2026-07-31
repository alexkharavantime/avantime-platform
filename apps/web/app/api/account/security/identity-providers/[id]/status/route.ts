import { NextResponse } from 'next/server';

import {
  identityCorrelationId,
  parseIdentityMutation,
} from '../../../../../../../lib/identity-route';
import { setOidcProviderEnabled } from '../../../../../../../lib/oidc-provider-configuration';
import { authorizePortalApi } from '../../../../../../../lib/portal-session';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  if (
    typeof parsed.body.enabled !== 'boolean' ||
    !Number.isSafeInteger(parsed.body.expectedVersion)
  ) {
    return NextResponse.json({ error: 'Некорректный статус провайдера.' }, { status: 400 });
  }
  try {
    return NextResponse.json(
      await setOidcProviderEnabled({
        session: authorization.session,
        providerId: (await context.params).id,
        enabled: parsed.body.enabled,
        expectedVersion: parsed.body.expectedVersion as number,
        correlationId: identityCorrelationId(request),
      }),
    );
  } catch {
    return NextResponse.json({ error: 'Статус провайдера не изменён.' }, { status: 409 });
  }
}
