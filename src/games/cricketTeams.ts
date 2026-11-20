import { rect } from '../lib/gfx';
import { drawText } from '../lib/font';
import { C, shade } from '../lib/util';

/**
 * The ten IPL franchises, by name and kit colours only. The official logos are the teams'
 * trademarks, so the game draws its own pixel badges (team initials on a shield) instead.
 */
export interface Team {
  code: string;
  name: string;
  main: string;   // shirt
  trim: string;   // collar, number, badge band
  pants: string;
  helmet: string;
  text: string;   // readable colour for the initials on the badge
}

export const TEAMS: Team[] = [
  { code: 'CSK', name: 'CHENNAI SUPER KINGS', main: '#FDB913', trim: '#1B3A8A', pants: '#F2B10F', helmet: '#1B3A8A', text: '#1B3A8A' },
  { code: 'MI', name: 'MUMBAI INDIANS', main: '#0B4EA2', trim: '#D4AF37', pants: '#0A3F84', helmet: '#0A3F84', text: '#E8C55A' },
  { code: 'RCB', name: 'ROYAL CHALLENGERS BENGALURU', main: '#D11D2A', trim: '#1A1A1A', pants: '#1A1A1A', helmet: '#1A1A1A', text: '#F2D16B' },
  { code: 'KKR', name: 'KOLKATA KNIGHT RIDERS', main: '#3A225D', trim: '#D4AF37', pants: '#3A225D', helmet: '#2A1846', text: '#E8C55A' },
  { code: 'GT', name: 'GUJARAT TITANS', main: '#1C2C4C', trim: '#C8A951', pants: '#1C2C4C', helmet: '#131F38', text: '#E2C46A' },
  { code: 'RR', name: 'RAJASTHAN ROYALS', main: '#EA1A85', trim: '#254AA5', pants: '#254AA5', helmet: '#254AA5', text: '#F4F1FF' },
  { code: 'DC', name: 'DELHI CAPITALS', main: '#17479E', trim: '#EF1B23', pants: '#17479E', helmet: '#0F3478', text: '#F4F1FF' },
  { code: 'PBKS', name: 'PUNJAB KINGS', main: '#DD1F2D', trim: '#D9C08C', pants: '#B5121F', helmet: '#B5121F', text: '#F4F1FF' },
  { code: 'LSG', name: 'LUCKNOW SUPER GIANTS', main: '#2EB4E6', trim: '#F26522', pants: '#1D3F8F', helmet: '#1D3F8F', text: '#12224F' },
  { code: 'SRH', name: 'SUNRISERS HYDERABAD', main: '#F26522', trim: '#1A1A1A', pants: '#1A1A1A', helmet: '#1A1A1A', text: '#1A1A1A' },
];

/** A shield: straight sides, then tapering to a point over the last rows. */
function shield(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  const taper = Math.min(6, Math.floor(w / 2) - 1);
  for (let r = 0; r < h; r++) {
    const inset = Math.max(0, r - (h - taper - 1));
    const rw = w - inset * 2;
    if (rw > 0) rect(g, x + inset, y + r, rw, 1, c);
  }
}

/** Original pixel team badge: shield in team colours with the initials. */
export function drawBadge(g: CanvasRenderingContext2D, x: number, y: number, t: Team, w = 22, h = 20) {
  x = Math.round(x); y = Math.round(y);
  shield(g, x - 1, y - 1, w + 2, h + 2, C.ink);
  shield(g, x, y, w, h, t.main);
  rect(g, x, y, w, 3, t.trim);
  rect(g, x + 1, y + 3, w - 2, 1, shade(t.main, 1.25));
  rect(g, x + w - 2, y + 3, 1, h - 8, shade(t.main, 0.78));
  drawText(g, t.code, x + w / 2, y + Math.floor(h / 2) - 2, { color: t.text, align: 'center' });
}

/** "8-Bit Premier League" broadcast crest (our own design) for the top-left corner. */
export function drawLeagueBug(g: CanvasRenderingContext2D, x: number, y: number) {
  rect(g, x - 2, y - 2, 70, 22, 'rgba(11,10,30,0.72)');
  shield(g, x - 1, y - 1, 18, 20, C.yellow);
  shield(g, x, y, 16, 18, C.violet);
  rect(g, x, y, 16, 2, C.pink);
  // pixel batter mid-drive
  rect(g, x + 6, y + 4, 2, 2, C.white);
  rect(g, x + 6, y + 6, 2, 4, C.white);
  rect(g, x + 5, y + 10, 1, 3, C.white);
  rect(g, x + 8, y + 10, 1, 3, C.white);
  for (let i = 0; i < 5; i++) rect(g, x + 8 + i, y + 7 - i, 1, 1, C.yellow);
  rect(g, x + 12, y + 3, 2, 2, C.red);
  drawText(g, '8-BIT', x + 21, y + 1, { color: C.white });
  drawText(g, 'PREMIER', x + 21, y + 7, { color: C.yellow });
  drawText(g, 'LEAGUE', x + 21, y + 13, { color: C.lavender });
}
