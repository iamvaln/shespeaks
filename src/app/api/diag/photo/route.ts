import { NextResponse, type NextRequest } from 'next/server';
import { getCandidateFromCookie } from '@/lib/locale';
import { addPhoto, deletePhoto, photosOf } from '@/lib/photos';
import { touchCandidate } from '@/lib/data';

export const dynamic = 'force-dynamic';
const list = (id: number) => photosOf(id).map((p) => ({ id: p.id, width: p.width, height: p.height, size: p.size }));

export async function POST(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'empty' }, { status: 400 });
  const r = addPhoto(c.id, Buffer.from(await file.arrayBuffer()));
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.error === 'too_big' ? 413 : 422 });
  touchCandidate(c.id);
  return NextResponse.json({ photos: list(c.id) });
}

export async function DELETE(req: NextRequest) {
  const c = await getCandidateFromCookie();
  if (!c) return NextResponse.json({ error: 'no_session' }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (Number.isInteger(id)) deletePhoto(c.id, id);
  touchCandidate(c.id);
  return NextResponse.json({ photos: list(c.id) });
}
