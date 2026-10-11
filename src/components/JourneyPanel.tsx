import type { Journey, Proposal, ChoicePayload, SubjectPayload, PhotoPayload } from '@/lib/journey';
import { ProposalAnswer } from './ProposalAnswer';
import { CopyButton, SubmittedButton } from './SubmitPanel';
import { fmtDate } from '@/lib/i18n';
import type { Locale } from '@/lib/questions';

type Props = {
  j: Journey; proposals: Proposal[]; locale: Locale; d: Record<string, any>;
  submit: { title: string; abstract: string; photoUrl: string | null; cfpUrl: string | null; cfpLabel: string | null; deadline: string | null };
};

export function JourneyPanel({ j, proposals, locale, d, submit }: Props) {
  const p = j.pending;
  return (
    <>
      <section className="card card-lg stack-sm" aria-labelledby="h-where">
        <h2 id="h-where" className="title" style={{ fontSize: 22 }}>{d.whereTitle}</h2>
        <ol className="journey-steps">
          {['recu', ...j.steps].map((s) => {
            const idx = j.steps.indexOf(j.step as never);
            const mine = s === 'recu' ? -1 : j.steps.indexOf(s as never);
            const state = s === j.step ? 'current' : mine < idx ? 'done' : 'todo';
            return <li key={s} data-state={state} aria-current={state === 'current' ? 'step' : undefined}>{d.steps[s]}</li>;
          })}
        </ol>
      </section>

      <section className="card card-lg stack-sm" aria-labelledby="h-todo">
        <h2 id="h-todo" className="title" style={{ fontSize: 22 }}>{d.todoTitle}</h2>
        {j.step === 'soumise' ? <p>{d.submittedDone}</p>
          : j.step === 'soumission' ? (
            <div className="stack-sm">
              <p>{d.submitIntro}</p>
              <p><strong>{submit.title}</strong> <CopyButton value={submit.title} d={d as never} /></p>
              <p style={{ whiteSpace: 'pre-line' }}>{submit.abstract}</p><CopyButton value={submit.abstract} d={d as never} />
              {submit.photoUrl && <p><a href={submit.photoUrl} download>{d.downloadPhoto}</a></p>}
              {submit.deadline && <p>{d.deadline} : {submit.deadline}</p>}
              {submit.cfpUrl && <p><a className="btn btn-ghost" href={submit.cfpUrl} target="_blank" rel="noopener">{submit.cfpLabel || d.submitLink}</a></p>}
              <SubmittedButton label={d.submitted} error={d.error} />
            </div>)
          : p?.kind === 'choix' ? (
            <div className="stack-sm">
              <p>{d.choiceIntro}</p>
              <ol>{(p.payload as ChoicePayload).items.map((it, k) => <li key={k}><strong>{it.title}</strong><br />{it.pitch}</li>)}</ol>
              <ProposalAnswer proposalId={p.id} kind="choix" count={(p.payload as ChoicePayload).items.length} d={d as never} />
            </div>)
          : p?.kind === 'sujet' ? (
            <div className="stack-sm">
              <p>{d.subjectIntro}</p>
              <h3 style={{ margin: 0 }}>{(p.payload as SubjectPayload).title}</h3>
              <p style={{ whiteSpace: 'pre-line' }}>{(p.payload as SubjectPayload).abstract}</p>
              {(p.payload as SubjectPayload).why && <><h4 style={{ margin: 0 }}>{d.why}</h4><p>{(p.payload as SubjectPayload).why}</p></>}
              {(p.payload as SubjectPayload).plan.length > 0 && <><h4 style={{ margin: 0 }}>{d.how}</h4><ol>{(p.payload as SubjectPayload).plan.map((s, k) => <li key={k}>{s}</li>)}</ol></>}
              <ProposalAnswer proposalId={p.id} kind="sujet" count={0} d={d as never} />
            </div>)
          : p?.kind === 'photo' ? <p>{d.photoAsked} {(p.payload as PhotoPayload).comment}</p>
          : j.step === 'photo' ? <p>{d.photoPending}</p>
          : <p>{d.nothing}</p>}
      </section>

      {proposals.length > 0 && (
        <section className="card card-lg stack-sm" aria-labelledby="h-history">
          <h2 id="h-history" className="title" style={{ fontSize: 22 }}>{d.historyTitle}</h2>
          <ul className="stack-sm">
            {[...proposals].reverse().map((x) => (
              <li key={x.id}>
                <details>
                  <summary>{fmtDate(x.sent_at, locale)} · {x.kind === 'choix' ? d.sentChoice : x.kind === 'sujet' ? d.sentSubject : d.sentPhoto}
                    {x.state === 'remplacee' ? ` · ${d.replaced}` : x.response ? ` · ${d.answered[x.response]}${x.response === 'choisie' && x.kind === 'choix' ? ` : ${(x.payload as ChoicePayload).items[x.response_choice ?? 0]?.title ?? ''}` : ''}` : ''}</summary>
                  {x.kind === 'sujet' && <p><strong>{(x.payload as SubjectPayload).title}</strong></p>}
                  {x.kind === 'choix' && <ol>{(x.payload as ChoicePayload).items.map((it, k) => <li key={k}>{it.title}</li>)}</ol>}
                  {x.kind === 'photo' && <p>{(x.payload as PhotoPayload).comment}</p>}
                  {x.candidate_comment && <p>« {x.candidate_comment} »</p>}
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
