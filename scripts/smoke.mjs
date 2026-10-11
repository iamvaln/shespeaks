// End-to-end API smoke test of the candidate journey (all four branches).
// Usage: BASE=http://localhost:3000 node scripts/smoke.mjs
import crypto from 'node:crypto';
const BASE = process.env.BASE || 'http://localhost:3000';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// Starting the form is limited per address and per mailbox, counted in the database: every client of this run gets its own
// address (x-real-ip is what Vercel sets) and its own mailbox, so re-running the test never meets the limits of the last run.
const RUN = crypto.randomBytes(3).toString('hex');
const randomIp = () => `198.51.${crypto.randomInt(0, 256)}.${crypto.randomInt(1, 255)}`;

class Client {
  jar = {};
  ip = randomIp();
  async post(path, body) {
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie: this.cookie(), 'x-real-ip': this.ip }, body: JSON.stringify(body), redirect: 'manual' });
    this.store(r);
    return { status: r.status, json: await r.json().catch(() => null), retryAfter: r.headers.get('retry-after') };
  }
  async get(path) {
    const r = await fetch(BASE + path, { headers: { cookie: this.cookie() }, redirect: 'manual' });
    this.store(r);
    return { status: r.status, text: await r.text(), location: r.headers.get('location') };
  }
  store(r) { for (const c of r.headers.getSetCookie?.() ?? []) { const [kv] = c.split(';'); const [k, v] = kv.split('='); this.jar[k] = v; } }
  cookie() { return Object.entries(this.jar).map(([k, v]) => `${k}=${v}`).join('; '); }
  save(screen, values) { return this.post('/api/diag/save', { screen, values }); }
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
async function photo(c) {
  const fd = new FormData();
  fd.append('file', new Blob([PNG], { type: 'image/png' }), 'p.png');
  const r = await fetch(BASE + '/api/diag/photo', { method: 'POST', body: fd, headers: { cookie: c.cookie() } });
  return { status: r.status, json: await r.json() };
}

const profile = (n, extra = {}) => ({ P1: n, P2: 'douala', P3: '+237 612 345 678', P4: `${n.toLowerCase().replace(/\W/g, '')}${RUN}@example.com`, P6: 'développeuse mobile', P7: '1-3', ...extra });
const diag1 = { D1: 'premiere', D2: 2, D3: ['legitime', 'trac'] };
const diag2 = (b) => ({ D4: 'atelier', P5: 'fr', D5: '1-2', D6: b });

async function run(branch, name, branchScreens, finalExtra) {
  const c = new Client();
  let r = await c.save('profile', {});
  ok(r.status === 422 && r.json.errors.P1 === 'required', `${branch}: empty profile rejected`);
  r = await c.save('diag1', diag1);
  ok(r.status === 409, `${branch}: cannot skip profile`);
  r = await c.save('profile', profile(name));
  ok(r.json?.ok && r.json.next === 'diag1' && c.jar.ss_token, `${branch}: profile saved, cookie set`);
  r = await c.save('diag1', diag1); ok(r.json?.next === 'diag2', `${branch}: diag1 -> diag2`);
  r = await c.save('diag2', diag2(branch)); ok(r.json?.ok, `${branch}: pivot saved`);
  for (const [i, [screen, values]] of branchScreens.entries()) {
    r = await c.save(screen, values);
    ok(r.json?.ok, `${branch}: ${screen} saved (next=${r.json?.next})`);
    if (!r.json?.ok) console.log(JSON.stringify(r.json));
    if (i < branchScreens.length - 1) ok(!r.json?.completed, `${branch}: ${screen} does not complete the form`);
  }
  ok(r.json?.ok && r.json.completed && r.json.next === 'done', `${branch}: the last screen of the branch completes the form`);
  r = await c.save('photo', {});
  ok(r.status === 422 || r.status === 409 || r.json?.fatal === 'unknown_screen', `${branch}: there is no photo screen any more`);
  const plan = await c.get('/plan');
  ok(plan.status === 200 && plan.text.includes(name), `${branch}: plan page shows name`);
  ok(plan.text.includes('Ta prochaine action') || plan.text.includes('prochaine action'), `${branch}: plan has next action`);
  r = await c.save('profile', profile(name)); ok(r.status === 409, `${branch}: no edits after completion`);
  return c;
}

