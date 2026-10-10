// A coach asks the AI for title suggestions on a fiche: who may ask, the limits, the call, and what is stored.
import { get, run, tx } from './db.ts';
import { getAnswers, getCandidate, getRefs, getTracks } from './data.ts';
import { aiConfigured, suggestTitles, type AiClient, type AiFailure, type AiResult } from './ai-topics.ts';
import { checkAiRate, refundAiRate } from './ratelimit.ts';

export type SuggestOutcome = { ok: true; added: number } | { ok: false; reason: AiFailure | 'not_eligible' | 'limited' };

/**
 * Suggestions replace the earlier suggestions nobody has acted on; the ones the coach shortlisted, set aside or chose stay (and the
 * model is told not to repeat any title already on the fiche). The templates and the coach's own tracks are never touched.
 */
export async function suggestTracksFor(candidateId: number, coachId: number, client?: AiClient): Promise<SuggestOutcome> {
  const c = await getCandidate(candidateId);
  if (!c || (c.branch !== 'A' && c.branch !== 'B') || !c.completed_at) return { ok: false, reason: 'not_eligible' };
  if (!client && !aiConfigured()) return { ok: false, reason: 'disabled' };
  if (!(await checkAiRate(coachId, candidateId)).ok) return { ok: false, reason: 'limited' };

  const [answers, refs, tracks] = await Promise.all([getAnswers(candidateId), getRefs(), getTracks(candidateId)]);
  const res = await suggestTitles({ branch: c.branch, locale: c.locale, answers, refs, existingTitles: tracks.map((t) => t.title) }, client);
  if (!res.ok) {
    console.error('[ai] suggestions failed', { candidate: candidateId, reason: res.reason, detail: res.detail });
    // 'failed' = the call did not complete (outage, timeout, key problem): give the press back. A refusal, a cut or an empty answer
    // were produced (and may be billed): they stay counted.
    if (res.reason === 'failed') await refundAiRate(coachId, candidateId).catch(() => {});
    return { ok: false, reason: res.reason };
  }
  let added: number;
  try {
    added = await store(candidateId, res);
  } catch (e) {
    console.error('[ai] could not store suggestions', { candidate: candidateId, error: (e as Error)?.name });
    return { ok: false, reason: 'failed' };
  }
  console.log('[ai] suggestions', { candidate: candidateId, model: res.model, added, inputTokens: res.inputTokens, outputTokens: res.outputTokens });
  return { ok: true, added };
}

async function store(candidateId: number, res: Extract<AiResult, { ok: true }>): Promise<number> {
  return tx(async () => {
    await get('SELECT pg_advisory_xact_lock(hashtext(?))', `ai-tracks:${candidateId}`); // two coaches at once: one after the other
    await run(`DELETE FROM tracks WHERE candidate_id=? AND origin='ia' AND state='generee'`, candidateId);
    const top = await get<{ p: number }>('SELECT COALESCE(MAX(position), -1) AS p FROM tracks WHERE candidate_id=?', candidateId);
    let position = (top?.p ?? -1) + 1;
    for (const t of res.titles) {
      await run(
        `INSERT INTO tracks (candidate_id,title,angle,format,domain,hook,origin,position) VALUES (?,?,?,?,?,?,'ia',?)`,
        candidateId, t.title, t.angle, t.format, res.domain, t.hook || null, position++,
      );
    }
    return res.titles.length;
  });
}
