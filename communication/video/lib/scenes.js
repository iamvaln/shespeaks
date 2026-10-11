// Shared sets and props: the conference hall (seen from the back of the audience), the presenters on stage,
// thought clouds and speech bubbles, plus timing helpers common to both episodes.
(function () {
  const C = SS.C;
  const { prog, ease, zoom } = SS;

  SS.defs = () => `<defs>
    <filter id="blur8" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="blur30" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>
    <linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.soft}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.soft}" stop-opacity="0.02"/></linearGradient>
    <linearGradient id="beamAmber" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.amber}" stop-opacity="0.32"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0.04"/></linearGradient>
    <radialGradient id="stageLight"><stop offset="0" stop-color="${C.soft}" stop-opacity="0.2"/><stop offset="1" stop-color="${C.soft}" stop-opacity="0"/></radialGradient>
    <radialGradient id="amberLight"><stop offset="0" stop-color="${C.amber}" stop-opacity="0.22"/><stop offset="1" stop-color="${C.amber}" stop-opacity="0"/></radialGradient>
  </defs>`;

  /** A member of the audience seen from behind. */
  SS.crowdHead = (x, y, r, color, rim = 0.16) => `<g><ellipse cx="${x}" cy="${y + r * 1.95}" rx="${r * 1.75}" ry="${r * 1.3}" fill="${color}"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>
    <path d="M${x - r * 0.8} ${y - r * 0.55} A${r} ${r} 0 0 1 ${x + r * 0.8} ${y - r * 0.55}" stroke="${C.soft}" stroke-opacity="${rim}" stroke-width="${r * 0.09}" fill="none" stroke-linecap="round"/></g>`;

  // The people the camera finds in the audience, seen from behind (row 3, r = 52).
  const BACKS = {
    // Episode 1's heroine: long braids over the hoodie, small top knot.
    braids: (X, Y) => {
      const strands = [-40, -28, -16, -4, 8, 20, 32, 44].map((dx) => `<path d="M${X + dx * 0.8} ${Y + 20} C${X + dx} ${Y + 80} ${X + dx * 1.05} ${Y + 120} ${X + dx * 1.1} ${Y + 146}" stroke="#3A2C24" stroke-width="4" stroke-dasharray="4 7" stroke-linecap="round" fill="none"/>`).join('');
      return `<ellipse cx="${X}" cy="${Y + 100}" rx="91" ry="68" fill="#3A4060"/>
        <ellipse cx="${X}" cy="${Y + 52}" rx="58" ry="26" fill="#30364F"/>
        <circle cx="${X}" cy="${Y}" r="52" fill="#16110E"/>
        <path d="M${X - 50} ${Y} C${X - 58} ${Y + 60} ${X - 62} ${Y + 110} ${X - 58} ${Y + 148} Q${X} ${Y + 160} ${X + 58} ${Y + 148} C${X + 62} ${Y + 110} ${X + 58} ${Y + 60} ${X + 50} ${Y} Z" fill="#16110E"/>${strands}
        <circle cx="${X + 4}" cy="${Y - 58}" r="24" fill="#16110E"/>
        <ellipse cx="${X + 4}" cy="${Y - 38}" rx="22" ry="7" fill="${C.muted}"/>`;
    },
    // Episode 2's last shot: a girl with a big afro, grey sweater.
    afro: (X, Y) => `<ellipse cx="${X}" cy="${Y + 100}" rx="91" ry="68" fill="#3A4060"/>
      <circle cx="${X}" cy="${Y - 12}" r="70" fill="#16110E"/>
      <path d="M${X - 40} ${Y - 60} Q${X} ${Y - 84} ${X + 40} ${Y - 60}" stroke="#3A2C24" stroke-width="4" fill="none" stroke-linecap="round"/>`,
  };

  /**
   * The hall from the back rows. o: focus {x, y} (who the camera finds), back ('braids' | 'afro'), slide {label, lines,
   * size, sub, diagram}, presenter (SVG), spot (amber pool of light under the presenter, id `${id}-spot`).
   */
  SS.hall = (id, o) => {
    const F = o.focus;
    const rows = [
      { y: 905, r: 28, n: 13, color: '#2B3050', off: 0 },
      { y: 1060, r: 38, n: 11, color: '#252A47', off: 0.5 },
      { y: 1262, r: 52, n: 9, color: '#20253F', off: 0, focus: true },
      { y: 1530, r: 72, n: 7, color: '#1A1E36', off: 0.5 },
      { y: 1860, r: 98, n: 5, color: '#151930', off: 0 },
    ];
    let crowd = '';
    SS.HALL_HEADS = [];
    for (const row of rows) {
      const step = 1180 / (row.n - 1);
      for (let i = 0; i < row.n; i++) {
        let x = -50 + (i + row.off) * step + ((i * 37) % 23) - 11;
        if (row.focus && Math.abs(x - F.x) < step / 2) {
          crowd += `<g>${BACKS[o.back](F.x, row.y)}
            <path d="M${F.x - 44} ${row.y - 26} A52 52 0 0 1 ${F.x + 44} ${row.y - 26}" stroke="${C.soft}" stroke-opacity="0.4" stroke-width="5" fill="none" stroke-linecap="round"/></g>`;
          continue;
        }
        // Keep the line of sight to the focus clear in the rows in front.
        if (row.y > F.y && Math.abs(x - F.x) < row.r * 1.6) x += x < F.x ? -row.r * 1.4 : row.r * 1.4;
        crowd += SS.crowdHead(x, row.y, row.r, row.color);
        SS.HALL_HEADS.push({ x, y: row.y, r: row.r });
      }
    }
    const s = o.slide;
    const lines = s.lines.map((l, i) => `<tspan x="160" y="${384 + i * (s.size + 8)}">${l}</tspan>`).join('');
    const diagram = s.diagram
      ? `<g fill="${C.sunken}" stroke="${C.soft}" stroke-opacity="0.5" stroke-width="3">
          <rect x="160" y="452" width="140" height="88" rx="14"/><rect x="370" y="452" width="140" height="88" rx="14"/><rect x="580" y="452" width="140" height="88" rx="14"/>
        </g>
        <path d="M306 496 H364 M516 496 H574" stroke="${C.soft}" stroke-opacity="0.6" stroke-width="4" stroke-linecap="round"/>`
      : '';
    const sub = s.sub ? `<text x="160" y="600" font-family="IBM Plex Mono" font-weight="500" font-size="26" letter-spacing="2" fill="${C.amber}">${s.sub}</text>` : '';
    const spot = o.spot
      ? `<polygon id="${id}-beamAmber" points="866,0 934,0 1020,700 780,700" fill="url(#beamAmber)" opacity="0"/>
         <ellipse id="${id}-spot" cx="900" cy="704" rx="150" ry="24" fill="${C.amber}" opacity="0"/>`
      : '';
    return `<g id="${id}">
      <rect width="1080" height="1920" fill="${C.night}"/>
      <rect x="80" y="190" width="780" height="510" rx="40" fill="${C.soft}" opacity="0.07" filter="url(#blur30)"/>
      <rect x="0" y="690" width="1080" height="90" fill="${C.raised}"/>
      <rect x="0" y="690" width="1080" height="6" fill="${C.line}"/>
      <rect x="110" y="230" width="700" height="430" rx="14" fill="#1E2442" stroke="${C.line}" stroke-width="4"/>
      <text x="160" y="300" font-family="IBM Plex Mono" font-weight="500" font-size="22" letter-spacing="4" fill="${C.muted}">${s.label}</text>
      <text font-family="Archivo" font-weight="800" font-size="${s.size}" fill="${C.ink}">${lines}</text>
      ${diagram}${sub}
      <polygon points="866,0 934,0 1020,700 780,700" fill="url(#beam)"/>
      ${spot}
      ${o.presenter}
      ${crowd}
    </g>`;
  };

  // The man presenting (episode 1): broad shoulders, short hair and beard, blazer; one arm points at the slide, the other holds the mic.
  SS.manPresenter = () => {
    const body = '#384066';
    const rim = `stroke="${C.soft}" stroke-opacity="0.45" stroke-width="4" fill="none" stroke-linecap="round"`;
    return `<g id="speaker">
      <path d="M870 700 L872 584 L898 584 L896 700 Z M904 700 L904 584 L930 584 L934 700 Z" fill="#2C3354"/>
      <ellipse cx="880" cy="702" rx="18" ry="7" fill="#1A1E36"/><ellipse cx="922" cy="702" rx="18" ry="7" fill="#1A1E36"/>
      <rect x="891" y="436" width="20" height="30" fill="#4A3426"/>
      <path d="M852 596 L858 478 Q900 452 944 478 L950 596 Z" fill="${body}"/>
      <path d="M886 462 L901 506 L916 462 Z" fill="${C.soft}" opacity="0.55"/>
      <path d="M886 462 L898 540 M916 462 L904 540" stroke="#2C3354" stroke-width="4"/>
      <g id="spkArm"><path d="M862 486 L812 470 L770 452" stroke="${body}" stroke-width="21" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="764" cy="449" r="11" fill="#5A3E2C"/><path d="M756 446 L744 441" stroke="#5A3E2C" stroke-width="6" stroke-linecap="round"/></g>
      <path d="M940 488 Q966 470 936 438" stroke="${body}" stroke-width="20" stroke-linecap="round" fill="none"/>
      <circle cx="934" cy="436" r="10" fill="#5A3E2C"/>
      <rect x="922" y="414" width="12" height="26" rx="5" fill="${C.muted}" transform="rotate(-25 928 427)"/>
      <ellipse cx="900" cy="410" rx="27" ry="31" fill="#5A3E2C"/>
      <path d="M873 404 C872 376 888 368 902 368 C918 368 930 378 928 402 C922 388 912 384 900 384 C888 384 878 390 873 404 Z" fill="#16110E"/>
      <path d="M876 418 C880 444 920 444 926 418 C920 432 882 432 876 418 Z" fill="#16110E"/>
      <path d="M876 388 A28 30 0 0 1 924 386" ${rim}/>
      <path d="M858 480 Q900 456 942 480" ${rim}/>
    </g>`;
  };

  // Her on stage (episode 2): hoodie (colour set on `hpBody` through currentColor), braids, top knot with the amber tie, mic.
  SS.herPresenter = () => {
    const skin = '#8A5536';
    return `<g id="hp">
      <path d="M874 700 L876 590 L898 590 L897 700 Z M904 700 L904 590 L926 590 L930 700 Z" fill="#2C3354"/>
      <ellipse cx="884" cy="702" rx="17" ry="7" fill="${C.ink}"/><ellipse cx="920" cy="702" rx="17" ry="7" fill="${C.ink}"/>
      <path d="M872 404 C870 372 932 372 930 404 L940 520 L862 520 Z" fill="#16110E"/>
      <rect x="892" y="434" width="18" height="30" fill="#6E4129"/>
      <g id="hpBody" style="color:#3A4060">
        <path d="M856 600 L862 482 Q900 454 940 482 L946 600 Z" fill="currentColor"/>
        <path d="M878 468 Q901 494 924 468" stroke="#000" stroke-opacity="0.2" stroke-width="8" fill="none"/>
        <g id="hpArm"><path d="M866 490 L818 474 L778 458" stroke="currentColor" stroke-width="19" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <circle cx="772" cy="455" r="10" fill="${skin}"/></g>
        <path d="M936 492 Q962 474 932 442" stroke="currentColor" stroke-width="18" stroke-linecap="round" fill="none"/>
      </g>
      <path d="M892 476 L890 520 M910 476 L912 520" stroke="${C.soft}" stroke-width="3"/>
      <circle cx="930" cy="440" r="9" fill="${skin}"/>
      <rect x="918" y="418" width="11" height="24" rx="5" fill="${C.muted}" transform="rotate(-25 924 430)"/>
      <ellipse cx="901" cy="410" rx="25" ry="29" fill="${skin}"/>
      <path d="M876 404 C874 380 890 372 902 372 C916 372 928 382 926 402 C918 390 910 388 900 388 C890 388 882 392 876 404 Z" fill="#16110E"/>
      <path d="M874 404 L868 470 M928 402 L934 470" stroke="#16110E" stroke-width="9" stroke-linecap="round"/>
      <circle cx="902" cy="364" r="15" fill="#16110E"/>
      <rect x="890" y="374" width="24" height="7" rx="3.5" fill="${C.amber}"/>
      <circle cx="893" cy="410" r="3" fill="#16110E"/><circle cx="910" cy="410" r="3" fill="#16110E"/>
      <path d="M892 422 Q901 430 911 422" stroke="#4A2418" stroke-width="3" fill="none" stroke-linecap="round"/>
    </g>`;
  };

  /** Thought cloud (the big one of episode 1, filling the top of the frame). */
  SS.cloud = () => {
    let bumps = '';
    for (let x = 200; x <= 880; x += 113) bumps += `<circle cx="${x}" cy="176" r="72"/><circle cx="${x}" cy="706" r="72"/>`;
    for (let y = 290; y <= 600; y += 103) bumps += `<circle cx="136" cy="${y}" r="72"/><circle cx="944" cy="${y}" r="72"/>`;
    return `<g fill="${C.ink}">${bumps}<rect x="136" y="176" width="808" height="530" rx="60"/></g>`;
  };

  /** Speech bubble with a tail pointing at `tip`; dashed for a whisper. */
  SS.speech = (id, x, y, w, h, tip, dashed, content) => {
    const bx = SS.clamp(tip[0], x + 80, x + w - 80);
    const line = dashed ? `stroke="${C.muted}" stroke-width="4" stroke-dasharray="14 10"` : '';
    return `<g id="${id}"><path d="M${bx - 36} ${y + h - 6} L${tip[0]} ${tip[1]} L${bx + 36} ${y + h - 6} Z" fill="${C.ink}" ${line}/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="50" fill="${C.ink}" ${line}/>
      <path d="M${bx - 32} ${y + h - 2} H${bx + 32}" stroke="${C.ink}" stroke-width="8"/>${content}</g>`;
  };

  /** Pop in at `tIn` (springy), shrink away at `tOut`. */
  SS.popIO = (t, id, tIn, tOut, cx, cy) => {
    const s = ease.back(SS.clamp((t - tIn) / 0.35)) * (1 - prog(t, tOut, 0.25, ease.in));
    SS.attr(id, { transform: zoom(Math.max(0, s), cx, cy) });
  };
  /** Fade in while rising a little. */
  SS.fadeUp = (t, id, at, out = Infinity) => {
    const p = prog(t, at, 0.5, ease.out) * (1 - prog(t, out, 0.3));
    SS.opacity(id, p);
    SS.attr(id, { transform: `translate(0 ${(1 - prog(t, at, 0.5, ease.out)) * 40})` });
  };
  /** Mouth movement while someone talks between a and b. */
  SS.talk = (t, a, b) => (t > a && t < b ? 0.25 + 0.25 * Math.abs(Math.sin(t * 17)) : 0);
})();
