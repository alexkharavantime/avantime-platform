import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const supplied = request.headers.get('x-correlation-id') ?? '';
  const correlationId = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,99}$/u.test(supplied)
    ? supplied
    : randomUUID();
  return NextResponse.json(
    { status: 'ok', correlationId },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
