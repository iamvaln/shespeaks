// Environment sanity check. Pure (no framework imports) so the same rules run at server start,
// at build time on Vercel (scripts/check-env.mjs), in the admin status panel, and in tests.
// It only ever reports variable NAMES, never their values.

export type EnvLevel = 'error' | 'warn';
export interface EnvIssue {
  level: EnvLevel;
  vars: string[];
  message: string;
}
type Env = Record<string, string | undefined>;

/**
 * Database URL: DATABASE_URL, or POSTGRES_URL (the pooled URL created by Vercel's Supabase integration).
 * The integration appends non-standard parameters (`supa=base-pooler.x`) that the driver would forward to
 * Postgres as settings, which makes every connection fail, so they are stripped.
 */
export function resolveDatabaseUrl(env: Env): string | undefined {
  const raw = (env.DATABASE_URL || env.POSTGRES_URL)?.trim();
  if (!raw) return undefined;
  const q = raw.indexOf('?');
  if (q < 0) return raw;
  const params = raw.slice(q + 1).split('&').filter((p) => p && !/^(supa|pgbouncer)=/i.test(p));
  return params.length ? `${raw.slice(0, q)}?${params.join('&')}` : raw.slice(0, q);
}

/**
 * TLS for the database connection. `sslmode` in the URL decides when it is there (`disable` on the VPS, where Postgres is
 * another container of the same stack); otherwise TLS is required except on a local host, as before. The driver would read
 * `sslmode` by itself, but an explicit `ssl` option overrides it, so the choice is made here once for the app and the scripts.
 */
export function databaseSsl(url: string): false | string {
  const mode = /[?&]sslmode=([^&]+)/.exec(url)?.[1];
  if (mode) return mode === 'disable' ? false : mode;
  return /@(localhost|127\.0\.0\.\d+)(:|\/)/.test(url) ? false : 'require';
}

/** Public site URL: APP_URL, else the URL Vercel provides (production domain, then deployment URL), else localhost. */
export function resolveAppUrl(env: Env): { url: string; source: 'APP_URL' | 'vercel' | 'default' } {
  const set = env.APP_URL?.trim();
  if (set && !/^(change-?me|your[-_ ].*)$/i.test(set)) return { url: set.replace(/\/$/, ''), source: 'APP_URL' };
  const host = (env.VERCEL_ENV === 'production' && env.VERCEL_PROJECT_PRODUCTION_URL) || env.VERCEL_URL;
  if (host) return { url: `https://${host.replace(/^https?:\/\//, '').replace(/\/$/, '')}`, source: 'vercel' };
  return { url: 'http://localhost:3000', source: 'default' };
}

const PLACEHOLDER = /^(change-?me|changeme|xxx+|your[-_ ].*|\[.*\])?$/i;
const isSet = (v: string | undefined) => !!v && !PLACEHOLDER.test(v.trim());

