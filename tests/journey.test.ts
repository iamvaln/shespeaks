import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accessOutcome } from '../src/lib/access-outcome.ts';
import { IDEA_MAX, ideaLines, journey, journeySteps, journeyState, tracksClosed, parseIdeas, pitchToSave, planLines, validateChoice, validateChoiceIdeas, validateSubject, WAITING_SR, type Proposal } from '../src/lib/journey.ts';

let n = 0;
const p = (kind: Proposal['kind'], state: Proposal['state'], response: Proposal['response'] = null): Proposal => ({
  id: ++n, candidate_id: 1, kind, payload: kind === 'choix' ? { items: [] } : kind === 'sujet' ? { title: 't', abstract: 'a', why: '', plan: [] } : { comment: '' },
  state, response, response_choice: null, candidate_comment: null, response_data: null, coach_id: 1, sent_at: `2026-10-11 10:00:${String(n).padStart(2, '0')}`,
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

test('the sentence for the candidate is saved only by « Enregistrer », never by the other buttons of the track', () => {
  for (const op of ['choose', 'shortlist', 'discard', 'restore', 'delete']) assert.equal(pitchToSave(op, 'Le hook de l’IA'), undefined, op);
  assert.equal(pitchToSave('save', '  Tu le fais déjà au travail. '), 'Tu le fais déjà au travail.');
  assert.equal(pitchToSave('save', '  '), null);
  assert.equal(pitchToSave('save', null), undefined, 'a track without the field keeps its sentence');
  assert.equal(pitchToSave('save', 'x'.repeat(500))?.length, 400);
});

test('« find my space »: a network failure or a server error asks her to retry, never says « sent »', () => {
  assert.equal(accessOutcome(200), 'sent');
  assert.equal(accessOutcome(429), 'limited');
  for (const status of [null, 500, 502, 503]) assert.equal(accessOutcome(status), 'retry', String(status));
});

// what a coach reads in the list and on the fiche: the coach's status says nothing about what was already sent to her
const st = (branch: 'A' | 'C', proposals: Proposal[], photo: string | null = null, submitted = false, photos = 1) => journeyState(j(branch, proposals, photo, submitted), proposals, photos);

test('journey state, A: « Intérêt reçu » is not the same as pistes proposed, chosen, or a subject proposed', () => {
  assert.deepEqual(st('A', []), { label: 'Rien envoyé', waiting: 'coach' });
  assert.deepEqual(st('A', [p('choix', 'envoyee')]), { label: 'Pistes proposées', waiting: 'candidate' });
  assert.deepEqual(st('A', [p('choix', 'repondue', 'aucune')]), { label: 'Aucune piste ne lui convient', waiting: 'coach' });
  assert.deepEqual(st('A', [p('choix', 'repondue', 'choisie')]), { label: 'A choisi · sujet à proposer', waiting: 'coach' });
  assert.deepEqual(st('A', [p('choix', 'repondue', 'choisie'), p('sujet', 'envoyee')]), { label: 'Sujet proposé', waiting: 'candidate' });
  assert.deepEqual(st('A', [p('choix', 'repondue', 'choisie'), p('sujet', 'repondue', 'changements')]), { label: 'Changements demandés sur le sujet', waiting: 'coach' });
  assert.deepEqual(st('A', [p('choix', 'remplacee'), p('choix', 'envoyee')]).label, 'Pistes proposées', 'a replaced proposal does not count');
});

test('journey state, C: nothing sent, subject sent, then the photo, the submission, done', () => {
  assert.deepEqual(st('C', []), { label: 'Rien envoyé', waiting: 'coach' });
  assert.deepEqual(st('C', [p('sujet', 'envoyee')]), { label: 'Sujet proposé', waiting: 'candidate' });
  const approved = p('sujet', 'repondue', 'approuvee');
  assert.deepEqual(st('C', [approved]), { label: 'Sujet approuvé · photo à traiter', waiting: 'coach' });
  assert.deepEqual(st('C', [approved, p('photo', 'envoyee')]), { label: 'Photo demandée', waiting: 'candidate' });
  assert.deepEqual(st('C', [approved], '2026-10-11'), { label: 'Attend sa soumission', waiting: 'candidate' });
  assert.deepEqual(st('C', [approved], '2026-10-11', true), { label: 'Candidature soumise', waiting: 'none' });
});

test('journey state: « changements demandés » is the latest word only until she chooses a new track', () => {
  const choice1 = { ...p('choix', 'repondue', 'choisie'), id: 1 };
  const changes = { ...p('sujet', 'repondue', 'changements'), id: 2 };
  assert.equal(st('A', [choice1, changes]).label, 'Changements demandés sur le sujet');
  // the coach starts again: new tracks, she chooses one: the subject is yet to be proposed
  assert.deepEqual(st('A', [choice1, changes, { ...p('choix', 'repondue', 'choisie'), id: 3 }]), { label: 'A choisi · sujet à proposer', waiting: 'coach' });
  assert.equal(st('A', [choice1, changes, { ...p('choix', 'envoyee'), id: 3 }]).label, 'Pistes proposées');
  assert.equal(st('A', [choice1, changes, { ...p('choix', 'repondue', 'choisie'), id: 3 }, { ...p('sujet', 'repondue', 'changements'), id: 4 }]).label, 'Changements demandés sur le sujet', 'a newer subject answer counts again');
});

test('journey state: a photo asked for before the photo step is not « Rien envoyé »', () => {
  const asked = p('photo', 'envoyee');
  assert.deepEqual(st('A', [asked]), { label: 'Rien envoyé · photo demandée', waiting: 'coach' });
  assert.deepEqual(st('C', [asked]), { label: 'Rien envoyé · photo demandée', waiting: 'coach' });
  assert.equal(st('A', [p('choix', 'envoyee'), asked]).label, 'Pistes proposées · photo demandée');
  assert.equal(st('C', [p('sujet', 'envoyee'), asked]).label, 'Sujet proposé · photo demandée');
  assert.equal(st('A', [p('choix', 'repondue', 'aucune'), asked]).label, 'Aucune piste ne lui convient · photo demandée');
  assert.equal(st('C', [{ ...asked, state: 'repondue' }]).label, 'Rien envoyé', 'answered: nothing pending any more');
});

test('journey state: the photo step says whether there is a photo to review', () => {
  const approved = p('sujet', 'repondue', 'approuvee');
  assert.equal(st('C', [approved], null, false, 0).label, 'Sujet approuvé · photo à demander');
  assert.equal(st('C', [approved], null, false, 2).label, 'Sujet approuvé · photo à traiter');
  assert.equal(st('C', [approved, p('photo', 'envoyee')], null, false, 0).label, 'Photo demandée', 'asked: her answer is awaited');
});

test('journey state: every state has a label and a spoken « who has the hand »', () => {
  for (const w of ['coach', 'candidate', 'none'] as const) assert.ok(WAITING_SR[w]);
});

test('her ideas with the choice: at least one way to approach it; unknown approaches and doubles dropped; lengths capped; lines for the coach', () => {
  assert.equal(validateChoiceIdeas(undefined).ok, false);
  assert.equal(validateChoiceIdeas({ approach: ['nope'] }).ok, false);
  const other = validateChoiceIdeas({ approach: [], other: '  En posant des questions au public  ' });
  assert.ok(other.ok && other.value.other === 'En posant des questions au public', 'her own words are enough');
  assert.equal(validateChoiceIdeas({ approach: ['demo'], prepare: 'x'.repeat(IDEA_MAX + 1) }).ok, false);
  const v = validateChoiceIdeas({ approach: ['demo', 'demo', 'conseils', 'nope'], concrete: 'Mon app', takeaway: '', prepare: 'Répéter' });
  assert.ok(v.ok);
  if (!v.ok) return;
  assert.deepEqual(v.value.approach, ['demo', 'conseils']);
  assert.deepEqual(ideaLines(v.value), [
    'Comment l’aborder : montrer une démo en direct ; donner des conseils pratiques',
    'Ce qu’elle pourrait montrer ou raconter : Mon app',
    'Ce qu’il faut préparer selon elle : Répéter',
  ]);
  assert.deepEqual(parseIdeas(JSON.stringify(v.value)), v.value);
  assert.equal(parseIdeas('not json'), null);
  assert.equal(parseIdeas(null), null);
});

// ---- the tracks are for consultation once she has chosen among those sent ------------------------------------------------------------
const answered = (response: Proposal['response'], at: string): Proposal => ({ ...p('choix', 'repondue', response), answered_at: at });
test('tracks: closed once she chose among those sent; open when nothing was sent, after « none fits », or for C and D', () => {
  const A = { branch: 'A' as const };
  assert.equal(tracksClosed(A, []), false, 'nothing sent');
  assert.equal(tracksClosed(A, [p('choix', 'envoyee')]), false, 'waiting: the existing lock covers it');
  assert.equal(tracksClosed(A, [answered('choisie', '2026-10-12 10:00:00')]), true, 'she chose');
  assert.equal(tracksClosed(A, [answered('aucune', '2026-10-12 10:00:00')]), false, 'none fits: the coach prepares the next series');
  assert.equal(tracksClosed({ branch: 'B' }, [answered('choisie', '2026-10-12 10:00:00')]), true);
  for (const branch of ['C', 'D', null] as const) assert.equal(tracksClosed({ branch }, [answered('choisie', '2026-10-12 10:00:00')]), false, String(branch));
});

test('tracks: the latest series decides, a reopening lifts the closing until she chooses again', () => {
  const A = { branch: 'A' as const };
  const first = answered('aucune', '2026-10-12 10:00:00');
  const second = answered('choisie', '2026-10-13 10:00:00');
  assert.equal(tracksClosed(A, [first, second]), true, 'the second series she chose from');
  assert.equal(tracksClosed(A, [first, second, p('choix', 'envoyee')]), false, 'a third series is out: waiting');
  assert.equal(tracksClosed({ ...A, reopened_at: '2026-10-14 09:00:00' }, [first, second]), false, 'reopened after her choice');
  assert.equal(tracksClosed({ ...A, reopened_at: '2026-10-12 09:00:00' }, [first, second]), true, 'reopened before her choice: closed');
  const third = answered('choisie', '2026-10-15 10:00:00');
  assert.equal(tracksClosed({ ...A, reopened_at: '2026-10-14 09:00:00' }, [first, second, third]), true, 'chosen again after the reopening');
  const replaced = { ...p('choix', 'remplacee'), response: null };
  assert.equal(tracksClosed(A, [answered('choisie', '2026-10-12 10:00:00'), replaced]), true, 'a replaced proposal is not a series');
  // reopened in the very second of her answer (timestamps are kept to the second): reopened wins, so the coach is never locked out
  assert.equal(tracksClosed({ ...A, reopened_at: '2026-10-12 10:00:00' }, [answered('choisie', '2026-10-12 10:00:00')]), false);
  // a subject exchange does not change it
  assert.equal(tracksClosed(A, [answered('choisie', '2026-10-12 10:00:00'), p('sujet', 'envoyee')]), true);
});
