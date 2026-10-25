import { NextResponse } from 'next/server';
import { getPrisma } from '@avantime/database';

import { listAccessRequestsForReview } from '../../../../lib/access-requests';
import { authorizePlatformApi } from '../../../../lib/platform-authorization';

export async function GET() {
  const authorization = await authorizePlatformApi('platform.access_requests.manage', {
    operationalContext: { targetType: 'access-request' },
  });
  if (authorization.response) return authorization.response;
  const prisma = await getPrisma();
  const [requests, companies] = await Promise.all([
    listAccessRequestsForReview(),
    prisma
      ? prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
      : Promise.resolve([]),
  ]);
  const response = NextResponse.json({ requests, companies });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
