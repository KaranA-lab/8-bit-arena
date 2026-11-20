import { W, H, type Game, rect, px, line, disc, Particles, Pops, Stands, floodlight, stars, miniPerson, CONFETTI } from '../lib/gfx';
import { drawText } from '../lib/font';
import { panel, blinkText, dim } from '../lib/ui';
import { C, clamp, lerp, rand, randi, chance, mulberry32 } from '../lib/util';
import { sfx } from '../lib/audio';
import { tapWord, input } from '../lib/input';
import { updateRecords } from '../lib/records';

type Side = -1 | 1;
type Outcome = 'six' | 'four' | 'two' | 'one' | 'dot' | 'caught' | 'behind' | 'bowled' | 'beaten';
type State = 'title' | 'ready' | 'runup' | 'flight' | 'hit' | 'result' | 'over';

// Side-on batsman seen from behind the stumps (keeper's view): body on the leg side, facing the
// off side, bat grounded in front of the stumps. The base drawing faces screen-left, which is a
// LEFT-hander from this angle; right-handers are drawn mirrored. Hands are relative to the feet.
interface Pose { hx: number; hy: number; a: number }
const P_IDLE: Pose = { hx: -7, hy: -21, a: 100 };
const P_BACK: Pose = { hx: 1, hy: -36, a: -55 };
const P_CONTACT: Pose = { hx: -8, hy: -24, a: 160 };
const P_FOLLOW: Record<Side, Pose> = { [-1]: { hx: -9, hy: -36, a: 215 }, [1]: { hx: 5, hy: -34, a: 330 } } as Record<Side, Pose>;
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({ hx: lerp(a.hx, b.hx, t), hy: lerp(a.hy, b.hy, t), a: lerp(a.a, b.a, t) });

const FAR_Y = 54;
const NEAR_Y = 136;
const BX = 171, BY = 152; // batsman's back foot
const TOTAL_BALLS = 18;
const MAX_WKTS = 3;
const newTarget = () => randi(25, 80);

// ground shots skip along the outfield: decaying hops (share of flight time, height px), then a roll
const HOPS_RUN = [{ len: 0.3, h: 9 }, { len: 0.22, h: 5 }, { len: 0.17, h: 2.5 }, { len: 0.12, h: 1 }];
const HOPS_FOUR = [{ len: 0.22, h: 5 }, { len: 0.15, h: 2 }, { len: 0.1, h: 0.8 }];

// stance picker buttons on the title card (game px)
const STANCE_BTNS = [
  { x: 74, y: 98, w: 82, h: 15, label: 'RIGHT-HANDED' },
  { x: 164, y: 98, w: 82, h: 15, label: 'LEFT-HANDED' },
];

interface Fielder { hx: number; hy: number; x: number; y: number; tx: number; ty: number; arms: number }

export class Cricket implements Game {
  state: State = 'title';
  t = 0;
  time = 0;
  target = newTarget();
  /** left-handed batsman (right-handers are the ones drawn mirrored around the stumps) */
  lefty = false;
  stanceSel = 0;
  hop = 0;
  runs = 0;
  wkts = 0;
  balls = 0;
  log: string[] = [];
  fielderSide: Side = 1;
  del = { speed: 130, T: 0.9, bounce: 0.62, line: 160, onStumps: false };
  bounced = false;
  swing: { t: number; side: Side; from: Pose } | null = null;
  pending: { o: Outcome; side: Side; deep: boolean } | null = null;
  missed = false;
  hit: { o: Outcome; side: Side; deep: boolean; t: number; dur: number; fx: number; fy: number; tx: number; ty: number; arc: number } | null = null;
  timing = '';
  stumpsDown = 0;
  won = false;
  stands = new Stands(0, 10, W, 31, '#1B1740', [C.pink, C.lavender, C.violet, C.white, C.yellow, C.sky], 11);
  parts = new Particles();
  pops = new Pops();
  timers: { t: number; fn: () => void }[] = [];
  fielders: Fielder[];
  deep: Fielder;
  pitchNoise: [number, number, string][] = [];
  hover = 0;

  constructor() {
    const mk = (x: number, y: number): Fielder => ({ hx: x, hy: y, x, y, tx: x, ty: y, arms: 0 });
    this.fielders = [mk(90, 84), mk(230, 82), mk(116, 104), mk(206, 103)];
    this.deep = mk(262, 64);
    const r = mulberry32(5);
    for (let i = 0; i < 260; i++) {
      const y = 48 + Math.floor(r() * 112);
      const t = (y - 48) / 112;
      const hw = lerp(6, 34, t);
      const x = Math.round(160 + (r() * 2 - 1) * hw);
      this.pitchNoise.push([x, y, r() < 0.5 ? '#B8955B' : '#D6B67C']);
    }
  }

  // ---------------- flow ----------------
  private newMatch() {
    this.runs = 0; this.wkts = 0; this.balls = 0; this.log = [];
    this.parts.list.length = 0; this.pops.clear();
    this.toReady();
  }

