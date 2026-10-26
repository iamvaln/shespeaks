import type { Journey, Proposal, ChoicePayload, SubjectPayload, PhotoPayload, Step } from '@/lib/journey';
import { ProposalAnswer } from './ProposalAnswer';
import { MessageForm } from './MessageForm';
import type { Message } from '@/lib/messages';
import { CopyButton, SubmittedButton } from './SubmitPanel';
import { fmtDate, type Dict } from '@/lib/i18n';
import { FORMATS, type Locale } from '@/lib/questions';

type Props = {
  j: Journey; proposals: Proposal[]; locale: Locale; d: Dict['journey']; photoCount: number;
  /** Her conversations with the coach: under one exchange (proposal_id) or on their own (null). */
  messages: Message[];
  submit: { title: string; abstract: string; photoUrl: string | null; cfpUrl: string | null; cfpLabel: string | null; deadline: string | null };
};

export function JourneyPanel({ j, proposals, locale, d, submit, photoCount, messages }: Props) {
  const thread = (proposalId: number | null) => messages.filter((m) => m.proposal_id === proposalId).map((m) => (
    <div key={m.id} className={`msg is-${m.author}`}>
      <span className="small">{m.author === 'candidate' ? d.messages.you : d.messages.coach} · {fmtDate(m.created_at, locale)}</span>
      <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{m.body}</p>
    </div>
  ));
  const p = j.pending;
  // a photo request can wait while the topic is still being discussed: it is shown whatever the step
  const photoAsk = [...proposals].reverse().find((x) => x.kind === 'photo' && x.state === 'envoyee') ?? null;
  const fmtLabel = (v: string) => FORMATS.find((f) => f.value === v)?.label[locale] ?? null;
  return (
    <>
      <section className="card card-lg stack-sm" aria-labelledby="h-where">
        <h2 id="h-where" className="title" style={{ fontSize: 22 }}>{d.whereTitle}</h2>
        <ol className="journey-steps">
          {(['recu', ...j.steps] as ('recu' | Step)[]).map((s) => {
            const idx = j.steps.indexOf(j.step);
            const mine = s === 'recu' ? -1 : j.steps.indexOf(s);
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
              <p><strong>{submit.title}</strong> <CopyButton value={submit.title} d={d} /></p>
              <p style={{ whiteSpace: 'pre-line' }}>{submit.abstract}</p><CopyButton value={submit.abstract} d={d} />
              {submit.photoUrl && <p><a href={submit.photoUrl} download>{d.downloadPhoto}</a></p>}
              {submit.deadline && <p>{d.deadline}{d.colon}{submit.deadline}</p>}
              {submit.cfpUrl && <p><a className="btn btn-ghost" href={submit.cfpUrl} target="_blank" rel="noopener">{submit.cfpLabel || d.submitLink}</a></p>}
              <SubmittedButton label={d.submitted} error={d.error} />
            </div>)
          : p?.kind === 'choix' ? (
            <div className="stack-sm">
              <p>{d.choiceIntro}</p>
              <ProposalAnswer key={p.id} proposalId={p.id} kind="choix" formatLabel={d.format} d={d}
                items={(p.payload as ChoicePayload).items.map((it) => ({ title: it.title, formatLabel: fmtLabel(it.format), pitch: it.pitch }))} />
            </div>)
          : p?.kind === 'sujet' ? (
            <div className="stack-sm">
              <p>{d.subjectIntro}</p>
              <h3 style={{ margin: 0 }}>{(p.payload as SubjectPayload).title}</h3>
              <p style={{ whiteSpace: 'pre-line' }}>{(p.payload as SubjectPayload).abstract}</p>
              {(p.payload as SubjectPayload).why && <><h4 style={{ margin: 0 }}>{d.why}</h4><p>{(p.payload as SubjectPayload).why}</p></>}
              {(p.payload as SubjectPayload).plan.length > 0 && <><h4 style={{ margin: 0 }}>{d.how}</h4><ol>{(p.payload as SubjectPayload).plan.map((s, k) => <li key={k}>{s}</li>)}</ol></>}
              <ProposalAnswer key={p.id} proposalId={p.id} kind="sujet" items={[]} formatLabel="" d={d} />
            </div>)
          : photoAsk ? null
          : j.step === 'photo' ? <p>{photoCount === 0 ? d.photoAdd : d.photoPending}</p>
          : <p>{d.nothing}</p>}
        {photoAsk && (
          <div className="stack-sm">
            <p>{d.photoAsked} {(photoAsk.payload as PhotoPayload).comment}</p>
            <p><a href="#photo">{d.photoUpload}</a></p>
          </div>
        )}
      </section>

      {proposals.length > 0 && (
        <section className="card card-lg stack-sm" aria-labelledby="h-history">
          <h2 id="h-history" className="title" style={{ fontSize: 22 }}>{d.historyTitle}</h2>
          <ul className="stack-sm">
            {[...proposals].reverse().map((x) => (
              <li key={x.id}>
                <details>
                  <summary>{fmtDate(x.sent_at, locale)} · {x.kind === 'choix' ? d.sentChoice : x.kind === 'sujet' ? d.sentSubject : d.sentPhoto}
                    {x.state === 'remplacee' ? ` · ${d.replaced}` : x.response ? ` · ${d.answered[x.response]}${x.response === 'choisie' && x.kind === 'choix' ? `${d.colon}${(x.payload as ChoicePayload).items[x.response_choice ?? 0]?.title ?? ''}` : ''}` : ''}</summary>
                  {x.kind === 'sujet' && <>
                    <p><strong>{(x.payload as SubjectPayload).title}</strong></p>
                    <p style={{ whiteSpace: 'pre-line' }}>{(x.payload as SubjectPayload).abstract}</p>
                    {(x.payload as SubjectPayload).why && <p>{(x.payload as SubjectPayload).why}</p>}
                    {(x.payload as SubjectPayload).plan.length > 0 && <ol>{(x.payload as SubjectPayload).plan.map((st, k) => <li key={k}>{st}</li>)}</ol>}
                  </>}
                  {x.kind === 'choix' && <ol>{(x.payload as ChoicePayload).items.map((it, k) => <li key={k}>{it.title}</li>)}</ol>}
                  {x.kind === 'photo' && <p>{(x.payload as PhotoPayload).comment}</p>}
                </details>
                {/* the conversation under this exchange stays visible: her comment first, then the answers */}
                {x.candidate_comment && (
                  <div className="msg is-candidate"><span className="small">{d.messages.you} · {fmtDate(x.answered_at ?? x.sent_at, locale)}</span><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{x.candidate_comment}</p></div>
                )}
                {thread(x.id)}
                {(x.candidate_comment || messages.some((m) => m.proposal_id === x.id)) && (
                  <details className="msg-reply"><summary>{d.messages.reply}</summary><MessageForm proposalId={x.id} label={d.messages.reply} d={d.messages} /></details>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card card-lg stack-sm" aria-labelledby="h-messages" id="messages">
        <h2 id="h-messages" className="title" style={{ fontSize: 22 }}>{d.messages.write}</h2>
        <p className="small">{d.messages.writeIntro}</p>
        {thread(null)}
        <MessageForm proposalId={null} label={d.messages.write} d={d.messages} />
      </section>
    </>
  );
}
