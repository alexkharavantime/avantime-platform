import { getPrisma } from '@avantime/database';
import { NextResponse } from 'next/server';

import { executeGovernanceApproval } from '../../../../../../lib/governance-approvals';
import { governanceMutationOriginAllowed } from '../../../../../../lib/governance-request-security';
import { authorizeOrganizationSession } from '../../../../../../lib/organization-authorization';
import { authorizePlatformSession } from '../../../../../../lib/platform-authorization';
import { getSession } from '../../../../../../lib/session';

const VISIBILITIES = new Set(['PRIVATE', 'ORGANIZATION', 'PLATFORM', 'PUBLIC']);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!governanceMutationOriginAllowed(request))
    return NextResponse.json({ error: 'Запрос отклонён.' }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    visibility?: unknown;
    expectedVersion?: unknown;
    approvalId?: unknown;
  } | null;
  if (
    typeof body?.visibility !== 'string' ||
    !VISIBILITIES.has(body.visibility) ||
    !Number.isSafeInteger(body.expectedVersion)
  ) {
    return NextResponse.json({ error: 'Некорректная visibility transition.' }, { status: 400 });
  }
  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ error: 'Knowledge store недоступен.' }, { status: 503 });
  const article = await prisma.knowledgeArticle.findUnique({ where: { id: (await params).id } });
  if (!article || article.quarantinedAt)
    return NextResponse.json({ error: 'Материал не найден.' }, { status: 404 });
  const session = await getSession();
  if (article.ownerScope === 'PLATFORM') {
    const authorization = await authorizePlatformSession(
      session,
      'platform.knowledge.visibility.manage',
    );
    if (authorization.response) return authorization.response;
    if (body.visibility === 'ORGANIZATION')
      return NextResponse.json(
        { error: 'Platform material не может иметь organization visibility.' },
        { status: 400 },
      );
    const updated = await prisma.knowledgeArticle.updateMany({
      where: { id: article.id, version: body.expectedVersion as number },
      data: {
        visibility: body.visibility as 'PRIVATE' | 'PLATFORM' | 'PUBLIC',
        version: { increment: 1 },
      },
    });
    return updated.count === 1
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: 'Версия материала изменилась.' }, { status: 409 });
  }
  if (article.ownerScope !== 'ORGANIZATION' || !article.companyId)
    return NextResponse.json(
      { error: 'Классификация материала запрещает изменение.' },
      { status: 403 },
    );
  const authorization = await authorizeOrganizationSession(session, 'knowledge.visibility.manage', {
    resource: {
      companyId: article.companyId,
      targetType: 'knowledge-article',
      targetId: article.id,
    },
    concealCrossTenant: true,
  });
  if (authorization.response) return authorization.response;
  if (body.visibility === 'PLATFORM')
    return NextResponse.json(
      { error: 'Organization material не может иметь platform visibility.' },
      { status: 400 },
    );
  if (body.visibility === 'PUBLIC') {
    if (typeof body.approvalId !== 'string')
      return NextResponse.json({ error: 'Требуется controlled approval.' }, { status: 403 });
    try {
      await executeGovernanceApproval({
        session: authorization.session,
        requestId: body.approvalId,
        executionKey: `knowledge-public:${body.approvalId}`,
        executionAuthorized: true,
        expectedActionType: 'KNOWLEDGE_VISIBILITY_PUBLIC',
        currentResourceVersion: article.version,
        execute: async (transaction, approval) => {
          if (
            approval.resourceId !== article.id ||
            approval.companyId !== article.companyId ||
            approval.safeParameters.articleId !== article.id ||
            approval.safeParameters.articleVersion !== article.version
          )
            throw new Error('APPROVAL_TARGET_CHANGED');
          await transaction.knowledgeArticle.update({
            where: { id: article.id },
            data: {
              visibility: 'PUBLIC',
              publicationApprovalId: approval.id,
              version: { increment: 1 },
            },
          });
        },
      });
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Approval execution отклонён.' }, { status: 409 });
    }
  }
  const updated = await prisma.knowledgeArticle.updateMany({
    where: {
      id: article.id,
      companyId: authorization.session.companyId,
      version: body.expectedVersion as number,
    },
    data: {
      visibility: body.visibility as 'PRIVATE' | 'ORGANIZATION',
      publicationApprovalId: null,
      version: { increment: 1 },
    },
  });
  return updated.count === 1
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: 'Версия материала изменилась.' }, { status: 409 });
}
