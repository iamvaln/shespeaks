import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidateAccessLinks, candidateChoiceSent, candidatePhotoRequested, candidateProposalReminder, candidateReadyToSubmit, candidateSubjectSent, coachCandidateAnswered } from '../src/lib/mail.ts';

const url = 'https://shespeaks.test/reprendre/tok';
const ai = /\bIA\b|\bAI\b|intelligence artificielle|artificial intelligence|Claude|OpenAI|GPT/i;

test('candidate emails exist in French and English, carry her link, never mention AI', () => {
  for (const loc of ['fr', 'en'] as const) {
    const all = [
      candidateChoiceSent('Aïcha Mbarga', url, loc), candidateSubjectSent('Aïcha', url, loc), candidatePhotoRequested('Aïcha', url, loc, 'Plus lumineuse'),
      candidateReadyToSubmit('Aïcha', url, loc, { title: 'Mon titre', abstract: 'Mon résumé', cfpUrl: 'https://sessionize.com/x', cfpLabel: 'Sessionize', deadline: '31 octobre 2026' }),
      candidateProposalReminder('Aïcha', url, loc), candidateAccessLinks([{ event: 'DevFest Douala 2026', date: '9 octobre 2026', url }], loc),
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
