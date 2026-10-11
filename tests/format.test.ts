import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRANCH_SHORT, dayLabel, elapsed, elapsedHours, one, pageList, statusTone } from '../src/lib/admin-format.ts';
import { STATUSES } from '../src/lib/db.ts';

const now = new Date('2026-10-08T18:00:00Z');

test('elapsed: hours under a day, then days; singular at one day', () => {
  assert.equal(elapsed('2026-10-08 17:40:00', now), 'moins d’1 h');
  assert.equal(elapsed('2026-10-08 13:00:00', now), '5 h');
  assert.equal(elapsed('2026-10-07 18:00:00', now), '1 jour');
  assert.equal(elapsed('2026-10-07 02:00:00', now), '1 jour');
  assert.equal(elapsed('2026-10-05 17:00:00', now), '3 jours');
  assert.equal(elapsed('2026-10-09 09:00:00', now), 'moins d’1 h'); // a clock a little ahead never gives a negative
});

test('elapsedHours counts whole hours', () => {
  assert.equal(elapsedHours('2026-10-06 18:00:00', now), 48);
  assert.equal(elapsedHours('2026-10-06 18:59:00', now), 47);
  assert.equal(elapsedHours('2026-10-06 18:01:00', now), 47); // 47 h 59 min: floor, not round
});

test('dayLabel wording', () => {
  assert.deepEqual([0, 1, 2, -1, -3].map(dayLabel), ['aujourd’hui', 'demain', 'dans 2 jours', 'en retard d’un jour', 'en retard de 3 jours']);
});

test('statusTone: amber only for what waits for a coach; every status has a tone; four start points have a short label', () => {
  for (const s of STATUSES) assert.ok(['amber', 'soft', 'neutral', 'green', 'red'].includes(statusTone(s.id)), s.id);
  assert.equal(statusTone('jour_j'), 'green');
  assert.equal(statusTone('diagnostic_recu'), 'amber');
  assert.equal(statusTone('en_cours'), 'soft');
  assert.equal(statusTone('retenue'), 'green');
  assert.equal(statusTone('non_retenue'), 'red');
  assert.equal(statusTone('slides_validees'), 'neutral');
  assert.deepEqual(Object.keys(BRANCH_SHORT), ['A', 'B', 'C', 'D']);
});

test('pageList: all pages when few, otherwise first, last and neighbours; a gap of one page shows the page', () => {
  assert.deepEqual(pageList(1, 1), [1]);
  assert.deepEqual(pageList(3, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(pageList(1, 10), [1, 2, '…', 10]);
  assert.deepEqual(pageList(5, 10), [1, '…', 4, 5, 6, '…', 10]);
  assert.deepEqual(pageList(4, 10), [1, 2, 3, 4, 5, '…', 10]);
  assert.deepEqual(pageList(10, 10), [1, '…', 9, 10]);
});

test('one: the first value of a query parameter, whatever shape it arrives in', () => {
  assert.equal(one(undefined), '');
  assert.equal(one('x'), 'x');
  assert.deepEqual(['a', 'b'].map((v) => one([v, 'z'])), ['a', 'b']);
  assert.equal(one(['a', 'b']), 'a');
});

test('the answers summary on a fiche: her profile for the topic first, then every topic answer of her branch, nothing about fears', async () => {
  const { topicSummary } = await import('../src/lib/admin-format.ts');
  const codes = (b: 'A' | 'B' | 'C' | 'D', a: Record<string, unknown> = {}) => topicSummary(b, a as never).map((q) => q.code);
  assert.deepEqual(codes('A').slice(0, 6), ['P6', 'P7', 'D1', 'D4', 'P5', 'D6']);
  assert.deepEqual(codes('A').slice(6), ['A1', 'A2', 'A3', 'A7', 'A4', 'A5', 'A6']);
  assert.deepEqual(codes('B').slice(6), ['B1', 'B2', 'B3', 'B4', 'B5']);
  assert.ok(codes('C').includes('C1') && codes('C').includes('C-abstract'));
  assert.ok(codes('D').includes('D1-a'));
  for (const b of ['A', 'B', 'C', 'D'] as const) for (const hidden of ['P1', 'P3', 'P4', 'D2', 'D3', 'D5']) assert.ok(!codes(b).includes(hidden), `${b} ${hidden}`);
});
