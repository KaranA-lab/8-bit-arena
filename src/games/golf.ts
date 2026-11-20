import { W, H, type Game, rect, px, disc, Particles, Pops } from '../lib/gfx';
import { drawText } from '../lib/font';
import { panel, blinkText, dim } from '../lib/ui';
import { C, clamp, randi, mulberry32 } from '../lib/util';
import { sfx } from '../lib/audio';
import { tapWord, input } from '../lib/input';
import { updateRecords } from '../lib/records';

const TS = 8, GW = 40, GH = 18, OY = 14;
const VOID = 0, FLOOR = 1, SAND = 2, WATER = 3, BLOCK = 4;
const R = 1.8;
const MAX_SPEED = 300;
const MAX_STROKES = 10;

interface P { x: number; y: number }
interface Slider { x: number; y: number; w: number; h: number; axis: 'x' | 'y'; min: number; max: number; speed: number; ph: number; vx: number; vy: number }
interface Course { grid: Uint8Array; tee: P; hole: P; par: number; seed: number; sliders: Slider[] }

const idx = (x: number, y: number) => y * GW + x;
const passable = (v: number) => v === FLOOR || v === SAND;

function bfsPath(grid: Uint8Array, from: P, to: P): number[] | null {
  const prev = new Int32Array(GW * GH).fill(-2);
  const start = idx(from.x, from.y), goal = idx(to.x, to.y);
  const q = [start];
  prev[start] = -1;
  for (let head = 0; head < q.length; head++) {
    const cur = q[head];
    if (cur === goal) {
      const path: number[] = [];
      for (let c = cur; c !== -1; c = prev[c]) path.push(c);
      return path.reverse();
    }
    const cx = cur % GW, cy = (cur / GW) | 0;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of nb) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const ni = idx(nx, ny);
      if (prev[ni] !== -2 || !passable(grid[ni])) continue;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  return null;
}

function placeSlider(grid: Uint8Array, path: number[], r: () => number): Slider | null {
  for (let tries = 0; tries < 12; tries++) {
    const i = Math.floor(path.length * (0.3 + r() * 0.4));
    const cur = path[i], nxt = path[i + 1];
    if (nxt === undefined) continue;
    const cx = cur % GW, cy = (cur / GW) | 0;
    const horizontalTravel = ((nxt / GW) | 0) === cy;
    if (horizontalTravel) {
      let top = cy, bot = cy;
      while (top - 1 >= 0 && passable(grid[idx(cx, top - 1)])) top--;
      while (bot + 1 < GH && passable(grid[idx(cx, bot + 1)])) bot++;
      if (bot - top + 1 < 3) continue;
      const h = 10;
      return { x: cx * TS + 2, y: OY + top * TS, w: 4, h, axis: 'y', min: OY + top * TS, max: OY + (bot + 1) * TS - h, speed: 1.6 + r() * 1.4, ph: r() * 6.28, vx: 0, vy: 0 };
    }
    let left = cx, right = cx;
    while (left - 1 >= 0 && passable(grid[idx(left - 1, cy)])) left--;
    while (right + 1 < GW && passable(grid[idx(right + 1, cy)])) right++;
    if (right - left + 1 < 3) continue;
    const w = 10;
    return { x: left * TS, y: OY + cy * TS + 2, w, h: 4, axis: 'x', min: left * TS, max: (right + 1) * TS - w, speed: 1.6 + r() * 1.4, ph: r() * 6.28, vx: 0, vy: 0 };
  }
  return null;
}

