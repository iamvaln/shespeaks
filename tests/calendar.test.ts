import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, dayOf, isoOrNull, todayIso } from '../src/lib/dates.ts';
import { admissionOpen, calendarWarnings, openEvents, reminderDue, rehearsalFor, urgency } from '../src/lib/calendar.ts';

test('isoOrNull accepts real days only', () => {
  assert.equal(isoOrNull('2026-10-26'), '2026-10-26');
  for (const bad of [null, undefined, '', '26/10/2026', '2026-10-6', '2026-02-31', '2026-13-01', 'bientôt', 20261026]) assert.equal(isoOrNull(bad), null, String(bad));
});

test('addDays crosses months and years', () => {
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('dayOf reads a UTC timestamp in the programme\'s zone (UTC+1, no summer time)', () => {
  assert.equal(dayOf('2026-10-12 22:59:59'), '2026-10-12');
  assert.equal(dayOf('2026-10-12 23:00:00'), '2026-10-13');
  assert.equal(dayOf('2026-10-12 23:30:00'), '2026-10-13');
  assert.equal(dayOf('2026-12-31 23:30:00'), '2027-01-01');
  assert.equal(dayOf('2026-10-12T10:00:00Z'), '2026-10-12');
  assert.equal(dayOf(null), null);
  assert.equal(dayOf('n’importe quoi'), null);
});

test('applications are open through the whole deadline day, then closed; no deadline = open; a dossier admitted late is open', () => {
  const deadline = '2026-10-26';
  assert.equal(admissionOpen({ today: '2026-10-25', interestDeadline: deadline }), true);
  assert.equal(admissionOpen({ today: '2026-10-26', interestDeadline: deadline }), true, 'the deadline day itself, up to 23:59');
  assert.equal(admissionOpen({ today: '2026-10-27', interestDeadline: deadline }), false);
  assert.equal(admissionOpen({ today: '2026-10-27', interestDeadline: deadline, admittedLate: true }), true);
  for (const none of ['', null, undefined, 'bientôt']) assert.equal(admissionOpen({ today: '2030-01-01', interestDeadline: none }), true, String(none));
  // 23:59 in Douala is still the deadline day; one minute later is not
  assert.equal(admissionOpen({ today: todayIso(new Date('2026-10-26T22:59:00Z')), interestDeadline: deadline }), true);
  assert.equal(admissionOpen({ today: todayIso(new Date('2026-10-26T23:00:00Z')), interestDeadline: deadline }), false);
});

test('only events with a real, upcoming day are offered, and after the rehearsal when there is one', () => {
  const ev = [{ city: 'yaounde', event_date: '2026-11-21' }, { city: 'douala', event_date: '2026-11-28' }, { city: 'bamenda', event_date: null }, { city: 'x', event_date: 'à confirmer' }, { city: 'old', event_date: '2026-09-01' }, { city: 'today', event_date: '2026-10-13' }];
  assert.deepEqual(openEvents(ev, '2026-10-13').map((e) => e.city), ['yaounde', 'douala', 'today']);
  assert.deepEqual(openEvents(ev, '2026-10-13', '2026-11-21').map((e) => e.city), ['douala'], 'on or before the rehearsal day: not offered');
  assert.deepEqual(openEvents(ev, '2026-10-13', 'pas de date').map((e) => e.city), ['yaounde', 'douala', 'today'], 'an unreadable rehearsal day is ignored');
  assert.deepEqual(openEvents([], '2026-10-13'), []);
});

test('the dates the team sets are checked for coherence (warnings, never errors)', () => {
  const ok = { interestDeadline: '2026-10-26', internalDeadline: '2026-10-28', rehearsalDate: '2026-11-14', events: [{ event_date: '2026-11-21', name: 'Yaoundé' }] };
  assert.deepEqual(calendarWarnings(ok), []);
  assert.deepEqual(calendarWarnings({}), [], 'nothing set: nothing to say');
  assert.match(calendarWarnings({ ...ok, interestDeadline: '2026-11-05', internalDeadline: '2026-11-06' }).join('|'), /9 jours entre la date limite des intérêts \(05\/11\/2026\)/);
  assert.match(calendarWarnings({ ...ok, internalDeadline: '2026-11-10' }).join('|'), /4 jours entre la date interne de soumission/);
  assert.match(calendarWarnings({ ...ok, interestDeadline: '2026-10-28' }).join('|'), /devrait précéder la date interne/);
  assert.match(calendarWarnings({ ...ok, events: [{ event_date: '2026-11-10', name: 'Bamenda' }, { event_date: '2026-11-21', name: 'Yaoundé' }] }).join('|'), /Un événement a lieu au plus tard le jour de répétition.*Bamenda/);
  assert.match(calendarWarnings({ ...ok, rehearsalDate: '14/11' }).join('|'), /Le jour de répétition n’est pas une date lisible/);
  assert.match(calendarWarnings({ interestDeadline: 'bientôt' }).join('|'), /La date limite des intérêts n’est pas une date lisible/);
});

test('a reminder tier is due for two days, never before, never after the target day', () => {
  const due = (today: string, tier: number) => reminderDue({ today, target: '2026-10-26', tier });
  assert.equal(due('2026-10-22', 3), false, '4 days before: too early');
  assert.equal(due('2026-10-23', 3), true, 'the day it falls on');
  assert.equal(due('2026-10-24', 3), true, 'the day after: a missed cron is made up');
  assert.equal(due('2026-10-25', 3), false, 'two days late: gone');
  assert.equal(due('2026-10-25', 1), true);
  assert.equal(due('2026-10-26', 1), true, 'the day after its day is the target day');
  assert.equal(due('2026-10-26', 0), true);
  assert.equal(due('2026-10-27', 0), false, 'never after the target day');
  assert.equal(due('2026-10-27', 1), false);
  for (const bad of [null, undefined, '', 'bientôt']) assert.equal(reminderDue({ today: '2026-10-25', target: bad, tier: 1 }), false, String(bad));
});

test('urgency from the days between her interest and the rehearsal sets the check-in rhythm', () => {
  assert.deepEqual(urgency(40), { level: 'confortable', everyDays: 7 });
  assert.deepEqual(urgency(28), { level: 'confortable', everyDays: 7 });
  assert.deepEqual(urgency(27), { level: 'normale', everyDays: 4 });
  assert.deepEqual(urgency(21), { level: 'normale', everyDays: 4 });
  assert.deepEqual(urgency(20), { level: 'serree', everyDays: 2 });
  assert.deepEqual(urgency(14), { level: 'serree', everyDays: 2 });
  assert.deepEqual(urgency(13), { level: 'tres_serree', everyDays: 1 });
  assert.deepEqual(urgency(-3), { level: 'tres_serree', everyDays: 1 });
  assert.deepEqual(urgency(null), { level: 'normale', everyDays: 4 });
  assert.deepEqual(urgency(Number.NaN), { level: 'normale', everyDays: 4 });
});

test('the rehearsal day of a candidate: the common one, else ten days before her event, else none', () => {
  assert.equal(rehearsalFor({ rehearsalDate: '2026-11-14', eventDay: '2026-11-21' }), '2026-11-14');
  assert.equal(rehearsalFor({ rehearsalDate: '', eventDay: '2026-11-21' }), '2026-11-11');
  assert.equal(rehearsalFor({ rehearsalDate: null, eventDay: null }), null);
  assert.equal(rehearsalFor({ eventDay: 'à confirmer' }), null);
});
