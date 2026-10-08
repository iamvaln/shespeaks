import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRANCH_SHORT, dayLabel, elapsed, elapsedHours, pageList, statusTone } from '../src/lib/admin-format.ts';

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
});

test('dayLabel wording', () => {
  assert.deepEqual([0, 1, 2, -1, -3].map(dayLabel), ['aujourd’hui', 'demain', 'dans 2 jours', 'hier', 'en retard de 3 jours']);
});

test('statusTone: amber only for what waits for a coach; every status has a tone; four start points have a short label', () => {
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
