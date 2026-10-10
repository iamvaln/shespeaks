// What is left of SheSpeaks on Vercel once the app runs on the VPS.
//  - shespeaks.techiesconnect.org itself: the waiting page, while its DNS record moves from Vercel to the VPS. Nothing is
//    written to Supabase any more; a visitor whose resolver still has the old answer reloads until it reaches the VPS.
//  - the other Vercel addresses (shespeaks-taupe.vercel.app…): a redirect to shespeaks.techiesconnect.org. A candidate's
//    session cookie belongs to the old address and does not follow the redirect: when she has one, she is sent through
//    her resume link, which sets it again on the new address.
export const NEW_HOST = 'shespeaks.techiesconnect.org';
export const NEW_ORIGIN = `https://${NEW_HOST}`;
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

export function redirectTarget(pathname: string, search: string, token: string | undefined): { url: string; status: 307 | 308 } {
  if (!pathname.startsWith('/reprendre/') && token && TOKEN.test(token)) return { url: `${NEW_ORIGIN}/reprendre/${token}`, status: 307 };
  return { url: `${NEW_ORIGIN}${pathname}${search}`, status: 308 };
}

export type Decision = { kind: 'waiting' } | { kind: 'redirect'; url: string; status: 307 | 308 };

export function decide(host: string | null, pathname: string, search: string, token: string | undefined): Decision {
  if ((host ?? '').toLowerCase().replace(/:\d+$/, '') === NEW_HOST) return { kind: 'waiting' };
  return { kind: 'redirect', ...redirectTarget(pathname, search, token) };
}

// Same page as the VPS stack's maintenance container (ops/maintenance/index.html on develop).
export const WAITING_PAGE = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="15">
<title>SheSpeaks · On revient dans un instant</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; background: #fbf7f2; color: #1d1a17; padding: 16px; }
  main { max-width: 32rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 .75rem; }
  p { line-height: 1.5; margin: .5rem 0; }
  .en { color: #5c554e; font-size: .95rem; margin-top: 1.5rem; }
</style>
</head>
<body>
<main>
  <h1>On revient dans un instant</h1>
  <p>SheSpeaks est en courte maintenance. Cette page se recharge toute seule : tes réponses déjà enregistrées sont en sécurité.</p>
  <p class="en">SheSpeaks is briefly down for maintenance. This page reloads by itself; the answers you already saved are safe.</p>
</main>
</body>
</html>
`;
