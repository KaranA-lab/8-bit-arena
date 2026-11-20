// A tiny 3x5 bitmap font so every bit of in-game text sits on the pixel grid.
const RAW: Record<string, string> = {
  A: '###,#.#,###,#.#,#.#',
  B: '##.,#.#,##.,#.#,##.',
  C: '###,#..,#..,#..,###',
  D: '##.,#.#,#.#,#.#,##.',
  E: '###,#..,##.,#..,###',
  F: '###,#..,##.,#..,#..',
  G: '###,#..,#.#,#.#,###',
  H: '#.#,#.#,###,#.#,#.#',
  I: '###,.#.,.#.,.#.,###',
  J: '..#,..#,..#,#.#,###',
  K: '#.#,#.#,##.,#.#,#.#',
  L: '#..,#..,#..,#..,###',
  M: '#...#,##.##,#.#.#,#...#,#...#',
  N: '#..#,##.#,#.##,#..#,#..#',
  O: '###,#.#,#.#,#.#,###',
  P: '###,#.#,###,#..,#..',
  Q: '###,#.#,#.#,##.,..#',
  R: '##.,#.#,##.,#.#,#.#',
  S: '###,#..,###,..#,###',
  T: '###,.#.,.#.,.#.,.#.',
  U: '#.#,#.#,#.#,#.#,###',
  V: '#.#,#.#,#.#,#.#,.#.',
  W: '#...#,#...#,#.#.#,##.##,#...#',
  X: '#.#,#.#,.#.,#.#,#.#',
  Y: '#.#,#.#,.#.,.#.,.#.',
  Z: '###,..#,.#.,#..,###',
  '0': '###,#.#,#.#,#.#,###',
  '1': '.#.,##.,.#.,.#.,###',
  '2': '###,..#,###,#..,###',
  '3': '###,..#,.##,..#,###',
  '4': '#.#,#.#,###,..#,..#',
  '5': '###,#..,###,..#,###',
  '6': '###,#..,###,#.#,###',
  '7': '###,..#,.#.,.#.,.#.',
  '8': '###,#.#,###,#.#,###',
  '9': '###,#.#,###,..#,###',
  ' ': '..,..,..,..,..',
  '.': '.,.,.,.,#',
  ',': '.,.,.,#,#',
  '!': '#,#,#,.,#',
  '?': '###,..#,.##,...,.#.',
  ':': '.,#,.,#,.',
  '-': '...,...,###,...,...',
  '+': '...,.#.,###,.#.,...',
  '/': '..#,..#,.#.,#..,#..',
  "'": '#,#,.,.,.',
  '(': '.#,#.,#.,#.,.#',
  ')': '#.,.#,.#,.#,#.',
  '=': '...,###,...,###,...',
  '>': '#..,.#.,..#,.#.,#..',
  '<': '..#,.#.,#..,.#.,..#',
  '%': '#.#,..#,.#.,#..,#.#',
  '#': '.#.#.,#####,.#.#.,#####,.#.#.',
  '*': '...,#.#,.#.,#.#,...',
  '^': '.#.,#.#,...,...,...',
};

interface Glyph { w: number; rows: string[] }
const GLYPHS: Record<string, Glyph> = {};
for (const [k, v] of Object.entries(RAW)) {
  const rows = v.split(',');
  GLYPHS[k] = { w: rows[0].length, rows };
}
const glyph = (ch: string) => GLYPHS[ch] ?? GLYPHS['?'];

export function measure(text: string, scale = 1): number {
  let w = 0;
  for (const ch of text.toUpperCase()) w += glyph(ch).w + 1;
  return Math.max(0, w - 1) * scale;
}

const cache = new Map<string, HTMLCanvasElement>();
function renderLine(text: string, color: string): HTMLCanvasElement {
  const key = color + '|' + text;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 500) cache.clear();
  const c = document.createElement('canvas');
  c.width = Math.max(1, measure(text));
  c.height = 5;
  const g = c.getContext('2d')!;
  g.fillStyle = color;
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const gl = glyph(ch);
    for (let y = 0; y < 5; y++) {
      const row = gl.rows[y];
      for (let i = 0; i < row.length; i++) if (row[i] === '#') g.fillRect(x + i, y, 1, 1);
    }
    x += gl.w + 1;
  }
  cache.set(key, c);
  return c;
}

export interface TextOpts {
  color?: string;
  scale?: number;
  align?: 'left' | 'center' | 'right';
  outline?: string;
  shadow?: string;
}

/** Draw pixel text. (x, y) is the top-left corner (or top-centre / top-right with align). */
export function drawText(g: CanvasRenderingContext2D, text: string, x: number, y: number, o: TextOpts = {}) {
  const scale = o.scale ?? 1;
  const w = measure(text, scale);
  const dx = Math.round(o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x);
  const dy = Math.round(y);
  const blit = (col: string, ox: number, oy: number) => {
    const c = renderLine(text, col);
    g.drawImage(c, dx + ox, dy + oy, c.width * scale, c.height * scale);
  };
  if (o.shadow) {
    const s = Math.max(1, Math.floor(scale / 2));
    if (o.outline) {
      for (let ox = -1; ox <= 1; ox++) blit(o.shadow, ox, s + 1);
    } else blit(o.shadow, 0, s);
  }
  if (o.outline) {
    for (let ox = -1; ox <= 1; ox++)
      for (let oy = -1; oy <= 1; oy++) if (ox || oy) blit(o.outline, ox, oy);
  }
  blit(o.color ?? '#fff', 0, 0);
}
