import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateAccessLinks, candidateChoiceSent, candidateClosingReminder, candidateExchangeReminder, candidateSubmitReminder, candidatePhotoRequested, candidateProposalReminder, candidateReadyToSubmit, candidateSubjectSent, coachCandidateAnswered } from '../src/lib/mail.ts';

const url = 'https://shespeaks.test/reprendre/tok';
const ai = /\bIA\b|\bAI\b|intelligence artificielle|artificial intelligence|Claude|OpenAI|GPT/i;

test('candidate emails exist in French and English, carry her link, never mention AI', () => {
  for (const loc of ['fr', 'en'] as const) {
    const all = [
      candidateChoiceSent('Aïcha Mbarga', url, loc), candidateSubjectSent('Aïcha', url, loc), candidatePhotoRequested('Aïcha', url, loc, 'Plus lumineuse'),
      candidateReadyToSubmit('Aïcha', url, loc, { title: 'Mon titre', abstract: 'Mon résumé', cfpUrl: 'https://sessionize.com/x', cfpLabel: 'Sessionize', deadline: '31 octobre 2026' }),
      candidateProposalReminder('Aïcha', url, loc),
      ...[3, 1, 0].map((daysLeft) => candidateClosingReminder({ name: 'Aïcha' }, url, loc, { daysLeft, deadline: '26 octobre 2026', step: { done: 3, total: 6 } })),
      ...(['choix', 'sujet', 'photo'] as const).flatMap((what) => [7, 1, 0].map((daysLeft) => candidateExchangeReminder('Aïcha', url, loc, { what, daysLeft, deadline: '26 octobre 2026' }))),
      ...[7, 0].flatMap((daysLeft) => [candidateSubmitReminder('Aïcha', url, loc, { daysLeft, date: '26 octobre 2026', kind: 'internal', callCloses: '31 octobre 2026', where: 'Sessionize' }), candidateSubmitReminder('Aïcha', url, loc, { daysLeft, date: '31 octobre 2026', kind: 'cfp', callCloses: null, where: null })]),
      candidateAccessLinks([{ event: 'DevFest Douala 2026', date: '9 octobre 2026', url }], loc),
    ];
    for (const m of all) {
      assert.ok(m.html.includes(url) && m.text.includes(url), m.subject);
      assert.ok(!ai.test(`${m.subject}\n${m.text}`), `${loc}: ${m.subject}`);
    }
  }
  assert.match(candidateChoiceSent('Aïcha', url, 'fr').subject, /propose des sujets/);
  assert.match(candidateChoiceSent('Aïcha', url, 'en').subject, /topics/);
});

test('comments are escaped in HTML', () => {
  const m = coachCandidateAnswered({ name: 'Aïcha' }, 'changements', '<script>alert(1)</script>', 'https://shespeaks.test/admin/candidates/1');
  assert.ok(!m.html.includes('<script>') && m.html.includes('&lt;script&gt;'));
  assert.ok(!candidatePhotoRequested('A', url, 'fr', '<b>x</b>').html.includes('<b>x</b>'));
});

test('the coach email names the chosen topic when there is one', () => {
  const m = coachCandidateAnswered({ name: 'Aïcha' }, 'choisie', null, 'https://shespeaks.test/admin/candidates/1', 'Automatiser son déploiement');
  assert.match(m.subject, /a choisi un sujet : « Automatiser son déploiement »/);
  assert.ok(m.text.includes('Automatiser son déploiement'));
  assert.equal(coachCandidateAnswered({ name: 'Aïcha' }, 'approuvee', null, 'https://shespeaks.test/admin/candidates/1').subject, 'Aïcha approuve son sujet');
});

test('the coach email of a choice carries what she imagined, escaped like any text she wrote', () => {
  const m = coachCandidateAnswered({ name: 'Awa' }, 'choisie', null, 'https://x.test/admin/candidates/1', 'Mon sujet', ['Comment l’aborder : montrer une démo en direct', 'Ce que le public doit retenir : <b>tester tôt</b>']);
  assert.match(m.text, /Ce qu’elle a imaginé/);
  assert.match(m.text, /montrer une démo en direct/);
  assert.ok(!m.html.includes('<b>tester tôt</b>') && m.html.includes('&lt;b&gt;tester tôt&lt;/b&gt;'));
});

test('the calendar reminders say how many days are left, in both languages', () => {
  const closing = (n: number, loc: 'fr' | 'en') => candidateClosingReminder({ name: 'Aïcha' }, url, loc, { daysLeft: n, deadline: '26 octobre 2026', step: { done: 3, total: 6 } });
  assert.match(closing(3, 'fr').subject, /Plus que 3 jours pour envoyer/);
  assert.match(closing(1, 'fr').subject, /Plus que 1 jour pour envoyer/);
  assert.match(closing(0, 'fr').subject, /Dernier jour/);
  assert.match(closing(0, 'en').subject, /Last day/);
  assert.match(closing(1, 'en').subject, /Only 1 day left/);
  assert.ok(closing(3, 'fr').text.includes('26 octobre 2026') && closing(3, 'fr').text.includes('écran 3 sur 6'));
  const submit = candidateSubmitReminder('Aïcha', url, 'fr', { daysLeft: 3, date: '26 octobre 2026', kind: 'internal', callCloses: '31 octobre 2026', where: 'Sessionize' });
  assert.ok(submit.text.includes('31 octobre 2026') && submit.text.includes('Sessionize'));
  assert.ok(!candidateSubmitReminder('Aïcha', url, 'fr', { daysLeft: 3, date: '31 octobre 2026', kind: 'cfp', callCloses: null, where: null }).text.includes('Où soumettre'));
});
