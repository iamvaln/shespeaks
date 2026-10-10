import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirectTarget } from './redirect.ts';

const NEW = 'https://sheleads.techiesconnect.org';
const TOKEN = 'Ab3_dE-f'.repeat(4);

test('a candidate with a session goes to her resume link on the new domain', () => {
  assert.deepEqual(redirectTarget('/interet', '', TOKEN), { url: `${NEW}/reprendre/${TOKEN}`, status: 307 });
});
test('resume links from old emails keep their path', () => {
  assert.deepEqual(redirectTarget(`/reprendre/${TOKEN}`, '', undefined), { url: `${NEW}/reprendre/${TOKEN}`, status: 308 });
  assert.deepEqual(redirectTarget(`/reprendre/${TOKEN}`, '', 'other-token-other-token-0'), { url: `${NEW}/reprendre/${TOKEN}`, status: 308 });
});
test('everyone else keeps path and query', () => {
  assert.deepEqual(redirectTarget('/admin/verify', '?t=abc', undefined), { url: `${NEW}/admin/verify?t=abc`, status: 308 });
  assert.deepEqual(redirectTarget('/', '', undefined), { url: `${NEW}/`, status: 308 });
});
test('a malformed cookie is ignored, not put in a URL', () => {
  assert.deepEqual(redirectTarget('/plan', '', 'a/../b'), { url: `${NEW}/plan`, status: 308 });
  assert.deepEqual(redirectTarget('/plan', '', 'short'), { url: `${NEW}/plan`, status: 308 });
});
