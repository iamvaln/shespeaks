// The real emails of the proposals flow, loaded by proposals.ts on first use (tests plug a recorder instead).
import { appUrl, candidateChoiceSent, candidatePhotoRequested, candidateReadyToSubmit, candidateSubjectSent, coachCandidateAnswered, sendMail } from './mail.ts';
import { eventFor, getCandidate, getSubject } from './data.ts';
import { coachRecipients } from './diagnostic.ts';
import { fmtDate } from './i18n.ts';
import { listProposals, type ProposalMailer } from './proposals.ts';

export const realMailer: ProposalMailer = {
  async toCandidate(id, what) {
    const c = await getCandidate(id);
    if (!c?.email) return;
    const url = `${appUrl()}/reprendre/${c.token}`;
    const name = c.name ?? '';
    let m;
    if (what === 'choix') m = candidateChoiceSent(name, url, c.locale);
    else if (what === 'sujet') m = candidateSubjectSent(name, url, c.locale);
    else if (what === 'photo') {
      const p = (await listProposals(id)).filter((x) => x.kind === 'photo').at(-1);
      m = candidatePhotoRequested(name, url, c.locale, (p?.payload as { comment?: string })?.comment ?? '');
    } else {
      const [s, e] = await Promise.all([getSubject(id), eventFor(c)]);
      m = candidateReadyToSubmit(name, url, c.locale, {
        title: s?.title ?? '', abstract: s?.abstract ?? '', cfpUrl: e?.submission_url ?? null, cfpLabel: e?.submission_label ?? null,
        deadline: e?.cfp_close_date ? fmtDate(e.cfp_close_date, c.locale) : null,
      });
    }
    await sendMail({ ...m, to: c.email, kind: `candidate_proposal_${what}`, candidateId: id });
  },
  async toCoaches(id, what, comment) {
    const c = await getCandidate(id);
    if (!c) return;
    const m = coachCandidateAnswered({ name: c.name ?? '' }, what, comment, `${appUrl()}/admin/candidates/${id}`);
    await Promise.allSettled((await coachRecipients(c)).map((r) => sendMail({ ...m, to: r.email, kind: `coach_answer_${what}`, candidateId: id })));
  },
};