  private toReady() {
    this.state = 'ready'; this.t = 0;
    this.swing = null; this.pending = null; this.missed = false; this.hit = null; this.timing = ''; this.stumpsDown = 0; this.bounced = false;
    this.fielderSide = chance(0.5) ? -1 : 1;
    this.deep.hx = this.fielderSide < 0 ? 58 : 262; this.deep.hy = 64;
    this.deep.x = this.deep.hx; this.deep.y = this.deep.hy; this.deep.tx = this.deep.hx; this.deep.ty = this.deep.hy; this.deep.arms = 0;
    for (const f of this.fielders) { f.tx = f.hx; f.ty = f.hy; f.arms = 0; }
    const over = Math.floor(this.balls / 6);
    const speed = randi(116, 126) + over * 8 + randi(0, 8);
    const onStumps = chance(0.45);
    this.del = {
      speed,
      T: lerp(1.08, 0.72, clamp((speed - 115) / 42, 0, 1)),
      bounce: rand(0.55, 0.72),
      onStumps,
      line: onStumps ? 160 : 160 + (chance(0.5) ? -1 : 1) * randi(4, 7),
    };
  }

  private after(t: number, fn: () => void) { this.timers.push({ t, fn }); }

  private swingAt(side: Side) {
    if (this.state !== 'flight' || this.swing) return;
    this.swing = { t: 0, side, from: this.currentPose() };
    sfx.play('swing');
    const dt = this.t - this.del.T;
    const a = Math.abs(dt);
    // generous windows: sixes should feel reachable
    const q = a <= 0.075 ? 'perfect' : a <= 0.12 ? 'good' : a <= 0.17 ? 'ok' : a <= 0.22 ? 'edge' : 'miss';
    this.timing = q === 'perfect' ? 'PERFECT TIMING' : q === 'good' ? 'GOOD TIMING' : q === 'miss' ? (dt < 0 ? 'WAY TOO EARLY' : 'TOO LATE') : dt < 0 ? 'A BIT EARLY' : 'A BIT LATE';
    if (q === 'miss') { this.missed = true; return; }
    const into = side === this.fielderSide;
    let o: Outcome;
    let deep = false;
    if (q === 'perfect') {
      if (!into) o = 'six';
      else { const r = Math.random(); o = r < 0.35 ? 'six' : r < 0.55 ? 'caught' : 'two'; deep = o === 'two'; }
    } else if (q === 'good') {
      if (!into) o = chance(0.45) ? 'six' : 'four';
      else { o = chance(0.15) ? 'caught' : 'two'; deep = o === 'two'; }
    } else if (q === 'ok') { o = 'two'; deep = into; }
    else o = chance(0.15) ? 'behind' : 'one';
    this.pending = { o, side, deep };
    if (dt >= 0) this.startHit();
  }

  private ballScreen(s: number) {
    const d = this.del;
    const f = s <= 1 ? Math.pow(Math.max(0, s), 1.5) : 1 + (s - 1) * 0.9;
    const y = s <= 1 ? FAR_Y + (NEAR_Y - FAR_Y) * f : NEAR_Y + (s - 1) * 70;
    const x = 163 + (d.line - 163) * Math.min(s, 1) + (s > 1 ? (d.line - 163) * (s - 1) : 0);
    let h: number;
    if (s < d.bounce) { const u = s / d.bounce; h = 1 - u * u; }
    else { const u = (s - d.bounce) / (1 - d.bounce); h = 0.32 * Math.sin(Math.min(1.4, u) * Math.PI * 0.55) / Math.sin(Math.PI * 0.55); }
    const scale = 10 + 10 * Math.min(1, f);
    const size = f < 0.22 ? 2 : f < 0.62 ? 3 : 4;
    return { x, y, hpx: Math.max(0, h) * scale, size };
  }

