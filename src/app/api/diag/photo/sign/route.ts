import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { signUpload } from '@/lib/photos';

export const dynamic = 'force-dynamic';

// Step 1 of a direct-to-Storage upload: validates size/type/count, returns a signed upload URL.
export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const { size, type } = (await req.json().catch(() => ({}))) as { size?: number; type?: string };
  const r = await signUpload(c.id, Number(size), String(type ?? ''));
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 422 });
  return NextResponse.json(r);
}
