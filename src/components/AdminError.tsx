'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';

/**
 * What a coach sees when a page of the coach space fails to render (a database that answers too slowly, an outage), in place of
 * Next's bare « Application error » screen: the menu stays, she can try again, and the reference (digest) is what to look up in the logs.
 */
export function AdminError({ error, reset, standalone = false }: { error: Error & { digest?: string }; reset: () => void; standalone?: boolean }) {
  const router = useRouter();
  // reset() alone re-renders the same failed result: the server has to be asked again
  const retry = () => startTransition(() => { router.refresh(); reset(); });
  return (
    <div className={standalone ? 'a-errwrap' : 'a-page'}>
      <section className="a-card a-errbox" role="alert">
        <h1 className="a-errtitle">Cette page n’a pas pu s’afficher</h1>
        <p>Une erreur est survenue sur le serveur en préparant la page. Cela peut être passager (une base de données lente à répondre, par exemple) : réessaie dans un instant.</p>
        {error.digest && (
          <p className="a-muted">Si ça continue, donne cette référence à l’équipe technique : <code>{error.digest}</code>. Elle permet de retrouver l’erreur dans les journaux.</p>
        )}
        <div className="a-actions">
          <button type="button" className="a-btn" onClick={retry}>Réessayer</button>
          <Link href="/admin" className="a-btn is-ghost">Tableau de bord</Link>
        </div>
      </section>
    </div>
  );
}
