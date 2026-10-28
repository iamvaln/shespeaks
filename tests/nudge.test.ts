import { test } from 'node:test';
import assert from 'node:assert/strict';
import { finishFormWhatsApp } from '../src/lib/whatsapp.ts';
import { coachStalledDigest } from '../src/lib/mail.ts';

test('the WhatsApp nudge to finish the form: her number, her language, where she stopped, her link (#47)', () => {
  const fr = finishFormWhatsApp({ whatsapp: '+237 612 345 678', name: 'Awa Mbarga', locale: 'fr', screenLabel: 'Ton expérience, tes questions', resumeUrl: 'https://x.test/reprendre/tok' })!;
  assert.ok(fr.startsWith('https://wa.me/237612345678?text='));
  const text = decodeURIComponent(fr.split('?text=')[1]);
  assert.match(text, /^Bonjour Awa,/);
  assert.match(text, /« Ton expérience, tes questions »/);
  assert.ok(text.endsWith('https://x.test/reprendre/tok'));
  const en = decodeURIComponent(finishFormWhatsApp({ whatsapp: '237612345678', name: 'Awa', locale: 'en', screenLabel: 'Your experience', resumeUrl: 'https://x.test/r' })!.split('?text=')[1]);
  assert.match(en, /^Hello Awa,/);
  assert.equal(finishFormWhatsApp({ whatsapp: '', name: 'Awa', locale: 'fr', screenLabel: 'x', resumeUrl: 'u' }), null, 'no number, no link');
});

test('the coach digest says what to follow, that she got a reminder by email, and how to nudge her on WhatsApp (#47)', () => {
  const item = { name: 'Awa', eventLabel: 'DevFest Douala', whatsapp: '+237 612', email: 'a@x.test', screenLabel: 'Écran 5', hoursIdle: 30, tier: 1, url: 'https://x.test/admin/candidates/1', waUrl: 'https://wa.me/237612?text=x' };
  const one = coachStalledDigest('Valentine', [item]);
  assert.match(one.subject, /^À suivre\s?: Awa n’a pas fini son formulaire$/u);
  assert.ok(!/Relance à faire/.test(one.subject + one.text));
  assert.match(one.text, /a reçu un rappel automatique par email ce matin/);
  assert.match(one.text, /Relancer sur WhatsApp\s?: https:\/\/wa\.me\/237612\?text=x/u);
  const two = coachStalledDigest('Valentine', [item, { ...item, name: 'Bea', email: null, waUrl: null }]);
  assert.match(two.subject, /^À suivre\s?: 2 candidates n’ont pas fini leur formulaire$/u);
});
