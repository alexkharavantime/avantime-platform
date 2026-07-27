import { NextResponse } from 'next/server';
import { createKnowledgeArticle } from '../../../../lib/knowledge-store';
import { authorizeApi } from '../../../../lib/authorization';

export async function POST(request: Request) {
  const authorization = await authorizeApi(['ADMIN']);
  if (authorization.response) return authorization.response;
  const { session } = authorization;
  const form = await request.formData();
  const title = String(form.get('title') ?? '').trim();
  const slug = String(form.get('slug') ?? '').trim();
  const summary = String(form.get('summary') ?? '').trim();
  const category = String(form.get('category') ?? '').trim();
  const body = String(form.get('body') ?? '').trim();
  if (!title || !slug || !summary || !category || !body) return NextResponse.json({ error: 'Заполните обязательные поля' }, { status: 400 });
  const article = await createKnowledgeArticle({ title, slug, summary, category, body, readingTime: String(form.get('readingTime') ?? '5 минут'), tags: String(form.get('tags') ?? '').split(',').map((v) => v.trim()).filter(Boolean), authorId: session.userId });
  return NextResponse.json(article, { status: 201 });
}
