import { drawText } from './font';
import { C, SKINS, mulberry32, rand, pick } from './util';

export const W = 320;
export const H = 160;

export type GameId = 'cricket' | 'football' | 'golf' | 'badminton';

export interface Game {
  update(dt: number): void;
  draw(g: CanvasRenderingContext2D): void;
  pointerDown?(x: number, y: number, button: number): void;
  pointerMove?(x: number, y: number): void;
  pointerUp?(x: number, y: number): void;
  keyDown?(code: string): void;
  keyUp?(code: string): void;
  destroy?(): void;
  cursor?(): string;
}

// ---------- primitive pixel drawing ----------
export function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(g: CanvasRenderingContext2D, x: number, y: number, c: string) {
  g.fillStyle = c;
  g.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** Bresenham line made of square "brush" pixels. */
export function line(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, c: string, t = 1) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  g.fillStyle = c;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor(t / 2);
  for (let i = 0; i < 400; i++) {
    g.fillRect(x0 - o, y0 - o, t, t);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Filled pixel circle with diameter d (integer), top-left anchored around centre. */
export function disc(g: CanvasRenderingContext2D, cx: number, cy: number, d: number, c: string) {
  g.fillStyle = c;
  const r = d / 2;
  const x0 = Math.round(cx - r), y0 = Math.round(cy - r);
  for (let y = 0; y < d; y++) {
    const yy = y + 0.5 - r;
    const half = Math.sqrt(Math.max(0, r * r - yy * yy));
    const xs = Math.round(r - half), xe = Math.round(r + half);
    if (xe > xs) g.fillRect(x0 + xs, y0 + y, xe - xs, 1);
  }
}

export function ring(g: CanvasRenderingContext2D, cx: number, cy: number, rw: number, rh: number, c: string) {
  g.fillStyle = c;
  const n = Math.max(12, Math.round((rw + rh) * 3));
  let lx = -999, ly = -999;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * rw), y = Math.round(cy + Math.sin(a) * rh);
    if (x !== lx || y !== ly) g.fillRect(x, y, 1, 1);
    lx = x; ly = y;
  }
}

// ---------- particles ----------
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; color: string; size: number; g: number; drag: number; confetti: boolean; ph: number;
}

export class Particles {
  list: Particle[] = [];

  burst(x: number, y: number, n: number, o: { colors: string[]; speed?: number; g?: number; life?: number; size?: number; up?: boolean; drag?: number }) {
    for (let i = 0; i < n; i++) {
      const a = o.up ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : rand(0, Math.PI * 2);
      const s = rand(0.3, 1) * (o.speed ?? 60);
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: (o.life ?? 0.8) * rand(0.6, 1.2), color: pick(o.colors), size: o.size ?? 1,
        g: o.g ?? 120, drag: o.drag ?? 0.5, confetti: false, ph: rand(0, 6),
      });
    }
  }

  confetti(n: number, colors: string[] = CONFETTI, x0 = 0, x1 = W) {
    for (let i = 0; i < n; i++) {
      this.list.push({
        x: rand(x0, x1), y: rand(-40, -2), vx: rand(-15, 15), vy: rand(10, 40),
        life: 0, max: rand(2.2, 3.6), color: pick(colors), size: 1, g: 22, drag: 0.6, confetti: true, ph: rand(0, 6),
      });
    }
  }

  confettiBurst(x: number, y: number, n: number, colors: string[] = CONFETTI) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.9, -Math.PI * 0.1);
      const s = rand(40, 120);
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: rand(1.6, 2.6), color: pick(colors), size: 1, g: 70, drag: 1.6, confetti: true, ph: rand(0, 6),
      });
    }
  }

  update(dt: number) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life += dt;
      if (p.life >= p.max) { l.splice(i, 1); continue; }
      p.vy += p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      if (p.confetti) p.vx += Math.sin(p.life * 6 + p.ph) * 30 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(g: CanvasRenderingContext2D) {
    for (const p of this.list) {
      // blink out at the end of life instead of alpha fading (8-bit style)
      if (p.life > p.max * 0.75 && Math.floor(p.life * 20) % 2) continue;
      g.fillStyle = p.color;
      if (p.confetti) {
        const flip = Math.floor(p.life * 10 + p.ph) % 3;
        if (flip === 0) g.fillRect(Math.round(p.x), Math.round(p.y), 2, 1);
        else if (flip === 1) g.fillRect(Math.round(p.x), Math.round(p.y), 1, 2);
        else g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else {
        g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
  }
}

export const CONFETTI = [C.pink, C.yellow, C.lavender, C.green, C.sky, C.white, C.orange, C.red];

// ---------- pop-up text ----------
interface Pop { text: string; x: number; y: number; t: number; dur: number; color: string; outline: string; scale: number; rainbow: boolean; sub?: string }

const RAINBOW = [C.yellow, C.orange, C.pinkHi, C.lavender, C.sky, C.green];

export class Pops {
  list: Pop[] = [];
  add(text: string, o: { x?: number; y?: number; dur?: number; color?: string; outline?: string; scale?: number; rainbow?: boolean; sub?: string } = {}) {
    this.list.push({
      text, x: o.x ?? W / 2, y: o.y ?? 52, t: 0, dur: o.dur ?? 1.4, color: o.color ?? C.white,
      outline: o.outline ?? C.ink, scale: o.scale ?? 3, rainbow: !!o.rainbow, sub: o.sub,
    });
  }
  clear() { this.list.length = 0; }
  update(dt: number) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t > p.dur) this.list.splice(i, 1);
    }
  }
  draw(g: CanvasRenderingContext2D) {
    for (const p of this.list) {
      if (p.t > p.dur - 0.3 && Math.floor(p.t * 16) % 2) continue;
      // stepped "pop": overshoot one scale step then settle
      const s = p.t < 0.05 ? Math.max(1, p.scale - 1) : p.t < 0.12 ? p.scale + 1 : p.scale;
      const rise = Math.min(4, Math.floor(p.t * 6));
      const color = p.rainbow ? RAINBOW[Math.floor(p.t * 12) % RAINBOW.length] : p.color;
      drawText(g, p.text, p.x, p.y - (5 * s) / 2 - rise, { color, scale: s, align: 'center', outline: p.outline, shadow: C.ink });
      if (p.sub && p.t > 0.15) drawText(g, p.sub, p.x, p.y + (5 * p.scale) / 2 + 4 - rise, { color: C.white, align: 'center', outline: C.ink });
    }
  }
}

