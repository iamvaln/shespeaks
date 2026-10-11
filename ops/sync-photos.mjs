// Copies the speaker photos from the Supabase Storage bucket into a folder (the `uploads` volume on the VPS), keeping
// the object paths (`<candidateId>/<uuid>.<ext>`, what photos.filename holds). Files already there are skipped: run it
// once ahead of the cutover for the bulk, then again during the cutover for what arrived since. No dependency.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node ops/sync-photos.mjs /data/uploads
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const headers = (key) => ({ authorization: `Bearer ${key}`, apikey: key });

/** Every object path of the bucket. The list API returns one folder level per call, in pages; folders have id null. */
export async function listAll(fetchFn, base, key, bucket, pageSize = 1000, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const r = await fetchFn(`${base}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { ...headers(key), 'content-type': 'application/json' },
      body: JSON.stringify({ prefix, limit: pageSize, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!r.ok) throw new Error(`list ${prefix || '/'}: HTTP ${r.status}`);
    const items = await r.json();
    for (const it of items) {
      if (it.id === null) out.push(...(await listAll(fetchFn, base, key, bucket, pageSize, `${prefix}${it.name}/`)));
      else out.push(`${prefix}${it.name}`);
    }
    if (items.length < pageSize) return out;
  }
}

export const missing = (remote, present) => remote.filter((p) => !present.has(p));

export function localPath(root, p) {
  const full = path.resolve(root, p);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error(`refused path: ${p}`);
  return full;
}

function filesUnder(root, dir = '') {
  if (!fs.existsSync(path.join(root, dir))) return [];
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesUnder(root, path.join(dir, e.name)) : [path.join(dir, e.name).split(path.sep).join('/')]);
}

async function main() {
  const root = process.argv[2];
  const base = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_PHOTO_BUCKET || 'speaker-photos';
  if (!root || !base || !key) { console.error('usage: SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node ops/sync-photos.mjs <folder>'); process.exit(2); }
  const remote = await listAll(fetch, base, key, bucket);
  const todo = missing(remote, new Set(filesUnder(root)));
  let failed = 0;
  for (const p of todo) {
    const r = await fetch(`${base}/storage/v1/object/authenticated/${bucket}/${p.split('/').map(encodeURIComponent).join('/')}`, { headers: headers(key) });
    if (!r.ok) { console.error(`[sync-photos] FAILED ${p}: HTTP ${r.status}`); failed++; continue; }
    const dest = localPath(root, p);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(`${dest}.part`, Buffer.from(await r.arrayBuffer()));
    fs.renameSync(`${dest}.part`, dest); // never leave a half-written photo under its real name
  }
  console.log(`[sync-photos] remote ${remote.length}, already here ${remote.length - todo.length}, copied ${todo.length - failed}${failed ? `, FAILED ${failed}` : ''}`);
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
