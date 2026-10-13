// A coach asks the AI to improve a candidate's subject: who may ask, the shared limits, the call, and the one proposal kept per candidate.
import { get, getSetting, run } from './db.ts';
import { getAnswers, getCandidate, getRefs, getSubject } from './data.ts';
import { currentSubject, improveSubject, type SubjectProposal } from './ai-subject.ts';
import { listProposals } from './proposals.ts';
import { ideaLines } from './journey.ts';
import { providerConfigured, type AiClient, type AiFailure, type AiProvider, type FetchLike } from './ai-topics.ts';
import { aiEventFor } from './ai-tracks.ts';
import { checkAiRate, refundAiRate } from './ratelimit.ts';

export type ImproveOutcome = { ok: true } | { ok: false; reason: AiFailure | 'not_eligible' | 'limited' };
export type StoredProposal = SubjectProposal & { provider: string; model: string; created_at: string };

/** Eligible: a finished form and a subject to start from (the fiche's « Sujet retenu », else her C or D answers). */
export async function improveSubjectFor(candidateId: number, coachId: number, provider: AiProvider = 'claude', opts: { client?: AiClient; fetchFn?: FetchLike } = {}): Promise<ImproveOutcome> {
  const c = await getCandidate(candidateId);
  if (!c || !c.branch || !c.completed_at) return { ok: false, reason: 'not_eligible' };
  const [answers, refs, subject, event, focus] = await Promise.all([getAnswers(candidateId), getRefs(), getSubject(candidateId), aiEventFor(c), getSetting('topic_focus')]);
  const current = currentSubject(c.branch, answers, subject ?? null);
  if (!current) return { ok: false, reason: 'not_eligible' };
  if (!(provider === 'claude' && opts.client) && !providerConfigured(provider)) return { ok: false, reason: 'disabled' };
  if (!(await checkAiRate(coachId, candidateId)).ok) return { ok: false, reason: 'limited' }; // shared with the title suggestions

  // what she imagined when she chose her track (latest choice): the plan should come close to it
  const chosen = (await listProposals(candidateId)).filter((x) => x.kind === 'choix' && x.response === 'choisie').at(-1);
  const ideas = chosen?.response_data ? ideaLines(chosen.response_data) : [];
  const res = await improveSubject({ branch: c.branch, locale: c.locale, answers, refs, current, event, focus, brief: c.ai_brief ?? '', ideas }, provider, opts);
  if (!res.ok) {
    console.error('[ai] subject improvement failed', { candidate: candidateId, provider, reason: res.reason, detail: res.detail });
    // only an outage (the call did not complete, nothing billed) gives the press back; a cut, refused or unusable answer was produced and
    // may be billed: it stays counted, so the daily limits keep bounding the spend
    if (res.reason === 'failed') await refundAiRate(coachId, candidateId).catch(() => {});
    return { ok: false, reason: res.reason };
  }
  const p = res.proposal;
  await run(
    `INSERT INTO subject_suggestions (candidate_id,provider,model,titles,abstract,plan,note,created_at) VALUES (?,?,?,?,?,?,?,(now() at time zone 'utc'))
     ON CONFLICT (candidate_id) DO UPDATE SET provider=excluded.provider, model=excluded.model, titles=excluded.titles, abstract=excluded.abstract,
       plan=excluded.plan, note=excluded.note, created_at=excluded.created_at`,
    candidateId, provider, res.model, JSON.stringify(p.titles), p.abstract, JSON.stringify(p.plan), p.note || null,
  );
  console.log('[ai] subject improvement', { candidate: candidateId, provider, model: res.model, inputTokens: res.inputTokens, outputTokens: res.outputTokens });
  return { ok: true };
}

export async function getSubjectProposal(candidateId: number): Promise<StoredProposal | null> {
  const r = await get<{ provider: string; model: string; titles: string; abstract: string; plan: string; note: string | null; created_at: string }>(
    'SELECT * FROM subject_suggestions WHERE candidate_id=?', candidateId);
  if (!r) return null;
  const list = (s: string): string[] => { try { const v = JSON.parse(s); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  return { provider: r.provider, model: r.model, titles: list(r.titles), abstract: r.abstract, plan: list(r.plan), note: r.note ?? '', created_at: r.created_at };
}
