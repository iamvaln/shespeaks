// Speaker photo storage: JPG/PNG only (checked on magic bytes), 10 Mo max, 3 per candidate.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR, all, get, run } from './db.ts';
import type { Photo } from './data.ts';

export const MAX_PHOTOS = 3;
export const MAX_BYTES = 10 * 1024 * 1024;

function dims(buf: Buffer, mime: string): { width: number; height: number } | null {
  try {
    if (mime === 'image/png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    // JPEG: walk the segments to the first SOFn marker
    let i = 2;
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

export type PhotoError = 'too_many' | 'too_big' | 'bad_type' | 'empty';

export function addPhoto(candidateId: number, data: Buffer): { photo?: Photo; error?: PhotoError } {
  if (data.length === 0) return { error: 'empty' };
  if (data.length > MAX_BYTES) return { error: 'too_big' };
  const count = (get<{ c: number }>('SELECT COUNT(*) c FROM photos WHERE candidate_id=?', candidateId))!.c;
  if (count >= MAX_PHOTOS) return { error: 'too_many' };
  const isPng = data.length > 24 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpg = data.length > 4 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (!isPng && !isJpg) return { error: 'bad_type' };
  const mime = isPng ? 'image/png' : 'image/jpeg';
  const filename = `${crypto.randomUUID()}.${isPng ? 'png' : 'jpg'}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), data);
  const d = dims(data, mime);
  const info = run('INSERT INTO photos (candidate_id,filename,mime,size,width,height) VALUES (?,?,?,?,?,?)', candidateId, filename, mime, data.length, d?.width ?? null, d?.height ?? null);
  return { photo: get<Photo>('SELECT * FROM photos WHERE id=?', Number(info.lastInsertRowid)) };
}

export function deletePhoto(candidateId: number, photoId: number) {
  const p = get<Photo>('SELECT * FROM photos WHERE id=? AND candidate_id=?', photoId, candidateId);
  if (!p) return;
  fs.rmSync(path.join(UPLOAD_DIR, p.filename), { force: true });
  run('DELETE FROM photos WHERE id=?', photoId);
  run('UPDATE candidates SET selected_photo_id=NULL WHERE id=? AND selected_photo_id=?', candidateId, photoId);
}

export const readPhoto = (p: Photo) => fs.readFileSync(path.join(UPLOAD_DIR, p.filename));
export const photosOf = (candidateId: number) => all<Photo>('SELECT * FROM photos WHERE candidate_id=? ORDER BY id', candidateId);
