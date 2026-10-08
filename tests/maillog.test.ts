import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logText } from '../src/lib/maillog.ts';

const TOKEN = 'WRGZX_BJx3jplOT38fwmdnJvXScFsZdZn2FN0vjLjcM';

test('email log: one-time coach login and invitation links are not kept', () => {
  for (const kind of ['coach_login', 'coach_invite']) {
    const out = logText({ kind, text: `Bonjour,\nOuvre https://shespeaks.example/admin/verify?token=${TOKEN}\nMerci` });
    assert.ok(!out.includes(TOKEN), `${kind}: token removed`);
    assert.match(out, /\/admin\/verify\?token=\(lien à usage unique, non conservé\)\nMerci/, `${kind}: the log says why and the rest is intact`);
  }
});

test('email log: every other email is kept as it is', () => {
  const text = `Ton lien : https://shespeaks.example/reprendre/${TOKEN}`;
  for (const kind of ['candidate_started', 'candidate_confirmation', 'candidate_reminder_1', 'coach_new_diagnostic'])
    assert.equal(logText({ kind, text }), text, kind);
});