export function generateCourse(seed: number): Course {
  const r = mulberry32(seed);
  for (let attempt = 0; attempt < 60; attempt++) {
    const grid = new Uint8Array(GW * GH);
    const carve = (x0: number, y0: number, x1: number, y1: number) => {
      const ax = Math.max(1, Math.min(x0, x1)), bx = Math.min(GW - 2, Math.max(x0, x1));
      const ay = Math.max(1, Math.min(y0, y1)), by = Math.min(GH - 2, Math.max(y0, y1));
      for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) grid[idx(x, y)] = FLOOR;
    };
    const n = 3 + Math.floor(r() * 3);
    const pts: P[] = [];
    for (let i = 0; i < n; i++) {
      const x = Math.round(4 + (31 * i) / (n - 1) + (r() - 0.5) * 5);
      const y = 3 + Math.floor(r() * 12);
      pts.push({ x: clamp(x, 3, 36), y: clamp(y, 3, 14) });
    }
    if (r() < 0.5) pts.reverse();
    for (let i = 0; i < n - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const hw = r() < 0.45 ? 1 : 2;
      if (r() < 0.5) { carve(a.x - hw, a.y - hw, b.x + hw, a.y + hw); carve(b.x - hw, a.y - hw, b.x + hw, b.y + hw); }
      else { carve(a.x - hw, a.y - hw, a.x + hw, b.y + hw); carve(a.x - hw, b.y - hw, b.x + hw, b.y + hw); }
    }
    for (const p of pts) if (r() < 0.45) { const w = 2 + Math.floor(r() * 3), h = 1 + Math.floor(r() * 3); carve(p.x - w, p.y - h, p.x + w, p.y + h); }
    const tee = pts[0], hole = pts[n - 1];
    carve(tee.x - 1, tee.y - 1, tee.x + 1, tee.y + 1);
    carve(hole.x - 1, hole.y - 1, hole.x + 1, hole.y + 1);
    const base = bfsPath(grid, tee, hole);
    if (!base || base.length < 16) continue;

    const nearKey = (x: number, y: number, d: number) =>
      Math.max(Math.abs(x - tee.x), Math.abs(y - tee.y)) <= d || Math.max(Math.abs(x - hole.x), Math.abs(y - hole.y)) <= d;
    const want = 3 + Math.floor(r() * 6);
    let placed = 0;
    for (let tries = 0; tries < 90 && placed < want; tries++) {
      const x = 1 + Math.floor(r() * (GW - 2)), y = 1 + Math.floor(r() * (GH - 2));
      if (grid[idx(x, y)] !== FLOOR || nearKey(x, y, 2)) continue;
      const backup = grid.slice();
      const k = r();
      if (k < 0.4) {
        const s = r() < 0.5 ? 1 : 2;
        for (let yy = y; yy < y + s; yy++) for (let xx = x; xx < x + s; xx++) if (grid[idx(xx, yy)] === FLOOR && !nearKey(xx, yy, 1)) grid[idx(xx, yy)] = BLOCK;
      } else {
        const v = k < 0.72 ? SAND : WATER;
        const rad = 1 + Math.floor(r() * 2);
        for (let dy = -rad; dy <= rad; dy++)
          for (let dx = -rad; dx <= rad; dx++) {
            if (dx * dx + dy * dy > rad * rad + 0.5) continue;
            const xx = x + dx, yy = y + dy;
            if (xx < 1 || yy < 1 || xx >= GW - 1 || yy >= GH - 1) continue;
            if (grid[idx(xx, yy)] === FLOOR && !nearKey(xx, yy, 1)) grid[idx(xx, yy)] = v;
          }
      }
      if (!bfsPath(grid, tee, hole)) grid.set(backup);
      else placed++;
    }
    const path = bfsPath(grid, tee, hole)!;
    const sliders: Slider[] = [];
    if (r() < 0.45) { const s = placeSlider(grid, path, r); if (s) sliders.push(s); }
    let water = 0;
    for (const v of grid) if (v === WATER) water++;
    const par = clamp(Math.round(path.length / 20) + 1 + (water >= 3 ? 1 : 0), 2, 5);
    return { grid, tee, hole, par, seed, sliders };
  }
  // fallback: straight lane
  const grid = new Uint8Array(GW * GH);
  for (let y = 7; y <= 10; y++) for (let x = 2; x <= 37; x++) grid[idx(x, y)] = FLOOR;
  return { grid, tee: { x: 4, y: 8 }, hole: { x: 35, y: 9 }, par: 3, seed, sliders: [] };
}

type State = 'title' | 'aim' | 'drag' | 'roll' | 'splash' | 'sunk';

export class Golf implements Game {
  state: State = 'title';
  course!: Course;
  holeNo = 1;
  strokes = 0;
  totalDiff = 0;
  ball = { x: 0, y: 0, vx: 0, vy: 0 };
  lastPos = { x: 0, y: 0 };
  dragStart = { x: 0, y: 0 };
  power = 0;
  dir = { x: 1, y: 0 };
  lipped = false;
  t = 0;
  time = 0;
  layer: HTMLCanvasElement;
  parts = new Particles();
  pops = new Pops();
  result = '';
  diff = 0;

