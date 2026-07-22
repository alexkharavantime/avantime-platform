import { NextResponse } from 'next/server';
import { getAccountProfile, updateAccountProfile } from '../../../lib/account';
import { getSession } from '../../../lib/session';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  return NextResponse.json(await getAccountProfile(session));
}

export async function PUT(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Требуется вход.' }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const profile = {
    name: String(body.name ?? '').trim(),
    email: session.email,
    phone: String(body.phone ?? '').trim(),
    jobTitle: String(body.jobTitle ?? '').trim(),
    companyName: String(body.companyName ?? '').trim(),
    registrationNumber: String(body.registrationNumber ?? '').trim(),
    address: String(body.address ?? '').trim(),
  };
  if (!profile.name || !profile.companyName) {
    return NextResponse.json({ error: 'Укажите имя и название компании.' }, { status: 400 });
  }
  return NextResponse.json(await updateAccountProfile(session, profile));
}
