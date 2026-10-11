import { test } from 'node:test';
import assert from 'node:assert/strict';
import { journey, journeySteps, planLines, validateChoice, validateSubject, type Proposal } from '../src/lib/journey.ts';

let n = 0;
const p = (kind: Proposal['kind'], state: Proposal['state'], response: Proposal['response'] = null): Proposal => ({
  id: ++n, candidate_id: 1, kind, payload: kind === 'choix' ? { items: [] } : kind === 'sujet' ? { title: 't', abstract: 'a', why: '', plan: [] } : { comment: '' },
  state, response, response_choice: null, candidate_comment: null, coach_id: 1, sent_at: `2026-10-11 10:00:${String(n).padStart(2, '0')}`,
  answered_at: null, handled_at: null, reminded_at: null,
});
const j = (branch: 'A' | 'C', proposals: Proposal[], photo: string | null = null, submitted: string | null = null) =>
  journey({ branch, photoValidatedAt: photo, submittedAt: submitted, proposals });

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
  assert.deepEqual([j('C', [approved], '2026-10-11', '2026-10-12').step, j('C', [approved], '2026-10-11', '2026-10-12').waiting], ['soumise', 'none']);
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
