// The old Vercel address now only forwards to the VPS. A candidate's session cookie belongs to the old domain and does not
// follow the redirect: when she has one, she is sent through her resume link, which sets it again on the new domain.
export const NEW_ORIGIN = 'https://sheleads.techiesconnect.org';
const TOKEN = /^[A-Za-z0-9_-]{20,128}$/;

export function redirectTarget(pathname: string, search: string, token: string | undefined): { url: string; status: 307 | 308 } {
  if (!pathname.startsWith('/reprendre/') && token && TOKEN.test(token)) return { url: `${NEW_ORIGIN}/reprendre/${token}`, status: 307 };
  return { url: `${NEW_ORIGIN}${pathname}${search}`, status: 308 };
}