export function checkEnv(env: Env, opts: { production: boolean }): EnvIssue[] {
  const out: EnvIssue[] = [];
  const add = (level: EnvLevel, vars: string[], message: string) => out.push({ level, vars, message });
  const onVercel = !!env.VERCEL;

  // --- database: needed everywhere ---------------------------------------------
  const db = resolveDatabaseUrl(env);
  if (!db) add('error', ['DATABASE_URL'], 'Manquante. Renseigne DATABASE_URL (ou laisse l’intégration Supabase fournir POSTGRES_URL) : la chaîne du Transaction pooler, port 6543.');
  else if (!/^postgres(ql)?:\/\//i.test(db)) add('error', ['DATABASE_URL'], 'Doit commencer par postgresql:// (vérifie que tu as copié la chaîne de connexion, pas l’URL du projet).');
  else if (/\[YOUR-PASSWORD\]|\[PASSWORD\]/i.test(db)) add('error', ['DATABASE_URL'], 'Contient encore le texte [YOUR-PASSWORD] : remplace-le par le mot de passe de la base.');
  else if (onVercel && !/:6543\b/.test(db)) {
    add('warn', ['DATABASE_URL'], 'Sur Vercel, utilise le Transaction pooler de Supabase (port 6543) : les connexions directes (5432) saturent la base en serverless.');
  }

  if (!opts.production) return out; // everything below only matters when real users are involved

  // --- public URL ------------------------------------------------------------------
  const app = resolveAppUrl(env);
  if (app.source === 'default') add('error', ['APP_URL'], 'Manquante. Les liens des emails (reprise du parcours, connexion des coachs) pointeraient vers localhost.');
  else if (/localhost|127\.0\.0\.1/.test(app.url)) add('error', ['APP_URL'], 'Pointe vers localhost en production : les liens envoyés par email ne fonctionneraient pas pour les candidates.');
  else if (app.source === 'vercel') add('warn', ['APP_URL'], `Non renseignée : les liens des emails utiliseront ${app.url}. Renseigne APP_URL avec ton vrai domaine.`);
  else if (!/^https:\/\//i.test(app.url)) add('warn', ['APP_URL'], 'Doit commencer par https://.');

  // --- secrets -----------------------------------------------------------------------
  if (!isSet(env.SESSION_SECRET)) add('error', ['SESSION_SECRET'], 'Manquant ou encore « change-me ». Génère-en un : openssl rand -hex 32');
  else if ((env.SESSION_SECRET ?? '').length < 16) add('error', ['SESSION_SECRET'], 'Trop court (au moins 16 caractères, idéalement 32 octets aléatoires en hexadécimal).');
  if (!isSet(env.CRON_SECRET)) add('error', ['CRON_SECRET'], 'Manquant ou encore « change-me » : la route des relances refuse de s’exécuter, donc aucune relance ne partirait.');

  // --- photo storage -----------------------------------------------------------------
  const sbUrl = isSet(env.SUPABASE_URL);
  const sbKey = isSet(env.SUPABASE_SERVICE_ROLE_KEY);
  if (sbUrl !== sbKey) {
    add('error', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'À renseigner ensemble ou pas du tout : il en manque une, les dépôts de photos ne fonctionneraient pas.');
  } else if (!sbUrl) {
    if (onVercel) add('error', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'Manquantes. Vercel n’a pas de disque persistant : les photos de speaker ne pourraient pas être conservées.');
    else if (!isSet(env.DATA_DIR)) add('warn', ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'], 'Non renseignées et DATA_DIR absent : les photos sont écrites dans ./data, qui disparaît avec le conteneur. Sur le VPS, DATA_DIR pointe vers le volume uploads.');
  } else if (!/^https:\/\/.+/i.test(env.SUPABASE_URL!.trim())) {
    add('error', ['SUPABASE_URL'], 'Doit être l’URL du projet, par exemple https://xxxx.supabase.co');
  }

  // --- first coach -------------------------------------------------------------------
  if (!isSet(env.ADMIN_EMAIL)) add('warn', ['ADMIN_EMAIL'], 'Non renseigné : tant qu’aucune coach n’existe, personne ne peut se connecter à l’espace coach. (À ignorer une fois la première coach créée.)');

  // --- email (Resend) -------------------------------------------------------------------
  if (!isSet(env.RESEND_API_KEY)) {
    add('warn', ['RESEND_API_KEY'], 'Non renseignée : les confirmations, relances et notifications aux coachs sont seulement enregistrées dans la page Emails, jamais envoyées. Les liens de connexion des coachs ne seront pas livrés.');
  } else {
    if (!/^re_/.test(env.RESEND_API_KEY!.trim())) add('error', ['RESEND_API_KEY'], 'Les clés API Resend commencent par « re_ » (tableau de bord Resend → API Keys).');
    const from = env.MAIL_FROM?.trim();
    const addr = from ? (/<([^>]+)>/.exec(from)?.[1] ?? from).trim() : '';
    if (!from) add('error', ['MAIL_FROM'], 'Obligatoire avec Resend : un expéditeur sur un domaine vérifié dans Resend, par exemple « SheSpeaks <no-reply@tondomaine.com> ».');
    else if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(addr)) add('error', ['MAIL_FROM'], 'Adresse d’expéditeur non valide. Format attendu : SheSpeaks <no-reply@tondomaine.com>');
    else if (/@resend\.dev$/i.test(addr)) add('warn', ['MAIL_FROM'], 'resend.dev est l’expéditeur de test de Resend : il ne peut écrire qu’à l’adresse de ton propre compte Resend. Vérifie ton domaine et utilise-le ici.');
    if (env.MAIL_REPLY_TO?.trim() && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test((/<([^>]+)>/.exec(env.MAIL_REPLY_TO)?.[1] ?? env.MAIL_REPLY_TO).trim())) {
      add('warn', ['MAIL_REPLY_TO'], 'Adresse non valide : les réponses n’atteindraient aucune coach.');
    }
  }

  // --- AI title suggestions for the coaches (optional) ------------------------------------------------------------------
  if (!isSet(env.ANTHROPIC_API_KEY)) {
    add('warn', ['ANTHROPIC_API_KEY'], 'Non renseignée : les suggestions de titres par IA sont désactivées (le bouton « Suggérer avec l’IA » n’apparaît pas sur les fiches).');
  } else if (!/^sk-ant-/.test(env.ANTHROPIC_API_KEY!.trim())) {
    add('warn', ['ANTHROPIC_API_KEY'], 'Ne ressemble pas à une clé Anthropic (elles commencent par « sk-ant- »).');
  }
  return out;
}

export const hasErrors = (issues: EnvIssue[]) => issues.some((i) => i.level === 'error');

export function formatIssues(issues: EnvIssue[]): string {
  if (!issues.length) return 'Vérification de l’environnement : tout est en ordre.';
  return [
    'Vérification de l’environnement :',
    ...issues.map((i) => `  ${i.level === 'error' ? '✖ ERREUR' : '⚠ alerte'}  ${i.vars.join(' + ')} — ${i.message}`),
  ].join('\n');
}
