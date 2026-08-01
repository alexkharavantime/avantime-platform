import { NextResponse } from 'next/server';
import {
  setKnowledgeArticleStatus,
  type KnowledgeStatus,
} from '../../../../../../lib/knowledge-store';
import { authorizePlatformApi } from '../../../../../../lib/platform-authorization';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const form = await request.formData();
  const status = String(form.get('status')) as KnowledgeStatus;
  const expectedVersion = Number(form.get('expectedVersion'));
  if (!['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'].includes(status))
    return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
    return NextResponse.json({ error: 'Некорректная версия' }, { status: 400 });
  const authorization = await authorizePlatformApi(
    status === 'PUBLISHED' ? 'platform.knowledge.publish' : 'platform.knowledge.manage',
  );
  if (authorization.response) return authorization.response;
  const { id } = await params;
  const updated = await setKnowledgeArticleStatus(id, status, expectedVersion);
  if (!updated) return NextResponse.json({ error: 'Версия материала изменилась' }, { status: 409 });
  return NextResponse.redirect(new URL('/admin/knowledge', request.url), 303);
}
