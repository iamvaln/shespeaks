import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_PATH, statusChoices } from '../src/lib/status.ts';

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

test('« non retenue » set by mistake can be taken back, to « Intérêt reçu » only', () => {
  assert.deepEqual(statusChoices('non_retenue', true), ['diagnostic_recu', 'non_retenue']);
});

test('an unknown status keeps every choice (never an empty list)', () => {
  assert.equal(statusChoices('inconnu', true).length, 9);
  assert.ok(statusChoices('inconnu', true).includes('diagnostic_recu'));
});