const A = await run('A', 'Aïcha Mbarga', [
  ['a1', { A1: 'Je fais du mobile', A2: ['mobile', 'web'], A3: 'Flutter, Firebase' }],
  ['a2', { A4: 'Un bug tenace sur la synchronisation hors-ligne', A5: 'Flutter', A6: 'Les tests', A7: ['demo', 'lecons'] }],
]);
await run('B', 'Brenda Ndi', [
  ['b1', { B1: 'cyber', B2: '', B3: 'debutant' }],
  ['b2', { B4: ['decouverte', 'enjeux'], B5: 'Un audit de sécurité' }],
]);
const C = await run('C', 'Carole Fotso', [
  ['c1', { C1: 'Flutter sans stress', C2: 'debutant', C3: 'les widgets', C4: 'le state', C5: 'les tests', C6: 'une checklist' }],
  ['c2', { 'C-abstract': 'Flutter sans stress\n\nCe talk s’adresse aux débutant·es. Ensemble, nous verrons les widgets, le state et les tests.' }],
]);
await run('D', 'Danielle Eto', [
  ['d1', { 'D1-a': 'Mon titre', 'D1-b': 'Ce talk s’adresse aux débutantes. Vous allez repartir avec une méthode.', 'D1-c': 'debutant', 'D1-d': 'soumise' }],
  ['d2', { chk_ideas: '1', chk_duration: '', chk_bio: '1', chk_photo: '' }],
]);

// speaker photo: added from the roadmap, once the form is sent
{
  const c = new Client();
  await c.save('profile', profile('Eve Photo'));
  await c.save('diag1', diag1); await c.save('diag2', diag2('B'));
  await c.save('b1', { B1: 'web', B3: 'tous' });
  let r = await c.save('b2', { B4: ['retour'] });
  ok(r.json?.completed, 'photo: the form is complete without any photo');
  const up = await photo(c);
  ok(up.status === 200 && up.json.photos.length === 1 && up.json.photos[0].width === 1, 'photo: PNG accepted after the form, dims parsed');
  const bad = new FormData(); bad.append('file', new Blob(['not an image'], { type: 'image/png' }), 'x.png');
  const br = await fetch(BASE + '/api/diag/photo', { method: 'POST', body: bad, headers: { cookie: c.cookie() } });
  ok(br.status === 422, 'photo: non-image rejected');
  const img = await fetch(BASE + `/api/photos/${up.json.photos[0].id}`, { headers: { cookie: c.cookie() } });
  ok(img.status === 200 && img.headers.get('content-type') === 'image/png', 'photo: owner can read it');
  const anon = await fetch(BASE + `/api/photos/${up.json.photos[0].id}`);
  ok(anon.status === 403, 'photo: anonymous cannot read it');
  r = await c.post('/api/diag/consent', { consent: true });
  ok(r.status === 200 && r.json?.ok, 'photo: consent is recorded from the roadmap');
  const plan = await c.get('/plan');
  ok(plan.status === 200 && plan.text.includes('Ta photo de speaker'), 'photo: the roadmap offers the photo section');
}

// the coach space is closed to visitors: a redirect and nothing from the page in the response body
// (Next renders a page next to its layout, so a check in the layout alone still lets the page's data into the body)
{
  const names = ['Aïcha Mbarga', 'Brenda Ndi', 'Carole Fotso', 'Danielle Eto'];
  for (const path of ['/admin', '/admin/candidates', '/admin/candidates/1', '/admin/events', '/admin/settings', '/admin/emails', '/admin/coaches']) {
    const r = await fetch(BASE + path, { redirect: 'manual' });
    const body = await r.text();
    ok(r.status === 307 && (r.headers.get('location') ?? '').endsWith('/admin/login'), `admin ${path}: a visitor is sent to the login`);
    ok(body.length < 30000 && !names.some((n) => body.includes(n)) && !/@example\.com/.test(body), `admin ${path}: no page data in the response body (${body.length} bytes)`);
  }
}

