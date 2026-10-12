// The characters, drawn in a 600 × 920 box, facing left (towards the stage), head centre near (300, 330).
// SS.person(id, options) returns the SVG; SS.pose(id, pose) moves eyes, brows, mouth, head and breathing on each frame.
(function () {
  const C = SS.C;
  const HAIR = '#16110E';
  const HAIR_LIGHT = '#3A2C24';
  const SKINS = {
    warm: { base: '#8A5536', shade: '#6E4129', blush: '#B0614A' },
    deep: { base: '#5E3A25', shade: '#4A2C1B', blush: '#7A4530' },
  };
  const NECK_PIVOT = '300 455';

  // A box braid: a thick rounded stroke with a lighter segmented line on top for the woven texture.
  const braid = (d, w = 15) => `<path d="${d}" stroke="${HAIR}" stroke-width="${w}" fill="none" stroke-linecap="round"/>
    <path d="${d}" stroke="${HAIR_LIGHT}" stroke-width="${w * 0.45}" stroke-dasharray="4 10" fill="none" stroke-linecap="round"/>`;

  // Long box braids: behind the head and shoulders (drawn before the body).
  function braidsBack() {
    let s = `<path d="M200 330 C186 250 236 196 306 194 C384 192 440 246 440 330 L452 620 L196 620 Z" fill="${HAIR}"/>`;
    for (let i = 0; i < 9; i++) {
      const x = 205 + i * 28;
      s += braid(`M${x} 340 C${x - 6} 480 ${x + 10} 600 ${x + (i - 4) * 6} 760`);
    }
    // Braids framing the far side of her face, down past the jaw.
    s += braid('M196 300 C182 400 186 520 176 640') + braid('M210 290 C194 410 200 520 192 650');
    return s;
  }
  // The bundle that falls over the near shoulder, in front of the hoodie.
  function braidsFront() {
    let s = '';
    for (let i = 0; i < 5; i++) {
      const x = 384 + i * 14;
      s += braid(`M${x} 360 C${x + 14} 470 ${x + 4} 600 ${x + 22 + i * 4} ${740 + i * 8}`, 16);
    }
    return s;
  }

  // Big afro, behind the head (drawn inside the head group so it follows the tilt).
  const afroBack = () => `<circle cx="312" cy="270" r="172" fill="${HAIR}"/>
    <path d="M190 200 Q240 120 320 112 M420 170 Q460 220 470 290 M160 300 Q156 360 176 410" stroke="${HAIR_LIGHT}" stroke-width="5" fill="none" stroke-linecap="round"/>`;

  function hairTop(id, style, band) {
    if (style === 'afro') {
      return `<path d="M180 330 C160 200 236 150 314 150 C400 152 452 220 436 330 C424 272 382 244 320 242 C262 242 214 266 180 330 Z" fill="${HAIR}"/>`;
    }
    if (style === 'wrap') {
      // Head wrap: a tall folded scarf with a knot on top.
      return `<path d="M176 322 C160 190 232 108 318 104 C410 100 462 190 440 322 C426 270 384 244 320 242 C262 242 214 266 176 322 Z" fill="${band}"/>
        <path d="M200 250 Q300 170 420 236 M214 196 Q300 140 410 176 M250 140 Q320 120 380 136" stroke="#000" stroke-opacity="0.22" stroke-width="7" fill="none" stroke-linecap="round"/>
        <ellipse cx="352" cy="104" rx="50" ry="32" fill="${band}" transform="rotate(-18 352 104)"/>
        <path d="M322 100 Q352 84 384 100" stroke="#000" stroke-opacity="0.22" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    }
    if (style === 'short') {
      // Short natural hair: a soft rounded cap, slightly fuller than the head.
      return `<path d="M178 326 C164 206 236 158 314 158 C398 160 446 222 434 326 C424 272 382 244 320 242 C262 242 214 264 178 326 Z" fill="${HAIR}"/>
        <path d="M232 196 Q300 170 372 192" stroke="${HAIR_LIGHT}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    }
    // Braids: cap with the grid of parts, and a small braided top knot held by a hair tie.
    const parts = [0, 1, 2, 3].map((i) => `<path d="M${226 + i * 44} ${256 - i * 6} L${246 + i * 40} ${206 - i * 2}" stroke="${HAIR_LIGHT}" stroke-width="3" stroke-linecap="round"/>`).join('');
    return `<circle cx="332" cy="162" r="50" fill="${HAIR}"/>
      <path d="M306 150 Q332 128 358 152 Q348 186 318 178 M318 162 Q336 150 346 166" stroke="${HAIR_LIGHT}" stroke-width="4" fill="none" stroke-linecap="round"/>
      <path d="M186 318 C178 222 238 182 314 182 C392 184 434 232 428 312 C412 266 370 246 320 246 C264 246 220 270 186 318 Z" fill="${HAIR}"/>
      <path d="M200 268 Q300 214 412 262" stroke="${HAIR_LIGHT}" stroke-width="3" fill="none"/>${parts}
      <rect id="${id}-band" x="298" y="204" width="68" height="20" rx="10" fill="${band}" transform="rotate(-5 332 214)"/>`;
  }

  function eye(id, side, e) {
    const { cx, cy, rx, ir } = e;
    const ry = rx * 0.72;
    const out = side === 'L' ? -1 : 1; // outer corner, where the lashes flick
    const lashX = side === 'L' ? cx - rx - 2 : cx + rx + 4;
    return `<g id="${id}-eye${side}">
      <clipPath id="${id}-clip${side}"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#F4EFE8"/>
      <g clip-path="url(#${id}-clip${side})"><g id="${id}-iris${side}">
        <circle cx="${cx}" cy="${cy + 1}" r="${ir}" fill="#2A1A12"/>
        <circle cx="${cx}" cy="${cy + 1}" r="${ir * 0.55}" fill="${HAIR}"/>
        <circle cx="${cx - ir * 0.35}" cy="${cy - ir * 0.35}" r="${ir * 0.32}" fill="#FFFFFF"/>
      </g></g>
      <path d="M${cx - rx - 2} ${cy + 2} Q${cx} ${cy - ry * 1.85} ${cx + rx + 4} ${cy - 1}" fill="none" stroke="${HAIR}" stroke-width="6" stroke-linecap="round"/>
      <path d="M${lashX} ${cy - 1} l${out * 9} ${-8}" stroke="${HAIR}" stroke-width="5" stroke-linecap="round"/>
    </g>`;
  }

  const EYES = { L: { cx: 230, cy: 338, rx: 19, ir: 11 }, R: { cx: 318, cy: 338, rx: 26, ir: 13.5 } };

  function outfit(id, o, skin) {
    if (o.outfit === 'hoodie') {
      return `<path id="${id}-top" d="M40 930 C50 650 150 548 266 516 Q306 556 346 516 C462 548 556 650 566 930 Z" fill="${o.top}"/>
        <path id="${id}-hood" d="M236 508 C262 572 352 572 378 508 L404 530 C366 610 248 610 210 530 Z" fill="${o.top}"/>
        <path d="M236 508 C262 572 352 572 378 508 L404 530 C366 610 248 610 210 530 Z" fill="${C.night}" opacity="0.28"/>
        <path id="${id}-creases" d="M140 930 C148 760 176 690 206 660 M470 930 C464 770 440 700 410 664 M200 930 Q306 900 412 930" stroke="${C.night}" stroke-opacity="0.3" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M282 578 Q278 640 284 700 M334 578 Q340 640 334 708" stroke="${C.soft}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <rect x="278" y="698" width="11" height="22" rx="4" fill="${C.soft}"/><rect x="329" y="706" width="11" height="22" rx="4" fill="${C.soft}"/>`;
    }
    const badge = o.badge
      ? `<path d="M278 520 L293 748 M336 520 L318 748" stroke="${C.soft}" stroke-width="6" stroke-linecap="round" fill="none"/>
         <g transform="rotate(-3 305 800)">
           <rect x="255" y="742" width="100" height="128" rx="10" fill="${C.ink}"/>
           <path d="M255 752 a10 10 0 0 1 10 -10 h80 a10 10 0 0 1 10 10 v20 h-100 Z" fill="${C.sunken}"/>
           <circle cx="305" cy="810" r="17" fill="${C.soft}"/>
           <text x="305" y="854" text-anchor="middle" font-family="IBM Plex Mono" font-weight="500" font-size="14" letter-spacing="1" fill="${C.night}">${o.badgeText || SS.t('CONF TECH', 'TECH CONF')}</text>
         </g>`
      : '';
    return `<path id="${id}-top" d="M40 930 C50 650 150 548 266 516 Q306 556 346 516 C462 548 556 650 566 930 Z" fill="${o.top}"/>
      <path d="M140 930 C148 760 176 690 206 660 M470 930 C464 770 440 700 410 664" stroke="${C.night}" stroke-opacity="0.35" stroke-width="5" fill="none" stroke-linecap="round"/>
      ${badge}`;
  }

  /**
   * options: hair ('braids' | 'short' | 'afro' | 'wrap'), skin ('warm' | 'deep'), outfit ('hoodie' | 'sweater'), top (colour),
   * band (hair tie colour, or the wrap's colour), badge (lanyard, sweater only) and badgeText, glasses, arms (for raising them),
   * transform (placement), flip (face right).
   */
  SS.person = function (id, o) {
    const skin = SKINS[o.skin || 'warm'];
    const braids = o.hair === 'braids';
    const place = o.flip ? `${o.transform || ''} translate(600 0) scale(-1 1)` : o.transform || '';
    const glasses = o.glasses
      ? `<g fill="none" stroke="${C.soft}" stroke-width="4.5"><circle cx="${EYES.L.cx}" cy="${EYES.L.cy}" r="30"/><circle cx="${EYES.R.cx}" cy="${EYES.R.cy}" r="36"/>
           <path d="M260 336 Q270 328 282 334 M354 334 L404 326"/></g>`
      : '';
    return `<g id="${id}" transform="${place}"><g id="${id}-all">
      <g id="${id}-hairback">${braids ? braidsBack() : ''}</g>
      <path d="M266 420 L266 515 Q304 545 344 515 L344 420 Z" fill="${skin.shade}"/>
      ${o.arms ? `<g id="${id}-arms" opacity="0">${['L', 'R'].map((s) => `<path id="${id}-arm${s}" stroke="${o.top}" stroke-width="84" stroke-linecap="round" fill="none"/><circle id="${id}-hand${s}" r="42" fill="${skin.base}"/>`).join('')}</g>` : ''}
      ${outfit(id, o, skin)}
      <g id="${id}-hairfront">${braids ? braidsFront() : ''}</g>
      <g id="${id}-head">
        ${o.hair === 'afro' ? afroBack() : ''}
        <path d="M300 190 C378 190 420 248 420 326 C420 396 388 442 334 460 C304 470 272 468 250 454 C210 428 188 386 188 330 C188 252 228 190 300 190 Z" fill="${skin.base}"/>
        <path d="M420 326 C420 396 388 442 334 460 C364 430 388 392 396 338 Z" fill="${skin.shade}" opacity="0.55"/>
        <ellipse cx="312" cy="390" rx="30" ry="17" fill="${skin.blush}" opacity="0.45"/>
        <ellipse cx="222" cy="388" rx="16" ry="12" fill="${skin.blush}" opacity="0.3"/>
        <ellipse cx="408" cy="344" rx="16" ry="26" fill="${skin.base}"/>
        <path d="M404 332 Q413 344 404 356" stroke="${skin.shade}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <circle cx="410" cy="374" r="5" fill="${C.soft}"/>
        ${hairTop(id, o.hair, o.band || C.muted)}
        ${eye(id, 'L', EYES.L)}
        ${eye(id, 'R', EYES.R)}
        ${glasses}
        <path id="${id}-browL" fill="none" stroke="${HAIR}" stroke-width="6.5" stroke-linecap="round"/>
        <path id="${id}-browR" fill="none" stroke="${HAIR}" stroke-width="7.5" stroke-linecap="round"/>
        <path d="M268 352 Q258 372 260 380 Q267 388 281 384" stroke="${skin.shade}" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <path id="${id}-mouth" fill="none" stroke="#4A2418" stroke-width="6.5" stroke-linecap="round"/>
        <ellipse id="${id}-mouthO" cx="272" cy="424" rx="12" ry="0" fill="#3A1810"/>
      </g>
    </g></g>`;
  };

  // Shoulders, and the arm angles (degrees) when hanging down and when raised high.
  const ARMS = { L: { x: 140, y: 610, down: 105, up: -122, upX: 180 }, R: { x: 470, y: 610, down: 75, up: -58, upX: 430 } };
  // With the arms raised, the sweater loses the hanging-sleeve silhouette (wide shoulders, sleeve creases):
  // the torso narrows to the shoulders, so she does not seem to have a second pair of arms.
  const TORSO = {
    down: 'M40 930 C50 650 150 548 266 516 Q306 556 346 516 C462 548 556 650 566 930 Z',
    up: 'M112 930 C118 700 178 572 266 516 Q306 556 346 516 C434 572 494 700 500 930 Z',
  };
  const lerpPath = (a, b, p) => {
    const nb = b.match(/-?[\d.]+/g).map(Number);
    let i = 0;
    return a.replace(/-?[\d.]+/g, (n) => String(Math.round(SS.lerp(Number(n), nb[i++], p) * 10) / 10));
  };

  /** pose: look [-1..1, -1..1], blink 0..1, brow (raise) 0..1, sad 0..1, smile -1..1, open (mouth, "oh!") 0..1, tilt (deg),
   * breathe -1..1, arms (raised) 0..1, wave (extra degrees). */
  SS.pose = function (id, p = {}) {
    const look = p.look || [0, 0];
    const blink = p.blink || 0;
    const brow = p.brow || 0;
    const sad = p.sad || 0;
    const smile = p.smile || 0;
    const tilt = `rotate(${p.tilt || 0} ${NECK_PIVOT})`;
    for (const part of ['head', 'hairback', 'hairfront']) SS.attr(`${id}-${part}`, { transform: tilt });
    SS.attr(`${id}-all`, { transform: `translate(0 ${-(p.breathe || 0) * 4})` });
    for (const side of ['L', 'R']) {
      const e = EYES[side];
      SS.attr(`${id}-iris${side}`, { transform: `translate(${look[0] * 8} ${look[1] * 6})` });
      SS.attr(`${id}-eye${side}`, { transform: `translate(0 ${e.cy}) scale(1 ${1 - 0.92 * blink}) translate(0 ${-e.cy})` });
    }
    const up = brow * 11;
    // Sad brows: the inner ends (towards the nose) lift, the outer ends drop.
    SS.attr(`${id}-browL`, { d: `M208 ${304 - up + sad * 4} Q229 ${293 - up} 251 ${299 - up - sad * 9}` });
    SS.attr(`${id}-browR`, { d: `M291 ${298 - up - sad * 10} Q317 ${285 - up} 345 ${295 - up + sad * 5}` });
    const lift = smile * 5;
    SS.attr(`${id}-mouth`, { d: `M253 ${418 - lift} Q271 ${421 + smile * 13} 289 ${417 - lift}` });
    const open = p.open || 0;
    SS.attr(`${id}-mouthO`, { rx: 9 + open * 5, ry: open * 15 });
    SS.opacity(`${id}-mouth`, 1 - SS.clamp(open * 3));
    if (SS.$(`${id}-arms`)) {
      const u = p.arms || 0;
      SS.opacity(`${id}-arms`, u > 0.02 ? 1 : 0);
      SS.attr(`${id}-top`, { d: lerpPath(TORSO.down, TORSO.up, SS.clamp(u)) });
      if (SS.$(`${id}-creases`)) SS.opacity(`${id}-creases`, 1 - SS.clamp(u * 2));
      for (const side of ['L', 'R']) {
        const a = { ...ARMS[side], x: SS.lerp(ARMS[side].x, ARMS[side].upX, SS.clamp(u)), y: SS.lerp(610, 588, SS.clamp(u)) };
        const deg = SS.lerp(a.down, a.up, u) + (side === 'L' ? -1 : 1) * (p.wave || 0);
        const r = (deg * Math.PI) / 180;
        const ex = a.x + Math.cos(r) * 300;
        const ey = a.y + Math.sin(r) * 300;
        const bend = side === 'L' ? -40 : 40; // elbows slightly outwards
        SS.attr(`${id}-arm${side}`, { d: `M${a.x} ${a.y} Q${(a.x + ex) / 2 + bend} ${(a.y + ey) / 2} ${ex} ${ey}` });
        SS.attr(`${id}-hand${side}`, { cx: ex, cy: ey });
      }
    }
  };
})();
