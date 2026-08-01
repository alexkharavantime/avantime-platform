import { NextResponse } from 'next/server';

import { authorizePlatformApi } from '../../../../../../lib/platform-authorization';
import { endPlatformSupportSession } from '../../../../../../lib/platform-support';
import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request))
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  const authorization = await authorizePlatformApi('platform.support.session.end');
  if (authorization.response) return authorization.response;
  try {
    await endPlatformSupportSession({
      session: authorization.session,
      supportSessionId: (await params).id,
    });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: 'Support-сессия не завершена.' }, { status: 403 });
  }
}
