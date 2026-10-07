import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { addPhoto, deletePhoto, photosOf } from '@/lib/photos';
import { touchCandidate } from '@/lib/data';
import { storageMode } from '@/lib/storage';

export const dynamic = 'force-dynamic';
const list = async (id: number) => (await photosOf(id)).map((p) => ({ id: p.id, width: p.width, height: p.height, size: p.size }));

// Local-dev upload path (multipart through the server). On Vercel/Supabase photos go browser → Storage
// directly (see ./sign and ./commit) because function request bodies are capped at ~4.5 MB.
export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  if (storageMode() === 'supabase') return NextResponse.json({ error: 'use_direct_upload' }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 });
  const r = await addPhoto(c.id, Buffer.from(await file.arrayBuffer()));
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.error === 'too_big' ? 413 : 422 });
  await touchCandidate(c.id);
  return NextResponse.json({ photos: await list(c.id) });
}

export async function DELETE(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (Number.isInteger(id)) await deletePhoto(c.id, id);
  await touchCandidate(c.id);
  return NextResponse.json({ photos: await list(c.id) });
}
