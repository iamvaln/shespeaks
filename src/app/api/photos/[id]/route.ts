import { NextResponse, type NextRequest } from 'next/server';
import { get } from '@/lib/db';
import type { Photo } from '@/lib/data';
import { getCandidateFromCookie } from '@/lib/locale';
import { getSessionCoach } from '@/lib/auth';
import { readPhoto } from '@/lib/photos';

export const dynamic = 'force-dynamic';

// Photos are personal data: only the owner (cookie) or a signed-in coach can read them.
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const photo = get<Photo>('SELECT * FROM photos WHERE id=?', Number(id));
  if (!photo) return new NextResponse('Not found', { status: 404 });
  const owner = await getCandidateFromCookie();
  const allowed = owner?.id === photo.candidate_id || !!(await getSessionCoach());
  if (!allowed) return new NextResponse('Forbidden', { status: 403 });
  return new NextResponse(new Uint8Array(readPhoto(photo)), {
    headers: { 'content-type': photo.mime, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' },
  });
}