  private startHit() {
    if (!this.pending) return;
    const { o, side, deep } = this.pending;
    this.pending = null;
    const b = this.ballScreen(this.t / this.del.T);
    const fx = b.x, fy = b.y - b.hpx;
    sfx.play('bat');
    this.parts.burst(fx, fy, 6, { colors: [C.white, '#E9C784'], speed: 40, life: 0.3 });
    let tx = 0, ty = 0, dur = 0.7, arc = 6;
    switch (o) {
      case 'six': tx = side < 0 ? randi(24, 92) : randi(228, 296); ty = randi(14, 28); dur = 1.15; arc = 46; break;
      case 'four': tx = side < 0 ? randi(3, 12) : randi(308, 317); ty = randi(58, 84); dur = 0.8; arc = 2; break;
      case 'two':
        // into the deep fielder: he collects it in the outfield while they run two
        if (deep) { tx = this.deep.x + 2; ty = this.deep.y - 4; dur = 0.9; arc = 10; }
        else { tx = side < 0 ? randi(64, 104) : randi(216, 256); ty = randi(72, 96); dur = 0.75; arc = 8; }
        break;
      case 'one': tx = side < 0 ? randi(100, 124) : randi(196, 220); ty = randi(94, 110); dur = 0.6; arc = 4; break;
      case 'caught': tx = this.deep.x; ty = this.deep.y - 9; dur = 1.05; arc = 40; break;
      case 'behind': tx = 170; ty = 176; dur = 0.3; arc = 2; break;
      default: break;
    }
    this.hit = { o, side, deep, t: 0, dur, fx, fy, tx, ty, arc };
    this.hop = 0;
    this.state = 'hit';
    this.t = 0;
    // fielders react
    if ((o === 'two' && !deep) || o === 'one' || o === 'four') {
      let best = this.fielders[0], bd = 1e9;
      for (const f of this.fielders) { const d = Math.hypot(f.x - tx, f.y - ty); if (d < bd) { bd = d; best = f; } }
      best.tx = tx; best.ty = ty;
    }
    if (o === 'six' || o === 'four') this.stands.cheer(0.4);
  }

  private finishBall(o: Outcome) {
    this.balls++;
    let runs = 0, wicket = false;
    switch (o) {
      case 'six': runs = 6; break;
      case 'four': runs = 4; break;
      case 'two': runs = 2; break;
      case 'one': runs = 1; break;
      case 'caught': case 'behind': case 'bowled': wicket = true; break;
    }
    this.runs += runs;
    if (wicket) this.wkts++;
    this.log.push(wicket ? 'W' : runs ? String(runs) : '.');
    const sub = this.timing || undefined;
    switch (o) {
      case 'six':
        this.pops.add('SIX!', { scale: 5, rainbow: true, sub, dur: 1.7 });
        sfx.play('six'); sfx.play('cheer');
        this.stands.cheer(1);
        for (let i = 0; i < 4; i++) this.after(i * 0.22, () => this.parts.burst(randi(40, 280), randi(8, 30), 26, { colors: CONFETTI, speed: 55, g: 30, life: 1 }));
        break;
      case 'four': this.pops.add('FOUR!', { scale: 4, color: C.yellow, sub, dur: 1.6 }); sfx.play('four'); sfx.play('cheer'); this.stands.cheer(0.75); break;
      case 'two':
        this.pops.add('2 RUNS', { scale: 3, color: C.white, sub: this.hit?.deep ? 'FIELDED IN THE DEEP' : sub });
        sfx.play('run'); this.after(0.15, () => sfx.play('run'));
        break;
      case 'one': this.pops.add('1 RUN', { scale: 3, color: C.white, sub }); sfx.play('run'); break;
      case 'caught': this.pops.add('CAUGHT!', { scale: 4, color: C.red, sub }); sfx.play('out'); sfx.play('groan'); break;
      case 'behind': this.pops.add('CAUGHT BEHIND!', { scale: 3, color: C.red, sub }); sfx.play('out'); sfx.play('groan'); break;
      case 'bowled': this.pops.add('BOWLED!', { scale: 4, color: C.red, sub }); sfx.play('out'); sfx.play('groan'); break;
      case 'beaten': this.pops.add('BEATEN!', { scale: 3, color: C.lavender, sub }); break;
      case 'dot': this.pops.add('DOT BALL', { scale: 3, color: C.lavender }); break;
    }
    this.state = 'result';
    this.t = 0;
  }

  private endMatch() {
    this.won = this.runs >= this.target;
    this.state = 'over';
    this.t = 0;
    this.pops.clear();
    if (this.won) { sfx.play('win'); sfx.play('cheer'); this.parts.confetti(140); this.stands.cheer(1); }
    else sfx.play('lose');
    const runs = this.runs, won = this.won;
    updateRecords((r) => { r.cricket.played++; if (won) r.cricket.won++; r.cricket.best = Math.max(r.cricket.best, runs); });
  }

