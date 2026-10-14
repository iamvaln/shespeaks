import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ficheTabs, tracksInOwnTab } from '../src/lib/fiche-tabs.ts';

const base = { hasTracks: true, tracksReadOnly: false, tracksSent: false, hasPlan: false, notes: 0, photos: 0 };
const ids = (i: Parameters<typeof ficheTabs>[0]) => ficheTabs(i).map((t) => t.id);
const label = (i: Parameters<typeof ficheTabs>[0], id: string) => ficheTabs(i).find((t) => t.id === id)?.label;

test('tabs: the tracks are worked on in « Sujet et pistes » while editable, and get their own tab once sent and read-only', () => {
  assert.deepEqual(ids(base), ['sujet', 'reponses', 'notes', 'photos']);
  assert.equal(label(base, 'sujet'), 'Sujet et pistes');
  const sent = { ...base, tracksReadOnly: true, tracksSent: true };
  assert.deepEqual(ids(sent), ['sujet', 'reponses', 'pistes', 'notes', 'photos'], 'after « Réponses »');
  assert.equal(label(sent, 'sujet'), 'Sujet');
  assert.equal(label(sent, 'pistes'), 'Pistes envoyées');
  assert.equal(tracksInOwnTab(sent), true);
});

test('tabs: no tab of their own when nothing was ever sent (a status moved by hand), when the block is editable, or for C and D', () => {
  const handSubmitted = { ...base, tracksReadOnly: true, tracksSent: false };
  assert.deepEqual(ids(handSubmitted), ['sujet', 'reponses', 'notes', 'photos']);
  assert.equal(label(handSubmitted, 'sujet'), 'Sujet et pistes', 'the read-only block stays where it was');
  assert.deepEqual(ids({ ...base, tracksSent: true }), ['sujet', 'reponses', 'notes', 'photos'], 'a series was sent and she said « none fits »: editable again');
  for (const [name, i] of [['C/D waiting', { ...base, hasTracks: false, tracksReadOnly: true, tracksSent: true }], ['C/D', { ...base, hasTracks: false }]] as const) {
    assert.deepEqual(ids(i), ['sujet', 'reponses', 'notes', 'photos'], name);
    assert.equal(label(i, 'sujet'), 'Sujet et pistes', `${name}: the label does not change`);
  }
});

test('tabs: counts and the roadmap tab', () => {
  const t = ficheTabs({ ...base, notes: 3, photos: 2, hasPlan: true });
  assert.deepEqual(t.map((x) => [x.id, x.count]), [['sujet', null], ['reponses', null], ['notes', 3], ['photos', 2], ['plan', null]]);
  assert.equal(t.at(-1)?.label, 'Plan de route');
});
