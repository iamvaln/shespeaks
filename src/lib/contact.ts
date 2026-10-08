// Contact checks for the profile screen. They need real numbers and real mail domains, so they run on the
// production deployment only (test numbers like +237 612 345 678 and @example.com are fine everywhere else).
import { promises as dns } from 'node:dns';
import { domainToASCII } from 'node:url';
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/** On for the production deployment (Vercel sets VERCEL_ENV). STRICT_CONTACT_CHECKS=1 or 0 forces it on or off. */
export function strictContactChecks(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.STRICT_CONTACT_CHECKS?.trim().toLowerCase();
  if (v === '1' || v === 'true') return true;
  if (v === '0' || v === 'false') return false;
  return env.VERCEL_ENV === 'production';
}

// A WhatsApp number is a mobile line: landlines, toll-free, premium and the like cannot be used.
const NOT_WHATSAPP = new Set(['FIXED_LINE', 'TOLL_FREE', 'PREMIUM_RATE', 'SHARED_COST', 'PERSONAL_NUMBER', 'PAGER', 'UAN', 'VOICEMAIL']);

/** A real number in international format (+country code…), checked against libphonenumber's rules for its country. */
export function isWhatsappNumber(raw: string): boolean {
  const p = parsePhoneNumberFromString(raw.trim());
  if (!p || !p.isValid()) return false;
  const type = p.getType();
  return !(type && NOT_WHATSAPP.has(type));
}

export interface Resolver {
  resolveMx(host: string): Promise<{ exchange: string; priority: number }[]>;
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
}

const DNS_TIMEOUT_MS = 3000;
/** The name server said "no such domain" or "no such record" (as opposed to being slow or unreachable). */
const definitive = (e: unknown) => ['ENOTFOUND', 'ENODATA', 'EBADNAME'].includes((e as { code?: string })?.code ?? '');

const withTimeout = <T,>(p: Promise<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(Object.assign(new Error('dns timeout'), { code: 'ETIMEOUT' })), DNS_TIMEOUT_MS);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });

/**
 * Can this address's domain receive mail? True when it has MX records (or, as mail servers do, an address record),
 * false when the domain does not exist, has no mail records or publishes a null MX. A slow or failing DNS never
 * blocks anyone: only a definitive answer rejects the address.
 */
export async function emailDomainAccepts(email: string, resolver: Resolver = dns): Promise<boolean> {
  const host = domainToASCII(email.trim().split('@').pop() ?? '').toLowerCase();
  if (!host || host.endsWith('.')) return false;
  try {
    const mx = await withTimeout(resolver.resolveMx(host));
    if (mx.length > 0) return !(mx.length === 1 && mx[0].exchange === ''); // "0 ." = this domain takes no mail
  } catch (e) {
    if (!definitive(e)) return true;
  }
  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      if ((await withTimeout(lookup.call(resolver, host))).length > 0) return true;
    } catch (e) {
      if (!definitive(e)) return true;
    }
  }
  return false;
}
