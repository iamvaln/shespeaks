import { NextResponse } from 'next/server';
import { get } from '@/lib/db';

export const dynamic = 'force-dynamic';

// For the container healthcheck and the cutover script: is the database answering? No data, no authentication.
export async function GET() {
  const headers = { 'cache-control': 'no-store' };
  try {
    await get('SELECT 1 AS ok');
    return NextResponse.json({ ok: true }, { headers });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503, headers });
  }
}
