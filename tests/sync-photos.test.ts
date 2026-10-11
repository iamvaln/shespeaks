import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
// @ts-expect-error untyped ops script
import { listAll, missing, localPath } from '../ops/sync-photos.mjs';

// Supabase Storage lists one level at a time: folders come back with id null.
function fakeStorage(tree: Record<string, string[]>) {
  const calls: string[] = [];
  const fetchFn = async (_url: string, init: { body: string }) => {
    const { prefix, offset } = JSON.parse(init.body);
    calls.push(`${prefix}@${offset}`);
    const names = (tree[prefix] ?? []).slice(offset, offset + 2); // pages of 2 to exercise paging
    return new Response(JSON.stringify(names.map((n) => (n.endsWith('/') ? { name: n.slice(0, -1), id: null } : { name: n, id: 'x' }))));
  };
  return { fetchFn, calls };
}

test('listAll walks folders and pages and returns full object paths', async () => {
  const { fetchFn } = fakeStorage({ '': ['12/', '7/'], '12/': ['a.jpg', 'b.png', 'c.jpg'], '7/': ['d.jpg'] });
  const all = await listAll(fetchFn as never, 'https://x.supabase.co', 'key', 'speaker-photos', 2);
  assert.deepEqual(all.sort(), ['12/a.jpg', '12/b.png', '12/c.jpg', '7/d.jpg']);
});

test('missing keeps only what is not already on disk', () => {
  assert.deepEqual(missing(['1/a.jpg', '1/b.jpg', '2/c.png'], new Set(['1/a.jpg'])), ['1/b.jpg', '2/c.png']);
});

test('localPath refuses a path that leaves the target folder', () => {
  assert.equal(localPath('/data/uploads', '12/a.jpg'), path.join('/data/uploads', '12/a.jpg'));
  assert.throws(() => localPath('/data/uploads', '../etc/passwd'));
  assert.throws(() => localPath('/data/uploads', '/etc/passwd'));
});
