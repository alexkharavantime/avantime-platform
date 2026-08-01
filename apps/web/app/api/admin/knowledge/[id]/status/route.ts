import { NextResponse } from 'next/server';
import {
  setKnowledgeArticleStatus,
  setOrganizationKnowledgeArticleStatus,
  type KnowledgeStatus,
} from '../../../../../../lib/knowledge-store';
import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';
import { authorizeOrganizationSession } from '../../../../../../lib/organization-authorization';
import { authorizePlatformApi } from '../../../../../../lib/platform-authorization';
import { getSession } from '../../../../../../lib/session';
import { getPrisma } from '@avantime/database';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request))
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  const form = await request.formData();
  const status = String(form.get('status')) as KnowledgeStatus;
  const expectedVersion = Number(form.get('expectedVersion'));
  if (!['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'].includes(status))
    return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
    return NextResponse.json({ error: 'Некорректная версия' }, { status: 400 });
  const { id } = await params;
  const prisma = await getPrisma();
  const article = prisma
    ? await prisma.knowledgeArticle.findUnique({
        where: { id },
        select: { ownerScope: true, companyId: true },
      })
    : null;
  if (!article) return NextResponse.json({ error: 'Материал не найден' }, { status: 404 });
  let updated;
  if (article.ownerScope === 'ORGANIZATION' && article.companyId) {
    const permission =
      status === 'PUBLISHED'
        ? 'knowledge.publish'
        : status === 'REVIEW'
          ? 'knowledge.review'
          : status === 'ARCHIVED'
            ? 'knowledge.archive'
            : 'knowledge.manage';
    const authorization = await authorizeOrganizationSession(await getSession(), permission, {
      resource: { companyId: article.companyId, targetType: 'knowledge-article', targetId: id },
      concealCrossTenant: true,
    });
    if (authorization.response) return authorization.response;
    updated = await setOrganizationKnowledgeArticleStatus({
      session: authorization.session,
      id,
      status,
      expectedVersion,
    });
  } else {
    const authorization = await authorizePlatformApi(
      status === 'PUBLISHED' ? 'platform.knowledge.publish' : 'platform.knowledge.manage',
    );
    if (authorization.response) return authorization.response;
    updated = await setKnowledgeArticleStatus(id, status, expectedVersion);
  }
  if (!updated) return NextResponse.json({ error: 'Версия материала изменилась' }, { status: 409 });
  return NextResponse.redirect(new URL('/admin/knowledge', request.url), 303);
}
