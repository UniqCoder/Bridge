import type { ReactNode } from 'react';

// Custom 1.5px-stroke domain glyphs for the console rail. No icon packs.
const G = ({ children, size = 20 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
    {children}
  </svg>
);

export const Glyph = {
  monitor: <G><path d="M3 4h18v12H3zM8 20h8M12 16v4" /><path d="M6 12l3-3 3 2 5-5" /></G>,
  replay: <G><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /><path d="M10.5 9v6l4.5-3z" /></G>,
  graph: <G><circle cx="5" cy="6" r="2" /><circle cx="5" cy="18" r="2" /><circle cx="19" cy="12" r="2.5" /><path d="M7 6.6l10 4.6M7 17.4l10-4.6M5 8v8" /></G>,
  witness: <G><path d="M3 3v18M21 3v18M3 8c5 7 13 7 18 0" /><path d="M12 13.5v4" /></G>,
  incident: <G><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 16.5v.5" /></G>,
  evidence: <G><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4M9 12l2 2 4-4" /></G>,
  gauntlet: <G><path d="M4 7h16v12H4z" /><path d="M4 7l8 6 8-6" /><circle cx="12" cy="16.5" r="1.5" /></G>,
  theatre: <G><path d="M3 6h18M3 12h12M3 18h7" /><path d="M17 15v6M21 15v6" /></G>,
  eval: <G><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></G>,
  docs: <G><path d="M5 3h10l4 4v14H5z" /><path d="M8 11h8M8 15h8M8 7h4" /></G>,
  lock: <G><rect x="5" y="10" width="14" height="10" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></G>,
  gate: <G><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5l3 7M20.5 12l-7.5 1M12 20.5l-3-7M3.5 12l7.5-1" /></G>,
  seal: <G><circle cx="12" cy="10" r="6" /><path d="M9 15.5L7.5 22 12 20l4.5 2-1.5-6.5M9.5 10l1.8 1.8 3.5-3.5" /></G>,
  play: <G><path d="M7 4.5v15l12-7.5z" /></G>,
  pause: <G><path d="M8 5v14M16 5v14" /></G>,
  key: <G><circle cx="8" cy="12" r="4.5" /><path d="M12.5 12H21M18 12v3M15.5 12v2" /></G>,
};
