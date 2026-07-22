import { NextResponse } from 'next/server';
import { setKnowledgeArticleStatus, type KnowledgeStatus } from '../../../../../../lib/knowledge-store';
import { getSession } from '../../../../../../lib/session';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 });
  const { id } = await params;
  const form = await request.formData();
  const status = String(form.get('status')) as KnowledgeStatus;
  if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(status)) return NextResponse.json({ error: 'Некорректный статус' }, { status: 400 });
  await setKnowledgeArticleStatus(id, status);
  return NextResponse.redirect(new URL('/admin/knowledge', request.url), 303);
}