  // ---------------- input ----------------
  private stanceAt(x: number, y: number) {
    return STANCE_BTNS.findIndex((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 3 && y <= b.y + b.h + 3);
  }

  private startWithStance(i: number) {
    this.stanceSel = i;
    this.lefty = i === 1;
    sfx.play('select');
    this.newMatch();
  }

  pointerDown(x: number, y = 80) {
    if (this.state === 'title') {
      const i = this.stanceAt(x, y);
      if (i >= 0) this.startWithStance(i);
      return;
    }
    if (this.state === 'over') {
      // back to the title card: new target, pick your stance again
      if (this.t > 0.8) { sfx.play('select'); this.target = newTarget(); this.state = 'title'; this.t = 0; this.pops.clear(); }
      return;
    }
    this.swingAt(x < W / 2 ? -1 : 1);
  }
  pointerMove(x: number, y = 80) {
    this.hover = x < W / 2 ? -1 : 1;
    if (this.state === 'title') {
      const i = this.stanceAt(x, y);
      if (i >= 0 && i !== this.stanceSel) { this.stanceSel = i; sfx.play('blip'); }
    }
  }
  keyDown(code: string) {
    const left = code === 'ArrowLeft' || code === 'KeyA';
    const right = code === 'ArrowRight' || code === 'KeyD';
    const go = code === 'Space' || code === 'Enter';
    if (this.state === 'title') {
      if (left || right) { this.stanceSel = left ? 0 : 1; sfx.play('blip'); }
      if (go) this.startWithStance(this.stanceSel);
      return;
    }
    if (this.state === 'over') { if (go) this.pointerDown(0); return; }
    if (left) this.pointerDown(0);
    else if (right) this.pointerDown(W);
  }
  cursor() { return 'pointer'; }

  // ---------------- update ----------------
  update(dt: number) {
    this.t += dt; this.time += dt;
    this.stands.update(dt); this.parts.update(dt); this.pops.update(dt);
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; tm.t -= dt; if (tm.t <= 0) { this.timers.splice(i, 1); tm.fn(); } }
    if (this.swing) this.swing.t += dt;

    // fielders jog toward their targets
    for (const f of [...this.fielders, this.deep]) {
      const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy);
      if (d > 0.5) { const s = Math.min(d, 70 * dt); f.x += (dx / d) * s; f.y += (dy / d) * s; }
    }

