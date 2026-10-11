// Épisode 2 — « Et après ? ». Her room, the phone (episode2-phone.js: topic ideas, review, call for speakers, the
// organisers' answer), her joy, the rehearsal call with a coach, the day itself on stage, the loop, the end card.
(function () {
  const C = SS.C;
  const { prog, keys, pulse, ease, zoom, popIO, fadeUp, talk } = SS;
  // Cut to 30 s: story ranges in order, a little faster where nothing needs reading, freeze frames where it does
  // (the three ideas, "Session submitted", the organisers' answer).
  const CUT = SS.edl([
    [1.7, 3.6], [3.6, 3.85], [4.35, 6.3], ['hold', 0.5], [6.3, 9.3], [9.7, 11.7],
    [11.95, 14.6, 2.5], ['hold', 0.4], [15.25, 16.15], ['hold', 1.5], [16.15, 16.5], [16.5, 18.2, 1.5],
    [18.6, 18.8], [19.6, 22.9], [23.75, 28.9, 3.6], [28.9, 31.45], [31.45, 35.0],
  ]);
  const GREY = '#3A4060';
  const FOCUS = { x: 540, y: 1262 };
  const EMOJIS = 16;
  const TALK = SS.t(['Mon premier agent IA', 'en production'], ['My first AI agent', 'in production']);
  const DAY = SS.t('J', 'D'); // J-15 / D-15

  /** 0 outside [a, b], 1 inside, with short cross-fades at both ends. */
  const vis = (t, a, b) => prog(t, a - 0.15, 0.3) * (1 - prog(t, b - 0.15, 0.3));

  function room() {
    const stars = [[700, 530], [760, 650], [930, 700], [690, 760], [820, 560]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3" fill="${C.ink}" opacity="0.7"/>`).join('');
    return `<g id="room">
      <rect width="1080" height="1920" fill="#161B33"/>
      <rect x="680" y="470" width="320" height="360" rx="12" fill="#0E1226" stroke="${C.line}" stroke-width="12"/>
      <path d="M840 470 V830 M680 650 H1000" stroke="${C.line}" stroke-width="8"/>
      <circle cx="930" cy="550" r="34" fill="${C.ink}" opacity="0.9"/>${stars}
      <rect x="80" y="500" width="220" height="280" rx="8" fill="${C.sunken}" stroke="${C.line}" stroke-width="6"/>
      <text x="190" y="640" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="68" fill="${C.amber}">&lt;/&gt;</text>
      <text x="190" y="710" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="19" letter-spacing="3" fill="${C.muted}">HELLO WORLD</text>
      <rect x="0" y="1280" width="1080" height="640" rx="60" fill="#232846"/>
      <ellipse cx="830" cy="1330" rx="240" ry="70" fill="#2B3152"/>
      <circle cx="560" cy="1500" r="520" fill="url(#stageLight)"/>
      ${SS.person('her', { hair: 'braids', skin: 'warm', outfit: 'hoodie', top: GREY, band: C.amber, arms: true, transform: 'translate(105 671) scale(1.45)' })}
      <g id="herPhone">
        <g transform="rotate(-6 540 1800)">
          <rect x="400" y="1660" width="280" height="420" rx="44" fill="#0A0C16" stroke="${C.line}" stroke-width="5"/>
          <circle cx="460" cy="1720" r="20" fill="${C.sunken}"/><circle cx="460" cy="1770" r="20" fill="${C.sunken}"/>
        </g>
        <ellipse cx="380" cy="1860" rx="80" ry="110" fill="#8A5536"/><ellipse cx="700" cy="1860" rx="80" ry="110" fill="#8A5536"/>
        <g id="buzz" stroke="${C.ink}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0">
          <path d="M360 1680 q-20 20 0 40 M330 1660 q-36 40 0 80 M720 1680 q20 20 0 40 M750 1660 q36 40 0 80"/>
        </g>
      </g>
      <g id="title">
        <text x="540" y="210" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="30" letter-spacing="6" fill="${C.amber}">${SS.t('ÉPISODE 2', 'EPISODE 2')}</text>
        <text x="540" y="360" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="140" fill="${C.ink}" data-max="1000">${SS.t('Et après ?', 'What’s next?')}</text>
      </g>
      <g id="confetti">${Array.from({ length: 46 }, (_, i) => `<rect id="cf${i}" x="-9" y="-5" width="18" height="10" rx="2" fill="${[C.amber, C.ink, C.soft, C.amber, C.muted][i % 5]}"/>`).join('')}</g>
    </g>`;
  }

  function phoneShot() {
    const cap = (id, s) => `<text id="${id}" x="540" y="180" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="50" fill="${C.ink}" opacity="0" data-max="1000">${s}</text>`;
    return `<g id="phoneShot">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="540" cy="980" r="900" fill="url(#stageLight)"/>
      ${cap('cap1', SS.t('Des idées de sujets, rien que pour toi', 'Topic ideas, just for you'))}
      ${cap('cap2', SS.t('Relue avec l’équipe avant la clôture', 'Reviewed with the team before the deadline'))}
      ${cap('cap3', `${SS.t('Proposition envoyée', 'Proposal submitted')} <tspan fill="#F5A524">✓</tspan>`)}
      ${cap('cap4', SS.t('Quelques jours plus tard…', 'A few days later…'))}
      ${SS.handsBack('hHer', '#8A5536', GREY)}
      ${SS.phone('ph', SS.ep2Phone.build())}
      ${SS.handsFront('hHer', '#8A5536')}
      ${SS.touchDot('touch')}
    </g>`;
  }

  // The rehearsal: a laptop with the coach on top, her slides below, her own small video in the corner.
  function callShot() {
    const slide = (id, inner) => `<g id="${id}">${inner}</g>`;
    return `<g id="call">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="540" cy="900" r="900" fill="url(#stageLight)"/>
      <rect x="50" y="360" width="980" height="1040" rx="30" fill="#0A0C16" stroke="${C.line}" stroke-width="4"/>
      <path d="M0 1400 H1080 L1040 1450 H40 Z" fill="${C.sunken}"/>
      <rect x="70" y="380" width="940" height="1000" rx="14" fill="#141831"/>
      <clipPath id="coachClip"><rect x="90" y="400" width="900" height="500" rx="16"/></clipPath>
      <g clip-path="url(#coachClip)">
        <rect x="90" y="400" width="900" height="500" fill="#2A3050"/>
        <rect x="740" y="560" width="220" height="12" rx="6" fill="${C.line}"/><rect x="770" y="520" width="40" height="40" fill="${C.muted}"/><rect x="820" y="510" width="30" height="50" fill="${C.amber}" opacity="0.7"/><rect x="860" y="525" width="56" height="35" fill="${C.soft}" opacity="0.5"/>
        ${SS.person('coach', { hair: 'wrap', skin: 'deep', outfit: 'sweater', top: '#5A6080', band: C.muted, transform: 'translate(205 330) scale(1.12)' })}
      </g>
      <text x="110" y="880" font-family="IBM Plex Mono" font-weight="500" font-size="22" letter-spacing="2" fill="${C.ink}">${SS.t('COACH SHESPEAKS', 'SHESPEAKS COACH')}</text>
      <rect x="90" y="920" width="900" height="400" rx="16" fill="${C.night}" stroke="${C.line}" stroke-width="2"/>
      ${slide('sl1', `<text font-family="Archivo" font-weight="800" font-size="58" fill="${C.ink}"><tspan x="140" y="1070">${TALK[0]}</tspan><tspan x="140" y="1140">${TALK[1]}</tspan></text>
        <text x="140" y="1220" font-family="IBM Plex Mono" font-weight="500" font-size="24" letter-spacing="2" fill="${C.amber}">AÏCHA M. · DEVFEST YAOUNDÉ 2026</text>`)}
      ${slide('sl2', `<text x="140" y="1020" font-family="IBM Plex Mono" font-weight="500" font-size="24" letter-spacing="2" fill="${C.amber}">${SS.t('LA DÉMO', 'THE DEMO')}</text>
        <g stroke="${C.ink}" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round" transform="translate(-40 450)">
          <rect x="200" y="592" width="112" height="88" rx="22"/><line x1="256" y1="592" x2="256" y2="568"/><circle cx="256" cy="562" r="7" fill="${C.ink}"/>
          <circle cx="236" cy="632" r="8" fill="${C.ink}" stroke="none"/><circle cx="276" cy="632" r="8" fill="${C.ink}" stroke="none"/>
          <path d="M340 636 H420 M404 620 L420 636 L404 652"/><path d="M460 600 V690 H760 V600"/>
          <rect x="480" y="630" width="68" height="44" rx="7" fill="${C.soft}"/><rect x="560" y="630" width="68" height="44" rx="7" fill="${C.soft}"/><rect x="640" y="630" width="68" height="44" rx="7" fill="${C.soft}"/>
        </g>`)}
      ${slide('sl3', `<text x="540" y="1150" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="110" fill="${C.ink}">${SS.t('Merci !', 'Thank you!')}</text>`)}
      <clipPath id="selfClip"><rect x="760" y="1110" width="210" height="190" rx="16"/></clipPath>
      <g clip-path="url(#selfClip)"><rect x="760" y="1110" width="210" height="190" fill="#232846"/>
        ${SS.person('her2', { hair: 'braids', skin: 'warm', outfit: 'hoodie', top: GREY, band: C.amber, transform: 'translate(712 1060) scale(0.48)' })}</g>
      <rect x="760" y="1110" width="210" height="190" rx="16" fill="none" stroke="${C.ink}" stroke-width="3"/>
      <circle cx="440" cy="1352" r="20" fill="${C.line}"/><circle cx="540" cy="1352" r="20" fill="#FF9A8B"/><circle cx="640" cy="1352" r="20" fill="${C.line}"/>
      ${SS.speech('coachSay', 70, 60, 940, 250, [400, 470], false, `<text font-family="Archivo" font-weight="800" font-size="60" fill="${C.night}"><tspan id="cs1" x="120" y="160">${SS.t('Ralentis sur la démo,', 'Slow down on the demo,')}</tspan><tspan id="cs2" x="120" y="240">${SS.t('et c’est parfait 👍', 'and it’s perfect 👍')}</tspan></text>`)}
      <text x="540" y="1560" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="28" letter-spacing="5" fill="${C.muted}">${SS.t('RÉPÉTITIONS', 'REHEARSALS')}</text>
      <text id="countdown" x="540" y="1710" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="140" fill="${C.amber}">${DAY}-15</text>
    </g>`;
  }

  function stageShot() {
    const heads = () => SS.HALL_HEADS.filter((h) => h.r <= 52 && h.x > 20 && h.x < 1060);
    const hall = SS.hall('stage', {
      focus: FOCUS, back: 'afro',
      slide: { label: 'DEVFEST YAOUNDÉ 2026', lines: TALK, size: 52, sub: 'AÏCHA M.' },
      presenter: SS.herPresenter(), spot: true,
    });
    // Applause: 👏 floating up from the audience.
    const clappers = heads().filter((_, i) => i % 3 === 0).slice(0, 14);
    SS.CLAPPERS = clappers;
    const emojis = Array.from({ length: EMOJIS }, (_, i) => `<text id="em${i}" font-size="${50 + (i % 3) * 12}" text-anchor="middle">👏</text>`).join('');
    return `<g id="stageShot"><g id="stageCam">${hall}<g id="emojis">${emojis}</g></g>
      <text id="jourJ" x="540" y="130" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="40" letter-spacing="10" fill="${C.amber}">${SS.t('JOUR J', 'D-DAY')}</text></g>`;
  }

  // The loop: a girl in the audience, the same wish as Aïcha in episode 1.
  function girlShot() {
    let bumps = '';
    for (let x = 220; x <= 860; x += 106) bumps += `<circle cx="${x}" cy="300" r="60"/><circle cx="${x}" cy="560" r="60"/>`;
    bumps += '<circle cx="170" cy="430" r="70"/><circle cx="910" cy="430" r="70"/>';
    return `<g id="girl">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="40" cy="260" r="1150" fill="url(#stageLight)"/>
      <g filter="url(#blur8)" fill="${C.raised}"><circle cx="1000" cy="1100" r="70"/><ellipse cx="1000" cy="1270" rx="130" ry="110"/><circle cx="80" cy="1150" r="64"/><ellipse cx="80" cy="1315" rx="120" ry="100"/></g>
      <g id="girlCam">${SS.person('ng', { hair: 'afro', skin: 'deep', outfit: 'sweater', top: GREY, transform: 'translate(130 860) scale(1.4)' })}</g>
      <g id="gThought">
        <circle id="gd1" cx="470" cy="880" r="16" fill="${C.ink}"/><circle id="gd2" cx="420" cy="800" r="26" fill="${C.ink}"/>
        <g id="gCloud"><g fill="${C.ink}">${bumps}<rect x="170" y="300" width="740" height="260" rx="60"/></g>
          <text id="gt" x="540" y="460" text-anchor="middle" font-family="Archivo" font-weight="800" font-size="76" fill="${C.night}">${SS.words('gt', SS.t('Ah… si j’osais…', 'Ah… if only I dared…'))}</text></g>
      </g>
    </g>`;
  }

  function endCard() {
    const mid = 'text-anchor="middle"';
    return `<g id="card">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <circle cx="540" cy="900" r="900" fill="url(#stageLight)"/>
      <image id="cardLogo" href="../../public/brand/shespeaks-logo-nuit.svg" x="230" y="260" width="620" height="255"/>
      <text id="cardTitle" ${mid} font-family="Archivo" font-weight="800" font-size="128" fill="${C.ink}"><tspan x="540" y="730">${SS.t('Tu n’es pas', 'You’re not')}</tspan><tspan x="540" y="864">${SS.t('seule.', 'alone.')}</tspan></text>
      <ellipse id="cardStage" cx="540" cy="960" rx="360" ry="34" fill="${C.amber}"/>
      <text id="cardLead" x="540" y="1090" ${mid} font-family="Archivo" font-weight="700" font-size="50" fill="${C.ink}" data-max="980">${SS.t('On t’accompagne jusqu’au Jour J.', 'We’re with you all the way to D-Day.')}</text>
      <text id="cardDeadline" x="540" y="1170" ${mid} font-family="Archivo" font-weight="500" font-size="40" fill="${C.soft}" data-max="980">${SS.t('Soumets ton intérêt avant le 26 octobre', 'Submit your interest by 26 October')}</text>
      <g id="cardUrl"><rect x="130" y="1240" width="820" height="112" rx="56" fill="${C.amber}"/>
        <text x="540" y="1310" ${mid} font-family="IBM Plex Mono" font-weight="500" font-size="40" fill="${C.night}">shespeaks.techiesconnect.org</text></g>
      <text id="cardEvents" x="540" y="1470" ${mid} font-family="IBM Plex Mono" font-weight="500" font-size="28" letter-spacing="3" fill="${C.muted}">DEVFEST YAOUNDÉ · DEVFEST DOUALA</text>
    </g>`;
  }

  function build() {
    SS.$('stage').innerHTML = `${SS.defs()}
      ${room()}${phoneShot()}${callShot()}${stageShot()}${girlShot()}${endCard()}
      <rect id="black" width="1080" height="1920" fill="#000"/>`;
    SS.fitAll();
  }

  function draw(t) {
    SS.opacity('room', vis(t, -1, 3.6) + vis(t, 16.6, 18.7));
    SS.opacity('phoneShot', vis(t, 3.6, 16.6));
    SS.opacity('call', vis(t, 18.7, 23.9));
    SS.opacity('stageShot', vis(t, 23.9, 29.0));
    SS.opacity('girl', vis(t, 29.0, 31.6));
    SS.opacity('card', prog(t, 31.45, 0.35));

    // 1 — Her room. The phone buzzes; later, the good news: arms up, confetti.
    const joy = prog(t, 16.7, 0.35, ease.back);
    SS.pose('her', {
      look: keys(t, [[0, [-0.2, 0.9]], [2.4, [-0.2, 0.9]], [2.7, [-0.2, 0.35]], [16.6, [-0.2, 0.35]], [16.7, [-0.3, -0.5]]]),
      blink: pulse(t, 1.4) + pulse(t, 17.9),
      brow: keys(t, [[2.3, 0], [2.6, 0.6], [16.6, 0.6], [16.8, 0.8]]),
      smile: keys(t, [[0, 0.15], [2.5, 0.15], [2.8, 0.55], [16.6, 0.55], [16.8, 1]]),
      open: t > 16.6 ? 0.7 * joy : 0,
      arms: joy,
      wave: Math.sin(t * 9) * 6 * joy,
      tilt: keys(t, [[16.6, 0], [17.0, -3]]),
      breathe: Math.sin((t * 2 * Math.PI) / 3.4) + (t > 16.6 ? Math.abs(Math.sin(t * 9)) * 2 * joy : 0),
    });
    SS.opacity('herPhone', t < 16 ? 1 : 0);
    const buzz = t > 2.3 && t < 3.0 ? 1 : 0;
    SS.opacity('buzz', buzz * (Math.floor(t * 12) % 2));
    SS.attr('herPhone', { transform: `translate(${buzz * Math.sin(t * 80) * 5} 0)` });
    fadeUp(t, 'title', 0.4, 3.2);
    for (let i = 0; i < 46; i++) {
      const p = SS.clamp((t - 16.75 - (i % 9) * 0.06) / 1.8);
      const x = ((i * 241) % 1080) + Math.sin(p * 6 + i) * 30;
      const y = -40 + p * (1500 + (i % 7) * 60);
      SS.attr(`cf${i}`, { transform: `translate(${x} ${y}) rotate(${p * 720 + i * 37})`, opacity: t > 16.7 && p < 1 ? 1 : 0 });
    }

    // 2–4 — The phone.
    SS.ep2Phone.seek(t);
    const caps = [['cap1', 3.75, 9.6], ['cap2', 9.95, 13.8], ['cap3', 14.0, 14.95], ['cap4', 15.1, 16.5]];
    for (const [id, a, b] of caps) SS.opacity(id, prog(t, a, 0.3) * (1 - prog(t, b, 0.2)));

    // 5 — The rehearsal call.
    SS.pose('coach', {
      look: [-0.4, 0.3], blink: pulse(t, 19.6) + pulse(t, 22.4),
      smile: keys(t, [[18.7, 0.4], [21.2, 0.4], [21.5, 0.9]]),
      open: talk(t, 19.9, 21.2), brow: keys(t, [[21.2, 0], [21.5, 0.4]]),
      tilt: Math.sin(t * 3) * 1.5, breathe: Math.sin(t * 1.8),
    });
    SS.pose('her2', { look: [-0.3, 0.2], smile: keys(t, [[18.7, 0.3], [21.4, 0.3], [21.7, 0.9]]), open: talk(t, 18.8, 19.8), blink: pulse(t, 20.5), tilt: Math.sin(t * 2.5) * 2 });
    popIO(t, 'coachSay', 19.8, 23.6, 400, 470);
    SS.opacity('cs1', prog(t, 19.95, 0.25));
    SS.opacity('cs2', prog(t, 20.5, 0.25));
    SS.opacity('sl1', t < 21.6 ? 1 : 0);
    SS.opacity('sl2', t >= 21.6 && t < 22.6 ? 1 : 0);
    SS.opacity('sl3', t >= 22.6 ? 1 : 0);
    // The answer comes on 5 November, DevFest Yaoundé is on 21 November: about two weeks of rehearsals.
    SS.$('countdown').textContent = `${DAY}-${Math.max(1, Math.round(15 - 14 * prog(t, 19.6, 3.0, ease.inOut)))}`;

    // 6 — The day itself: the amber pool lights her, her hoodie turns amber, the room applauds; then the camera
    // finds a girl in the audience.
    const lit = prog(t, 24.3, 0.6);
    SS.opacity('stage-spot', lit);
    SS.opacity('stage-beamAmber', lit);
    SS.$('hpBody').style.color = SS.mix(GREY, C.amber, prog(t, 24.5, 0.6));
    SS.attr('hpArm', { transform: `rotate(${Math.sin(t * 2.6) * 8} 866 490)` });
    const [s, tx, ty] = keys(t, [[23.9, [1, 0, 0]], [26.6, [1.12, -86, -58]], [27.0, [1.12, -86, -58]], [28.9, [2.2, -648, -1514]]]);
    SS.attr('stageCam', { transform: `translate(${tx} ${ty}) scale(${s})` });
    fadeUp(t, 'jourJ', 24.1, 26.8);
    for (let i = 0; i < EMOJIS; i++) {
      const h = SS.CLAPPERS[(i * 5) % SS.CLAPPERS.length];
      const p = SS.clamp((t - 25.0 - i * 0.16) / 1.6);
      SS.attr(`em${i}`, { x: h.x + Math.sin(p * 5 + i) * 20, y: h.y - h.r - p * 320 });
      SS.opacity(`em${i}`, p > 0 && p < 1 ? Math.sin(p * Math.PI) : 0);
    }

    // 7 — The loop: her wish.
    SS.attr('girlCam', { transform: zoom(1 + 0.04 * prog(t, 29, 2.6, ease.linear), 540, 1300) });
    SS.pose('ng', { look: [-0.9, -0.7], brow: keys(t, [[29.2, 0], [29.6, 0.7]]), smile: keys(t, [[29.4, 0], [30.0, 0.3]]), blink: pulse(t, 30.6), tilt: keys(t, [[29.3, 0], [30.2, -3]]), breathe: Math.sin(t * 1.9) });
    popIO(t, 'gd1', 29.45, 99, 470, 880);
    popIO(t, 'gd2', 29.55, 99, 420, 800);
    popIO(t, 'gCloud', 29.65, 99, 440, 700);
    SS.reveal(t, 'gt', 29.85, 0.2);

    // 8 — End card.
    fadeUp(t, 'cardLogo', 31.55);
    fadeUp(t, 'cardTitle', 31.75);
    SS.attr('cardStage', { rx: 360 * prog(t, 32.0, 0.5, ease.out) });
    fadeUp(t, 'cardLead', 32.2);
    fadeUp(t, 'cardDeadline', 32.4);
    SS.opacity('cardUrl', prog(t, 32.6, 0.4));
    SS.attr('cardUrl', { transform: zoom(ease.back(SS.clamp((t - 32.6) / 0.4)) * (1 + 0.025 * Math.max(0, Math.sin((t - 33.2) * 4))), 540, 1296) });
    fadeUp(t, 'cardEvents', 32.85);
  }

  SS.start(CUT.duration, build, (t) => {
    draw(CUT.story(t));
    SS.opacity('black', 1 - prog(t, 0, 0.5, ease.out));
  });
})();
