import { NextResponse } from 'next/server';
import { createRequest, listRequests, type RequestPriority } from '../../../lib/requests-store';
import { createJiraIssue } from '../../../lib/jira';
import { getSession } from '../../../lib/session';

export async function GET() {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ requests: await listRequests() });
}

export async function POST(request: Request) {
  if (!(await getSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json()) as { title?: string; description?: string; category?: string; priority?: RequestPriority };
  if (!body.title?.trim() || !body.description?.trim() || !body.category?.trim()) return NextResponse.json({ error: 'Заполните тему, категорию и описание.' }, { status: 400 });
  const input = { title: body.title.trim(), description: body.description.trim(), category: body.category.trim(), priority: body.priority ?? 'NORMAL' as RequestPriority };
  const created = await createRequest(input);
  let jira = null;
  try { jira = await createJiraIssue(input); } catch (error) { console.error('Jira synchronization failed.', error); }
  return NextResponse.json({ request: created, jira }, { status: 201 });
}
