// Épisode 2 — the phone close-up: the SheSpeaks team's message with three topic ideas, the review checklist
// (real items from src/lib/questions.ts), the DevFest call for speakers, then a lock screen with the organisers' answer.
(function () {
  const C = SS.C;
  const { prog, keys, ease } = SS;
  const L = { bg: '#F4F3F7', chat: '#E9E7EF', ink: '#111528', soft: '#2E3350', muted: '#4F5570', line: '#C9CCDA', amber: '#8A5300' };
  const W = SS.SCREEN.w;
  const TITLE = SS.t('Mon premier agent IA en production', 'My first AI agent in production');

  const PAGES = [[9.7, 0], [10.0, 1], [11.95, 1], [12.25, 2], [13.85, 2], [14.15, 3], [14.95, 3], [15.25, 4]];
  const TAPS = [{ t: 7.0, x: 328, y: 530 }, { t: 13.6, x: 328, y: 1288 }];
  const GRID = SS.t(['Titre clair et court', 'Résumé de bonne longueur', 'Public visé explicite', 'Bénéfice explicite', 'Deux ou trois idées clés repérables'],
    ['Clear, short title', 'Abstract of the right length', 'Explicit target audience', 'Explicit benefit', 'Two or three identifiable key ideas']);

  const text = (x, y, size, fill, s, extra = '') => `<text x="${x}" y="${y}" font-family="Archivo" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`;
  const lines = (x, y, size, fill, ls, gap, extra = '') => `<text font-family="Archivo" font-size="${size}" fill="${fill}" ${extra}>${ls.map((l, i) => `<tspan x="${x}" y="${y + i * gap}">${l}</tspan>`).join('')}</text>`;

  // Chat bubbles: from the team (left, white) or from her (right, amber tint).
  function bubble(id, y, ls, w, mine = false) {
    const h = 30 + ls.length * 38;
    const x = mine ? W - 30 - w : 30;
    return `<g id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="${mine ? '#FFE7B8' : '#FFFFFF'}"/>
      ${lines(x + 26, y + 46, 28, L.ink, ls, 38)}</g>`;
  }
  function typing(id, y) {
    return `<g id="${id}"><rect x="30" y="${y}" width="120" height="68" rx="26" fill="#FFFFFF"/>
      ${[0, 1, 2].map((i) => `<circle id="${id}-d${i}" cx="${66 + i * 24}" cy="${y + 34}" r="8" fill="${C.muted}"/>`).join('')}</g>`;
  }
  function idea(id, y, n, ls) {
    const h = ls.length > 1 ? 116 : 88;
    return `<g id="${id}"><rect id="${id}-bg" x="30" y="${y}" width="596" height="${h}" rx="22" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      <circle id="${id}-n" cx="80" cy="${y + h / 2}" r="24" fill="#E6E4EC"/>
      ${text(80, y + h / 2 + 9, 26, L.ink, n, 'text-anchor="middle" font-weight="700"')}
      ${lines(124, y + (ls.length > 1 ? 50 : 54), 26, L.ink, ls, 36, 'font-weight="600"')}</g>`;
  }

  function chatPage() {
    return `<g id="pg0"><rect width="${W}" height="1406" fill="${L.chat}"/>
      <rect width="${W}" height="236" fill="${C.night}"/>${SS.statusBar(true)}
      <path d="M52 152 L36 170 L52 188" stroke="${C.ink}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="120" cy="170" r="44" fill="${C.raised}"/>
      <image href="../../public/brand/shespeaks-symbole-nuit.svg" x="84" y="134" width="72" height="72"/>
      ${text(182, 162, 30, C.ink, SS.t('Équipe SheSpeaks', 'SheSpeaks team'), 'font-weight="700"')}
      ${text(182, 200, 22, '#7BD8A4', SS.t('en ligne', 'online'))}
      ${typing('ty1', 260)}
      ${bubble('m1', 260, SS.t(['Salut Aïcha ! On a lu ton', 'formulaire 🙌'], ['Hi Aïcha! We read your', 'form 🙌']), 400)}
      ${bubble('m2', 392, SS.t(['Voici 3 idées de sujets pour toi :'], ['Here are 3 topic ideas for you:']), 520)}
      ${idea('c1', 486, '1', [TITLE])}
      ${idea('c2', 588, '2', SS.t(['Trier 500 tickets par jour', 'avec un agent IA'], ['Sorting 500 tickets a day', 'with an AI agent']))}
      ${idea('c3', 718, '3', SS.t(['Agents IA : ce qui marche,', 'ce qui casse'], ['AI agents: what works,', 'what breaks']))}
      ${bubble('m4', 856, SS.t(['Le 1 !! 😍'], ['Number 1!! 😍']), SS.t(210, 250), true)}
      ${typing('ty2', 950)}
      ${bubble('m5', 950, SS.t(['Top ! On prépare ta', 'proposition ensemble 💪'], ['Great! Let’s prepare your', 'proposal together 💪']), 410)}
      <rect x="30" y="1300" width="596" height="76" rx="38" fill="#FFFFFF"/>${text(64, 1348, 26, C.muted, 'Message')}
    </g>`;
  }

  function gridPage() {
    const items = GRID.map((g, i) => {
      const y = 690 + i * 100;
      return `<rect x="30" y="${y - 40}" width="596" height="84" rx="18" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
        <g id="gk${i}"><circle cx="76" cy="${y + 2}" r="22" fill="#FFFFFF" stroke="${C.muted}" stroke-width="3"/>
        <path id="gk${i}-tick" d="M64 ${y + 3} L73 ${y + 12} L89 ${y - 6}" stroke="${C.night}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0"/></g>
        ${text(116, y + 11, 27, L.ink, g, 'data-max="490"')}`;
    }).join('');
    return `<g id="pg1"><rect width="${W}" height="1406" fill="${L.bg}"/>
      ${SS.statusBar(false)}${SS.addressBar('u1', false, 'shespeaks.techiesconnect.org/interet')}
      <image href="../../public/brand/shespeaks-logo-clair.svg" x="36" y="196" height="70" width="171"/>
      <text x="36" y="330" font-family="IBM Plex Mono" font-weight="500" font-size="22" letter-spacing="3" fill="${L.amber}">${SS.t('TA PROPOSITION', 'YOUR PROPOSAL')}</text>
      ${text(36, 394, 48, L.ink, SS.t('La grille de relecture', 'Review checklist'), 'font-weight="800"')}
      <rect x="30" y="430" width="596" height="150" rx="18" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      ${text(60, 480, 22, L.muted, SS.t('Titre', 'Title'), 'font-weight="600"')}${text(60, 530, 27, L.ink, TITLE, 'font-weight="700" data-max="540"')}
      ${items}</g>`;
  }

  function cfpPage() {
    const bars = [0, 1, 2, 3].map((i) => `<rect x="56" y="${760 + i * 40}" width="${[520, 480, 540, 300][i]}" height="14" rx="7" fill="#D9D7E0"/>`).join('');
    return `<g id="pg2"><rect width="${W}" height="1406" fill="#FFFFFF"/>
      ${SS.statusBar(false)}${SS.addressBar('u2', false, 'devfest.gdgyaounde.com/speakers')}
      <text x="36" y="262" font-family="IBM Plex Mono" font-weight="500" font-size="22" letter-spacing="3" fill="${L.muted}">DEVFEST YAOUNDÉ 2026</text>
      ${text(36, 330, 52, L.ink, 'Call for Speakers', 'font-weight="800"')}
      ${text(36, 430, 24, L.soft, 'Session title', 'font-weight="600"')}
      <rect x="36" y="450" width="584" height="80" rx="10" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      <text id="cfpTitle" x="58" y="502" font-family="Archivo" font-size="26" fill="${L.ink}"></text>
      ${text(36, 600, 24, L.soft, 'Abstract', 'font-weight="600"')}
      <rect x="36" y="620" width="584" height="320" rx="10" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      <g id="cfpBars">${bars}</g>
      ${text(36, 1010, 24, L.soft, 'Format', 'font-weight="600"')}
      <rect x="36" y="1030" width="584" height="80" rx="10" fill="#FFFFFF" stroke="${L.line}" stroke-width="2"/>
      ${text(58, 1082, 26, L.ink, 'Talk · 30 min')}<path d="M580 1064 l12 12 l12 -12" stroke="${L.muted}" stroke-width="4" fill="none"/>
      <rect id="cfpBtn" x="36" y="1240" width="584" height="96" rx="14" fill="${L.ink}"/>
      ${text(328, 1300, 32, C.ink, 'Submit', 'text-anchor="middle" font-weight="700"')}
    </g>`;
  }

  function submittedPage() {
    return `<g id="pg3"><rect width="${W}" height="1406" fill="#FFFFFF"/>
      ${SS.statusBar(false)}${SS.addressBar('u3', false, 'devfest.gdgyaounde.com/speakers')}
      <g id="sentCheck"><circle cx="328" cy="560" r="84" fill="#1B6B3F"/>
        <path d="M290 562 L318 590 L368 536" stroke="#FFFFFF" stroke-width="12" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
      ${text(328, 730, 48, L.ink, 'Session submitted', 'text-anchor="middle" font-weight="800"')}
      ${lines(328, 800, 27, L.muted, ['Thank you! The organizers will', 'review all proposals after the', 'deadline.'], 40, 'text-anchor="middle"')}
    </g>`;
  }

  function lockPage() {
    return `<g id="pg4">
      <linearGradient id="lockBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1226"/><stop offset="1" stop-color="#2E3350"/></linearGradient>
      <rect width="${W}" height="1406" fill="url(#lockBg)"/>${SS.statusBar(true, '')}
      ${text(328, 400, 150, C.ink, '18:42', 'text-anchor="middle" font-weight="700"')}
      ${text(328, 462, 32, C.soft, SS.t('jeudi 5 novembre', 'Thursday, 5 November'), 'text-anchor="middle"')}
      <g id="notif">
        <rect x="26" y="540" width="604" height="230" rx="36" fill="${C.ink}" opacity="0.95"/>
        <rect x="56" y="572" width="60" height="60" rx="14" fill="${C.night}"/>
        <path d="M68 588 h36 v28 h-36 z M68 588 l18 14 l18 -14" stroke="${C.ink}" stroke-width="3.5" fill="none" stroke-linejoin="round"/>
        ${text(134, 598, 24, C.muted, 'Mail')}${text(600, 598, 22, C.muted, SS.t('maintenant', 'now'), 'text-anchor="end"')}
        ${text(134, 634, 28, L.ink, 'DevFest Yaoundé 2026', 'font-weight="700"')}
        ${text(56, 690, 28, L.ink, SS.t('Félicitations, ta session est retenue 🎉', 'Congratulations, your session is accepted 🎉'), 'data-max="550"')}
        ${text(56, 734, 25, L.muted, SS.t(`« ${TITLE} »`, `“${TITLE}”`), 'data-max="550"')}
      </g>
    </g>`;
  }

  // Reveal a chat item: fade in and slide up a little.
  const show = (t, id, at, out = Infinity) => {
    const p = prog(t, at, 0.3, ease.out) * (1 - prog(t, out, 0.15));
    SS.opacity(id, p);
    SS.attr(id, { transform: `translate(0 ${(1 - prog(t, at, 0.3, ease.out)) * 24})` });
  };
  const dots = (t, id) => [0, 1, 2].forEach((i) => SS.attr(`${id}-d${i}`, { transform: `translate(0 ${-6 * Math.max(0, Math.sin(t * 9 - i * 0.9))})` }));

  SS.ep2Phone = {
    build() {
      return [chatPage(), gridPage(), cfpPage(), submittedPage(), lockPage()].map((p, i) => `<g id="strip${i}">${p}</g>`).join('');
    },
    seek(t) {
      const idx = keys(t, PAGES);
      for (let i = 0; i <= 4; i++) SS.attr(`strip${i}`, { transform: `translate(${(i - idx) * W} 0)` });

      // The team writes, offers three ideas; she picks the first.
      show(t, 'ty1', 3.9, 4.35); dots(t, 'ty1');
      show(t, 'm1', 4.4);
      show(t, 'm2', 4.95);
      show(t, 'c1', 5.35); show(t, 'c2', 5.6); show(t, 'c3', 5.85);
      const pick = prog(t, 7.0, 0.2);
      SS.attr('c1-bg', { fill: SS.mix('#FFFFFF', C.amber, pick), stroke: SS.mix(L.line, C.amber, pick) });
      SS.attr('c1-n', { fill: SS.mix('#E6E4EC', '#FFFFFF', pick) });
      show(t, 'm4', 7.5);
      show(t, 'ty2', 7.85, 8.3); dots(t, 'ty2');
      show(t, 'm5', 8.35);

      // The review checklist ticks itself, item by item.
      GRID.forEach((_, i) => {
        const p = prog(t, 10.3 + i * 0.3, 0.2);
        SS.attr(`gk${i}`, { transform: SS.zoom(1 + 0.25 * SS.pulse(t, 10.3 + i * 0.3, 0.3), 76, 692 + i * 100) });
        SS.$(`gk${i}`).firstElementChild.setAttribute('fill', SS.mix('#FFFFFF', C.amber, p));
        SS.opacity(`gk${i}-tick`, p);
      });

      // Call for speakers: the title fills in, she submits.
      SS.$('cfpTitle').textContent = TITLE.slice(0, Math.round(prog(t, 12.35, 0.6, ease.linear) * TITLE.length));
      SS.opacity('cfpBars', prog(t, 12.9, 0.3));
      SS.attr('sentCheck', { transform: SS.zoom(ease.back(SS.clamp((t - 14.15) / 0.4)), 328, 560) });

      // Lock screen: the organisers' answer drops in.
      const drop = prog(t, 15.6, 0.45, ease.back);
      SS.attr('notif', { transform: `translate(0 ${(1 - drop) * -320})` });
      SS.opacity('notif', prog(t, 15.6, 0.2));

      SS.touch('touch', t, TAPS, [560, 1330]);
      SS.ripple('ph', t, TAPS);
    },
  };
})();
