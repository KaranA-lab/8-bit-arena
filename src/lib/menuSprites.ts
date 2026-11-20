// Tiny hover animations for the menu: the game's ball/shuttle travels across above the title.
export type SpriteKind = 'cricket' | 'football' | 'golf' | 'badminton' | 'creator' | 'locked';

const PAL: Record<string, string> = {
  r: '#D62839', h: '#FF8A8A', d: '#8E1B2B', s: '#F7E7CE',
  w: '#F4F1FF', k: '#03050B', g: '#B9B5C9', p: '#A8457E', y: '#FFC21A', R: '#E43B44',
  e: '#F28BB4', o: '#D99A00', t: '#E8C48A',
};

// a little pencil, pointing right (eraser, band, body, wood, lead)
const PENCIL = ['egyyyyyyt.', 'egyyyyyytk', 'egoooooot.'];
const HEART = ['.pp.pp.', 'ppppppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...'];

const CIRCLE8 = ['..xxxx..', '.xxxxxx.', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', '.xxxxxx.', '..xxxx..'];
const SEAMS: [number, number][][] = [
  [[5, 1], [4, 2], [4, 3], [3, 4], [3, 5], [2, 6]], // /
  [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [4, 7]], // |
  [[2, 1], [3, 2], [3, 3], [4, 4], [4, 5], [5, 6]], // \
  [[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4]], // -
];

function cricketFrame(f: number): string[] {
  const rows: string[][] = CIRCLE8.map((row, y) =>
    row.split('').map((c, x) => (c === '.' ? '.' : x + y <= 3 ? 'h' : x + y >= 11 ? 'd' : 'r')),
  );
  for (const [x, y] of SEAMS[f % 4]) if (rows[y][x] !== '.') rows[y][x] = 's';
  return rows.map((r) => r.join(''));
}

const FOOT = [
  ['..wwww..', '.wwkkww.', 'wwwkkwww', 'wkwwwwkw', 'kkwwwwkk', 'wkwwwwkw', '.wwkkgw.', '..wggg..'],
  ['..wwww..', '.kwwwwk.', 'wkkwwkkw', 'wwwkkwww', 'wwwkkwww', 'wkkwwkkg', '.kwwwwk.', '..wggg..'],
];
const GOLF = [
  ['.wwww.', 'wwgwww', 'wwwwgw', 'wgwwww', 'wwwgwg', '.wggg.'],
  ['.wwww.', 'wwwwgw', 'wgwwww', 'wwwgww', 'gwwwwg', '.wggg.'],
];
const SHUTTLE_R = ['ww......', 'wwww....', 'wwwwwwRR', 'wwwwwwRR', 'wwww....', 'ww......'];
const SHUTTLE_L = SHUTTLE_R.map((r) => r.split('').reverse().join(''));

function blit(g: CanvasRenderingContext2D, map: string[], x: number, y: number) {
  x = Math.round(x); y = Math.round(y);
  for (let yy = 0; yy < map.length; yy++)
    for (let xx = 0; xx < map[yy].length; xx++) {
      const c = map[yy][xx];
      if (c === '.') continue;
      g.fillStyle = PAL[c];
      g.fillRect(x + xx, y + yy, 1, 1);
    }
}

/** Starts the loop on a canvas sized in "art pixels". Returns a stop function. */
export function runSprite(canvas: HTMLCanvasElement, kind: SpriteKind, pixel: number) {
  const g = canvas.getContext('2d')!;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  const w = Math.max(16, Math.round(cssW / pixel)), h = Math.max(10, Math.round(cssH / pixel));
  canvas.width = w; canvas.height = h;
  g.imageSmoothingEnabled = false;
  const ground = h - 1;
  const t0 = performance.now();
  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    // rAF timestamps can predate t0 by a frame; keep t >= 0 so frame indices stay valid
    const t = Math.max(0, (now - t0) / 1000);
    g.clearRect(0, 0, w, h);
    switch (kind) {
      case 'cricket': {
        const dur = 1.3, u = (t % dur) / dur;
        const x = -9 + (w + 18) * u;
        blit(g, cricketFrame(Math.floor(t * 14)), x, ground - 8);
        if (Math.floor(t * 20) % 2) { g.fillStyle = '#8A7BC3'; g.fillRect(Math.round(x) - 2, ground - 1, 1, 1); g.fillRect(Math.round(x) - 4, ground - 2, 1, 1); }
        break;
      }
      case 'football': {
        const dur = 1.5, u = (t % dur) / dur;
        const x = -9 + (w + 18) * u;
        const bounce = Math.abs(Math.sin(u * Math.PI * 4)) * (h - 10) * (1 - u * 0.5);
        blit(g, FOOT[Math.floor(t * 10) % 2], x, ground - 8 - bounce);
        break;
      }
      case 'golf': {
        const cycle = 1.9, k = t % cycle;
        const holeX = w - 9;
        g.fillStyle = '#03050B';
        g.fillRect(holeX - 1, ground - 1, 6, 2);
        g.fillStyle = '#F4F1FF';
        g.fillRect(holeX + 2, ground - 11, 1, 10);
        g.fillStyle = PAL.p;
        const wave = Math.floor(t * 6) % 2;
        g.fillRect(holeX + 3, ground - 11, 4, 2);
        g.fillRect(holeX + 3, ground - 9, 3 + wave, 1);
        if (k < 1.2) {
          const u = k / 1.2;
          const e = 1 - Math.pow(1 - u, 2.2);
          const x = -6 + (holeX - 0 + 6) * e;
          blit(g, GOLF[Math.floor(t * (12 - u * 9)) % 2], x, ground - 6);
        } else if (k < 1.35) {
          blit(g, ['.ww.', 'wwww'], holeX, ground - 2);
        }
        break;
      }
      case 'badminton': {
        const dur = 1.1, n = Math.floor(t / dur), u = (t % dur) / dur;
        const right = n % 2 === 0;
        const x = right ? -4 + (w - 4) * u : w - 8 - (w - 4) * u;
        const y = ground - 6 - Math.sin(Math.PI * u) * (h - 8);
        blit(g, right ? SHUTTLE_R : SHUTTLE_L, x, y);
        break;
      }
      case 'creator': {
        // the pencil sketches a wavy line, then signs off with a heart
        const cycle = 1.8, k = t % cycle;
        const u = Math.min(1, k / 1.3);
        const tipX = -10 + (w - 4) * u;
        const wave = (x: number) => ground - 3 - Math.round(Math.sin(x * 0.35) * 2);
        g.fillStyle = PAL.p;
        for (let x = 0; x < tipX; x += 2) g.fillRect(x, wave(x), 1, 1);
        if (k < 1.3) blit(g, PENCIL, tipX - 9, wave(tipX) - 2 - (Math.floor(t * 12) % 2));
        else blit(g, HEART, w - 9, ground - 7 - (Math.floor(t * 8) % 2));
        break;
      }
      case 'locked': {
        for (let i = 0; i < 6; i++) {
          g.fillStyle = Math.random() < 0.5 ? '#3A2459' : '#6236AE';
          g.fillRect(Math.floor(Math.random() * w), Math.floor(Math.random() * h), 2 + Math.floor(Math.random() * 6), 1);
        }
        break;
      }
    }
  };
  raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); g.clearRect(0, 0, w, h); };
}
