import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REFS, SCREENS, flowFor, totalSteps, validateScreen } from '../src/lib/questions.ts';
import { generateTracks } from '../src/lib/topics.ts';
import { assembleAbstract } from '../src/lib/abstract.ts';
import { autoChecks } from '../src/lib/review.ts';
import { buildRoadmap } from '../src/lib/roadmap.ts';

test('flow: 3 common screens, branch screens, photo', () => {
  assert.deepEqual(flowFor('A'), ['profile', 'diag1', 'diag2', 'a1', 'a2', 'photo']);
  assert.deepEqual(flowFor('C'), ['profile', 'diag1', 'diag2', 'c1', 'c2', 'photo']);
  assert.equal(flowFor(undefined).length, 3);
  assert.equal(totalSteps('D'), 7);
});

test('validation: required, phone, email, "Autre" city', () => {
  const e = validateScreen(SCREENS.profile, { P1: 'Aïcha', P2: 'autre', P3: 'abc', P4: 'nope', P5: 'fr', P6: 'dev', P7: '1-3' }, DEFAULT_REFS);
  assert.equal(e.P3, 'invalid_phone');
  assert.equal(e.P4, 'invalid_email');
  assert.equal(e.P2o, 'required');
  const ok = validateScreen(SCREENS.profile, { P1: 'A', P2: 'douala', P3: '+237 612 34 56 78', P5: 'fr', P6: 'dev', P7: '1-3' }, DEFAULT_REFS);
  assert.deepEqual(ok, {});
});

test('A2 accepts 1 to 3 domains', () => {
  const base = { A7: ['retour'] };
  assert.equal(validateScreen(SCREENS.a1, { ...base, A2: [] }, DEFAULT_REFS).A2, 'required');
  assert.equal(validateScreen(SCREENS.a1, { A2: ['web', 'cloud', 'qa', 'ux'] }, DEFAULT_REFS).A2, 'too_many');
  assert.deepEqual(validateScreen(SCREENS.a1, { A2: ['web'] }, DEFAULT_REFS), {});
});

test('tracks: personal first, then domain x angle, max 5, unique', () => {
  const t = generateTracks(
    { P5: 'fr', A2: ['web', 'cloud'], A3: 'Flutter, Figma', A4: 'x'.repeat(100), A5: 'Git', A6: 'tout', A7: ['demo', 'lecons'] },
    'A', 'fr', DEFAULT_REFS,
  );
  assert.equal(t.length, 5);
  assert.equal(t[0].origin, 'personnelle');
  assert.ok(t[0].title.startsWith('Cas pratique : '));
  assert.equal(t[0].title.length, 'Cas pratique : '.length + 71); // 70 chars + ellipsis
  assert.equal(t[1].title, 'Les questions qu’on me pose le plus sur Git');
  assert.equal(t[2].title, 'Ce que j’aurais aimé savoir en débutant en Développement web');
  assert.equal(t[3].title, 'Live demo : construire une app avec Flutter en 25 minutes');
  assert.equal(t[3].format, 'atelier');
  assert.equal(new Set(t.map((x) => x.title)).size, 5);
});

test('tracks: no techno => demo becomes "premier projet"; B2 replaces the domain name', () => {
  const t = generateTracks({ P5: 'fr', B1: 'web', B2: 'accessibilité web', B4: ['demo', 'lecons'] }, 'B', 'fr', DEFAULT_REFS);
  assert.equal(t[0].title, 'Live demo : construire un premier projet accessibilité web');
  assert.equal(t[1].title, '5 leçons apprises en accessibilité web');
});

test('abstract assembly FR and EN', () => {
  const a = { P5: 'fr', C1: 'Mon titre', C2: 'debutant', C3: 'a', C4: 'b', C5: 'c', C6: 'une checklist' };
  const fr = assembleAbstract(a, 'fr');
  assert.match(fr, /Ce talk s’adresse aux débutant·es\. Ensemble, nous verrons a, b et c\./);
  assert.match(fr, /vous repartirez avec une checklist\./);
  assert.match(assembleAbstract({ ...a, C4: '', C5: '' }, 'fr'), /nous verrons a\./);
  assert.match(assembleAbstract({ ...a, P5: 'en' }, 'fr'), /This talk is for beginners\. Together, we will look at a, b and c\./);
});

test('review grid automatic checks', () => {
  const abstract = ('Ce talk s’adresse aux débutants. ' + 'mot '.repeat(90) + 'Vous allez repartir avec une méthode.').trim();
  const r = autoChecks('Un titre court', abstract);
  assert.ok(r.every((c) => c.ok));
  const bad = autoChecks('un deux trois quatre cinq six sept huit neuf dix onze douze treize', 'trop court');
  assert.deepEqual(bad.map((c) => c.ok), [false, false, false, false]);
});

test('roadmap: personalised actions and next action', () => {
  const a = { P1: 'Aïcha', P2: 'douala', P5: 'en', P6: 'dev', D1: 'premiere', D2: 2, D3: ['legitime', 'trac', 'candidature'], D4: 'atelier', D5: '1-2', D6: 'A' };
  const r = buildRoadmap({ answers: a, branch: 'A', locale: 'fr', event: null, cityName: 'Douala' });
  const stars = (n: number) => r.steps[n - 1].actions.filter((x) => x.personalized).length;
  assert.equal(stars(1), 2);
  assert.equal(stars(2), 2);
  assert.equal(stars(3), 1);
  assert.equal(stars(4), 2);
  assert.equal(stars(5), 1);
  assert.equal(r.steps.length, 5);
  assert.match(r.nextAction, /Ta coach, notifiée automatiquement/);
  const d = buildRoadmap({ answers: { ...a, 'D1-d': 'retenue' }, branch: 'D', locale: 'fr', event: null, cityName: 'Douala' });
  assert.equal(d.steps[0].done, true);
  assert.match(d.nextAction, /Félicitations/);
  assert.equal(stars(1), 2); // not affected
  assert.equal(d.steps[0].actions.filter((x) => x.personalized).length, 1); // "rédiger candidature" skipped when already accepted
});
