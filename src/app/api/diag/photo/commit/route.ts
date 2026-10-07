import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { commitUpload, photosOf } from '@/lib/photos';
import { touchCandidate } from '@/lib/data';

export const dynamic = 'force-dynamic';

// Step 2: the browser finished uploading; we re-validate the stored object (magic bytes, size, count) and register it.
export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const { path } = (await req.json().catch(() => ({}))) as { path?: string };
  const r = await commitUpload(c.id, String(path ?? ''));
  if (r.error) return NextResponse.json({ error: r.error }, { status: 422 });
  await touchCandidate(c.id);
  const photos = (await photosOf(c.id)).map((p) => ({ id: p.id, width: p.width, height: p.height, size: p.size }));
  return NextResponse.json({ photos });
}