  constructor() {
    this.layer = document.createElement('canvas');
    this.layer.width = W; this.layer.height = H;
    this.newHole(true);
  }

  private holeCenter() { const h = this.course.hole; return { x: h.x * TS + 4, y: OY + h.y * TS + 4 }; }

  private newHole(first = false) {
    this.course = generateCourse(randi(1000, 99999));
    const t = this.course.tee;
    this.ball = { x: t.x * TS + 4, y: OY + t.y * TS + 4, vx: 0, vy: 0 };
    this.lastPos = { x: this.ball.x, y: this.ball.y };
    this.strokes = 0;
    this.state = first ? 'title' : 'aim';
    this.t = 0;
    this.pops.clear();
    this.renderLayer();
  }

  private tileAt(x: number, y: number) {
    const tx = Math.floor(x / TS), ty = Math.floor((y - OY) / TS);
    if (tx < 0 || ty < 0 || tx >= GW || ty >= GH) return VOID;
    return this.course.grid[idx(tx, ty)];
  }

  private solidAt(x: number, y: number) {
    for (const [ox, oy] of [[-R, -R], [R, -R], [-R, R], [R, R]]) {
      const t = this.tileAt(x + ox, y + oy);
      if (t === VOID || t === BLOCK) return true;
    }
    for (const s of this.course.sliders) if (x + R > s.x && x - R < s.x + s.w && y + R > s.y && y - R < s.y + s.h) return true;
    return false;
  }

