export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
export const randi = (a: number, b: number) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p: number) => Math.random() < p;
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIn = (t: number) => Math.pow(clamp(t, 0, 1), 2);
export const easeInOut = (t: number) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

/** Darken (f < 1) or lighten (f > 1) a #RRGGBB colour. */
export function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

/** Small seeded PRNG so golf courses can be regenerated from their number. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Brand palette (from the Figma colour frame) plus a few game colours. */
export const C = {
  pink: '#A8457E',
  pinkHi: '#D274A8',
  plum: '#551B52',
  ink: '#03050B',
  navy: '#120F2B',
  purple: '#3A2459',
  violet: '#6236AE',
  lavender: '#8A7BC3',
  white: '#F4F1FF',
  grey: '#9A98B0',
  yellow: '#FFC21A',
  orange: '#F7882F',
  red: '#E43B44',
  green: '#2FBF71',
  blue: '#2F6FE4',
  sky: '#5BC8FF',
  skin: '#F2B48C',
  skin2: '#C98A5E',
  skin3: '#8D5A3B',
} as const;

export const SKINS = [C.skin, C.skin2, C.skin3];