// ---------- stadium crowd ----------
interface Fan { x: number; y: number; c: string; h: string; ph: number; amp: number }

export class Stands {
  fans: Fan[] = [];
  excite = 0.08;
  focusX = -1;
  focusExcite = 0;
  t = 0;
  constructor(public x0: number, public y0: number, public w: number, public h: number, public bg: string, colors: string[], seed = 7) {
    const r = mulberry32(seed);
    let row = 0;
    for (let yy = y0 + 2; yy < y0 + h - 2; yy += 4, row++) {
      for (let xx = x0 + (row % 2 ? 1 : -1); xx < x0 + w; xx += 3) {
        if (r() < 0.1) continue;
        this.fans.push({ x: xx, y: yy, c: colors[Math.floor(r() * colors.length)], h: SKINS[Math.floor(r() * 3)], ph: r() * 6.28, amp: r() });
      }
    }
  }
  cheer(level: number, x = -1) {
    if (x < 0) this.excite = Math.max(this.excite, level);
    else { this.focusX = x; this.focusExcite = Math.max(this.focusExcite, level); }
  }
  update(dt: number) {
    this.t += dt;
    this.excite = Math.max(0.08, this.excite - dt * 0.3);
    this.focusExcite = Math.max(0, this.focusExcite - dt * 0.5);
  }
  draw(g: CanvasRenderingContext2D) {
    rect(g, this.x0, this.y0, this.w, this.h, this.bg);
    for (let yy = this.y0 + 5; yy < this.y0 + this.h; yy += 8) rect(g, this.x0, yy, this.w, 1, 'rgba(0,0,0,0.25)');
    const t = this.t;
    for (const f of this.fans) {
      let ex = this.excite;
      if (this.focusExcite > 0) ex = Math.max(ex, this.focusExcite * Math.max(0, 1 - Math.abs(f.x - this.focusX) / 50));
      const jumping = ex > f.amp * 0.9;
      const up = jumping && Math.sin(t * 16 + f.ph) > 0 ? 1 : 0;
      const y = f.y - up;
      g.fillStyle = f.c;
      g.fillRect(f.x, y + 1, 2, 2);
      if (jumping) { g.fillRect(f.x - 1, y - up, 1, 1); g.fillRect(f.x + 2, y - up, 1, 1); }
      g.fillStyle = f.h;
      g.fillRect(f.x, y, 1, 1);
    }
  }
}

