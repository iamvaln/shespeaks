import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_PATH, statusChoices, statusHint } from '../src/lib/status.ts';

test('« Suivi » offers the current status and the ones ahead, « non retenue » always, in the order of the list', () => {
  assert.deepEqual(statusChoices('diagnostic_recu', true), ['diagnostic_recu', 'sujet_valide', 'candidature_soumise', 'retenue', 'non_retenue', 'slides_validees', 'repetition_faite', 'jour_j']);
  assert.deepEqual(statusChoices('sujet_valide', true), ['sujet_valide', 'candidature_soumise', 'retenue', 'non_retenue', 'slides_validees', 'repetition_faite', 'jour_j']);
  assert.deepEqual(statusChoices('candidature_soumise', true), ['candidature_soumise', 'retenue', 'non_retenue', 'slides_validees', 'repetition_faite', 'jour_j']);
  assert.deepEqual(statusChoices('retenue', true), ['retenue', 'non_retenue', 'slides_validees', 'repetition_faite', 'jour_j']);
  assert.deepEqual(statusChoices('jour_j', true), ['non_retenue', 'jour_j']);
});

test('a status that is passed is gone from the list', () => {
  for (let i = 1; i < STATUS_PATH.length; i++) {
    const offered = statusChoices(STATUS_PATH[i], true);
    for (const passed of STATUS_PATH.slice(0, i)) assert.ok(!offered.includes(passed), `${passed} is passed once at ${STATUS_PATH[i]}`);
    assert.ok(offered.includes(STATUS_PATH[i]), 'the current one stays');
  }
});

test('a form that is not finished: only « En cours » and « Non retenue »; a finished form is no longer « En cours »', () => {
  assert.deepEqual(statusChoices('en_cours', false), ['en_cours', 'non_retenue']);
  assert.ok(!statusChoices('diagnostic_recu', true).includes('en_cours'));
  assert.ok(statusChoices('en_cours', true).includes('diagnostic_recu'), 'a reset status can be moved on again');
});

test('« non retenue » set by mistake can be taken back: to « Intérêt reçu » when her form is done, to « En cours » when it is not', () => {
  assert.deepEqual(statusChoices('non_retenue', true), ['diagnostic_recu', 'non_retenue']);
  assert.deepEqual(statusChoices('non_retenue', false), ['en_cours', 'non_retenue']);
});

test('a status set by hand ahead of the exchanges can be brought back to what they stand for, and only to that', () => {
  assert.deepEqual(statusChoices('sujet_valide', true, 'diagnostic_recu'), ['diagnostic_recu', 'sujet_valide', 'candidature_soumise', 'retenue', 'non_retenue', 'slides_validees', 'repetition_faite', 'jour_j']);
  assert.deepEqual(statusChoices('candidature_soumise', true, 'sujet_valide'), ['sujet_valide', 'candidature_soumise', 'retenue', 'non_retenue', 'slides_validees', 'repetition_faite', 'jour_j']);
  assert.ok(!statusChoices('sujet_valide', true, 'sujet_valide').includes('diagnostic_recu'), 'in sync: nothing to bring back');
  assert.ok(!statusChoices('sujet_valide', true, null).includes('diagnostic_recu'), 'no floor: forward only');
  assert.ok(!statusChoices('retenue', true, 'diagnostic_recu').includes('diagnostic_recu'), '« retenue » and later are the coach\'s: never brought back to the exchanges');
  assert.ok(!statusChoices('sujet_valide', false, 'diagnostic_recu').includes('diagnostic_recu'), 'an unfinished form has its own rule');
});

test('the line under the list says what the list does, case by case', () => {
  assert.match(statusHint('non_retenue', true), /seul « Intérêt reçu »/);
  assert.match(statusHint('non_retenue', false), /seul « En cours »/);
  assert.match(statusHint('en_cours', false), /seuls « En cours » et « Non retenue »/);
  assert.match(statusHint('diagnostic_recu', true), /« Non retenue » reste toujours possible/);
  assert.notEqual(statusHint('diagnostic_recu', true), statusHint('en_cours', false));
});

test('an unknown status keeps every choice (never an empty list)', () => {
  assert.equal(statusChoices('inconnu', true).length, 9);
  assert.ok(statusChoices('inconnu', true).includes('diagnostic_recu'));
});
