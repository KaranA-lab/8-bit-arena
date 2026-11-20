// Shared, mutable scene state read by independent animation loops (plane <-> crowd).
export const planeState = { x: -999, y: -999, w: 0, visible: false };

export const MOBILE_MAX = 760;
export const isMobileLayout = () => window.innerWidth <= MOBILE_MAX;

/** Design units: 1 Figma px. Desktop fits the 1440x800 frame; phones zoom in on its centre. */
export function designUnit() {
  if (isMobileLayout()) return window.innerWidth / MOBILE_MAX;
  return Math.min(window.innerWidth / 1440, window.innerHeight / 800);
}

/** Top of the 1440x800 stage: centred on desktop, pinned near the top on phones. */
export function stageTop() {
  if (isMobileLayout()) return Math.round(window.innerHeight * 0.05);
  return Math.max(0, (window.innerHeight - 800 * designUnit()) / 2);
}

/** Scale + top offset for the 1091px-wide desktop monitor, so it fits any viewport. */
export function monitorLayout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const k = vw < 900 ? 0.96 : 0.758;
  const s = Math.min((vw * k) / 1091, (vh * 0.84) / 620);
  const u = designUnit();
  const top = Math.max(124 * u, (vh - 640 * s) / 2);
  return { s, top };
}

/** y offset (in the monitor's own units) that puts it fully below the viewport. */
export function monitorOffY() {
  if (isMobileLayout()) return window.innerHeight + 60; // handheld is unscaled
  const { s, top } = monitorLayout();
  return Math.ceil((window.innerHeight - top) / s) + 80;
}

export function applyLayoutVars() {
  const r = document.documentElement.style;
  const u = designUnit();
  const { s, top } = monitorLayout();
  r.setProperty('--u', `${u}px`);
  r.setProperty('--s', String(s));
  r.setProperty('--mon-top', `${top}px`);
  r.setProperty('--stage-top', `${stageTop()}px`);
}

// ---------- depth layering ----------
// Clouds sit at fixed depths; the plane gets a z-index between them depending on how
// near it is, so it can slip behind one cloud and pass in front of the next.
export const cloudZ = (depth: number) => 20 + 2 * Math.round(depth * 20);
export const Z = { planeFar: 21, crowdBack: 70, planeLow: 71, crowdFront: 72, planeExit: 90 };

export interface CloudSpot { x: number; y: number; w: number; flip: boolean; depth: number; ax: number; ay: number; aw: number; bob: number }

/** Cloud positions in design px: home (Desktop 1) and arcade (Desktop 2) states. */
export const CLOUDS: CloudSpot[] = [
  { x: 384, y: 29, w: 372, flip: true, depth: 0.55, ax: 487, ay: -126, aw: 152, bob: 0 },
  { x: 1002, y: 97, w: 211, flip: false, depth: 0.8, ax: 1010, ay: -101, aw: 86, bob: 1 },
  { x: 1184, y: 79, w: 165, flip: false, depth: 0.35, ax: 1274, ay: -120, aw: 67, bob: 2 },
  { x: 111, y: 79, w: 127, flip: false, depth: 0.7, ax: 302, ay: -126, aw: 52, bob: 1 },
  { x: -55, y: 162, w: 127, flip: false, depth: 0.3, ax: 133, ay: -98, aw: 51, bob: 0 },
];

/** Phones only see the middle ~760px of the frame, so the same clouds are rearranged there. */
export const CLOUDS_MOBILE: CloudSpot[] = [
  { x: 430, y: 130, w: 380, flip: true, depth: 0.55, ax: 470, ay: -520, aw: 150, bob: 0 },
  { x: 850, y: 30, w: 210, flip: false, depth: 0.8, ax: 880, ay: -420, aw: 90, bob: 1 },
  { x: 930, y: 300, w: 150, flip: false, depth: 0.35, ax: 960, ay: -520, aw: 60, bob: 2 },
  { x: 310, y: 20, w: 170, flip: false, depth: 0.7, ax: 340, ay: -420, aw: 60, bob: 1 },
  { x: 380, y: 390, w: 120, flip: false, depth: 0.3, ax: 400, ay: -620, aw: 50, bob: 0 },
];

export const GAMES = [
  { id: 'cricket', name: 'CRICKET', title: 'Cricket' },
  { id: 'football', name: 'FOOTBALL', title: 'Football' },
  { id: 'golf', name: 'MINI GOLF', title: 'Mini Golf' },
  { id: 'badminton', name: 'BADMINTON', title: 'Badminton' },
] as const;