export function floodlight(g: CanvasRenderingContext2D, x: number, y: number, poleH: number, t: number) {
  rect(g, x, y + 4, 1, poleH, '#2A2440');
  rect(g, x - 4, y, 9, 4, '#2A2440');
  for (let i = 0; i < 4; i++) {
    const flick = Math.sin(t * 3 + i * 1.7 + x) > 0.97 ? C.lavender : '#FFF6D6';
    rect(g, x - 3 + i * 2, y + 1, 1, 2, flick);
  }
  g.fillStyle = 'rgba(255,246,214,0.07)';
  g.fillRect(x - 10, y - 4, 21, 12);
  g.fillStyle = 'rgba(255,246,214,0.05)';
  g.fillRect(x - 16, y - 7, 33, 18);
}

export function stars(g: CanvasRenderingContext2D, seed: number, n: number, x0: number, y0: number, w: number, h: number, t: number) {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(r() * w), y = y0 + Math.floor(r() * h);
    const ph = r() * 6.28;
    const tw = Math.sin(t * 2 + ph);
    g.fillStyle = tw > 0.6 ? C.white : tw > -0.2 ? C.lavender : C.purple;
    g.fillRect(x, y, 1, 1);
  }
}

/** Little far-away figure. Feet at (x, y). */
export function miniPerson(
  g: CanvasRenderingContext2D, x: number, y: number, h: number, shirt: string, pants: string,
  pose: 'stand' | 'run1' | 'run2' | 'arms' | 'crouch' = 'stand', skin: string = C.skin, hat?: string,
) {
  x = Math.round(x); y = Math.round(y);
  const head = Math.max(2, Math.round(h * 0.22));
  const body = Math.max(2, Math.round(h * 0.38));
  const legs = h - head - body;
  const bw = h >= 11 ? 4 : 3;
  const bx = x - Math.floor(bw / 2);
  const crouch = pose === 'crouch' ? 1 : 0;
  // legs
  g.fillStyle = pants;
  if (pose === 'run1') { g.fillRect(bx - 1, y - legs, 1, legs); g.fillRect(bx + bw - 1, y - legs + 1, 1, legs - 1); }
  else if (pose === 'run2') { g.fillRect(bx, y - legs + 1, 1, legs - 1); g.fillRect(bx + bw, y - legs, 1, legs); }
  else { g.fillRect(bx, y - legs + crouch, 1, legs - crouch); g.fillRect(bx + bw - 1, y - legs + crouch, 1, legs - crouch); }
  // body
  const by = y - legs - body + crouch;
  g.fillStyle = shirt;
  g.fillRect(bx, by, bw, body);
  // arms
  if (pose === 'arms') { g.fillRect(bx - 1, by - 2, 1, 3); g.fillRect(bx + bw, by - 2, 1, 3); }
  else if (pose === 'run1' || pose === 'run2') { g.fillRect(bx - 1, by + 1, 1, 2); g.fillRect(bx + bw, by, 1, 2); }
  else { g.fillRect(bx - 1, by, 1, Math.max(2, body - 1)); g.fillRect(bx + bw, by, 1, Math.max(2, body - 1)); }
  // head
  g.fillStyle = skin;
  const hw = bw >= 4 ? 3 : 2;
  const hx = x - Math.floor(hw / 2);
  g.fillRect(hx, by - head, hw, head);
  if (hat) { g.fillStyle = hat; g.fillRect(hx, by - head, hw, 1); }
}

/** Pixel shirt icon used for kit selection. */
export function shirt(g: CanvasRenderingContext2D, x: number, y: number, main: string, trim: string, num?: string, stripe?: string) {
  x = Math.round(x); y = Math.round(y);
  rect(g, x, y + 2, 16, 4, C.ink);
  rect(g, x + 3, y + 1, 10, 15, C.ink);
  rect(g, x + 1, y + 3, 14, 2, main);
  rect(g, x + 4, y + 2, 8, 13, main);
  if (stripe) for (let sx = x + 5; sx < x + 12; sx += 3) rect(g, sx, y + 2, 1, 13, stripe);
  rect(g, x + 1, y + 5, 2, 1, trim);
  rect(g, x + 13, y + 5, 2, 1, trim);
  rect(g, x + 6, y + 2, 4, 1, trim);
  rect(g, x + 11, y + 3, 1, 12, 'rgba(0,0,0,0.25)');
  if (num) drawText(g, num, x + 8, y + 7, { color: trim, align: 'center' });
}
