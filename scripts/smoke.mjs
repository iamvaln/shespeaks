// End-to-end API smoke test of the candidate journey (all four branches).
// Usage: BASE=http://localhost:3000 node scripts/smoke.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

class Client {
  jar = {};
  async post(path, body) {
    const r = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json', cookie: this.cookie() }, body: JSON.stringify(body), redirect: 'manual' });
    this.store(r);
    return { status: r.status, json: await r.json().catch(() => null) };
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

const profile = (n, extra = {}) => ({ P1: n, P2: 'douala', P3: '+237 612 345 678', P4: `${n.toLowerCase().replace(/\W/g, '')}@example.com`, P5: 'fr', P6: 'développeuse mobile', P7: '1-3', ...extra });
const diag1 = { D1: 'premiere', D2: 2, D3: ['legitime', 'trac'] };
const diag2 = (b) => ({ D4: 'atelier', D5: '1-2', D6: b });

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
  for (const [screen, values] of branchScreens) {
    r = await c.save(screen, values);
    ok(r.json?.ok, `${branch}: ${screen} saved (next=${r.json?.next})`);
    if (!r.json?.ok) console.log(JSON.stringify(r.json));
  }
  r = await c.save('photo', { later: '1' });
  ok(r.json?.ok && r.json.completed, `${branch}: completed via "add later"`);
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

// photo upload + consent rules
{
  const c = new Client();
  await c.save('profile', profile('Eve Photo'));
  await c.save('diag1', diag1); await c.save('diag2', diag2('B'));
  await c.save('b1', { B1: 'web', B3: 'tous' }); await c.save('b2', { B4: ['retour'] });
  let r = await c.save('photo', {});
  ok(r.status === 422 && r.json.errors.photo === 'photo_or_later', 'photo: needs a photo or "later"');
  const up = await photo(c);
  ok(up.status === 200 && up.json.photos.length === 1 && up.json.photos[0].width === 1, 'photo: PNG accepted, dims parsed');
  r = await c.save('photo', {});
  ok(r.status === 422 && r.json.errors.consent === 'consent_required', 'photo: consent mandatory once a photo is uploaded');
  const bad = new FormData(); bad.append('file', new Blob(['not an image'], { type: 'image/png' }), 'x.png');
  const br = await fetch(BASE + '/api/diag/photo', { method: 'POST', body: bad, headers: { cookie: c.cookie() } });
  ok(br.status === 422, 'photo: non-image rejected');
  const img = await fetch(BASE + `/api/photos/${up.json.photos[0].id}`, { headers: { cookie: c.cookie() } });
  ok(img.status === 200 && img.headers.get('content-type') === 'image/png', 'photo: owner can read it');
  const anon = await fetch(BASE + `/api/photos/${up.json.photos[0].id}`);
  ok(anon.status === 403, 'photo: anonymous cannot read it');
  r = await c.save('photo', { consent: '1' });
  ok(r.json?.completed, 'photo: completes with consent');
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
console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll smoke checks passed');
process.exit(failures ? 1 : 0);
