import { requireCoach } from '@/lib/auth';
import { countToProcess } from '@/lib/admin-data';
import { initials } from '@/lib/text';
import { AdminShell } from '@/components/AdminShell';
import { Icon } from '@/components/admin-icons';
import { logoutAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const coach = await requireCoach();
  const toProcess = await countToProcess();
  return (
    <AdminShell
      toProcess={toProcess}
      coachName={coach.name}
      initials={initials(coach.name)}
      signOut={<form action={logoutAction}><button type="submit" className="app-signout" aria-label="Se déconnecter"><Icon name="logout" /></button></form>}
    >
      {children}
    </AdminShell>
  );
}
