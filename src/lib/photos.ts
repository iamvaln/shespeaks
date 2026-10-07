// Speaker photos: JPG/PNG only (checked on magic bytes), 10 Mo max, 3 per candidate.
import crypto from 'node:crypto';
import { all, get, insert, run } from './db.ts';
import type { Photo } from './data.ts';
import { createUploadTarget, getObject, putObject, removeObject, storageMode } from './storage.ts';

export const MAX_PHOTOS = 3;
export const MAX_BYTES = 10 * 1024 * 1024;

function dims(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    let i = 2; // JPEG: walk segments to the first SOFn marker
    while (i < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + len;
    }
  } catch {
    /* fallthrough */
  }
  return null;
}

export type PhotoError = 'too_many' | 'too_big' | 'bad_type' | 'empty' | 'bad_path';

const countOf = async (candidateId: number) => (await get<{ c: number }>('SELECT COUNT(*)::int AS c FROM photos WHERE candidate_id=?', candidateId))!.c;

function sniff(data: Buffer): { mime: string; ext: string } | null {
  const isPng = data.length > 24 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = data.length > 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  return isPng ? { mime: 'image/png', ext: 'png' } : isJpg ? { mime: 'image/jpeg', ext: 'jpg' } : null;
}

async function register(candidateId: number, objectPath: string, data: Buffer, mime: string): Promise<Photo> {
  const d = dims(data, mime);
  const id = await insert(
    'INSERT INTO photos (candidate_id,filename,mime,size,width,height) VALUES (?,?,?,?,?,?)',
    candidateId, objectPath, mime, data.length, d?.width ?? null, d?.height ?? null,
  );
  return (await get<Photo>('SELECT * FROM photos WHERE id=?', id))!;
}

/** Server-side upload (local dev, or small files). */
export async function addPhoto(candidateId: number, data: Buffer): Promise<{ photo?: Photo; error?: PhotoError }> {
  if (data.length === 0) return { error: 'empty' };
  if (data.length > MAX_BYTES) return { error: 'too_big' };
  if ((await countOf(candidateId)) >= MAX_PHOTOS) return { error: 'too_many' };
  const kind = sniff(data);
  if (!kind) return { error: 'bad_type' };
  const objectPath = `${candidateId}/${crypto.randomUUID()}.${kind.ext}`;
  await putObject(objectPath, data, kind.mime);
  return { photo: await register(candidateId, objectPath, data, kind.mime) };
}

/** Step 1 of the direct upload: pre-check, then hand the browser a signed Storage URL. */
export async function signUpload(candidateId: number, size: number, type: string) {
  if (storageMode() === 'local') return { mode: 'local' as const };
  if (!size || size <= 0) return { error: 'empty' as PhotoError };
  if (size > MAX_BYTES) return { error: 'too_big' as PhotoError };
  if (!['image/jpeg', 'image/png'].includes(type)) return { error: 'bad_type' as PhotoError };
  if ((await countOf(candidateId)) >= MAX_PHOTOS) return { error: 'too_many' as PhotoError };
  const ext = type === 'image/png' ? 'png' : 'jpg';
  const t = await createUploadTarget(`${candidateId}/${crypto.randomUUID()}.${ext}`);
  return { mode: 'supabase' as const, signedUrl: t.signedUrl, path: t.path };
}

/** Step 2: the browser says it uploaded; we re-validate what actually landed in Storage. */
export async function commitUpload(candidateId: number, objectPath: string): Promise<{ photo?: Photo; error?: PhotoError }> {
  if (!objectPath.startsWith(`${candidateId}/`) || objectPath.includes('..')) return { error: 'bad_path' };
  const data = await getObject(objectPath);
  const fail = async (error: PhotoError) => {
    await removeObject(objectPath);
    return { error };
  };
  if (!data || data.length === 0) return { error: 'empty' };
  if (data.length > MAX_BYTES) return fail('too_big');
  const kind = sniff(data);
  if (!kind) return fail('bad_type');
  if (await get('SELECT 1 FROM photos WHERE filename=?', objectPath)) return { error: 'bad_path' };
  if ((await countOf(candidateId)) >= MAX_PHOTOS) return fail('too_many');
  return { photo: await register(candidateId, objectPath, data, kind.mime) };
}

export async function deletePhoto(candidateId: number, photoId: number) {
  const p = await get<Photo>('SELECT * FROM photos WHERE id=? AND candidate_id=?', photoId, candidateId);
  if (!p) return;
  await removeObject(p.filename);
  await run('DELETE FROM photos WHERE id=?', photoId);
  await run('UPDATE candidates SET selected_photo_id=NULL WHERE id=? AND selected_photo_id=?', candidateId, photoId);
}

export const photosOf = (candidateId: number) => all<Photo>('SELECT * FROM photos WHERE candidate_id=? ORDER BY id', candidateId);