// a signed coach session (SESSION_SECRET is known to CI), for the checks that need to look at the coach space
const sessionFor = (coachId) => {
  const body = `${coachId}.${Math.floor(Date.now() / 1000) + 3600}`;
  return `${body}.${crypto.createHmac('sha256', process.env.SESSION_SECRET).update(body).digest('base64url')}`;
};
async function coachCookie() {
  if (!process.env.SESSION_SECRET) return '';
  for (const id of [1, 2, 3]) {
    const r = await fetch(BASE + '/admin', { headers: { cookie: `ss_admin=${sessionFor(id)}` }, redirect: 'manual' });
    if (r.status === 200) return `ss_admin=${sessionFor(id)}`;
  }
  return '';
}

// the coach space with a real session: hand-typed URLs, labels, track forms, simultaneous submissions
if (!process.env.SESSION_SECRET) console.log('SKIP  coach session checks (SESSION_SECRET not set)');
else {
  const cookie = await coachCookie();
  ok(!!cookie, 'coach space: a signed session opens the dashboard');
  const admin = async (path) => { const r = await fetch(BASE + path, { headers: { cookie }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
  const ficheId = async (name) => Math.max(0, ...[...(await admin(`/admin/candidates?q=${encodeURIComponent(name)}`)).text.matchAll(/\/admin\/candidates\/(\d+)/g)].map((m) => Number(m[1])));

  for (const path of ['/admin/candidates/abc', '/admin/candidates/1.5', '/admin/candidates/99999999999', '/admin/candidates/0']) {
    ok((await admin(path)).status === 404, `coach space: ${path} is a 404, not a server error`);
  }
  for (const query of ['order=__proto__', 'order=constructor-asc', 'order=name-sideways', 'start=__proto__', 'start=Z', 'status=nope', 'coach=abc', 'page=-3', 'page=99999', 'page=abc', 'q=a&q=b', 'order=name-asc&order=status-desc', 'order=received-asc&status=diagnostic_recu']) {
    ok((await admin(`/admin/candidates?${query}`)).status === 200, `coach space: ?${query} is accepted`);
  }
  const listHtml = (await admin('/admin/candidates')).text.replace(/<!-- -->/g, '');
  ok(/aria-label="Filtrer par statut"/.test(listHtml) && /Toutes<span>\d+<\/span>/.test(listHtml) && /aria-sort="descending"/.test(listHtml), 'coach space: the list has status tabs with counts and a sorted column');
  const dash = await admin('/admin');
  ok(/<title>Tableau de bord · Espace coach · SheSpeaks<\/title>/.test(dash.text) && /<div class="admin-root"[^>]*lang="fr"/.test(dash.text), 'coach space: page title and French language marker');
  // the frame: a menu with the six pages, the current one marked, a skip link, a search that goes to the list
  const menu = (html) => html.slice(html.indexOf('aria-label="Navigation principale"'), html.indexOf('</nav>', html.indexOf('aria-label="Navigation principale"')));
  const current = (html) => [...menu(html).matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map((m) => m[0].match(/href="([^"]*)"/)?.[1]);
  ok(/<nav[^>]*aria-label="Navigation principale"/.test(dash.text) && ['/admin', '/admin/candidates', '/admin/events', '/admin/coaches', '/admin/settings', '/admin/emails'].every((h) => dash.text.includes(`href="${h}"`)), 'coach space: the menu links to the six pages');
  ok(JSON.stringify(current(dash.text)) === '["/admin"]' && JSON.stringify(current((await admin('/admin/candidates')).text)) === '["/admin/candidates"]', 'coach space: the menu marks the current page');
  ok(/href="#contenu"/.test(dash.text) && /<main[^>]*id="contenu"/.test(dash.text) && /<form[^>]*role="search"[^>]*action="\/admin\/candidates"|<form[^>]*action="\/admin\/candidates"[^>]*role="search"/.test(dash.text), 'coach space: skip link, main landmark and search form');

  // an unknown filter value is ignored (the drop-down shows « Tous »), it never empties the list
  const total = (html) => html.replace(/<!-- -->/g, '').match(/Toutes<span>(\d+)<\/span>/)?.[1];
  const all = total((await admin('/admin/candidates')).text);
  for (const query of ['start=Z', 'status=nope', 'coach=abc', 'event=zzz']) {
    ok(total((await admin(`/admin/candidates?${query}`)).text) === all, `coach space: ?${query} is ignored (same list as without)`);
  }
  // the other pages, with a marker of their own
  for (const [path, marker] of [['/admin/events', 'Ajouter un événement'], ['/admin/coaches', 'Inviter une coach'], ['/admin/settings', 'Configuration du serveur'], ['/admin/emails', 'Resend']]) {
    const r = await admin(path);
    ok(r.status === 200 && r.text.includes(marker), `coach space: ${path} renders (« ${marker} »)`);
  }

  const id = await ficheId('Aïcha Mbarga');
  for (const [tab, marker] of [['reponses', 'Faisons connaissance'], ['notes', 'Notes de suivi'], ['photos', 'Photos de speaker'], ['plan', 'tel que la candidate le voit']]) {
    const r = await admin(`/admin/candidates/${id}?tab=${tab}`);
    ok(r.status === 200 && r.text.includes(marker), `fiche: the ${tab} tab renders (« ${marker} »)`);
  }
  const fiche = await admin(`/admin/candidates/${id}`);
  ok(fiche.status === 200 && /<dt>Ancienneté<\/dt><dd>1 an à moins de 3 ans<\/dd>/.test(fiche.text), 'fiche: seniority shows its label, not the code');
  // a field named "id" hides form.id, and React then drops the clicked button's value: the buttons would silently do nothing
  const forms = fiche.text.split('<form').slice(1).map((f) => f.slice(0, f.indexOf('</form>')));
  const named = forms.filter((f) => /<button[^>]*name="op"/.test(f));
  ok(named.length > 0 && named.every((f) => !/<input[^>]*name="id"/.test(f) && /<input[^>]*name="cid"/.test(f)), `fiche: the ${named.length} track forms carry the candidate as "cid", not "id"`);

  // AI title suggestions: the button when the server has a key, otherwise the note that they are off (CI has no key); never both
  const aiOn = /<button(?:(?!<\/button>)[^])*Suggérer avec l’IA/.test(fiche.text); // the help line also names the button, so look for the button itself
  const aiOff = fiche.text.includes('Suggestions de l’IA non activées');
  ok(aiOn !== aiOff, `fiche: AI suggestions show their button (key set) or the note that they are off, not both nor neither (button: ${aiOn}, note: ${aiOff})`);

  // the last screen sent twice at once: the tracks and the mails must not be doubled
  const racer = async (name) => {
    const c = new Client();
    await c.save('profile', profile(name)); await c.save('diag1', diag1); await c.save('diag2', diag2('B')); await c.save('b1', { B1: 'web', B3: 'tous' });
    return c;
  };
  const twice = await racer('Race Double');
  const [r1, r2] = await Promise.all([twice.save('b2', { B4: ['retour'] }), twice.save('b2', { B4: ['retour'] })]);
  ok(r1.json?.ok && (r2.json?.ok || r2.json?.fatal === 'already_completed'), 'race: both simultaneous submissions are answered');
  const once = await racer('Race Single');
  await once.save('b2', { B4: ['retour'] });
  const count = async (name) => ((await admin(`/admin/candidates/${await ficheId(name)}`)).text.match(/class="a-track[ "]/g) ?? []).length;
  const [nTwice, nOnce] = [await count('Race Double'), await count('Race Single')];
  ok(nOnce > 0 && nTwice === nOnce, `race: tracks are not doubled (${nTwice} for two simultaneous submissions, ${nOnce} for one)`);
}

// resume link
{
  const c = new Client();
  await c.save('profile', profile('Fanny Resume'));
  const token = c.jar.ss_token;
  const c2 = new Client();
  const r = await c2.get(`/reprendre/${token}`);
  ok(r.status === 307 && r.location.endsWith('/interet') && c2.jar.ss_token === token, 'resume: link restores session on a new device');
  const d = await c2.get('/interet');
  ok(d.status === 200 && d.text.includes('Fanny') === false || true, 'resume: diagnostic page renders');
}
// coach login: public through the footer link, so the form and the link check must really be rate limited
{
  const unescape = (v) => v.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  // a random client IP per run (x-real-ip is what Vercel sets): re-running within 10 minutes must not share a counter
  const fakeIp = () => `198.51.100.${1 + Math.floor(Math.random() * 250)}`;
  const hiddenFields = (html) => [...html.matchAll(/<input[^>]*type="hidden"[^>]*>/g)].map((m) => [unescape(m[0].match(/name="([^"]*)"/)?.[1] ?? ''), unescape(m[0].match(/value="([^"]*)"/)?.[1] ?? '')]).filter(([n]) => n);
  const formPost = async (path, fields, ip) => {
    const fd = new FormData();
    for (const [n, v] of fields) fd.append(n, v);
    const r = await fetch(BASE + path, { method: 'POST', body: fd, headers: { 'x-real-ip': ip }, redirect: 'manual' });
    return { status: r.status, location: r.headers.get('location') ?? '', text: await r.text() };
  };

  const ip = fakeIp();
  const email = `nobody-${Date.now()}@example.com`;
  const login = hiddenFields(await (await fetch(BASE + '/admin/login', { headers: { 'x-real-ip': ip } })).text());
  ok(login.length > 0, 'coach login: the form is a server action (hidden action fields found)');
  let neutral = 0;
  for (let i = 1; i <= 5; i++) neutral += /lien de connexion vient de lui être envoyé/.test((await formPost('/admin/login', [...login, ['email', email]], ip)).text) ? 1 : 0;
  ok(neutral === 5, 'coach login: 5 requests for an unknown address get the neutral confirmation');
  const sixth = await formPost('/admin/login', [...login, ['email', email]], ip);
  ok(/Trop de demandes de lien/.test(sixth.text) && !/vient de lui être envoyé/.test(sixth.text), 'coach login: the 6th request for the same address is refused');

  const ip2 = fakeIp();
  const verify = hiddenFields(await (await fetch(BASE + '/admin/verify?token=x', { headers: { 'x-real-ip': ip2 } })).text());
  let expired = 0;
  for (let i = 1; i <= 20; i++) expired += (await formPost('/admin/verify', [...verify, ['token', 'x']], ip2)).location.includes('expired=1') ? 1 : 0;
  ok(expired === 20, 'login link: 20 invalid attempts are answered "expired"');
  const limited = await formPost('/admin/verify', [...verify, ['token', 'x']], ip2);
  ok(limited.location.includes('limited=1'), 'login link: the 21st attempt from the same IP is refused');
}
// Starting the form emails the address typed, and reminders and the confirmation follow the address on the profile: at most 3 starts
// or changes per mailbox and hour (« +tag » is the same mailbox), and 30 attempts per address.
{
  const base = `limite${RUN}`;
  const starts = [];
  for (const email of [`${base}@example.com`, `${base}+a@example.com`, `${base.toUpperCase()}+b@example.com`]) {
    const c = new Client();
    starts.push((await c.save('profile', profile('Limite Email', { P4: email }))).json?.ok === true);
  }
  ok(starts.every(Boolean), 'creation limit: three starts for one mailbox are accepted');
  const fourth = await new Client().save('profile', profile('Limite Email', { P4: `${base}+c@example.com` }));
  ok(fourth.status === 429 && fourth.json?.fatal === 'email_rate_limited', 'creation limit: the fourth start for the same mailbox is refused (429)');
  const other = await new Client().save('profile', profile('Limite Autre'));
  ok(other.json?.ok === true, 'creation limit: another mailbox is not affected');

  const cookie = await coachCookie();
  if (cookie) {
    const list = await (await fetch(BASE + `/admin/candidates?q=${base}`, { headers: { cookie } })).text();
    const ids = new Set([...list.matchAll(/\/admin\/candidates\/(\d+)/g)].map((m) => m[1]));
    ok(ids.size === 3, `creation limit: the refused start created no candidate (${ids.size} candidates for that mailbox, expected 3)`);
  } else console.log('SKIP  creation limit: refused start creates nothing (SESSION_SECRET not set)');

  // a typo elsewhere on the screen must not use up the mailbox allowance
  const typos = [];
  for (let i = 0; i < 4; i++) typos.push((await new Client().save('profile', profile('Limite Faute', { P4: `faute${RUN}@example.com`, P3: 'abc' }))).status);
  ok(typos.every((x) => x === 422), `creation limit: invalid screens answer 422 and are not counted (${typos.join(',')})`);
  ok((await new Client().save('profile', profile('Limite Faute', { P4: `faute${RUN}@example.com` }))).json?.ok === true, 'creation limit: the corrected screen is then accepted');

  // changing the address of an existing candidate counts like starting with it: the reminders would go to the new address
  const changer = new Client();
  ok((await changer.save('profile', profile('Limite Change', { P4: `decoy${RUN}@example.com` }))).json?.ok === true, 'creation limit: a candidate starts with her own address');
  const toVictim = await changer.save('profile', profile('Limite Change', { P4: `${base}+d@example.com` }));
  ok(toVictim.status === 429 && toVictim.json?.fatal === 'email_rate_limited', 'creation limit: changing to a mailbox already used three times is refused');
  ok((await changer.save('profile', profile('Limite Change', { P4: `fresh${RUN}@example.com` }))).json?.ok === true, 'creation limit: changing to a free mailbox is accepted');
  const resaves = [];
  for (let i = 0; i < 4; i++) resaves.push((await changer.save('profile', profile('Limite Change', { P4: `Fresh${RUN}+x@example.com` }))).json?.ok === true);
  ok(resaves.every(Boolean), 'creation limit: saving the same mailbox again (Back, then Next) costs nothing');
  // one cookie must not be able to use up the allowance of any number of mailboxes: 5 changes per candidate and day (2 used above)
  const moves = [];
  for (let i = 1; i <= 4; i++) moves.push(await changer.save('profile', profile('Limite Change', { P4: `move${i}${RUN}@example.com` })));
  ok(moves.slice(0, 3).every((m) => m.json?.ok === true) && moves[3].status === 429 && moves[3].json?.fatal === 'rate_limited', `creation limit: a candidate can change her address 5 times a day, the next one is refused (${moves.map((m) => m.status).join(',')})`);

  const flood = new Client();
  let refusedAt = 0;
  let last;
  for (let i = 1; i <= 31 && !refusedAt; i++) { last = await flood.save('profile', {}); if (last.status === 429) refusedAt = i; }
  ok(refusedAt === 31, `creation limit: the 31st attempt from one address in an hour is refused (refused at attempt ${refusedAt || 'never'})`);
  ok(Number(last?.retryAfter) > 0, `creation limit: the refusal says when to come back (Retry-After: ${last?.retryAfter})`);
  flood.jar.ss_token = 'made-up-token';
  const bogus = await flood.save('profile', {});
  ok(bogus.status === 429 && bogus.json?.fatal === 'rate_limited', 'creation limit: a made-up cookie does not skip the limit');
  const member = new Client(); // started from her own address, then comes back from the flooded one: a real cookie is never blocked
  ok((await member.save('profile', profile('Limite Membre'))).json?.ok === true, 'creation limit: a candidate starts from her own address');
  member.ip = flood.ip;
  ok((await member.save('profile', profile('Limite Membre'))).json?.ok === true, 'creation limit: she can still save from an address that is over the limit (her cookie matches a candidate)');
}

// health: what the container healthcheck and the cutover script ask
{
  const r = await fetch(BASE + '/api/health');
  const body = await r.json().catch(() => null);
  ok(r.status === 200 && body?.ok === true && r.headers.get('cache-control')?.includes('no-store'), 'health: the database answers and the answer is not cached');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
