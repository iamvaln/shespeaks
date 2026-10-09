import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countdown, daysUntil, todayIso } from '../src/lib/dates.ts';

test('daysUntil counts calendar days, not 24-hour periods', () => {
  assert.equal(daysUntil('2026-10-31', '2026-10-08'), 23);
  assert.equal(daysUntil('2026-11-01', '2026-10-08'), 24);
  assert.equal(daysUntil('2026-10-08', '2026-10-08'), 0);
  assert.equal(daysUntil('2026-10-07', '2026-10-08'), -1);
  assert.equal(daysUntil('2027-01-01', '2026-12-31'), 1); // year boundary
  assert.equal(daysUntil(null, '2026-10-08'), null);
  assert.equal(daysUntil('', '2026-10-08'), null);
});

test('countdown: J-n until the day itself, then the given word', () => {
  assert.equal(countdown(23, 'clôturé'), 'J-23');
  assert.equal(countdown(0, 'clôturé'), 'J-0');
  assert.equal(countdown(-1, 'clôturé'), 'clôturé');
});

test('todayIso follows the Douala calendar, one hour ahead of UTC', () => {
  assert.equal(todayIso(new Date('2026-10-08T22:59:59Z')), '2026-10-08');
  assert.equal(todayIso(new Date('2026-10-08T23:00:00Z')), '2026-10-09');
  assert.match(todayIso(), /^\d{4}-\d{2}-\d{2}$/);
});

test('fmtDate: a calendar date is the same everywhere, a timestamp is shown on Douala time', async () => {
  const { fmtDate } = await import('../src/lib/i18n.ts');
  assert.equal(fmtDate('2026-10-31', 'fr'), '31 octobre 2026');
  assert.equal(fmtDate('2026-11-01', 'fr'), '1er novembre 2026'); // the first of the month is « 1er »
  assert.equal(fmtDate('2026-11-01', 'fr', { day: 'numeric', month: 'short' }), '1er nov.');
  assert.equal(fmtDate('2026-11-01', 'en'), '1 November 2026');
  assert.equal(fmtDate('2026-11-11', 'fr'), '11 novembre 2026');
  assert.match(fmtDate('2026-11-01 00:30:00', 'fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), /^1er novembre/);
  assert.equal(fmtDate('2026-10-31', 'fr', { day: 'numeric', month: 'short' }), '31 oct.');
  // stored as UTC: 22:30 UTC is 23:30 in Douala, and 00:30 the next day from 23:00 UTC
  assert.match(fmtDate('2026-10-08 22:30:00', 'fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), /^8 octobre.*23:30$/);
  assert.match(fmtDate('2026-10-08 23:30:00', 'fr', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }), /^9 octobre.*00:30$/);
  assert.equal(fmtDate(null, 'fr'), '');
  assert.equal(fmtDate('12/05/2026', 'fr'), '12/05/2026'); // a stray value is shown as it is, never thrown
  assert.equal(fmtDate('2026-13-45', 'fr'), '2026-13-45');
});
