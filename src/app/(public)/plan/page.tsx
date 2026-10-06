import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCandidateFromCookie, getLocale } from '@/lib/locale';
import { cityLabel, eventFor, getAnswers, getPhotos, getSubject, getTracks } from '@/lib/data';
import { buildRoadmap } from '@/lib/roadmap';
import { RoadmapView } from '@/components/RoadmapView';
import { PlanPhotos } from '@/components/PlanPhotos';
import { getSetting } from '@/lib/db';
import { t } from '@/lib/i18n';
import { appUrl } from '@/lib/mail';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Plan de route · Roadmap' };

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const sp = await searchParams;
  const locale = await getLocale();
  const c = await getCandidateFromCookie();
  if (!c) redirect('/');
  if (!c.completed_at || !c.branch) redirect('/diagnostic');
  const d = t(locale).plan;
  const answers = getAnswers(c.id);
  const sub = getSubject(c.id);
  const photos = getPhotos(c.id);
  const rm = buildRoadmap({
    answers, branch: c.branch, locale,
    subjectTitle: sub?.title, event: eventFor(c), cityName: cityLabel(c, locale),
  });
  const show = getSetting('show_tracks_to_candidates') === 'true';
  const tracks = show ? getTracks(c.id).filter((x) => x.state !== 'ecartee') : [];
  const photo = photos.find((p) => p.id === c.selected_photo_id) ?? photos[0];

  return (
    <div className="container narrow" style={{ paddingBottom: 40 }}>
      <div className="stack">
        <p className="label" style={{ marginTop: 24 }}>{d.done}</p>
        <h1 className="display-l">{d.title}</h1>
        <div className="confirm" role="status">
          <div className="dot" aria-hidden="true">✓</div>
          <div>
            <h2>{d.confirmH}</h2>
            <p>{d.confirmP}{sp.done && c.email ? ` ${d.emailSent}` : ''}</p>
          </div>
        </div>

        <RoadmapView rm={rm} locale={locale} photoUrl={photo ? `/api/photos/${photo.id}` : null} internalDeadline={getSetting('internal_deadline')} />

        {tracks.length > 0 && (
          <section className="card card-lg stack-sm">
            <h2 className="title" style={{ fontSize: 22 }}>{d.tracksTitle}</h2>
            <p className="muted">{d.tracksIntro}</p>
            <ol>{tracks.map((x) => <li key={x.id}>{x.title}</li>)}</ol>
          </section>
        )}

        <PlanPhotos initial={photos.map((p) => ({ id: p.id, width: p.width, height: p.height, size: p.size }))} consent={!!c.consent_photo} locale={locale} />

        <p className="small">{d.bookmark} <span className="muted" style={{ wordBreak: 'break-all' }}>{c.email ? '' : `${appUrl()}/reprendre/${c.token}`}</span></p>
      </div>
    </div>
  );
}
