// Épisode 1 — the phone close-up: the neighbour types the address, the landing page opens, then she fills the
// interest form (real screen titles and options from src/lib/questions.ts) and sends it.
(function () {
  const C = SS.C;
  const { prog, keys, ease } = SS;
  const L = { bg: '#F4F3F7', ink: '#111528', soft: '#2E3350', muted: '#4F5570', line: '#C9CCDA', amber: '#8A5300' };
  const W = SS.SCREEN.w;
  const URL = 'shespeaks.techiesconnect.org';
  const TYPE = { start: 13.45, dur: 2.1 };
  const LOGO = '../../public/brand/shespeaks-logo';

  // When each page slides in (index along the strip of pages).
  const PAGES = [[17.15, 0], [17.5, 1], [19.95, 1], [20.3, 2], [21.45, 2], [21.8, 3], [22.8, 3], [23.1, 4], [23.55, 4], [23.85, 5], [24.75, 5], [25.05, 6]];

  const NB_TAPS = [
    ...[...URL].map((ch, i) => { const [x, y] = SS.keyCenter(ch); return { t: TYPE.start + (i * TYPE.dur) / URL.length, x, y }; }),
    { t: TYPE.start + TYPE.dur + 0.15, ...xy(SS.keyCenter('\n')) },
    { t: 16.9, x: 256, y: 948 },
  ];
  const HER_TAPS = [
    { t: 18.45, x: 300, y: 570 }, { t: 19.2, x: 220, y: 741 }, { t: 19.45, x: 300, y: 990 }, { t: 19.85, x: 328, y: 1288 },
    { t: 20.6, x: 300, y: 591 }, { t: 21.0, x: 208, y: 1020 }, { t: 21.35, x: 328, y: 1288 },
    { t: 21.95, x: 181, y: 581 }, { t: 22.35, x: 300, y: 979 }, { t: 22.7, x: 328, y: 1288 },
    { t: 23.3, x: 300, y: 570 }, { t: 23.5, x: 328, y: 1288 },
    { t: 24.65, x: 328, y: 1288 },
  ];
  function xy([x, y]) { return { x, y }; }

  const text = (x, y, size, fill, s, extra = '') => `<text x="${x}" y="${y}" font-family="Archivo" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`;
  const label = (y, s, size = 26) => text(36, y, size, L.soft, s, 'font-weight="600" data-max="584"');

  function input(id, y, lab, placeholder = '') {
    return `${label(y, lab)}<rect x="36" y="${y + 20}" width="584" height="80" rx="14" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      <text id="${id}" x="60" y="${y + 72}" font-family="Archivo" font-size="30" fill="${L.ink}">${placeholder}</text>`;
  }
  function chip(id, x, y, w, s) {
    return `<rect id="${id}-bg" x="${x}" y="${y}" width="${w}" height="72" rx="36" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      <text id="${id}-tx" x="${x + w / 2}" y="${y + 46}" text-anchor="middle" font-family="Archivo" font-weight="600" font-size="26" fill="${L.soft}">${s}</text>`;
  }
  function option(id, y, lines) {
    const h = lines.length > 1 ? 120 : 92;
    return `<rect id="${id}-bg" x="36" y="${y}" width="584" height="${h}" rx="18" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      <circle id="${id}-dot" cx="80" cy="${y + h / 2}" r="15" fill="#FFFFFF" stroke="${C.muted}" stroke-width="3"/>
      ${lines.map((s, i) => text(116, y + (lines.length > 1 ? 52 + i * 36 : 56), 26, L.ink, s)).join('')}`;
  }
  const select = (id, p) => {
    SS.attr(`${id}-bg`, { fill: SS.mix('#FFFFFF', '#FFF1D6', p), stroke: SS.mix(L.line, C.amber, p), 'stroke-width': 2 + p * 2 });
    const dot = SS.$(`${id}-dot`);
    if (dot) dot.setAttribute('fill', SS.mix('#FFFFFF', C.amber, p));
  };
  const selectChip = (id, p) => {
    SS.attr(`${id}-bg`, { fill: SS.mix('#FFFFFF', C.amber, p), stroke: SS.mix(L.line, C.amber, p) });
    SS.attr(`${id}-tx`, { fill: SS.mix(L.soft, C.night, p) });
  };
  const button = (id, s) => `<rect id="${id}" x="36" y="1240" width="584" height="96" rx="48" fill="${C.amber}"/>
    ${text(328, 1300, 32, C.night, s, 'text-anchor="middle" font-weight="700"')}`;

  function formPage(i, block, title, progress, body, cta = SS.t('Continuer', 'Continue')) {
    return `<g id="pg${i}"><rect width="${W}" height="1406" fill="${L.bg}"/>
      ${SS.statusBar(false)}${SS.addressBar(`url${i}`, false, `${URL}/interet`)}
      <image href="${LOGO}-clair.svg" x="36" y="196" height="70" width="171"/>
      <rect x="36" y="300" width="584" height="10" rx="5" fill="#E6E4EC"/><rect x="36" y="300" width="${584 * progress}" height="10" rx="5" fill="${C.amber}"/>
      <text x="36" y="374" font-family="IBM Plex Mono" font-weight="500" font-size="22" letter-spacing="3" fill="${L.amber}">${block}</text>
      ${text(36, 440, 50, L.ink, title, 'font-weight="800" data-max="584"')}
      ${body}${button(`pg${i}-btn`, cta)}</g>`;
  }

  function landingPage() {
    return `<g id="pg0"><rect width="${W}" height="1406" fill="${C.raised}"/>
      ${SS.statusBar(true)}${SS.addressBar('url0', true, '')}
      <rect id="loading" x="30" y="172" width="0" height="5" rx="2.5" fill="${C.amber}"/>
      <g id="newtab">${text(328, 520, 30, C.muted, SS.t('Rechercher ou saisir une adresse', 'Search or type a URL'), 'text-anchor="middle"')}</g>
      <g id="land">
        <rect y="180" width="${W}" height="1226" fill="${C.night}"/>
        <image href="${LOGO}-nuit.svg" x="36" y="196" height="84" width="205"/>
        <path d="M562 222 h46 M562 238 h46 M562 254 h46" stroke="${C.ink}" stroke-width="4" stroke-linecap="round"/>
        <text font-family="IBM Plex Mono" font-weight="500" font-size="19" letter-spacing="2.5" fill="${C.amber}"><tspan x="36" y="360">${SS.t('ACCOMPAGNER LA NOUVELLE GÉNÉRATION', 'SUPPORTING THE NEXT GENERATION')}</tspan><tspan x="36" y="392">${SS.t('DE FEMMES SPEAKERS', 'OF WOMEN SPEAKERS')}</tspan></text>
        <text font-family="Archivo" font-weight="800" font-size="66" fill="${C.ink}">${SS.t(`<tspan x="36" y="490">Prends la parole</tspan><tspan x="36" y="566">sur les <tspan fill="${C.amber}">scènes</tspan></tspan><tspan x="36" y="642" fill="${C.amber}">de la tech.</tspan>`,
          `<tspan x="36" y="490">Take the floor</tspan><tspan x="36" y="566">on <tspan fill="${C.amber}">tech</tspan></tspan><tspan x="36" y="642" fill="${C.amber}">stages.</tspan>`)}</text>
        <text font-family="Archivo" font-size="27" fill="${C.soft}">${SS.t(['SheSpeaks accompagne les jeunes', 'professionnelles et les étudiantes de', 'la tech pour qu’elles prennent la', 'parole lors des événements tech.'],
          ['SheSpeaks supports young', 'professionals and students in tech', 'so they speak at tech events.']).map((l, i) => `<tspan x="36" y="${730 + i * 38}">${l}</tspan>`).join('')}</text>
        <rect x="36" y="900" width="440" height="96" rx="48" fill="${C.amber}"/>
        ${text(256, 960, 32, C.night, SS.t('Soumettre mon intérêt', 'Submit my interest'), 'text-anchor="middle" font-weight="700"')}
        <image href="../../public/landing/hero-wide.webp" x="0" y="1050" width="${W}" height="356" preserveAspectRatio="xMidYMid slice"/>
      </g>
      <g id="kbWrap">${SS.keyboard('kb')}</g>
    </g>`;
  }

  function confirmPage() {
    const steps = SS.t(['Sujet et candidature', 'Préparation', 'Slides', 'Répétition', 'Jour J'], ['Topic and application', 'Preparation', 'Slides', 'Speech rehearsal', 'Talk day']);
    return `<g id="pg6"><rect width="${W}" height="1406" fill="${L.bg}"/>
      ${SS.statusBar(false)}${SS.addressBar('url6', false, `${URL}/interet`)}
      <g id="okCheck"><circle cx="328" cy="420" r="74" fill="${C.amber}"/>
        <path d="M292 422 L318 448 L366 396" stroke="${C.night}" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
      <text x="328" y="560" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="24" letter-spacing="3" fill="${L.amber}">${SS.t('INTÉRÊT ENVOYÉ', 'INTEREST SUBMITTED')}</text>
      <text text-anchor="middle" font-family="Archivo" font-weight="800" font-size="44" fill="${L.ink}"><tspan x="328" y="634">${SS.t('L’équipe SheSpeaks a bien', 'The SheSpeaks team has')}</tspan><tspan x="328" y="688">${SS.t('reçu ton formulaire', 'received your form')}</tspan></text>
      <text text-anchor="middle" font-family="Archivo" font-size="27" fill="${L.muted}"><tspan x="328" y="760">${SS.t('On le relit et on revient vers toi', 'We are reading it and will get back')}</tspan><tspan x="328" y="798">${SS.t('sur WhatsApp ou par email.', 'to you on WhatsApp or by email.')}</tspan></text>
      <rect x="36" y="870" width="584" height="470" rx="24" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      <text x="72" y="930" font-family="IBM Plex Mono" font-weight="500" font-size="22" letter-spacing="3" fill="${L.amber}">${SS.t('TON PLAN DE ROUTE', 'YOUR ROADMAP')}</text>
      <path d="M86 990 V1270" stroke="${L.line}" stroke-width="4"/>
      ${steps.map((s, i) => `<circle cx="86" cy="${990 + i * 70}" r="14" fill="${i === 0 ? C.amber : '#FFFFFF'}" stroke="${i === 0 ? C.amber : C.muted}" stroke-width="3"/>${text(120, 999 + i * 70, 28, L.ink, s, i === 0 ? 'font-weight="700"' : '')}`).join('')}
    </g>`;
  }

  SS.ep1Phone = {
    build() {
      const pages = [
        landingPage(),
        formPage(1, SS.t('TON PROFIL', 'ABOUT YOU'), SS.t('Faisons connaissance', 'Let’s get to know you'), 0.16,
          `${input('v1', 510, SS.t('Ton nom complet', 'Your full name'))}
           ${label(680, SS.t('À quel événement veux-tu participer ?', 'Which event do you want to take part in?'))}
           ${chip('ev1', 36, 705, 380, 'DevFest Yaoundé 2026')}${chip('ev2', 36, 795, 360, 'DevFest Douala 2026')}
           ${input('v3', 930, SS.t('Ton numéro WhatsApp', 'Your WhatsApp number'))}`),
        formPage(2, SS.t('TON EXPÉRIENCE', 'YOUR EXPERIENCE'), SS.t('Ton aisance à l’oral', 'Your comfort with public speaking'), 0.34,
          `${label(520, SS.t('Ton expérience de la prise de parole', 'Your public-speaking experience'))}
           ${option('x1', 545, SS.t(['Ce sera ma première fois'], ['This will be my first time']))}${option('x2', 649, SS.t(['J’ai parlé en meetup, en cours', 'ou en entreprise'], ['I have spoken at a meetup, in', 'class or at work']))}${option('x3', 781, SS.t(['J’ai déjà parlé en conférence'], ['I have already spoken at a conference']))}
           ${label(940, SS.t('À quel point te sens-tu à l’aise à l’oral ?', 'How comfortable do you feel speaking in public?'), 25)}
           ${[1, 2, 3, 4, 5].map((n, i) => `<circle id="sc${n}" cx="${88 + i * 120}" cy="1020" r="42" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>${text(88 + i * 120, 1031, 30, L.ink, n, 'text-anchor="middle" font-weight="700"')}`).join('')}
           ${text(46, 1104, 21, L.muted, SS.t('pas du tout à l’aise', 'not comfortable at all'))}${text(610, 1104, 21, L.muted, SS.t('très à l’aise', 'very comfortable'), 'text-anchor="end"')}`),
        formPage(3, SS.t('TON PROJET', 'YOUR PROJECT'), SS.t('Ton projet de talk', 'Your talk project'), 0.52,
          `${label(520, SS.t('Quel format te tente ?', 'Which format appeals to you?'))}
           ${chip('f1', 36, 545, 290, 'Talk (20–30 min)')}${chip('f2', 340, 545, 280, 'Lightning talk')}${chip('f3', 36, 635, 290, SS.t('Atelier pratique', 'Hands-on workshop'))}${chip('f4', 340, 635, 280, SS.t('Conseillez-moi', 'Advise me'))}
           ${label(790, SS.t('Où en es-tu avec ton sujet ?', 'Where are you with your topic?'))}
           ${option('t1', 815, SS.t(['Je cherche encore mon sujet'], ['I’m still looking for my topic']))}${option('t2', 919, SS.t(['J’ai un domaine qui m’intéresse,', 'mais pas encore de sujet précis'], ['I have a field I like, but no', 'specific topic yet']))}${option('t3', 1051, SS.t(['J’ai un sujet précis, mais je ne', 'l’ai pas encore rédigé'], ['I have a specific topic, but I', 'haven’t written it up yet']))}`),
        formPage(4, SS.t('TON SUJET', 'YOUR TOPIC'), SS.t('Ton domaine de prédilection', 'Your favourite field'), 0.7,
          `${input('v4', 510, SS.t('Ton domaine', 'Your field'), SS.t('Data &amp; IA', 'Data &amp; AI'))}<path d="M580 562 l12 12 l12 -12" stroke="${L.muted}" stroke-width="4" fill="none"/>
           ${input('v5', 680, SS.t('Précise si tu veux (sous-thème, techno…)', 'Narrow it down if you like (sub-topic, tech…)'))}
           ${label(850, SS.t('À qui s’adresse ton talk ?', 'Who is your talk for?'))}${chip('a1', 36, 875, 270, SS.t('Débutant·es', 'Beginners'))}${chip('a2', 320, 875, 300, SS.t('Intermédiaires', 'Intermediate'))}`),
        formPage(5, SS.t('TON SUJET', 'YOUR TOPIC'), SS.t('Ton angle et ton vécu', 'Your angle and experience'), 0.9,
          `${label(520, SS.t('Ton vécu dans ce domaine : un projet,', 'Your experience in this field:'))}${label(556, SS.t('une réussite, une galère', 'a project, a win, a struggle'))}
           <rect x="36" y="580" width="584" height="300" rx="14" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
           <text id="v6" font-family="Archivo" font-size="30" fill="${L.ink}"><tspan id="v6a" x="60" y="634"></tspan><tspan id="v6b" x="60" y="676"></tspan><tspan id="v6c" x="60" y="718"></tspan><tspan id="v6d" x="60" y="760"></tspan></text>`,
          SS.t('Envoyer mon intérêt', 'Submit my interest')),
        confirmPage(),
      ];
      return pages.map((p, i) => `<g id="strip${i}">${p}</g>`).join('');
    },

    seek(t) {
      const idx = keys(t, PAGES);
      for (let i = 0; i <= 6; i++) SS.attr(`strip${i}`, { transform: `translate(${(i - idx) * W} 0)` });

      // Typing the address on the neighbour's phone.
      const n = Math.floor(SS.clamp((t - TYPE.start) / TYPE.dur) * URL.length + (t >= TYPE.start ? 1 : 0));
      const typed = URL.slice(0, Math.min(n, URL.length));
      const caret = t < TYPE.start + TYPE.dur + 0.15 && Math.floor(t * 3) % 2 === 0 ? '|' : '';
      SS.$('url0').textContent = typed + caret;
      SS.opacity('newtab', typed ? 0 : 1);
      [...URL].forEach((ch, i) => {
        const at = TYPE.start + (i * TYPE.dur) / URL.length;
        SS.pressKey('kb', ch, SS.pulse(t, at - 0.02, 0.12));
      });
      SS.attr('kbWrap', { transform: `translate(0 ${520 * prog(t, 15.8, 0.3)})` });
      SS.attr('loading', { width: 596 * prog(t, 15.75, 0.4, ease.out), opacity: 1 - prog(t, 16.2, 0.2) });
      SS.opacity('land', prog(t, 16.05, 0.35));

      // Screen 1: name, event, WhatsApp.
      SS.$('v1').textContent = 'Aïcha M.'.slice(0, Math.round(prog(t, 18.55, 0.5, ease.linear) * 8));
      selectChip('ev1', prog(t, 19.2, 0.15));
      SS.$('v3').textContent = '+237 6•• •• •• ••'.slice(0, Math.round(prog(t, 19.5, 0.35, ease.linear) * 17));
      // Screen 2: first time on stage, comfort 2/5.
      select('x1', prog(t, 20.6, 0.15));
      SS.attr('sc2', { fill: SS.mix('#FFFFFF', C.amber, prog(t, 21.0, 0.15)), stroke: SS.mix(L.line, C.amber, prog(t, 21.0, 0.15)) });
      // Screen 3: a talk; she has a field she likes, not a precise topic yet.
      selectChip('f1', prog(t, 21.95, 0.15));
      select('t2', prog(t, 22.35, 0.15));
      // Screen 4–5: her field, then what she did yesterday.
      const field = SS.t('Agents IA', 'AI agents');
      SS.$('v5').textContent = field.slice(0, Math.round(prog(t, 23.3, 0.2, ease.linear) * field.length));
      selectChip('a2', prog(t, 23.4, 0.1));
      const story = SS.t(['Hier, j’ai créé un agent IA', 'qui trie les tickets du', 'support de mon équipe.'], ['Yesterday I built an AI agent', 'that sorts my team’s', 'support tickets.']);
      const typedChars = Math.round(prog(t, 23.95, 0.6, ease.linear) * story.join('').length);
      let left = typedChars;
      ['v6a', 'v6b', 'v6c'].forEach((id, i) => { SS.$(id).textContent = story[i].slice(0, Math.max(0, left)); left -= story[i].length; });
      SS.attr('okCheck', { transform: SS.zoom(ease.back(SS.clamp((t - 25.1) / 0.4)), 328, 420) });

      // Taps: the touch dot follows the neighbour's typing, then hers.
      if (t < 17.7) SS.touch('touch', t, NB_TAPS, [560, 1300]);
      else SS.touch('touch', t, HER_TAPS, [560, 1330]);
      SS.ripple('ph', t, t < 17.7 ? NB_TAPS.slice(-1) : HER_TAPS);
      for (const part of ['hNb', 'hNb-back']) SS.opacity(part, 1 - prog(t, 17.65, 0.3));
      for (const part of ['hHer', 'hHer-back']) SS.opacity(part, prog(t, 17.75, 0.3));
      // Hand-off: the phone swings over to her.
      const dx = keys(t, [[17.45, 0], [17.8, -70], [18.2, 0]]);
      const rot = keys(t, [[17.45, 0], [17.8, -5], [18.2, 0]]);
      SS.attr('phoneRig', { transform: `translate(${dx} 0) rotate(${rot} 540 1000)` });
      SS.opacity('caption', prog(t, 18.3, 0.35) * (1 - prog(t, 24.6, 0.3)));
    },
  };
})();
