// On-brand illustrations used in the home slider until real photos are provided (see src/content/slides.ts).
// Drawn with the charte's own vocabulary: the amber ring frames a person, the amber ellipse is the stage.
// Always on the "nuit" background, so literal brand colours are intentional here.
const NIGHT = '#111528';
const RAISED = '#1A1F36';
const SUNKEN = '#262B44';
const LINE = '#2E3350';
const AMBER = '#F5A524';
const INK = '#F7F3EC';
const MUTED = '#9AA0B8';

export type SceneKind = 'talk' | 'lightning' | 'workshop' | 'demo' | 'rehearsal' | 'dayd';

// Charte: "un seul des deux par visuel" (anneau OU ellipse), une seule zone de lumière dominante.
// So each scene has ONE amber element: a lit ring on the person who is the subject, or the stage ellipse on the talk day.
function Person({ x, y, size, lit = false }: { x: number; y: number; size: number; lit?: boolean }) {
  const k = size / 100;
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`}>
      <circle cx="50" cy="50" r="47" fill={NIGHT} stroke={lit ? AMBER : LINE} strokeWidth="5" />
      <clipPath id={`clip-${x}-${y}-${size}`}><circle cx="50" cy="50" r="39" /></clipPath>
      <g clipPath={`url(#clip-${x}-${y}-${size})`}>
        <rect x="0" y="0" width="100" height="100" fill={SUNKEN} />
        <circle cx="50" cy="42" r="14" fill={MUTED} />
        <path d="M18 100 Q50 52 82 100 Z" fill={MUTED} />
      </g>
    </g>
  );
}

function Crowd({ y = 470 }: { y?: number }) {
  const back = Array.from({ length: 11 }, (_, i) => 20 + i * 76);
  const front = Array.from({ length: 10 }, (_, i) => 58 + i * 76);
  return (
    <g>
      {back.map((x) => (<g key={`b${x}`}><circle cx={x} cy={y - 16} r="20" fill={RAISED} /><ellipse cx={x} cy={y + 44} rx="34" ry="30" fill={RAISED} /></g>))}
      {front.map((x, i) => (<g key={`f${x}`}><circle cx={x} cy={y + 8} r="24" fill={i % 4 === 1 ? LINE : SUNKEN} /><ellipse cx={x} cy={y + 72} rx="40" ry="38" fill={i % 4 === 1 ? LINE : SUNKEN} /></g>))}
    </g>
  );
}

const Stage = ({ cy = 392, rx = 340, lit = false }: { cy?: number; rx?: number; lit?: boolean }) => <ellipse cx="400" cy={cy} rx={rx} ry="28" fill={lit ? AMBER : LINE} />;

