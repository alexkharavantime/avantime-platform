import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/session';
import { inviteCompanyMember, listCompanyMembers } from '../../../lib/team';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ members: await listCompanyMembers(session) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await request.json()) as { name?: string; email?: string; jobTitle?: string };
  if (!body.name?.trim() || !body.email?.includes('@')) return NextResponse.json({ error: 'Укажите имя и корректный email.' }, { status: 400 });
  const member = await inviteCompanyMember(session, { name: body.name.trim(), email: body.email.trim().toLowerCase(), jobTitle: body.jobTitle?.trim() ?? '' });
  return NextResponse.json({ member }, { status: 201 });
}
