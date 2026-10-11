import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journey, journeySteps, planLines, validateChoice, validateSubject, type Proposal } from '../src/lib/journey.ts';

let n = 0;
const p = (kind: Proposal['kind'], state: Proposal['state'], response: Proposal['response'] = null): Proposal => ({
  id: ++n, candidate_id: 1, kind, payload: kind === 'choix' ? { items: [] } : kind === 'sujet' ? { title: 't', abstract: 'a', why: '', plan: [] } : { comment: '' },
  state, response, response_choice: null, candidate_comment: null, coach_id: 1, sent_at: `2026-10-11 10:00:${String(n).padStart(2, '0')}`,
  answered_at: null, handled_at: null, reminded_at: null,
});
const j = (branch: 'A' | 'C', proposals: Proposal[], photo: string | null = null, submitted = false) =>
  journey({ branch, photoValidatedAt: photo, submitted, proposals });

test('steps: A and B choose first, C and D start at the adjusted subject', () => {
  assert.deepEqual(journeySteps('A'), ['choix', 'sujet', 'photo', 'soumission', 'soumise']);
  assert.deepEqual(journeySteps('C'), ['sujet', 'photo', 'soumission', 'soumise']);
});

test('A: nothing sent → coach; choice sent → candidate; chosen → back to the coach at the subject step', () => {
  assert.deepEqual([j('A', []).step, j('A', []).waiting], ['choix', 'coach']);
  const sent = p('choix', 'envoyee');
  assert.deepEqual([j('A', [sent]).step, j('A', [sent]).waiting, j('A', [sent]).pending?.id], ['choix', 'candidate', sent.id]);
  assert.deepEqual([j('A', [p('choix', 'repondue', 'aucune')]).step, j('A', [p('choix', 'repondue', 'aucune')]).waiting], ['choix', 'coach']);
  const chosen = j('A', [p('choix', 'repondue', 'choisie')]);
  assert.deepEqual([chosen.step, chosen.waiting], ['sujet', 'coach']);
});

test('subject: sent → candidate; changes asked → coach; approved → photo (coach), photo requested → candidate', () => {
  assert.deepEqual([j('C', [p('sujet', 'envoyee')]).step, j('C', [p('sujet', 'envoyee')]).waiting], ['sujet', 'candidate']);
  assert.deepEqual([j('C', [p('sujet', 'repondue', 'changements')]).waiting], ['coach']);
  const approved = p('sujet', 'repondue', 'approuvee');
  assert.deepEqual([j('C', [approved]).step, j('C', [approved]).waiting], ['photo', 'coach']);
  assert.deepEqual([j('C', [approved, p('photo', 'envoyee')]).waiting], ['candidate']);
  assert.deepEqual([j('C', [approved, p('photo', 'repondue', 'photo_deposee')]).waiting], ['coach']);
});

test('approved + photo validated → submission (candidate); submitted → done; a replaced proposal never counts', () => {
  const approved = p('sujet', 'repondue', 'approuvee');
  assert.deepEqual([j('C', [approved], '2026-10-11').step, j('C', [approved], '2026-10-11').waiting], ['soumission', 'candidate']);
  assert.deepEqual([j('C', [approved], '2026-10-11', true).step, j('C', [approved], '2026-10-11', true).waiting], ['soumise', 'none']);
  assert.equal(j('C', [p('sujet', 'remplacee'), p('sujet', 'envoyee')]).pending?.state, 'envoyee');
  assert.deepEqual([j('C', [p('sujet', 'remplacee')]).waiting], ['coach']);
  assert.equal(j('C', [p('sujet', 'envoyee')], '2026-10-11').step, 'sujet', 'a photo validated early does not skip the subject');
});

test('validations: 2 or 3 topics with title and pitch; subject needs title and abstract; plan lines', () => {
  const item = { title: 'Automatiser son déploiement', format: 'talk', pitch: 'Tu le fais déjà au travail.' };
  assert.equal(validateChoice([item, item]), null);
  assert.match(validateChoice([item])!, /2 ou 3/);
  assert.match(validateChoice([item, item, item, item])!, /2 ou 3/);
  assert.match(validateChoice([item, { ...item, pitch: ' ' }])!, /phrase/);
  assert.equal(validateSubject({ title: 'T', abstract: 'A', why: '', plan: [] }), null);
  assert.match(validateSubject({ title: '', abstract: 'A', why: '', plan: [] })!, /titre/);
  assert.match(validateSubject({ title: 'T', abstract: '', why: '', plan: [] })!, /résumé/);
  assert.deepEqual(planLines(' Accroche \n\n Idées clés\n' + 'x'.repeat(400) + '\n4\n5\n6\n7\n8\n9'), ['Accroche', 'Idées clés', 'x'.repeat(300), '4', '5', '6', '7', '8']);
});

test('A/B: the latest of choice and subject decides the step, so whatever was sent last is the one she can answer', () => {
  // subject sent, she asks for changes, the coach goes back to a new choice of topics
  const choice1 = p('choix', 'repondue', 'choisie');
  const subject = p('sujet', 'repondue', 'changements');
  const choice2 = p('choix', 'envoyee');
  const back = j('A', [choice1, subject, choice2]);
  assert.deepEqual([back.step, back.waiting, back.pending?.id], ['choix', 'candidate', choice2.id]);
  // she answers « none fits »: still the choice step, the coach has the hand
  const none = j('A', [choice1, subject, { ...choice2, state: 'repondue', response: 'aucune' }]);
  assert.deepEqual([none.step, none.waiting, none.pending], ['choix', 'coach', null]);
  // she picks one: the coach develops it into a subject
  const picked = j('A', [choice1, subject, { ...choice2, state: 'repondue', response: 'choisie' }]);
  assert.deepEqual([picked.step, picked.waiting, picked.pending], ['sujet', 'coach', null]);
  // a subject sent after that choice is the one to answer
  const subject2 = p('sujet', 'envoyee');
  const again = j('A', [choice1, subject, { ...choice2, state: 'repondue', response: 'choisie' }, subject2]);
  assert.deepEqual([again.step, again.waiting, again.pending?.id], ['sujet', 'candidate', subject2.id]);
  // a replaced proposal never counts, whatever its kind
  const replaced = j('A', [choice1, p('sujet', 'envoyee'), { ...p('choix', 'remplacee') }]);
  assert.deepEqual([replaced.step, replaced.waiting], ['sujet', 'candidate']);
  // even after an approved subject, a new choice sent by the coach is the one to answer
  const reopened = j('A', [choice1, p('sujet', 'repondue', 'approuvee'), p('choix', 'envoyee')]);
  assert.deepEqual([reopened.step, reopened.waiting], ['choix', 'candidate']);
});

test('C/D ignore choices: the subject decides', () => {
  const c = j('C', [p('sujet', 'repondue', 'changements'), p('choix', 'envoyee')]);
  assert.deepEqual([c.step, c.waiting], ['sujet', 'coach']);
});

test('submitted (whatever the reason) → done, nothing pending, at any step', () => {
  for (const branch of ['A', 'C'] as const) {
    const done = j(branch, [p('sujet', 'envoyee')], null, true);
    assert.deepEqual([done.step, done.waiting, done.pending], ['soumise', 'none', null]);
  }
  assert.equal(j('A', [], null, true).step, 'soumise');
});
