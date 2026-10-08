// Line icons for the landing page (24x24, drawn with currentColor). Decorative: always aria-hidden.
const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

export type IconName = 'mic' | 'users' | 'monitor' | 'file' | 'slides' | 'chat' | 'arrow' | 'chevron' | 'linkedin' | 'x';

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  const p = { ...common, width: size, height: size, className };
  switch (name) {
    case 'mic':
      return (<svg {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" /></svg>);
    case 'users':
      return (<svg {...p}><circle cx="12" cy="8" r="2.7" /><path d="M7.4 19c0-2.6 2-4.4 4.6-4.4s4.6 1.8 4.6 4.4" /><circle cx="5.6" cy="10.2" r="2" /><path d="M2.2 18c0-2 1.4-3.4 3.4-3.4" /><circle cx="18.4" cy="10.2" r="2" /><path d="M21.8 18c0-2-1.4-3.4-3.4-3.4" /></svg>);
    case 'monitor':
      return (<svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><circle cx="12" cy="8.6" r="1.8" /><path d="M8.8 13.4c.6-1.4 1.9-2.2 3.2-2.2s2.6.8 3.2 2.2" /></svg>);
    case 'file':
      return (<svg {...p}><path d="M6.5 3h8l4 4v14h-12z" /><path d="M14.5 3v4h4M9 12h6M9 15.5h6M9 8.5h3" /></svg>);
    case 'slides':
      return (<svg {...p}><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><circle cx="9" cy="9.4" r="1.4" /><path d="M13 9h4M13 12h4" /></svg>);
    case 'chat':
      return (<svg {...p}><path d="M4 5h10.5A1.5 1.5 0 0 1 16 6.5v5a1.5 1.5 0 0 1-1.5 1.5H9l-3.2 2.8V13H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 5z" /><path d="M18 9.2h2a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-1.3V21l-3.1-2.8H11" /></svg>);
    case 'arrow':
      return (<svg {...p} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
    case 'chevron':
      return (<svg {...p} strokeWidth={2}><path d="M6 9l6 6 6-6" /></svg>);
    case 'linkedin':
      return (<svg {...p} fill="currentColor" stroke="none"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zM7.119 20.452H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>);
    case 'x':
      return (<svg {...p} fill="currentColor" stroke="none"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.29 19.494h2.039L6.486 3.24H4.298l13.311 17.407z" /></svg>);
  }
}
