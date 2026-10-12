// A phone held in two hands, for the close-ups. Screen content is drawn in local coordinates (656 × 1406).
// SS.phone(id, content) returns the SVG; SS.touch moves the touch dot between taps; SS.pressKey lights keyboard keys.
(function () {
  const C = SS.C;
  const P = { x: 190, y: 250, w: 700, h: 1450, bezel: 22 };
  const S = { x: P.x + P.bezel, y: P.y + P.bezel, w: P.w - 2 * P.bezel, h: P.h - 2 * P.bezel };
  SS.SCREEN = S;

  SS.phone = (id, content) => `<g id="${id}">
    <rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" rx="96" fill="#0A0C16" stroke="${C.line}" stroke-width="4"/>
    <clipPath id="${id}-clip"><rect x="${S.x}" y="${S.y}" width="${S.w}" height="${S.h}" rx="76"/></clipPath>
    <g clip-path="url(#${id}-clip)"><g transform="translate(${S.x} ${S.y})">${content}
      <circle id="${id}-ripple" r="0" fill="${C.night}" opacity="0"/></g></g>
    <rect x="${P.x + P.w / 2 - 80}" y="${P.y + 36}" width="160" height="40" rx="20" fill="#0A0C16"/>
  </g>`;

  /** Status bar (time, battery), dark or light text; an empty time for a lock screen, which shows the big clock instead. */
  SS.statusBar = (dark, time = '9:41') => {
    const ink = dark ? C.ink : C.night;
    return `<text x="70" y="70" font-family="Archivo" font-weight="700" font-size="30" fill="${ink}">${time}</text>
      <rect x="540" y="48" width="50" height="26" rx="7" fill="none" stroke="${ink}" stroke-width="3"/><rect x="545" y="53" width="34" height="16" rx="3" fill="${ink}"/>
      <path d="M490 72 h6 v-6 h-6z M500 72 h6 v-12 h-6z M510 72 h6 v-18 h-6z" fill="${ink}"/>`;
  };

  /** Browser address bar with a padlock. */
  SS.addressBar = (id, dark, url) => `<rect x="30" y="96" width="596" height="70" rx="35" fill="${dark ? C.sunken : '#E6E4EC'}"/>
    <path d="M62 128 v-6 a9 9 0 0 1 18 0 v6 M58 128 h26 v18 h-26z" fill="none" stroke="${dark ? C.muted : '#4F5570'}" stroke-width="3"/>
    <text id="${id}" x="100" y="141" font-family="Archivo" font-weight="500" font-size="28" fill="${dark ? C.ink : '#2E3350'}">${url}</text>`;

  // AZERTY keyboard, docked at the bottom of the screen.
  const ROWS = ['azertyuiop', 'qsdfghjklm', 'wxcvbn'];
  const KEY = { w: 58, h: 78, gap: 6, top: 900 };
  const keyPos = {};
  ROWS.forEach((row, r) => {
    const x0 = (S.w - (row.length * KEY.w + (row.length - 1) * KEY.gap)) / 2;
    [...row].forEach((ch, i) => { keyPos[ch] = { x: x0 + i * (KEY.w + KEY.gap), y: KEY.top + 40 + r * (KEY.h + 14) }; });
  });
  keyPos['.'] = { x: 452, y: KEY.top + 40 + 3 * (KEY.h + 14) };
  keyPos['\n'] = { x: 516, y: keyPos['.'].y, w: 112 };
  SS.keyCenter = (ch) => { const k = keyPos[ch] || keyPos['.']; return [k.x + (k.w || KEY.w) / 2, k.y + KEY.h / 2]; };

  SS.keyboard = (id) => {
    let s = `<g id="${id}"><rect x="0" y="${KEY.top}" width="${S.w}" height="${S.h - KEY.top}" fill="#1E2340"/>`;
    for (const ch in keyPos) {
      const k = keyPos[ch];
      const w = k.w || KEY.w;
      const label = ch === '\n' ? 'OK' : ch;
      s += `<rect id="${id}-k${ch === '.' ? 'dot' : ch === '\n' ? 'ok' : ch}" x="${k.x}" y="${k.y}" width="${w}" height="${KEY.h}" rx="10" fill="${ch === '\n' ? C.amber : C.line}"/>
        <text x="${k.x + w / 2}" y="${k.y + 52}" text-anchor="middle" font-family="Archivo" font-weight="500" font-size="32" fill="${ch === '\n' ? C.night : C.ink}">${label}</text>`;
    }
    const sy = keyPos['.'].y;
    s += `<rect x="30" y="${sy}" width="108" height="${KEY.h}" rx="10" fill="${C.line}"/><text x="84" y="${sy + 50}" text-anchor="middle" font-family="Archivo" font-size="26" fill="${C.ink}">123</text>
      <rect x="148" y="${sy}" width="294" height="${KEY.h}" rx="10" fill="${C.line}"/></g>`;
    return s;
  };
  SS.pressKey = (id, ch, amount) => {
    const el = SS.$(`${id}-k${ch === '.' ? 'dot' : ch === '\n' ? 'ok' : ch}`);
    if (el && ch !== '\n') el.setAttribute('fill', SS.mix(C.line, C.soft, amount));
  };

  /** Hands holding the phone: palms and sleeves behind it (`back`), fingers on the edges and resting thumbs in front. */
  SS.handsBack = (id, skin, sleeve) => `<g id="${id}-back">
      <g transform="rotate(-12 150 1900)"><rect x="40" y="1760" width="230" height="260" rx="60" fill="${sleeve}"/></g>
      <ellipse cx="215" cy="1640" rx="112" ry="150" fill="${skin}"/>
      <g transform="rotate(12 930 1900)"><rect x="810" y="1760" width="230" height="260" rx="60" fill="${sleeve}"/></g>
      <ellipse cx="865" cy="1640" rx="112" ry="150" fill="${skin}"/>
    </g>`;
  SS.handsFront = (id, skin) => {
    const crease = SS.mix(skin, '#000000', 0.25);
    const finger = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="58" rx="29" fill="${skin}"/>`;
    return `<g id="${id}">
      ${[1400, 1474, 1548].map((y, i) => finger(158 - i * 4, y, 66)).join('')}
      ${[1400, 1474, 1548].map((y, i) => finger(856 + i * 4, y, 66)).join('')}
      <path d="M150 1740 Q190 1690 250 1676" stroke="${skin}" stroke-width="56" stroke-linecap="round" fill="none"/>
      <path d="M930 1740 Q890 1690 830 1676" stroke="${skin}" stroke-width="56" stroke-linecap="round" fill="none"/>
      <path d="M236 1666 q10 8 6 20 M844 1666 q-10 8 -6 20" stroke="${crease}" stroke-width="4" fill="none" stroke-linecap="round"/>
    </g>`;
  };
  /** Touch indicator (the usual app-demo dot) that travels between taps. */
  SS.touchDot = (id) => `<circle id="${id}" r="38" fill="#FFFFFF" fill-opacity="0.5" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="4" opacity="0"/>`;
  SS.touch = (id, t, taps, rest) => {
    const [x, y, press] = SS.thumbAt(t, taps, rest);
    const d = taps.reduce((m, tap) => Math.min(m, tap.t - t > 0 ? (tap.t - t) * 1.2 : t - tap.t), 9);
    const vis = 1 - SS.clamp((d - 0.2) / 0.2);
    SS.attr(id, { cx: S.x + x, cy: S.y + y, r: 38 - press * 8, opacity: vis });
  };
  /** Position along a list of taps [{t, x, y}], resting in between; returns [x, y, press]. */
  SS.thumbAt = (t, taps, rest) => {
    const frames = [];
    taps.forEach((tap, i) => {
      const prev = taps[i - 1];
      if (!prev || tap.t - prev.t > 0.75) frames.push([tap.t - 0.45, rest]);
      frames.push([tap.t - 0.18, [tap.x, tap.y]], [tap.t + 0.1, [tap.x, tap.y]]);
      const next = taps[i + 1];
      if (!next || next.t - tap.t > 0.75) frames.push([tap.t + 0.4, rest]);
    });
    const [x, y] = frames.length ? SS.keys(t, frames) : rest;
    const press = taps.reduce((m, tap) => Math.max(m, SS.pulse(t, tap.t - 0.06, 0.16)), 0);
    return [x, y, press];
  };
  /** Ripple under the latest tap. */
  SS.ripple = (id, t, taps) => {
    const last = taps.filter((tap) => tap.t <= t).pop();
    const p = last ? SS.clamp((t - last.t) / 0.4) : 1;
    SS.attr(`${id}-ripple`, { cx: last ? last.x : 0, cy: last ? last.y : 0, r: 20 + p * 50, opacity: last && p < 1 ? 0.25 * (1 - p) : 0 });
  };
})();
