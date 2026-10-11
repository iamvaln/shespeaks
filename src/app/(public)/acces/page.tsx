import { getLocale } from '@/lib/locale';
import { t } from '@/lib/i18n';
import { AccessForm } from '@/components/AccessForm';

export const dynamic = 'force-dynamic';
export default async function Access() {
  const d = t(await getLocale()).access;
  return (
    <div className="container narrow" style={{ padding: '32px 0 48px' }}>
      <div className="stack">
        <h1 className="display-l">{d.title}</h1>
        <p>{d.intro}</p>
        <AccessForm d={d} />
      </div>
    </div>
  );
}