export function Scene({ kind }: { kind: SceneKind }) {
  return (
    <svg viewBox="0 0 800 560" role="img" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice" style={{ display: 'block', width: '100%', height: '100%' }}>
      <defs>
        <radialGradient id={`glow-${kind}`} cx="50%" cy="46%" r="55%">
          <stop offset="0" stopColor={AMBER} stopOpacity="0.28" />
          <stop offset="1" stopColor={AMBER} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`beam-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={AMBER} stopOpacity="0.5" />
          <stop offset="1" stopColor={AMBER} stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="800" height="560" fill={NIGHT} />
      <rect width="800" height="560" fill={`url(#glow-${kind})`} />

      {kind === 'talk' && (
        <g>
          <rect x="300" y="62" width="400" height="236" rx="12" fill={RAISED} stroke={LINE} strokeWidth="2" />
          <rect x="332" y="96" width="170" height="16" rx="8" fill={INK} />
          {[132, 156, 180].map((y, i) => (<rect key={y} x="332" y={y} width={[300, 262, 220][i]} height="9" rx="4.5" fill={MUTED} opacity=".55" />))}
          {[0, 1, 2, 3].map((i) => (<rect key={i} x={540 + i * 30} y={262 - [40, 70, 52, 96][i]} width="20" height={[40, 70, 52, 96][i]} rx="3" fill={INK} opacity={i === 3 ? 0.95 : 0.55} />))}
          <Stage /><Person x={96} y={160} size={176} lit /><Crowd />
        </g>
      )}

      {kind === 'lightning' && (
        <g>
          <circle cx="470" cy="190" r="128" fill="none" stroke={LINE} strokeWidth="16" />
          <circle cx="470" cy="190" r="128" fill="none" stroke={AMBER} strokeWidth="16" strokeLinecap="round" strokeDasharray="804" strokeDashoffset="598" transform="rotate(-90 470 190)" />
          <path d="M486 106 L428 204 L468 204 L452 280 L520 172 L480 172 Z" fill={INK} />
          <rect x="330" y="26" width="28" height="12" rx="6" fill={MUTED} />
          <Stage /><Person x={120} y={176} size={160} /><Crowd />
        </g>
      )}

      {kind === 'workshop' && (
        <g>
          <rect x="150" y="226" width="500" height="150" rx="30" fill={RAISED} stroke={LINE} strokeWidth="2" />
          {[250, 330, 470, 550].map((x, i) => (
            <g key={x} transform={`translate(${x - 38} ${i % 2 ? 270 : 284})`}>
              <rect width="76" height="46" rx="5" fill={SUNKEN} stroke={MUTED} strokeWidth="2" />
              <rect x="10" y="12" width="34" height="5" rx="2.5" fill={INK} />
              <rect x="10" y="24" width="52" height="5" rx="2.5" fill={MUTED} opacity=".7" />
              <rect x="-6" y="46" width="88" height="7" rx="3.5" fill={LINE} />
            </g>
          ))}
          <Person x={92} y={120} size={116} /><Person x={236} y={30} size={116} /><Person x={448} y={30} size={116} /><Person x={592} y={120} size={116} />
          <Person x={342} y={372} size={116} lit /><Person x={150} y={332} size={96} /><Person x={554} y={332} size={96} />
          <Stage cy={520} rx={360} />
        </g>
      )}

      {kind === 'demo' && (
        <g>
          <rect x="190" y="52" width="420" height="262" rx="14" fill={RAISED} stroke={LINE} strokeWidth="2" />
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <rect key={i} x={222 + [0, 24, 24, 48, 24, 0, 0][i]} y={86 + i * 28} width={[120, 170, 120, 150, 90, 70, 50][i]} height="10" rx="5" fill={[INK, INK, MUTED, INK, MUTED, INK, MUTED][i]} opacity={i === 0 || i === 5 ? 0.95 : 0.7} />
          ))}
          <rect x="450" y="86" width="132" height="170" rx="8" fill={SUNKEN} />
          <circle cx="516" cy="150" r="30" fill="none" stroke={AMBER} strokeWidth="6" />
          <path d="M501 150 L512 162 L534 138" fill="none" stroke={AMBER} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="480" y="200" width="72" height="8" rx="4" fill={MUTED} opacity=".7" />
          <path d="M150 314 H650 L618 336 H182 Z" fill={LINE} />
          <Stage /><Person x={42} y={170} size={150} /><Crowd />
        </g>
      )}

      {kind === 'rehearsal' && (
        <g>
          <circle cx="672" cy="112" r="44" fill="none" stroke={LINE} strokeWidth="10" />
          <path d="M672 112 L672 80" stroke={INK} strokeWidth="8" strokeLinecap="round" /><path d="M672 112 L692 124" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <rect x="660" y="52" width="24" height="10" rx="4" fill={LINE} />
          <Stage cy={330} rx={300} /><Person x={304} y={104} size={192} lit />
          {[88, 196, 304, 412, 520, 628].map((x, i) => (<Person key={x} x={x} y={i % 2 ? 392 : 410} size={92} />))}
        </g>
      )}

      {kind === 'dayd' && (
        <g>
          <polygon points="400,0 560,392 240,392" fill={`url(#beam-${kind})`} />
          <Stage lit /><Person x={290} y={128} size={220} />
          <Crowd />
          {[110, 262, 566, 718].map((x) => (<g key={x}><path d={`M${x - 18} 460 l-8 -34 M${x + 18} 460 l8 -34`} stroke={MUTED} strokeWidth="6" strokeLinecap="round" /></g>))}
        </g>
      )}
    </svg>
  );
}
