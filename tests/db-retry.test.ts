import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRepeatableRead } from '../src/lib/db.ts';

test('only a plain read may be run twice: never a write, a lock, a sequence or several statements', () => {
  for (const ok of ['SELECT * FROM coaches WHERE id=?', '  select count(*)::int as n from candidates where status=\'x\'  ', 'SELECT * FROM devfest_events ORDER BY event_date IS NULL, event_date, name;', 'SELECT 1'])
    assert.equal(isRepeatableRead(ok), true, ok);
  for (const no of [
    'INSERT INTO notes (candidate_id) VALUES (?)', 'UPDATE candidates SET status=? WHERE id=?', 'DELETE FROM photos WHERE id=?',
    'SELECT * FROM tracks WHERE id=? FOR UPDATE', 'SELECT * FROM tracks FOR NO KEY UPDATE', 'SELECT * FROM tracks FOR SHARE', 'SELECT * FROM tracks FOR KEY SHARE',
    'SELECT pg_advisory_xact_lock(hashtext(?))', 'SELECT pg_try_advisory_lock(1)', 'SELECT nextval(\'candidates_id_seq\')', 'SELECT setval(\'s\', 1)',
    'WITH x AS (DELETE FROM notes RETURNING *) SELECT * FROM x', 'SELECT 1; DELETE FROM notes', 'INSERT INTO t VALUES (1) RETURNING id', '',
  ]) assert.equal(isRepeatableRead(no), false, no);
});