  // ---------------- static layer ----------------
  private renderLayer() {
    const g = this.layer.getContext('2d')!;
    const { grid } = this.course;
    const r = mulberry32(this.course.seed * 7 + 3);
    g.clearRect(0, 0, W, H);
    rect(g, 0, 0, W, H, C.navy);
    for (let i = 0; i < 6; i++) {
      const cx = r() * W, cy = OY + r() * (H - OY), rad = 10 + r() * 22;
      g.fillStyle = i % 2 ? 'rgba(85,27,82,0.45)' : 'rgba(58,36,89,0.6)';
      for (let y = -rad; y <= rad; y += 2) for (let x = -rad; x <= rad; x += 2) if (x * x + y * y < rad * rad && ((x + y) / 2) % 2 === 0) g.fillRect(Math.round(cx + x), Math.round(cy + y), 2, 2);
    }
    for (let i = 0; i < 70; i++) px(g, r() * W, OY + r() * (H - OY), r() < 0.3 ? C.white : C.lavender);

    const get = (x: number, y: number) => (x < 0 || y < 0 || x >= GW || y >= GH ? VOID : grid[idx(x, y)]);
    const isWall = (x: number, y: number) => {
      if (get(x, y) !== VOID) return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) !== VOID) return true;
      return false;
    };
    const solid = (x: number, y: number) => isWall(x, y) || get(x, y) === BLOCK;

    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const v = grid[idx(x, y)];
        const x0 = x * TS, y0 = OY + y * TS;
        if (v === VOID) {
          if (!isWall(x, y)) continue;
          rect(g, x0, y0, TS, TS, '#3A2459');
          rect(g, x0, y0 + 3, TS, 1, '#2C1B47');
          rect(g, x0 + (y % 2 ? 2 : 6), y0, 1, 3, '#2C1B47');
          rect(g, x0 + (y % 2 ? 5 : 1), y0 + 4, 1, 4, '#2C1B47');
          if (get(x, y + 1) !== VOID) rect(g, x0, y0 + TS - 1, TS, 1, '#8A7BC3');
          if (get(x + 1, y) !== VOID) rect(g, x0 + TS - 1, y0, 1, TS, '#6236AE');
          if (get(x - 1, y) !== VOID) rect(g, x0, y0, 1, TS, '#6236AE');
          if (get(x, y - 1) !== VOID) rect(g, x0, y0, TS, 1, '#1E1238');
          continue;
        }
        // ground
        if (v === FLOOR || v === BLOCK) {
          rect(g, x0, y0, TS, TS, (x + y) % 2 ? '#3F8F55' : '#398551');
          px(g, x0 + Math.floor(r() * 8), y0 + Math.floor(r() * 8), '#4FA463');
        } else if (v === SAND) {
          rect(g, x0, y0, TS, TS, '#E3C27E');
          for (let k = 0; k < 3; k++) px(g, x0 + Math.floor(r() * 8), y0 + Math.floor(r() * 8), '#C9A15A');
          px(g, x0 + Math.floor(r() * 8), y0 + Math.floor(r() * 8), '#F3DBA4');
        } else if (v === WATER) {
          rect(g, x0, y0, TS, TS, '#2B5FD9');
          if (passable(get(x, y - 1))) rect(g, x0, y0, TS, 1, '#9CC4FF');
          if (passable(get(x - 1, y))) rect(g, x0, y0, 1, TS, '#9CC4FF');
          if (passable(get(x + 1, y))) rect(g, x0 + TS - 1, y0, 1, TS, '#9CC4FF');
          if (passable(get(x, y + 1))) rect(g, x0, y0 + TS - 1, TS, 1, '#9CC4FF');
        }
        if (v !== BLOCK) {
          if (solid(x, y - 1)) rect(g, x0, y0, TS, 1, 'rgba(0,0,0,0.28)');
          if (solid(x - 1, y)) rect(g, x0, y0, 1, TS, 'rgba(0,0,0,0.28)');
        } else {
          rect(g, x0 + 1, y0 + 1, TS - 1, TS - 1, 'rgba(0,0,0,0.3)');
          rect(g, x0, y0, TS - 1, TS - 1, C.pink);
          rect(g, x0, y0, TS - 1, 1, '#D274A8');
          rect(g, x0, y0, 1, TS - 1, '#D274A8');
          rect(g, x0, y0 + TS - 2, TS - 1, 1, C.plum);
          rect(g, x0 + TS - 2, y0, 1, TS - 1, C.plum);
          rect(g, x0 + 3, y0 + 3, 1, 1, '#D274A8');
        }
      }
    }
    // tee mat
    const t = this.course.tee;
    rect(g, t.x * TS + 1, OY + t.y * TS + 1, 7, 6, '#6CC783');
    px(g, t.x * TS + 1, OY + t.y * TS + 1, C.white);
    px(g, t.x * TS + 7, OY + t.y * TS + 1, C.white);
  }

  // ---------------- flow ----------------
  private shoot() {
    if (this.power < 0.06) { this.state = 'aim'; return; }
    this.strokes++;
    this.lastPos = { x: this.ball.x, y: this.ball.y };
    this.ball.vx = this.dir.x * this.power * MAX_SPEED;
    this.ball.vy = this.dir.y * this.power * MAX_SPEED;
    this.state = 'roll';
    this.lipped = false;
    sfx.play('putt');
  }

  private sink() {
    const hc = this.holeCenter();
    this.ball.x = hc.x; this.ball.y = hc.y; this.ball.vx = 0; this.ball.vy = 0;
    this.state = 'sunk'; this.t = 0;
    sfx.play('sink');
    const d = this.strokes - this.course.par;
    this.diff = d;
    this.totalDiff += d;
    const names: Record<string, string> = { '-4': 'CONDOR!', '-3': 'ALBATROSS!', '-2': 'EAGLE!', '-1': 'BIRDIE!', '0': 'PAR', '1': 'BOGEY', '2': 'DOUBLE BOGEY', '3': 'TRIPLE BOGEY' };
    this.result = this.strokes === 1 ? 'HOLE IN ONE!' : names[String(d)] ?? `+${d}`;
    this.parts.burst(hc.x, hc.y, 14, { colors: [C.white, C.yellow, C.green], speed: 50, up: true, life: 0.7 });
    if (this.strokes === 1) { this.parts.confetti(140); sfx.play('cheer'); sfx.play('six'); }
    else if (d < 0) { this.parts.confettiBurst(hc.x, hc.y, 50); sfx.play('cheer'); }
    const ace = this.strokes === 1, under = d < 0;
    updateRecords((rec) => { rec.golf.holes++; if (ace) rec.golf.aces++; if (under) rec.golf.underPar++; });
  }

  private splash() {
    sfx.play('splash');
    this.parts.burst(this.ball.x, this.ball.y, 16, { colors: ['#9CC4FF', C.white, '#2B5FD9'], speed: 45, up: true, life: 0.6 });
    this.state = 'splash'; this.t = 0;
    this.ball.vx = 0; this.ball.vy = 0;
    this.strokes++;
    this.pops.add('SPLASH! +1', { scale: 2, color: C.sky, y: 40 });
  }

  // ---------------- input ----------------
  pointerDown(x: number, y: number) {
    if (this.state === 'title') { sfx.play('select'); this.state = 'aim'; return; }
    if (this.state === 'sunk' && this.t > 0.6) { sfx.play('select'); this.holeNo++; this.newHole(); return; }
    if (this.state === 'aim') { this.state = 'drag'; this.dragStart = { x, y }; this.power = 0; }
  }
  pointerMove(x: number, y: number) {
    if (this.state !== 'drag') return;
    const dx = this.dragStart.x - x, dy = this.dragStart.y - y;
    const d = Math.hypot(dx, dy);
    this.power = clamp(d / 60, 0, 1);
    if (d > 0.5) this.dir = { x: dx / d, y: dy / d };
  }
  pointerUp(x: number, y: number) {
    if (this.state !== 'drag') return;
    this.pointerMove(x, y);
    this.shoot();
  }
  keyDown(code: string) {
    if ((code === 'Space' || code === 'Enter') && (this.state === 'title' || this.state === 'sunk')) this.pointerDown(0, 0);
  }
  cursor() { return this.state === 'drag' ? 'grabbing' : this.state === 'aim' ? 'grab' : 'pointer'; }

  // ---------------- update ----------------
  update(dt: number) {
    this.t += dt; this.time += dt;
    this.parts.update(dt); this.pops.update(dt);
    const b = this.ball;

    for (const s of this.course.sliders) {
      const v = s.min + (s.max - s.min) * (0.5 + 0.5 * Math.sin(this.time * s.speed + s.ph));
      const ox = s.x, oy = s.y;
      if (s.axis === 'y') s.y = v; else s.x = v;
      s.vx = (s.x - ox) / Math.max(dt, 1e-4); s.vy = (s.y - oy) / Math.max(dt, 1e-4);
      if (this.state !== 'sunk' && b.x + R > s.x && b.x - R < s.x + s.w && b.y + R > s.y && b.y - R < s.y + s.h) {
        if (s.axis === 'y') {
          const above = b.y < s.y + s.h / 2;
          b.y = above ? s.y - R - 0.2 : s.y + s.h + R + 0.2;
          b.vy = s.vy * 1.1;
          if (this.solidAt(b.x, b.y)) b.y = above ? s.y + s.h + R + 0.2 : s.y - R - 0.2;
        } else {
          const left = b.x < s.x + s.w / 2;
          b.x = left ? s.x - R - 0.2 : s.x + s.w + R + 0.2;
          b.vx = s.vx * 1.1;
          if (this.solidAt(b.x, b.y)) b.x = left ? s.x + s.w + R + 0.2 : s.x - R - 0.2;
        }
        sfx.play('wall');
        if (this.state === 'aim' || this.state === 'drag') { this.state = 'roll'; }
      }
    }

    if (this.state === 'roll') {
      const hc = this.holeCenter();
      const sp = Math.hypot(b.vx, b.vy);
      const steps = Math.max(1, Math.ceil((sp * dt) / 1.2));
      const h = dt / steps;
      for (let i = 0; i < steps; i++) {
        const tile = this.tileAt(b.x, b.y);
        const decay = Math.exp(-(tile === SAND ? 3.4 : 0.85) * h);
        b.vx *= decay; b.vy *= decay;
        const s = Math.hypot(b.vx, b.vy);
        if (s > 0) { const dec = Math.min(s, 14 * h); b.vx -= (b.vx / s) * dec; b.vy -= (b.vy / s) * dec; }
        const dx = hc.x - b.x, dy = hc.y - b.y, d = Math.hypot(dx, dy);
        if (d < 6 && d > 0.01) { b.vx += (dx / d) * 160 * h; b.vy += (dy / d) * 160 * h; }
        if (d < 2.6) {
          if (Math.hypot(b.vx, b.vy) < 150) { this.sink(); return; }
          if (!this.lipped) {
            this.lipped = true;
            const a = (Math.random() - 0.5) * 1.2, c = Math.cos(a), sn = Math.sin(a);
            const vx = b.vx * c - b.vy * sn, vy = b.vx * sn + b.vy * c;
            b.vx = vx * 0.8; b.vy = vy * 0.8;
          }
        } else if (d > 4) this.lipped = false;
        const nx = b.x + b.vx * h;
        if (this.solidAt(nx, b.y)) { if (Math.abs(b.vx) > 12) sfx.play('wall'); b.vx = -b.vx * 0.72; }
        else b.x = nx;
        const ny = b.y + b.vy * h;
        if (this.solidAt(b.x, ny)) { if (Math.abs(b.vy) > 12) sfx.play('wall'); b.vy = -b.vy * 0.72; }
        else b.y = ny;
        if (this.tileAt(b.x, b.y) === WATER) { this.splash(); return; }
      }
      if (Math.hypot(b.vx, b.vy) < 3) {
        b.vx = 0; b.vy = 0;
        if (this.strokes >= MAX_STROKES) {
          this.strokes = MAX_STROKES;
          this.sink();
          this.result = 'PICKED UP';
        } else this.state = 'aim';
      }
    } else if (this.state === 'splash') {
      if (this.t > 0.9) { b.x = this.lastPos.x; b.y = this.lastPos.y; this.state = 'aim'; }
    }
  }

  // ---------------- draw ----------------
  draw(g: CanvasRenderingContext2D) {
    g.drawImage(this.layer, 0, 0);
    const { grid } = this.course;
    // water shimmer
    for (let y = 0; y < GH; y++)
      for (let x = 0; x < GW; x++) {
        if (grid[idx(x, y)] !== WATER) continue;
        const x0 = x * TS, y0 = OY + y * TS;
        const o = Math.floor(this.time * 5 + y * 3 + x) % 8;
        rect(g, x0 + o, y0 + 2, Math.min(2, 8 - o), 1, '#5C93F5');
        rect(g, x0 + ((o + 4) % 7), y0 + 5, 2, 1, '#7FB2FF');
      }
    // twinkles
    const tw = mulberry32(Math.floor(this.time * 3));
    for (let i = 0; i < 6; i++) {
      const sx = Math.floor(tw() * W), sy = OY + Math.floor(tw() * (H - OY));
      if (this.tileAt(sx, sy) === VOID) { px(g, sx, sy, C.white); px(g, sx - 1, sy, C.lavender); px(g, sx + 1, sy, C.lavender); }
    }
    // hole + flag
    const hc = this.holeCenter();
    disc(g, hc.x, hc.y, 7, '#245F38');
    disc(g, hc.x, hc.y, 5, C.ink);
    rect(g, hc.x, hc.y - 13, 1, 13, C.white);
    const f = Math.floor(this.time * 4) % 2;
    rect(g, hc.x + 1, hc.y - 13, 6, 2, C.pink);
    rect(g, hc.x + 1, hc.y - 11, f ? 5 : 6, 2, C.pink);
    px(g, hc.x + (f ? 6 : 7), hc.y - (f ? 12 : 11), C.pinkHi);
    rect(g, hc.x + 1, hc.y - 13, 6, 1, C.pinkHi);
    // sliders
    for (const s of this.course.sliders) {
      rect(g, s.x + 1, s.y + 1, s.w, s.h, 'rgba(0,0,0,0.35)');
      rect(g, s.x, s.y, s.w, s.h, C.yellow);
      g.fillStyle = C.ink;
      for (let k = 0; k < s.w + s.h; k += 3) {
        if (s.axis === 'y') g.fillRect(Math.round(s.x), Math.round(s.y + k), s.w, 1);
        else g.fillRect(Math.round(s.x + k), Math.round(s.y), 1, s.h);
      }
    }
    // aim
    const b = this.ball;
    if (this.state === 'drag' && this.power > 0.02) {
      const len = 6 + this.power * 46;
      const col = this.power < 0.45 ? C.green : this.power < 0.8 ? C.yellow : C.red;
      for (let d = 4; d < len; d += 3) px(g, b.x + this.dir.x * d, b.y + this.dir.y * d, col);
      px(g, b.x + this.dir.x * len, b.y + this.dir.y * len, C.white);
      for (let d = 3; d < this.power * 16; d += 2) px(g, b.x - this.dir.x * d, b.y - this.dir.y * d, 'rgba(138,123,195,0.8)');
    }
    // ball
    if (this.state === 'sunk') {
      const d = Math.max(0, 4 - Math.floor(this.t * 12));
      if (d > 0) disc(g, b.x, b.y, d, C.white);
    } else if (this.state !== 'splash' || this.t < 0.05) {
      rect(g, b.x - 1, b.y + 1, 4, 1, 'rgba(0,0,0,0.35)');
      disc(g, b.x, b.y, 4, C.white);
      px(g, Math.round(b.x), Math.round(b.y), '#C9C6D6');
      if (this.state === 'aim' && Math.floor(this.time * 3) % 2) {
        px(g, b.x - 4, b.y - 1, C.yellow); px(g, b.x + 3, b.y - 1, C.yellow);
      }
    }
    this.parts.draw(g);
    this.drawHud(g);
    this.pops.draw(g);
    if (this.state === 'title') this.drawTitle(g);
    if (this.state === 'sunk' && this.t > 0.35) this.drawSunk(g);
  }

  private drawHud(g: CanvasRenderingContext2D) {
    rect(g, 0, 0, W, 12, 'rgba(3,5,11,0.9)');
    drawText(g, `HOLE ${this.holeNo}`, 4, 4, { color: C.yellow });
    drawText(g, `PAR ${this.course.par}`, 52, 4, { color: C.white });
    drawText(g, `STROKES ${this.strokes}`, 88, 4, { color: C.white });
    const td = this.totalDiff;
    drawText(g, `TOTAL ${td === 0 ? 'E' : td > 0 ? '+' + td : td}`, 146, 4, { color: td <= 0 ? C.green : C.pinkHi });
    drawText(g, `COURSE #${this.course.seed}`, W - 4, 4, { color: C.lavender, align: 'right' });
    if (this.state === 'drag') {
      rect(g, W - 46, H - 9, 42, 6, C.ink);
      const col = this.power < 0.45 ? C.green : this.power < 0.8 ? C.yellow : C.red;
      rect(g, W - 45, H - 8, Math.round(40 * this.power), 4, col);
      drawText(g, 'POWER', W - 48, H - 8, { color: C.white, align: 'right', outline: C.ink });
    } else if (this.state === 'aim' && this.strokes === 0 && this.holeNo <= 2) {
      drawText(g, 'DRAG BACK FROM ANYWHERE, RELEASE TO PUTT', W / 2, H - 8, { color: C.white, align: 'center', outline: C.ink });
    }
  }

  private drawTitle(g: CanvasRenderingContext2D) {
    dim(g, 0.5);
    panel(g, 56, 24, 208, 110, C.green);
    drawText(g, 'MINI GOLF', W / 2, 32, { color: C.yellow, scale: 3, align: 'center', outline: C.ink });
    drawText(g, 'INFINITE RANDOM COURSES', W / 2, 54, { color: C.lavender, align: 'center' });
    drawText(g, 'DRAG BACK FROM ANYWHERE', W / 2, 68, { color: C.white, align: 'center' });
    drawText(g, 'AND RELEASE TO PUTT', W / 2, 76, { color: C.white, align: 'center' });
    drawText(g, 'SAND SLOWS YOU DOWN', W / 2, 88, { color: '#E3C27E', align: 'center' });
    drawText(g, 'WATER COSTS A STROKE', W / 2, 96, { color: C.sky, align: 'center' });
    drawText(g, 'DODGE THE MOVING BLOCKERS', W / 2, 104, { color: C.yellow, align: 'center' });
    blinkText(g, `${tapWord()} TO TEE OFF`, W / 2, 120, this.time);
  }

  private drawSunk(g: CanvasRenderingContext2D) {
    panel(g, 80, 40, 160, 66, this.strokes === 1 ? C.yellow : this.diff < 0 ? C.green : C.violet);
    const ace = this.strokes === 1;
    drawText(g, this.result, W / 2, 48, { color: ace ? C.yellow : this.diff < 0 ? C.green : C.white, scale: ace ? 3 : 3, align: 'center', outline: C.ink });
    drawText(g, `${this.strokes} STROKE${this.strokes === 1 ? '' : 'S'}  -  PAR ${this.course.par}`, W / 2, 70, { color: C.lavender, align: 'center' });
    if (this.t > 0.6) blinkText(g, `${tapWord()} FOR NEXT HOLE`, W / 2, 88, this.time);
  }
}
