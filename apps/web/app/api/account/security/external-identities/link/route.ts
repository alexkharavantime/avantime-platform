import { NextResponse } from 'next/server';

import { parseIdentityMutation } from '../../../../../../lib/identity-route';
import { authorizePortalApi } from '../../../../../../lib/portal-session';

export async function POST(request: Request) {
  const authorization = await authorizePortalApi();
  if (authorization.response) return authorization.response;
  const parsed = await parseIdentityMutation(request);
  if (parsed.response) return parsed.response;
  return NextResponse.json(
    {
      error:
        'Связывание identity возможно только через подтверждённый OIDC callback и повторный вход.',
      code: 'OIDC_CALLBACK_REQUIRED',
    },
    { status: 400 },
  );
}
