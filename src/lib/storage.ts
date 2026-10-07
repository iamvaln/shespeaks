// Object storage for speaker photos.
//  - Production (Vercel): private Supabase Storage bucket. Browsers upload straight to Storage through a
//    signed upload URL, because Vercel functions cannot receive bodies larger than ~4.5 MB.
//  - Local dev (no SUPABASE_URL): files in DATA_DIR/uploads, uploaded through our own API.
import fs from 'node:fs';
import path from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const BUCKET = process.env.SUPABASE_PHOTO_BUCKET || 'speaker-photos';
const LOCAL_DIR = path.join(path.resolve(process.env.DATA_DIR || './data'), 'uploads');

export const storageMode = (): 'supabase' | 'local' => (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? 'supabase' : 'local');

const g = globalThis as unknown as { __ssSb?: SupabaseClient; __ssBucketOk?: boolean };
function sb(): SupabaseClient {
  if (!g.__ssSb) g.__ssSb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  return g.__ssSb;
}
async function ensureBucket() {
  if (g.__ssBucketOk) return;
  const { data } = await sb().storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await sb().storage.createBucket(BUCKET, { public: false, fileSizeLimit: 10 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png'] });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  g.__ssBucketOk = true;
}
const localPath = (p: string) => {
  const full = path.join(LOCAL_DIR, p);
  if (!full.startsWith(LOCAL_DIR + path.sep)) throw new Error('bad path');
  return full;
};

export async function createUploadTarget(objectPath: string): Promise<{ signedUrl: string; path: string }> {
  await ensureBucket();
  const { data, error } = await sb().storage.from(BUCKET).createSignedUploadUrl(objectPath);
  if (error || !data) throw error ?? new Error('no signed url');
  return { signedUrl: data.signedUrl, path: objectPath };
}

export async function putObject(objectPath: string, data: Buffer, contentType: string) {
  if (storageMode() === 'local') {
    fs.mkdirSync(path.dirname(localPath(objectPath)), { recursive: true });
    fs.writeFileSync(localPath(objectPath), data);
    return;
  }
  await ensureBucket();
  const { error } = await sb().storage.from(BUCKET).upload(objectPath, data, { contentType, upsert: false });
  if (error) throw error;
}

export async function getObject(objectPath: string): Promise<Buffer | null> {
  if (storageMode() === 'local') return fs.existsSync(localPath(objectPath)) ? fs.readFileSync(localPath(objectPath)) : null;
  const { data, error } = await sb().storage.from(BUCKET).download(objectPath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

export async function removeObject(objectPath: string) {
  if (storageMode() === 'local') return void fs.rmSync(localPath(objectPath), { force: true });
  await sb().storage.from(BUCKET).remove([objectPath]);
}

/** Short-lived read URL (Supabase only). */
export async function signedReadUrl(objectPath: string, seconds = 300): Promise<string | null> {
  if (storageMode() === 'local') return null;
  const { data } = await sb().storage.from(BUCKET).createSignedUrl(objectPath, seconds);
  return data?.signedUrl ?? null;
}