    switch (this.state) {
      case 'ready':
        if (this.t > 1.0) { this.state = 'runup'; this.t = 0; }
        break;
      case 'runup':
        if (this.t > 1.15) { this.state = 'flight'; this.t = 0; }
        break;
      case 'flight': {
        const s = this.t / this.del.T;
        if (!this.bounced && s >= this.del.bounce) { this.bounced = true; sfx.play('bounce'); const b = this.ballScreen(s); this.parts.burst(b.x, b.y, 4, { colors: ['#D6B67C', '#B8955B'], speed: 15, life: 0.3, g: 20 }); }
        if (this.pending && s >= 1) this.startHit();
        else if (!this.pending && this.t >= this.del.T + 0.1 && this.del.onStumps && !this.stumpsDown) {
          this.stumpsDown = 0.001;
          sfx.play('stumps');
          this.parts.burst(160, 135, 10, { colors: ['#F3E2B8', '#E9C784', C.white], speed: 70, up: true, life: 0.9 });
          this.finishBall('bowled');
        } else if (!this.pending && s >= 1.32) {
          this.finishBall(this.missed ? 'beaten' : 'dot');
        }
        // a late swing that never registered still counts as no shot
        if (this.swing && this.swing.t > 0.4 && !this.pending && !this.missed && this.state === 'flight') this.missed = true;
        break;
      }
      case 'hit': {
        const h = this.hit!;
        h.t += dt;
        if (h.o === 'caught') { this.deep.arms = h.t > h.dur * 0.7 ? 1 : 0; }
        // each time a ground shot lands: a thud and a puff of dust
        const hop = this.hitHeight(h, clamp(h.t / h.dur, 0, 1)).hop;
        if (this.isGroundShot(h.o) && hop > this.hop) {
          this.hop = hop;
          const p = this.hitProgress(h, clamp(h.t / h.dur, 0, 1));
          const bx = lerp(h.fx, h.tx, p), by = lerp(h.fy + 4, h.ty, p);
          sfx.play('bounce');
          this.parts.burst(bx, by, 4, { colors: ['#9FD7A9', '#5FA772', C.white], speed: 18, up: true, life: 0.35, g: 40 });
        }
        if (h.t >= h.dur) {
          if (h.o === 'six') this.stands.cheer(1, h.tx);
          if (h.o === 'four') this.parts.burst(h.tx, h.ty, 8, { colors: [C.white, '#9FD7A9'], speed: 30, life: 0.5 });
          this.finishBall(h.o);
        }
        break;
      }
      case 'result':
        if (this.stumpsDown) this.stumpsDown += dt;
        if (this.t > 1.6) {
          if (this.runs >= this.target || this.wkts >= MAX_WKTS || this.balls >= TOTAL_BALLS) this.endMatch();
          else this.toReady();
        }
        break;
    }
  }

  private currentPose(): Pose {
    const sw = this.swing;
    if (sw) {
      const t = sw.t;
      // a mirrored (right-handed) batsman uses the opposite follow-through pose
      const fol = P_FOLLOW[(!this.lefty ? -sw.side : sw.side) as Side];
      if (t < 0.06) return lerpPose(sw.from, P_CONTACT, t / 0.06);
      if (t < 0.26) return lerpPose(P_CONTACT, fol, (t - 0.06) / 0.2);
      if (t < 0.95) return fol;
      return lerpPose(fol, P_IDLE, clamp((t - 0.95) / 0.3, 0, 1));
    }
    if (this.state === 'flight') return lerpPose(P_IDLE, P_BACK, clamp(this.t / 0.28, 0, 1));
    if (this.state === 'runup' && this.t > 0.85) return lerpPose(P_IDLE, P_BACK, clamp((this.t - 0.85) / 0.6, 0, 0.4));
    const tap = (this.state === 'ready' || this.state === 'runup') && Math.floor(this.time * 3) % 2 ? 3 : 0;
    return { ...P_IDLE, a: P_IDLE.a - tap };
  }

  // ---------------- draw ----------------
  draw(g: CanvasRenderingContext2D) {
    this.drawGround(g);
    this.drawFarEnd(g);
    // fielders
    for (const f of this.fielders) this.drawFielder(g, f);
    this.drawFielder(g, this.deep, true);
    // ball in flight/hit, behind batsman when far
    this.drawBall(g, false);
    this.drawStumps(g);
    if (!this.lefty) {
      // right-hander: mirror the base (left-handed) drawing around the stumps (x = 160)
      g.save();
      g.translate(W, 0);
      g.scale(-1, 1);
      this.drawBatsman(g, this.currentPose(), false);
      g.restore();
      const lean = this.swing && this.swing.t < 0.95 ? -1 : 0;
      drawText(g, '7', W - (BX + lean + 1) - 3, BY - 31, { color: C.violet });
    } else {
      this.drawBatsman(g, this.currentPose(), true);
    }
    this.drawBall(g, true);
    this.parts.draw(g);
    this.drawHud(g);
    this.pops.draw(g);
    if (this.state === 'title') this.drawTitle(g);
    if (this.state === 'over') this.drawOver(g);
  }

  private drawGround(g: CanvasRenderingContext2D) {
    rect(g, 0, 0, W, 12, C.navy);
    stars(g, 3, 18, 0, 0, W, 10, this.time);
    floodlight(g, 16, 1, 9, this.time);
    floodlight(g, 304, 1, 9, this.time);
    this.stands.draw(g);
    // ad boards
    for (let i = 0; i < 10; i++) {
      rect(g, i * 32, 41, 31, 5, i % 2 ? C.pink : C.violet);
      rect(g, i * 32 + 31, 41, 1, 5, C.ink);
      drawText(g, i % 2 ? '8-BIT' : 'ARENA', i * 32 + 16, 41, { color: i % 2 ? C.white : C.yellow, align: 'center' });
    }
    // outfield stripes (perspective)
    const N = 10;
    for (let k = 0; k < N; k++) {
      const y0 = Math.round(46 + 114 * Math.pow(k / N, 1.35));
      const y1 = Math.round(46 + 114 * Math.pow((k + 1) / N, 1.35));
      rect(g, 0, y0, W, y1 - y0, k % 2 ? '#2F6E4D' : '#357A55');
    }
    // boundary rope
    for (let x = 0; x < W; x += 2) {
      const y = 48 + Math.round(Math.pow((x - 160) / 160, 2) * 7);
      px(g, x, y, '#F4F1FF');
    }
    // pitch
    for (let y = 48; y < H; y++) {
      const t = (y - 48) / 112;
      const hw = lerp(6, 34, t);
      rect(g, 160 - hw, y, hw * 2, 1, y < 60 || y > 138 ? '#BE9A5E' : '#C9A86C');
    }
    for (const [x, y, c] of this.pitchNoise) px(g, x, y, c);
    // creases
    rect(g, 150, 57, 20, 1, C.white);
    rect(g, 118, 141, 84, 1, C.white);
    rect(g, 124, 150, 72, 1, 'rgba(244,241,255,0.6)');
    line(g, 128, 141, 124, 158, 'rgba(244,241,255,0.6)');
    line(g, 192, 141, 196, 158, 'rgba(244,241,255,0.6)');
  }

  private drawFarEnd(g: CanvasRenderingContext2D) {
    // far stumps
    for (const x of [158, 160, 162]) rect(g, x, 51, 1, 6, '#F3E2B8');
    rect(g, 158, 50, 5, 1, '#E9C784');
    // umpire
    miniPerson(g, 151, 56, 12, C.white, '#222', 'stand', C.skin2, '#111');
    // non-striker
    miniPerson(g, 170, 58, 12, C.white, C.white, 'stand', C.skin);
    line(g, 172, 51, 173, 57, '#E9C784');
    // bowler
    let bx = 163, by = 56, pose: 'stand' | 'run1' | 'run2' = 'stand';
    let arm = 90;
    if (this.state === 'ready') { bx = 172; by = 46; }
    else if (this.state === 'runup') {
      const u = clamp(this.t / 0.9, 0, 1);
      bx = lerp(172, 164, u); by = lerp(46, 56, u);
      pose = this.t < 0.9 ? (Math.floor(this.t * 12) % 2 ? 'run1' : 'run2') : 'stand';
      if (this.t > 0.9) arm = lerp(90, -270, clamp((this.t - 0.9) / 0.25, 0, 1));
    } else if (this.state === 'flight') {
      const u = clamp(this.t / 0.6, 0, 1);
      bx = lerp(164, 158, u); by = lerp(56, 61, u);
      pose = this.state === 'flight' && this.t < 0.6 ? (Math.floor(this.t * 10) % 2 ? 'run1' : 'run2') : 'stand';
      arm = 70;
    } else { bx = 158; by = 61; }
    miniPerson(g, bx, by, 13, C.violet, C.white, pose, C.skin2);
    // bowling arm
    const sx = Math.round(bx + 1), sy = Math.round(by - 9);
    const r = (arm * Math.PI) / 180;
    line(g, sx, sy, sx + Math.cos(r) * 5, sy + Math.sin(r) * 5, C.violet);
    if (this.state === 'runup' || this.state === 'ready') {
      const hx = sx + Math.cos(r) * 5, hy = sy + Math.sin(r) * 5;
      px(g, hx, hy, C.red);
    }
  }

  private drawFielder(g: CanvasRenderingContext2D, f: Fielder, deep = false) {
    const h = Math.round(8 + (f.y - 60) / 12);
    const moving = Math.hypot(f.tx - f.x, f.ty - f.y) > 0.8;
    const pose = f.arms ? 'arms' : moving ? (Math.floor(this.time * 10) % 2 ? 'run1' : 'run2') : 'stand';
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(Math.round(f.x) - 2, Math.round(f.y), 5, 1);
    miniPerson(g, f.x, f.y, h, C.violet, C.white, pose, C.skin2);
    if (deep && (this.state === 'ready' || this.state === 'runup') && Math.floor(this.time * 4) % 2) {
      drawText(g, '!', f.x, f.y - h - 7, { color: C.yellow, align: 'center', outline: C.ink });
    }
  }

  private drawStumps(g: CanvasRenderingContext2D) {
    const k = this.stumpsDown;
    const xs = [157, 160, 163];
    xs.forEach((x, i) => {
      const lean = k ? Math.round(Math.min(4, k * 30) * (i - 1 || 0.5)) : 0;
      line(g, x, 150, x + lean, 137 + (k ? Math.min(2, Math.round(k * 10)) : 0), '#F3E2B8', 2);
    });
    if (!k) { rect(g, 156, 136, 4, 1, '#E9C784'); rect(g, 160, 136, 4, 1, '#E9C784'); }
  }

  /** Side-on stance: front (left) leg toward the bowler, knees bent, head turned up the pitch. */
  private drawBatsman(g: CanvasRenderingContext2D, pose: Pose, number: boolean) {
    const x = BX, y = BY;
    const lean = this.swing && this.swing.t < 0.95 ? -1 : 0; // weight transfers into the shot
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x - 15, y - 2, 23, 3);
    // front leg (further from camera), pointing at the off side
    line(g, x - 2, y - 21, x - 6 + lean, y - 12, '#D8D4E6', 4);
    line(g, x - 6 + lean, y - 12, x - 7 + lean, y - 6, '#DCD9E6', 5);
    rect(g, x - 9 + lean, y - 10, 5, 1, '#B4B0C6');
    rect(g, x - 14 + lean, y - 5, 7, 2, '#25213A');
    // back leg (nearer), knee bent forward
    line(g, x + 2, y - 21, x - 1, y - 11, '#F4F1FF', 4);
    line(g, x - 1, y - 11, x + 1, y - 3, '#EDEBF5', 5);
    rect(g, x - 3, y - 9, 6, 1, '#B4B0C6');
    rect(g, x - 3, y - 5, 6, 1, '#B4B0C6');
    rect(g, x - 5, y - 2, 8, 2, '#25213A');
    // hips
    rect(g, x - 4, y - 24, 9, 5, '#F4F1FF');
    rect(g, x + 3, y - 24, 2, 5, '#D8D4E6');
    // torso in profile, leaning over the front knee
    const tx = x + lean;
    rect(g, tx - 5, y - 34, 10, 11, '#F4F1FF');
    rect(g, tx - 6, y - 32, 1, 7, '#F4F1FF');
    rect(g, tx + 2, y - 34, 3, 11, '#D8D4E6');
    rect(g, tx - 5, y - 34, 10, 1, C.violet);
    if (number) drawText(g, '7', tx + 1, y - 31, { color: C.violet });
    // helmet in profile, looking up the pitch
    rect(g, tx - 1, y - 36, 3, 2, C.skin2);
    rect(g, tx - 4, y - 43, 8, 8, '#1E2A6E');
    rect(g, tx - 3, y - 44, 6, 1, '#1E2A6E');
    rect(g, tx + 1, y - 42, 2, 2, '#3D4FA8');
    rect(g, tx - 6, y - 39, 3, 1, '#141C4A');
    rect(g, tx - 6, y - 38, 1, 4, '#B9B5C9');
    rect(g, tx - 5, y - 35, 2, 1, '#B9B5C9');
    rect(g, tx + 1, y - 36, 4, 2, '#141C4A');
    // arms + bat
    const hx = x + pose.hx, hy = y + pose.hy;
    line(g, tx + 2, y - 32, hx, hy, '#E4E1EE', 2);
    line(g, tx - 3, y - 31, hx, hy, '#F4F1FF', 2);
    const r = (pose.a * Math.PI) / 180, dx = Math.cos(r), dy = Math.sin(r);
    line(g, hx, hy, hx + dx * 5, hy + dy * 5, '#B03030', 2);
    // dark rim first so the willow reads against the cream stumps behind it
    line(g, hx + dx * 5, hy + dy * 5, hx + dx * 20, hy + dy * 20, '#5A3E1E', 5);
    line(g, hx + dx * 5, hy + dy * 5, hx + dx * 19, hy + dy * 19, '#E9C784', 3);
    line(g, hx + dx * 6 - dy, hy + dy * 6 + dx, hx + dx * 19 - dy, hy + dy * 19 + dx, '#B98F47', 1);
    rect(g, hx - 2, hy - 2, 4, 4, C.white);
    rect(g, hx - 1, hy - 1, 2, 2, C.blue);
  }

  private drawBall(g: CanvasRenderingContext2D, near: boolean) {
    if (this.state === 'flight' || (this.state === 'result' && !this.hit && this.t < 0.4)) {
      const s = this.state === 'flight' ? this.t / this.del.T : 1.32 + this.t;
      const b = this.ballScreen(s);
      const isNear = s > 0.85;
      if (isNear !== near || b.y > H + 4) return;
      if (b.hpx > 0.5) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(Math.round(b.x - b.size / 2), Math.round(b.y), b.size, 1); }
      this.ballSprite(g, b.x, b.y - b.hpx, b.size);
    } else if (this.state === 'runup' && !near) {
      // ball in the bowler's hand is drawn as part of the bowler
    } else if (this.hit && (this.state === 'hit' || this.state === 'result')) {
      if (!near) return;
      const h = this.hit;
      const u = clamp(h.t / h.dur, 0, 1);
      if (h.o === 'six' && u >= 1) return;
      const p = this.hitProgress(h, u);
      const gx = lerp(h.fx, h.tx, p), gy = lerp(h.fy + 4, h.ty, p);
      const air = this.hitHeight(h, u).h;
      const size = Math.max(2, Math.round(4 - 2 * u + (h.o === 'six' ? 2 * Math.sin(Math.PI * u) : 0)));
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(Math.round(gx - 1), Math.round(gy), 3, 1);
      this.ballSprite(g, gx, gy - air - 1, size);
    }
  }

  private isGroundShot(o: Outcome) { return o === 'one' || o === 'two' || o === 'four'; }

  /** Ground shots slow down as they run along the outfield; aerial ones travel evenly. */
  private hitProgress(h: { o: Outcome }, u: number) {
    return this.isGroundShot(h.o) ? 1 - Math.pow(1 - u, 1.7) : u;
  }

  /** Height above the ground (px) and which hop the ball is on (-1 = rolling / in the air). */
  private hitHeight(h: { o: Outcome; arc: number }, u: number) {
    if (!this.isGroundShot(h.o)) return { h: h.arc * 4 * u * (1 - u), hop: -1 };
    const hops = h.o === 'four' ? HOPS_FOUR : HOPS_RUN;
    let start = 0;
    for (let i = 0; i < hops.length; i++) {
      const hp = hops[i];
      if (u < start + hp.len) { const k = (u - start) / hp.len; return { h: hp.h * 4 * k * (1 - k), hop: i }; }
      start += hp.len;
    }
    return { h: 0, hop: hops.length };
  }

  private ballSprite(g: CanvasRenderingContext2D, x: number, y: number, d: number) {
    disc(g, x, y, d, '#D62839');
    if (d >= 3) px(g, Math.round(x - d / 2) + 1, Math.round(y - d / 2), '#FF8A8A');
    if (d >= 4) rect(g, Math.round(x) - 1, Math.round(y - d / 2) + 1, 1, d - 2, '#F7E7CE');
  }

  private drawHud(g: CanvasRenderingContext2D) {
    if (this.state === 'title') return;
    rect(g, 0, 0, W, 11, 'rgba(3,5,11,0.8)');
    drawText(g, `TARGET ${this.target}`, 4, 3, { color: C.yellow });
    drawText(g, `${this.runs}/${this.wkts}`, W / 2 - 8, 3, { color: C.white, align: 'center' });
    for (let i = 0; i < MAX_WKTS; i++) {
      const c = i < this.wkts ? C.red : C.lavender;
      rect(g, W / 2 + 6 + i * 5, 3, 1, 5, c); rect(g, W / 2 + 8 + i * 5, 3, 1, 5, c);
    }
    drawText(g, `BALLS LEFT ${TOTAL_BALLS - this.balls}`, W - 4, 3, { color: C.lavender, align: 'right' });

    rect(g, 0, H - 10, 84, 10, 'rgba(3,5,11,0.75)');
    const need = Math.max(0, this.target - this.runs);
    drawText(g, `NEED ${need} OFF ${TOTAL_BALLS - this.balls}`, 4, H - 7, { color: C.white });

    rect(g, W - 84, H - 10, 84, 10, 'rgba(3,5,11,0.75)');
    const last = this.log.slice(-6);
    drawText(g, last.length ? last.join(' ') : '-', W - 4, H - 7, { color: C.white, align: 'right' });
    drawText(g, `${this.del.speed}KM/H`, W - 4, H - 17, { color: C.lavender, align: 'right', outline: C.ink });

    if (this.state === 'ready' || this.state === 'runup' || (this.state === 'flight' && this.t < 0.35)) {
      const side = this.fielderSide < 0 ? 'LEFT' : 'RIGHT';
      const gap = this.fielderSide < 0 ? 'RIGHT' : 'LEFT';
      drawText(g, `FIELDER ${side} - HIT ${gap}`, W / 2, H - 8, { color: C.yellow, align: 'center', outline: C.ink });
    }
    if (this.balls < 2 && (this.state === 'runup' || this.state === 'flight')) {
      drawText(g, `< ${tapWord()} LEFT`, 6, 100, { color: this.hover < 0 ? C.yellow : C.white, outline: C.ink });
      drawText(g, `${tapWord()} RIGHT >`, W - 6, 100, { color: this.hover > 0 ? C.yellow : C.white, outline: C.ink, align: 'right' });
    }
  }

  private drawTitle(g: CanvasRenderingContext2D) {
    dim(g, 0.35);
    panel(g, 62, 16, 196, 128);
    drawText(g, 'CRICKET CHASE', W / 2, 24, { color: C.yellow, scale: 2, align: 'center', outline: C.ink });
    drawText(g, 'TARGET', W / 2, 40, { color: C.lavender, align: 'center' });
    drawText(g, String(this.target), W / 2, 47, { color: C.white, scale: 3, align: 'center', outline: C.pink });
    drawText(g, `${TOTAL_BALLS} BALLS  -  ${MAX_WKTS} WICKETS`, W / 2, 67, { color: C.white, align: 'center' });
    drawText(g, input.touch ? 'SWING: TAP LEFT/RIGHT HALF OR D-PAD' : 'SWING: CLICK LEFT/RIGHT HALF OR < >', W / 2, 76, { color: C.lavender, align: 'center' });
    drawText(g, 'CHOOSE YOUR STANCE', W / 2, 89, { color: C.white, align: 'center' });
    STANCE_BTNS.forEach((b, i) => {
      const sel = i === this.stanceSel;
      rect(g, b.x, b.y, b.w, b.h, sel ? 'rgba(255,194,26,0.2)' : C.purple);
      rect(g, b.x, b.y, b.w, 1, sel ? C.yellow : C.lavender);
      rect(g, b.x, b.y + b.h - 1, b.w, 1, sel ? C.yellow : C.violet);
      rect(g, b.x, b.y, 1, b.h, sel ? C.yellow : C.lavender);
      rect(g, b.x + b.w - 1, b.y, 1, b.h, sel ? C.yellow : C.violet);
      const bob = sel && Math.floor(this.time * 4) % 2 ? -1 : 0;
      drawText(g, b.label, b.x + b.w / 2, b.y + 5 + bob, { color: sel ? C.yellow : C.white, align: 'center' });
    });
    blinkText(g, `${tapWord()} A STANCE TO START`, W / 2, 120, this.time);
    drawText(g, input.touch ? 'OR D-PAD < >  THEN  A' : 'OR < >  THEN  ENTER', W / 2, 130, { color: C.grey, align: 'center' });
  }

  private drawOver(g: CanvasRenderingContext2D) {
    dim(g, 0.4);
    panel(g, 62, 30, 196, 96, this.won ? C.yellow : C.red);
    drawText(g, this.won ? 'YOU WON!' : this.wkts >= MAX_WKTS ? 'ALL OUT!' : 'SO CLOSE!', W / 2, 40, {
      color: this.won ? C.yellow : C.red, scale: 3, align: 'center', outline: C.ink,
    });
    drawText(g, `${this.runs}/${this.wkts} FROM ${this.balls} BALLS`, W / 2, 64, { color: C.white, align: 'center' });
    const msg = this.won
      ? `CHASED ${this.target} WITH ${TOTAL_BALLS - this.balls} BALLS SPARE`
      : `FELL SHORT BY ${this.target - this.runs} RUNS`;
    drawText(g, msg, W / 2, 74, { color: C.lavender, align: 'center' });
    if (this.t > 0.8) blinkText(g, `${tapWord()} TO PLAY AGAIN`, W / 2, 100, this.time);
    drawText(g, 'NEW TARGET (UP TO 80) EVERY GAME', W / 2, 110, { color: C.grey, align: 'center' });
  }
}
