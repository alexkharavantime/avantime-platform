import { NextResponse } from 'next/server';

import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';
import { requestPlatformKnowledgeReindex } from '../../../../../../lib/knowledge-indexing';
import { authorizePlatformApi } from '../../../../../../lib/platform-authorization';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request)) {
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  }
  const authorization = await authorizePlatformApi('platform.knowledge.manage');
  if (authorization.response) return authorization.response;

  const form = await request.formData();
  const expectedVersion = Number(form.get('expectedVersion'));
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ error: 'Некорректная версия.' }, { status: 400 });
  }

  const result = await requestPlatformKnowledgeReindex({
    articleId: (await params).id,
    expectedVersion,
    actorId: authorization.session.userId,
    correlationId: crypto.randomUUID(),
  });
  if (!result) {
    return NextResponse.json(
      { error: 'Материал не найден или версия изменилась.' },
      { status: 409 },
    );
  }
  return NextResponse.redirect(new URL('/admin/knowledge', request.url), 303);
}
