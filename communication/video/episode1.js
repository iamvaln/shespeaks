// Épisode 1 — « Ce que j'ai fait hier ». The hall and her thought bubble, her neighbour's whisper, the phone
// (episode1-phone.js), her pride once the interest is sent, the end card.
(function () {
  const C = SS.C;
  const { prog, keys, pulse, ease, zoom } = SS;
  // Cut to 30 s: the hall and the thought play as written; the whisper, the typing and the form run a little faster
  // (screens 4–5 in fast-forward), with a freeze on the confirmation so it can be read.
  const CUT = SS.edl([
    [0, 2.85], [2.85, 7.5], [7.5, 12.6, 4.8], [12.6, 16.05, 2.65], [16.05, 18.3, 1.8], [18.3, 22.8, 3.4],
    [22.8, 24.6, 1.0], [24.6, 25.45, 0.85], ['hold', 0.5], [25.45, 28.3, 2.6], [28.3, 32.4],
  ]);

  // Heroine in the hall, row 3, seen from behind: the camera pushes in on her.
  const FOCUS = { x: 540, y: 1262 };

  function faceShot() {
    const thought = SS.t(['Ah… si j’osais', 'prendre la parole,', 'je présenterais ce', 'que j’ai fait hier.'],
      ['Ah… if only I dared', 'to take the stage,', 'I’d present what', 'I built yesterday.']);
    const lines = [['l1', thought[0], 278], ['l2', thought[1], 358], ['l3', thought[2], 452], ['l4', thought[3], 532]];
    const text = lines.map(([id, s, y]) => `<text id="${id}" x="196" y="${y}" font-family="Archivo" font-weight="800" font-size="64" fill="${C.night}">${SS.words(id, s)}</text>`).join('');
    const tickets = [0, 1, 2].map((i) => `<g id="tk${i}"><rect x="-34" y="-22" width="68" height="44" rx="7" fill="${C.soft}" stroke="${C.night}" stroke-width="4"/>
      <path d="M-20 -6 H18 M-20 8 H6" stroke="${C.night}" stroke-width="4" stroke-linecap="round"/></g>`).join('');
    const big = `font-family="Archivo" font-weight="800" font-size="64" fill="${C.night}"`;
    return `<g id="face">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="40" cy="260" r="1150" fill="url(#stageLight)"/>
      <g id="faceCam">
        <g filter="url(#blur8)" fill="${C.raised}">
          <circle cx="70" cy="1090" r="70"/><ellipse cx="70" cy="1260" rx="130" ry="110"/>
          <circle cx="1010" cy="1050" r="64"/><ellipse cx="1010" cy="1215" rx="120" ry="100"/>
        </g>
        <g id="nbLean">${SS.person('nb', { hair: 'short', skin: 'deep', outfit: 'sweater', top: '#2A2F4D', badge: true, glasses: true, transform: 'translate(712 1010) scale(1.3)' })}</g>
        <rect id="nbShade" x="700" y="900" width="600" height="1300" fill="${C.night}" opacity="0.35"/>
        <circle id="bandGlow" cx="585" cy="1068" r="80" fill="${C.amber}" filter="url(#blur30)" opacity="0"/>
        ${SS.person('her', { hair: 'braids', skin: 'warm', outfit: 'hoodie', top: '#3A4060', band: C.muted, transform: 'translate(120 770) scale(1.4)' })}
      </g>
      <g id="bubble">
        <circle id="dot1" cx="452" cy="856" r="14" fill="${C.ink}"/>
        <circle id="dot2" cx="398" cy="800" r="25" fill="${C.ink}"/>
        <g id="cloud">${SS.cloud()}
          ${text}
          <path id="underline" d="M198 376 H700" stroke="${C.amber}" stroke-width="10" stroke-linecap="round" fill="none"/>
          <g id="doodle" stroke="${C.night}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <line x1="256" y1="592" x2="256" y2="568"/><circle cx="256" cy="562" r="7" fill="${C.night}"/>
            <rect x="200" y="592" width="112" height="88" rx="22"/>
            <circle cx="236" cy="632" r="8" fill="${C.night}" stroke="none"/><circle cx="276" cy="632" r="8" fill="${C.night}" stroke="none"/>
            <path d="M238 658 Q256 668 274 658"/>
            <path d="M340 636 H420 M404 620 L420 636 L404 652"/>
            <path d="M600 600 V690 H868 V600"/>
          </g>
          ${tickets}
          <g id="check"><circle cx="896" cy="604" r="28" fill="${C.amber}"/><path d="M882 604 L893 615 L912 594" stroke="${C.night}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
        </g>
      </g>
      <g id="proudCaption">
        <text x="540" y="330" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="76" fill="${C.ink}">${SS.t('Intérêt envoyé', 'Interest submitted')} <tspan fill="${C.amber}">✓</tspan></text>
        <text x="540" y="410" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="28" letter-spacing="3" fill="${C.muted}">${SS.t('L’ÉQUIPE TE RÉPOND PAR WHATSAPP OU EMAIL', 'THE TEAM REPLIES ON WHATSAPP OR BY EMAIL')}</text>
      </g>
      ${SS.speech('whisper', 400, 500, 650, 390, [790, 1140], true, `
        <text id="psst" x="450" y="574" font-family="IBM Plex Mono" font-weight="500" font-size="30" letter-spacing="2" fill="${C.muted}">psst…</text>
        <rect id="marker" x="450" y="616" width="0" height="72" rx="10" fill="${C.amber}"/>
        <text id="wsp1" x="450" y="672" ${big}>${SS.t('Avec SheSpeaks,', 'With SheSpeaks,')}</text>
        <text id="wsp2" x="450" y="754" ${big}>${SS.words('wsp2', SS.t('tu n’y vas', 'you won’t do it'))}</text>
        <text id="wsp3" x="450" y="836" ${big}>${SS.words('wsp3', SS.t('pas seule.', 'alone.'))}</text>`)}
      ${SS.speech('ask', 60, 560, 470, 230, [330, 880], false, `
        <text id="ask1" x="104" y="656" ${big}>${SS.words('ask1', SS.t('Ah bon ?', 'Really?'))}</text>
        <text id="ask2" x="104" y="738" ${big}>${SS.words('ask2', SS.t('Comment ?', 'How?'))}</text>`)}
    </g>`;
  }

  function phoneShot() {
    return `<g id="phoneShot">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="540" cy="980" r="900" fill="url(#stageLight)"/>
      <g id="caption"><text x="540" y="180" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="56" fill="${C.ink}">${SS.t('8 à 10 minutes', '8 to 10 minutes')}<tspan fill="${C.amber}"> · </tspan>${SS.t('sans compte', 'no account')}</text></g>
      <g id="phoneRig">
        ${SS.handsBack('hNb', '#5E3A25', '#2A2F4D')}${SS.handsBack('hHer', '#8A5536', '#3A4060')}
        ${SS.phone('ph', SS.ep1Phone.build())}
        ${SS.handsFront('hNb', '#5E3A25')}${SS.handsFront('hHer', '#8A5536')}
        ${SS.touchDot('touch')}
      </g>
    </g>`;
  }

  function endCard() {
    const mid = 'text-anchor="middle"';
    return `<g id="card">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="540" cy="900" r="900" fill="url(#stageLight)"/>
      <image id="cardLogo" href="../../public/brand/shespeaks-logo-nuit.svg" x="230" y="300" width="620" height="255"/>
      <text id="cardTitle" ${mid} font-family="Archivo" font-weight="800" font-size="136" fill="${C.ink}"><tspan x="540" y="790">${SS.t('À toi', 'Your turn')}</tspan><tspan x="540" y="930">${SS.t('la scène.', 'on stage.')}</tspan></text>
      <ellipse id="cardStage" cx="540" cy="1030" rx="360" ry="34" fill="${C.amber}"/>
      <text id="cardEvents" x="540" y="1170" ${mid} font-family="IBM Plex Mono" font-weight="500" font-size="28" letter-spacing="3" fill="${C.muted}">DEVFEST YAOUNDÉ · DEVFEST DOUALA</text>
      <text id="cardDeadline" x="540" y="1252" ${mid} font-family="Archivo" font-weight="700" font-size="46" fill="${C.ink}" data-max="980">${SS.t('Soumets ton intérêt avant le 26 octobre', 'Submit your interest by 26 October')}</text>
      <g id="cardUrl"><rect x="130" y="1320" width="820" height="112" rx="56" fill="${C.amber}"/>
        <text x="540" y="1390" ${mid} font-family="IBM Plex Mono" font-weight="500" font-size="40" fill="${C.night}">shespeaks.techiesconnect.org</text></g>
      <text id="cardNext" x="540" y="1730" ${mid} font-family="Archivo" font-weight="600" font-size="34" fill="${C.muted}">${SS.t('Et après ? Épisode 2 bientôt →', 'What’s next? Episode 2 coming soon →')}</text>
    </g>`;
  }

  function build() {
    SS.$('stage').innerHTML = `
      ${SS.defs()}
      <g id="hallCam">${SS.hall('hall', { focus: FOCUS, back: 'braids', slide: { label: SS.t('CONFÉRENCE TECH', 'TECH CONFERENCE'), lines: ['Building AI agents'], size: 58, diagram: true }, presenter: SS.manPresenter() })}</g>
      ${faceShot()}
      ${phoneShot()}
      ${endCard()}
      <rect id="black" width="1080" height="1920" fill="#000"/>`;
    const len = SS.$('l2').getComputedTextLength();
    SS.attr('underline', { d: `M198 376 H${196 + len - 18}` });
    SS.underlineLen = len - 20;
    // Amber marker behind the word "SheSpeaks" in "Avec SheSpeaks," ("With SheSpeaks,": also 5 characters before it).
    const w1 = SS.$('wsp1');
    SS.markerX = 450 + w1.getSubStringLength(0, 5) - 8;
    SS.markerLen = w1.getSubStringLength(5, 9) + 16;
    SS.attr('marker', { x: SS.markerX });
    SS.fitAll();
  }

  const { popIO, fadeUp, talk } = SS;

  function seek(t) {
    SS.opacity('black', 1 - prog(t, 0, 0.6, ease.out));

    // Shot A — the hall: slow push-in on her.
    SS.attr('hallCam', { transform: zoom(1 + 0.6 * prog(t, 0.5, 2.3), FOCUS.x, FOCUS.y) });
    SS.attr('spkArm', { transform: `rotate(${Math.sin(t * 2.4) * 7} 862 486)` });
    const cut = prog(t, 2.55, 0.3);
    SS.opacity('hallCam', 1 - cut);

    // Which shot is on screen: her face (scenes 1–2 and her pride), the phone, the end card.
    SS.opacity('face', t < 20 ? cut * (1 - prog(t, 12.75, 0.3)) : prog(t, 25.6, 0.3) * (1 - prog(t, 28.3, 0.35)));
    SS.opacity('phoneShot', prog(t, 12.75, 0.3) * (1 - prog(t, 25.6, 0.3)));
    SS.opacity('card', prog(t, 28.3, 0.35));

    // Shot B — her face, then the camera widens to take in the neighbour; later a closer shot of her pride.
    if (t < 20) {
      const creep = 1 + 0.05 * prog(t, 2.6, 5, ease.linear);
      const wide = prog(t, 7.7, 1.2);
      SS.attr('faceCam', { transform: zoom(SS.lerp(creep, 0.9, wide), 540, 1300, -170 * wide, -60 * wide) });
    } else {
      SS.attr('faceCam', { transform: zoom(1.28 + 0.05 * prog(t, 25.6, 2.8, ease.linear), 540, 1232, 0, -250) });
    }
    SS.opacity('nbShade', 0.35 * (1 - prog(t, 7.7, 0.8)));
    const lean = prog(t, 8.5, 0.5) * (1 - prog(t, 11.0, 0.6));
    SS.attr('nbLean', { transform: `translate(${-34 * lean} ${8 * lean}) rotate(${-6 * lean} 1000 1900)` });

    const blink = pulse(t, 3.7) + pulse(t, 6.25) + pulse(t, 7.35) + pulse(t, 10.6) + pulse(t, 12.3) + pulse(t, 26.9);
    SS.pose('her', {
      look: keys(t, [[2.6, [-0.9, -0.7]], [6.5, [-0.9, -0.7]], [7.0, [-0.3, 0.7]], [9.1, [-0.3, 0.7]], [9.35, [1, 0.1]], [12.6, [1, 0.1]], [25.6, [-0.7, -0.5]]]),
      blink,
      brow: keys(t, [[2.9, 0], [3.4, 0.7], [4.8, 0.3], [6.5, 0.3], [7.0, 0], [9.3, 0], [9.6, 0.9], [10.6, 0.5], [12.6, 0.6], [25.6, 0.4]]),
      sad: keys(t, [[6.5, 0], [7.0, 0.7], [9.2, 0.7], [9.5, 0]]),
      smile: keys(t, [[4.9, 0.05], [5.4, 0.85], [6.5, 0.85], [7.0, -0.15], [10.4, -0.15], [10.8, 0.35], [25.6, 0.5], [26.2, 1]]),
      open: keys(t, [[9.5, 0], [9.7, 0.65], [10.3, 0.65], [10.5, 0]]) + talk(t, 11.25, 12.1),
      tilt: keys(t, [[3.1, 0], [4.2, -3], [6.5, -3], [7.1, 1], [9.4, 1], [9.8, 4], [12.6, 4], [25.6, -2]]),
      breathe: Math.sin((t * 2 * Math.PI) / 3.4),
    });
    SS.pose('nb', {
      look: keys(t, [[8.3, [-0.9, -0.6]], [8.6, [-1, 0.3]]]),
      blink: pulse(t, 4.5) + pulse(t, 6.9) + pulse(t, 11.4) + pulse(t, 27.3),
      smile: keys(t, [[8.5, 0], [8.9, 0.55], [11.6, 0.55], [12.0, 0.9]]),
      open: talk(t, 9.2, 10.4) * 0.7,
      brow: keys(t, [[11.6, 0], [12.0, 0.4]]),
      breathe: Math.sin((t * 2 * Math.PI) / 3.9 + 1),
    });

    // Thought bubble: two dots, then the cloud pops from her head; it vanishes when the neighbour leans in.
    popIO(t, 'dot1', 3.05, 7.6, 452, 856);
    popIO(t, 'dot2', 3.17, 7.55, 398, 800);
    popIO(t, 'cloud', 3.28, 7.5, 420, 760);
    SS.reveal(t, 'l1', 3.42);
    SS.reveal(t, 'l2', 3.95);
    SS.reveal(t, 'l3', 4.7);
    SS.reveal(t, 'l4', 5.05);
    const u = SS.underlineLen;
    SS.attr('underline', { 'stroke-dasharray': `${u} ${u}`, 'stroke-dashoffset': u * (1 - prog(t, 4.25, 0.45, ease.out)) });

    // The doodle: her AI agent sorts three tickets into the tray (what she did yesterday).
    SS.opacity('doodle', prog(t, 5.45, 0.3));
    for (let i = 0; i < 3; i++) {
      const p = prog(t, 5.7 + i * 0.3, 0.5);
      const x = SS.lerp(256, 650 + i * 84, p);
      const y = SS.lerp(636, 650, p) - Math.sin(p * Math.PI) * 70;
      SS.attr(`tk${i}`, { transform: `translate(${x} ${y}) rotate(${(1 - p) * -20})` });
      SS.opacity(`tk${i}`, prog(t, 5.7 + i * 0.3, 0.12));
    }
    SS.attr('check', { transform: zoom(ease.back(SS.clamp((t - 6.55) / 0.35)), 896, 604) });

    // Scene 2 — the whisper, then her question.
    popIO(t, 'whisper', 9.0, 11.0, 790, 1140);
    SS.opacity('psst', prog(t, 9.15, 0.25));
    SS.opacity('wsp1', prog(t, 9.4, 0.25));
    SS.attr('marker', { width: SS.markerLen * prog(t, 9.6, 0.35, ease.out) });
    SS.reveal(t, 'wsp2', 9.85, 0.15);
    SS.reveal(t, 'wsp3', 10.3, 0.15);
    popIO(t, 'ask', 11.1, 12.75, 330, 880);
    SS.reveal(t, 'ask1', 11.25, 0.15);
    SS.reveal(t, 'ask2', 11.65, 0.15);

    // Scenes 3–4 — the phone.
    SS.ep1Phone.seek(t);

    // Her pride once it is sent: the hair tie turns amber, a warm glow behind it.
    const lit = prog(t, 26.1, 0.5);
    SS.attr('her-band', { fill: SS.mix(C.muted, C.amber, lit) });
    SS.opacity('bandGlow', 0.6 * pulse(t, 26.1, 1.2) + 0.25 * lit);
    fadeUp(t, 'proudCaption', 26.3);

    // Scene 5 — end card.
    fadeUp(t, 'cardLogo', 28.5);
    fadeUp(t, 'cardTitle', 28.8);
    SS.attr('cardStage', { rx: 360 * prog(t, 29.2, 0.6, ease.out) });
    fadeUp(t, 'cardEvents', 29.5);
    fadeUp(t, 'cardDeadline', 29.7);
    SS.opacity('cardUrl', prog(t, 30.0, 0.4));
    SS.attr('cardUrl', { transform: zoom(ease.back(SS.clamp((t - 30.0) / 0.4)) * (1 + 0.025 * Math.max(0, Math.sin((t - 30.6) * 4))), 540, 1376) });
    fadeUp(t, 'cardNext', 30.7);
  }

  SS.start(CUT.duration, build, (t) => seek(CUT.story(t)));
})();
