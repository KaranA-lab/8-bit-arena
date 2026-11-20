import { W, H, type Game, rect, px, line, disc, Particles, Pops, Stands, floodlight, stars, miniPerson, CONFETTI } from '../lib/gfx';
import { drawText, measure } from '../lib/font';
import { panel, blinkText, dim } from '../lib/ui';
import { C, clamp, lerp, rand, randi, chance, pick, shade, mulberry32 } from '../lib/util';
import { sfx } from '../lib/audio';
import { tapWord, input } from '../lib/input';
import { updateRecords } from '../lib/records';
import { TEAMS, drawBadge, drawLeagueBug } from './cricketTeams';

type Side = -1 | 1;
type Outcome = 'six' | 'four' | 'two' | 'one' | 'dot' | 'caught' | 'behind' | 'bowled' | 'beaten';
type State = 'team' | 'title' | 'ready' | 'runup' | 'flight' | 'hit' | 'result' | 'over';

// team picker grid (5 x 2) and the back button on the stance card (game px)
const teamCell = (i: number) => ({ cx: 72 + (i % 5) * 44, top: 46 + Math.floor(i / 5) * 34 });
const BACK_BTN = { x: 67, y: 20, w: 34, h: 10 };
const BATTER_NUMS = [7, 18, 45, 10];
const BOWLERS = ['IYER', 'KHAN', 'RAO', 'SINGH', 'PATEL', 'NAIR', 'GILL', 'DAS', 'MENON', 'BOSE', 'REDDY', 'JOSHI'];

// Side-on batsman seen from behind the stumps (keeper's view): body on the leg side, facing the
// off side, bat grounded in front of the stumps. The base drawing faces screen-left, which is a
// LEFT-hander from this angle; right-handers are drawn mirrored. Hands are relative to the feet.
interface Pose { hx: number; hy: number; a: number }
const P_IDLE: Pose = { hx: -5, hy: -14, a: 100 };
const P_BACK: Pose = { hx: 1, hy: -25, a: -55 };
const P_CONTACT: Pose = { hx: -5, hy: -16, a: 160 };
const P_FOLLOW: Record<Side, Pose> = { [-1]: { hx: -6, hy: -25, a: 215 }, [1]: { hx: 4, hy: -23, a: 330 } } as Record<Side, Pose>;
const BAT_LEN = 14;  // handle + blade, px
const NUM_Y = 22;    // shirt number height above the feet
const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({ hx: lerp(a.hx, b.hx, t), hy: lerp(a.hy, b.hy, t), a: lerp(a.a, b.a, t) });

const FAR_Y = 54;
// Near end, seen from behind the stumps: stumps closest to the camera, the batsman just in
// front of them at the popping crease (toward the bowler), the ball meeting his bat beyond.
const NEAR_Y = 128;              // where the delivery reaches the bat
const BX = 171, BY = 136;        // batsman's back foot, at the popping crease
const POP_Y = 132;               // popping crease line
const STUMP_BASE = 145, STUMP_TOP = 131;
const TOTAL_BALLS = 18;
const MAX_WKTS = 3;
const newTarget = () => randi(25, 80);

/** Boundary rope: flat along the far stands, curving down only near the sides of the ground. */
const ropeY = (x: number) => 47 + Math.pow(Math.min(1, Math.abs(x - 160) / 160), 5) * 28;

// ground shots skip along the outfield: decaying hops (share of flight time, height px), then a roll
const HOPS_RUN = [{ len: 0.3, h: 9 }, { len: 0.22, h: 5 }, { len: 0.17, h: 2.5 }, { len: 0.12, h: 1 }];
const HOPS_FOUR = [{ len: 0.22, h: 5 }, { len: 0.15, h: 2 }, { len: 0.1, h: 0.8 }];

// stance picker buttons on the title card (game px)
const STANCE_BTNS = [
  { x: 74, y: 96, w: 82, h: 15, label: 'RIGHT-HANDED' },
  { x: 164, y: 96, w: 82, h: 15, label: 'LEFT-HANDED' },
];

// ---- difficulty ----
interface Level {
  label: string; color: string;
  win: [number, number, number, number]; // timing windows (s) for perfect / good / ok / edge
  pace: number;                          // extra km/h
  stumps: number;                        // share of deliveries aimed at the stumps
  gapPerfectSix: number;                 // perfect timing into the gap: chance of six (else four)
  gapGoodSix: number;                    // good timing into the gap: chance of six (else four)
  fieldPerfect: [number, number];        // perfect timing at the deep fielder: [six over him, caught]
  fieldGoodCaught: number;               // good timing at the deep fielder: chance he catches it
  edgeOut: number;                       // edges carried to the keeper
}
const LEVELS: Level[] = [
  {
    label: 'BEGINNER', color: C.green, win: [0.075, 0.12, 0.17, 0.22], pace: 0, stumps: 0.45,
    gapPerfectSix: 1, gapGoodSix: 0.45, fieldPerfect: [0.35, 0.2], fieldGoodCaught: 0.15, edgeOut: 0.15,
  },
  {
    // sixes need genuinely good timing: the perfect window is ±30ms instead of ±75ms
    label: 'INTERMEDIATE', color: C.yellow, win: [0.03, 0.06, 0.1, 0.15], pace: 10, stumps: 0.55,
    gapPerfectSix: 0.7, gapGoodSix: 0.05, fieldPerfect: [0.15, 0.35], fieldGoodCaught: 0.3, edgeOut: 0.3,
  },
];
const LEVEL_BTNS = [
  { x: 92, y: 70, w: 64, h: 12 },
  { x: 164, y: 70, w: 64, h: 12 },
];

interface Fielder { hx: number; hy: number; x: number; y: number; tx: number; ty: number; arms: number }

export class Cricket implements Game {
  state: State = 'team';
  t = 0;
  time = 0;
  target = newTarget();
  team = 0;
  opp = 1;
  teamSel = 0;
  // broadcast stats
  batter = 0;
  batRuns = 0;
  batBalls = 0;
  newBatterNext = false;
  bowler = 'IYER';
  bowlRuns = 0;
  bowlWkts = 0;
  bowlBalls = 0;
  overStart = 0;
  barIn = 0;
  /** left-handed batsman (right-handers are the ones drawn mirrored around the stumps) */
  lefty = false;
  stanceSel = 0;
  level = 0;
  private get L() { return LEVELS[this.level]; }
  hop = 0;
  ropeCrossed = false;
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
    sfx.startCrowd();
  }

  destroy() { sfx.stopCrowd(); }

  private get T() { return TEAMS[this.team]; }
  private get O() { return TEAMS[this.opp]; }

  // ---------------- flow ----------------
  /** Lock in your team; draw a random opponent and a fresh target. */
  private setupFixture() {
    const others = TEAMS.map((_, i) => i).filter((i) => i !== this.team);
    this.opp = pick(others);
    this.target = newTarget();
    const a = this.T.main, b = this.O.main;
    this.stands = new Stands(0, 10, W, 31, '#1B1740', [a, a, a, b, b, C.white, C.lavender], 11 + this.team);
  }

  private newMatch() {
    this.runs = 0; this.wkts = 0; this.balls = 0; this.log = [];
    this.batter = 0; this.batRuns = 0; this.batBalls = 0; this.newBatterNext = false;
    this.overStart = 0; this.barIn = 0;
    this.newBowler();
    this.parts.list.length = 0; this.pops.clear();
    this.toReady();
  }

  private newBowler() {
    this.bowler = pick(BOWLERS.filter((b) => b !== this.bowler));
    this.bowlRuns = 0; this.bowlWkts = 0; this.bowlBalls = 0;
  }

  private toReady() {
    if (this.newBatterNext) { this.batter++; this.batRuns = 0; this.batBalls = 0; this.newBatterNext = false; }
    if (this.balls > 0 && this.balls % 6 === 0 && this.overStart !== this.balls) { this.overStart = this.balls; this.newBowler(); }
    this.state = 'ready'; this.t = 0;
    this.swing = null; this.pending = null; this.missed = false; this.hit = null; this.timing = ''; this.stumpsDown = 0; this.bounced = false;
    this.fielderSide = chance(0.5) ? -1 : 1;
    this.deep.hx = this.fielderSide < 0 ? 58 : 262; this.deep.hy = 64;
    this.deep.x = this.deep.hx; this.deep.y = this.deep.hy; this.deep.tx = this.deep.hx; this.deep.ty = this.deep.hy; this.deep.arms = 0;
    for (const f of this.fielders) { f.tx = f.hx; f.ty = f.hy; f.arms = 0; }
    const over = Math.floor(this.balls / 6);
    const speed = randi(116, 126) + over * 8 + randi(0, 8) + this.L.pace;
    const onStumps = chance(this.L.stumps);
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
    // timing windows and outcomes depend on the chosen difficulty
    const L = this.L;
    const [wPerfect, wGood, wOk, wEdge] = L.win;
    const q = a <= wPerfect ? 'perfect' : a <= wGood ? 'good' : a <= wOk ? 'ok' : a <= wEdge ? 'edge' : 'miss';
    this.timing = q === 'perfect' ? 'PERFECT TIMING' : q === 'good' ? 'GOOD TIMING' : q === 'miss' ? (dt < 0 ? 'WAY TOO EARLY' : 'TOO LATE') : dt < 0 ? 'A BIT EARLY' : 'A BIT LATE';
    if (q === 'miss') { this.missed = true; return; }
    const into = side === this.fielderSide;
    let o: Outcome;
    let deep = false;
    if (q === 'perfect') {
      if (!into) o = chance(L.gapPerfectSix) ? 'six' : 'four';
      else {
        const r = Math.random();
        o = r < L.fieldPerfect[0] ? 'six' : r < L.fieldPerfect[0] + L.fieldPerfect[1] ? 'caught' : 'two';
        deep = o === 'two';
      }
    } else if (q === 'good') {
      if (!into) o = chance(L.gapGoodSix) ? 'six' : 'four';
      else { o = chance(L.fieldGoodCaught) ? 'caught' : 'two'; deep = o === 'two'; }
    } else if (q === 'ok') { o = 'two'; deep = into; }
    else o = chance(L.edgeOut) ? 'behind' : 'one';
    this.pending = { o, side, deep };
    if (dt >= 0) this.startHit();
  }

  private ballScreen(s: number) {
    const d = this.del;
    const f = s <= 1 ? Math.pow(Math.max(0, s), 1.5) : 1 + (s - 1) * 0.9;
    // past the bat it carries on to the stumps (and the keeper beyond them)
    const y = s <= 1 ? FAR_Y + (NEAR_Y - FAR_Y) * f : NEAR_Y + (s - 1) * 110;
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
      case 'four':
        // along the ground to the side boundary, finishing a few px over the rope
        tx = side < 0 ? randi(8, 40) : randi(280, 312); ty = Math.round(ropeY(tx)) - 4; dur = 1.05; arc = 2;
        break;
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
    this.ropeCrossed = false;
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
    this.batRuns += runs; this.batBalls++;
    this.bowlRuns += runs; this.bowlBalls++;
    if (wicket) { this.bowlWkts++; this.newBatterNext = true; }
    const sub = this.timing || undefined;
    switch (o) {
      case 'six':
        this.pops.add('SIX!', { scale: 5, rainbow: true, sub, dur: 1.7 });
        sfx.play('six'); sfx.roar(1);
        this.stands.cheer(1);
        for (let i = 0; i < 4; i++) this.after(i * 0.22, () => this.parts.burst(randi(40, 280), randi(8, 30), 26, { colors: CONFETTI, speed: 55, g: 30, life: 1 }));
        break;
      case 'four': this.pops.add('FOUR!', { scale: 4, color: C.yellow, sub, dur: 1.6 }); sfx.play('four'); sfx.roar(0.7); this.stands.cheer(0.75); break;
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
  private levelAt(x: number, y: number) {
    return LEVEL_BTNS.findIndex((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2);
  }

  private stanceAt(x: number, y: number) {
    return STANCE_BTNS.findIndex((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 3 && y <= b.y + b.h + 3);
  }

  private startWithStance(i: number) {
    this.stanceSel = i;
    this.lefty = i === 1;
    sfx.play('select');
    this.newMatch();
  }

  private teamAt(x: number, y: number) {
    return TEAMS.findIndex((_, i) => { const { cx, top } = teamCell(i); return x >= cx - 20 && x <= cx + 20 && y >= top - 3 && y <= top + 27; });
  }

  private pickTeam(i: number) {
    this.team = i; this.teamSel = i;
    sfx.play('select');
    this.setupFixture();
    this.state = 'title'; this.t = 0;
  }

  private onBack(x: number, y: number) {
    const b = BACK_BTN;
    return x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2;
  }

  pointerDown(x: number, y = 80) {
    if (this.state === 'team') {
      const i = this.teamAt(x, y);
      if (i >= 0) this.pickTeam(i);
      return;
    }
    if (this.state === 'title') {
      if (this.onBack(x, y)) { sfx.play('close'); this.state = 'team'; this.t = 0; return; }
      const lv = this.levelAt(x, y);
      if (lv >= 0) { if (lv !== this.level) { this.level = lv; sfx.play('select'); } return; }
      const i = this.stanceAt(x, y);
      if (i >= 0) this.startWithStance(i);
      return;
    }
    if (this.state === 'over') {
      // back to the stance card: same team, new opponent and target
      if (this.t > 0.8) { sfx.play('select'); this.setupFixture(); this.state = 'title'; this.t = 0; this.pops.clear(); }
      return;
    }
    this.swingAt(x < W / 2 ? -1 : 1);
  }
  pointerMove(x: number, y = 80) {
    this.hover = x < W / 2 ? -1 : 1;
    if (this.state === 'team') {
      const i = this.teamAt(x, y);
      if (i >= 0 && i !== this.teamSel) { this.teamSel = i; sfx.play('blip'); }
    }
    if (this.state === 'title') {
      const i = this.stanceAt(x, y);
      if (i >= 0 && i !== this.stanceSel) { this.stanceSel = i; sfx.play('blip'); }
    }
  }
  keyDown(code: string) {
    const left = code === 'ArrowLeft' || code === 'KeyA';
    const right = code === 'ArrowRight' || code === 'KeyD';
    const up = code === 'ArrowUp' || code === 'KeyW';
    const down = code === 'ArrowDown' || code === 'KeyS';
    const go = code === 'Space' || code === 'Enter';
    if (this.state === 'team') {
      const n = TEAMS.length;
      if (left) this.teamSel = (this.teamSel + n - 1) % n;
      if (right) this.teamSel = (this.teamSel + 1) % n;
      if (up || down) this.teamSel = (this.teamSel + 5) % n;
      if (left || right || up || down) sfx.play('blip');
      if (go) this.pickTeam(this.teamSel);
      return;
    }
    if (this.state === 'title') {
      if (left || right) { this.stanceSel = left ? 0 : 1; sfx.play('blip'); }
      if (up || down) { this.level = 1 - this.level; sfx.play('blip'); }
      if (code === 'Backspace' || code === 'Escape') { sfx.play('close'); this.state = 'team'; this.t = 0; return; }
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
    if (this.state !== 'team' && this.state !== 'title') this.barIn = Math.min(1, this.barIn + dt * 3);
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
          this.parts.burst(160, STUMP_TOP + 1, 10, { colors: ['#F3E2B8', '#E9C784', C.white], speed: 70, up: true, life: 0.9 });
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
        // a four rolls over the rope: puff of chalk and the crowd on that side jumps up
        if (h.o === 'four' && !this.ropeCrossed) {
          const p = this.hitProgress(h, clamp(h.t / h.dur, 0, 1));
          const bx = lerp(h.fx, h.tx, p), by = lerp(h.fy + 4, h.ty, p);
          if (by <= ropeY(bx)) {
            this.ropeCrossed = true;
            this.parts.burst(bx, by, 10, { colors: [C.white, '#E8E4F5'], speed: 26, up: true, life: 0.5, g: 50 });
            this.stands.cheer(0.9, bx);
          }
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
    // batsman first, then the stumps over him: the wicket is behind him, nearest the camera
    if (!this.lefty) {
      // right-hander: mirror the base (left-handed) drawing around the stumps (x = 160)
      g.save();
      g.translate(W, 0);
      g.scale(-1, 1);
      this.drawBatsman(g, this.currentPose(), false);
      g.restore();
      // shirt number drawn un-mirrored at the mirrored position so it stays readable
      const lean = this.swing && this.swing.t < 0.95 ? -1 : 0;
      const num = this.shirtNumber();
      drawText(g, num, W - this.numberX(num, BX + lean) - measure(num), BY - NUM_Y, { color: this.T.trim });
    } else {
      this.drawBatsman(g, this.currentPose(), true);
    }
    this.drawStumps(g);
    this.drawBall(g, true);
    this.parts.draw(g);
    this.drawHud(g);
    this.pops.draw(g);
    if (this.state === 'team') this.drawTeams(g);
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
    // beyond the boundary: slightly darker grass, then the dashed rope itself
    g.fillStyle = 'rgba(3,5,11,0.16)';
    for (let x = 0; x < W; x++) { const ry = Math.round(ropeY(x)); if (ry > 46) g.fillRect(x, 46, 1, ry - 46); }
    for (let x = 0; x < W - 1; x++) {
      if (Math.floor(x / 3) % 2) continue;
      line(g, x, Math.round(ropeY(x)), x + 1, Math.round(ropeY(x + 1)), '#F4F1FF');
    }
    // pitch
    for (let y = 48; y < H; y++) {
      const t = (y - 48) / 112;
      const hw = lerp(6, 34, t);
      rect(g, 160 - hw, y, hw * 2, 1, y < 60 || y > POP_Y - 3 ? '#BE9A5E' : '#C9A86C');
    }
    for (const [x, y, c] of this.pitchNoise) px(g, x, y, c);
    // creases
    rect(g, 150, 57, 20, 1, C.white);
    // near end: popping crease in front of the batsman, bowling crease under the stumps
    rect(g, 120, POP_Y, 80, 1, C.white);
    rect(g, 126, STUMP_BASE, 68, 1, 'rgba(244,241,255,0.6)');
    line(g, 130, POP_Y, 125, 152, 'rgba(244,241,255,0.6)');
    line(g, 190, POP_Y, 195, 152, 'rgba(244,241,255,0.6)');
  }

  private drawFarEnd(g: CanvasRenderingContext2D) {
    // far stumps
    for (const x of [158, 160, 162]) rect(g, x, 51, 1, 6, '#F3E2B8');
    rect(g, 158, 50, 5, 1, '#E9C784');
    // umpire
    miniPerson(g, 151, 56, 12, C.white, '#222', 'stand', C.skin2, '#111');
    // non-striker (your team)
    miniPerson(g, 170, 58, 12, this.T.main, this.T.pants, 'stand', C.skin, this.T.helmet);
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
    miniPerson(g, bx, by, 13, this.O.main, this.O.pants, pose, C.skin2);
    // bowling arm
    const sx = Math.round(bx + 1), sy = Math.round(by - 9);
    const r = (arm * Math.PI) / 180;
    line(g, sx, sy, sx + Math.cos(r) * 5, sy + Math.sin(r) * 5, this.O.main);
    if (this.state === 'runup' || this.state === 'ready') {
      const hx = sx + Math.cos(r) * 5, hy = sy + Math.sin(r) * 5;
      px(g, hx, hy, C.red);
    }
  }

  private drawFielder(g: CanvasRenderingContext2D, f: Fielder, deep = false) {
    // a touch bigger the nearer they are, so they sit in scale with the batsman
    const h = Math.round(9 + (f.y - 60) / 8);
    const moving = Math.hypot(f.tx - f.x, f.ty - f.y) > 0.8;
    const pose = f.arms ? 'arms' : moving ? (Math.floor(this.time * 10) % 2 ? 'run1' : 'run2') : 'stand';
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(Math.round(f.x) - 2, Math.round(f.y), 5, 1);
    miniPerson(g, f.x, f.y, h, this.O.main, this.O.pants, pose, C.skin2);
    if (deep && (this.state === 'ready' || this.state === 'runup') && Math.floor(this.time * 4) % 2) {
      drawText(g, '!', f.x, f.y - h - 7, { color: C.yellow, align: 'center', outline: C.ink });
    }
  }

  private drawStumps(g: CanvasRenderingContext2D) {
    const k = this.stumpsDown;
    const xs = [157, 160, 163];
    xs.forEach((x, i) => {
      const lean = k ? Math.round(Math.min(4, k * 30) * (i - 1 || 0.5)) : 0;
      line(g, x, STUMP_BASE, x + lean, STUMP_TOP + (k ? Math.min(2, Math.round(k * 10)) : 0), '#F3E2B8', 2);
    });
    if (!k) { rect(g, 156, STUMP_TOP - 1, 4, 1, '#E9C784'); rect(g, 160, STUMP_TOP - 1, 4, 1, '#E9C784'); }
  }

  private shirtNumber() { return String(BATTER_NUMS[this.batter] ?? 7); }
  /** Left edge of the shirt number on the torso (torso spans tx-3..tx+3). */
  private numberX(n: string, tx: number) { return n.length > 1 ? tx - 3 : tx - 1; }

  /**
   * Side-on stance, about 31px tall (in scale with the fielders): front (left) leg toward the
   * bowler, knees bent, head turned up the pitch. Team shirt, trousers and helmet; white pads.
   */
  private drawBatsman(g: CanvasRenderingContext2D, pose: Pose, number: boolean) {
    const x = BX, y = BY;
    const T = this.T;
    const lean = this.swing && this.swing.t < 0.95 ? -1 : 0; // weight transfers into the shot
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x - 10, y - 1, 16, 2);
    // front leg (further from camera), pointing at the off side
    line(g, x - 1, y - 14, x - 4 + lean, y - 8, shade(T.pants, 0.8), 3);
    line(g, x - 4 + lean, y - 8, x - 5 + lean, y - 4, '#DCD9E6', 3);
    rect(g, x - 9 + lean, y - 3, 5, 2, '#25213A');
    // back leg (nearer), knee bent forward
    line(g, x + 1, y - 14, x - 1, y - 7, T.pants, 3);
    line(g, x - 1, y - 7, x, y - 3, '#EDEBF5', 4);
    rect(g, x - 2, y - 5, 4, 1, '#B4B0C6');
    rect(g, x - 3, y - 2, 6, 2, '#25213A');
    // hips
    rect(g, x - 3, y - 16, 6, 3, T.pants);
    rect(g, x + 2, y - 16, 1, 3, shade(T.pants, 0.8));
    // torso in profile (team shirt), leaning over the front knee
    const tx = x + lean;
    rect(g, tx - 3, y - 23, 7, 8, T.main);
    rect(g, tx - 4, y - 22, 1, 5, T.main);
    rect(g, tx + 2, y - 23, 2, 8, shade(T.main, 0.8));
    rect(g, tx - 3, y - 23, 7, 1, T.trim);
    if (number) { const n = this.shirtNumber(); drawText(g, n, this.numberX(n, tx), y - NUM_Y, { color: T.trim }); }
    // helmet in team colours, in profile, looking up the pitch
    rect(g, tx - 1, y - 24, 2, 1, C.skin2);
    rect(g, tx - 3, y - 30, 6, 6, T.helmet);
    rect(g, tx - 2, y - 31, 4, 1, T.helmet);
    rect(g, tx + 1, y - 29, 1, 1, shade(T.helmet, 1.6));
    rect(g, tx - 5, y - 27, 2, 1, shade(T.helmet, 0.6));
    rect(g, tx - 4, y - 26, 1, 2, '#B9B5C9');
    rect(g, tx + 1, y - 25, 3, 1, shade(T.helmet, 0.6));
    // arms (team sleeves) + bat
    const hx = x + pose.hx, hy = y + pose.hy;
    line(g, tx + 1, y - 22, hx, hy, shade(T.main, 0.85), 2);
    line(g, tx - 2, y - 21, hx, hy, T.main, 2);
    const r = (pose.a * Math.PI) / 180, dx = Math.cos(r), dy = Math.sin(r);
    line(g, hx, hy, hx + dx * 3, hy + dy * 3, '#B03030', 1);
    // dark rim first so the willow reads against the cream stumps behind it
    line(g, hx + dx * 3, hy + dy * 3, hx + dx * BAT_LEN, hy + dy * BAT_LEN, '#5A3E1E', 3);
    line(g, hx + dx * 3, hy + dy * 3, hx + dx * (BAT_LEN - 1), hy + dy * (BAT_LEN - 1), '#E9C784', 2);
    rect(g, hx - 1, hy - 1, 3, 3, C.white);
    rect(g, hx, hy, 1, 1, C.blue);
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

  /** TV-style graphics: league crest top-left, two-tier score bar along the bottom. */
  private drawHud(g: CanvasRenderingContext2D) {
    if (this.state === 'team' || this.state === 'title') return;
    const T = this.T, O = this.O;
    drawLeagueBug(g, 4, 4);
    drawText(g, this.L.label, 4, 26, { color: this.L.color, outline: C.ink });

    if (this.state === 'ready' || this.state === 'runup' || (this.state === 'flight' && this.t < 0.35)) {
      const side = this.fielderSide < 0 ? 'LEFT' : 'RIGHT';
      const gap = this.fielderSide < 0 ? 'RIGHT' : 'LEFT';
      drawText(g, `DEEP FIELDER ${side} - HIT ${gap}`, W - 6, 6, { color: C.yellow, align: 'right', outline: C.ink });
    }
    if (this.balls < 2 && (this.state === 'runup' || this.state === 'flight')) {
      drawText(g, `< ${tapWord()} LEFT`, 6, 100, { color: this.hover < 0 ? C.yellow : C.white, outline: C.ink });
      drawText(g, `${tapWord()} RIGHT >`, W - 6, 100, { color: this.hover > 0 ? C.yellow : C.white, outline: C.ink, align: 'right' });
    }

    // the bar slides up when the innings starts
    const e = 1 - Math.pow(1 - this.barIn, 3);
    const y = 146 + Math.round((1 - e) * 26);
    const ballsLeft = TOTAL_BALLS - this.balls;
    const need = Math.max(0, this.target - this.runs);

    // tier 1 tabs: equation + speed gun
    rect(g, 0, y - 9, 96, 9, 'rgba(11,10,30,0.94)');
    rect(g, 0, y - 9, 3, 9, T.main);
    drawText(g, need > 0 ? `TO WIN ${need} OFF ${ballsLeft}` : 'TARGET REACHED!', 6, y - 7, { color: C.yellow });
    const showSpeed = this.state === 'flight' || this.state === 'hit' || this.state === 'result';
    if (showSpeed) {
      rect(g, 98, y - 9, 44, 9, 'rgba(11,10,30,0.94)');
      drawText(g, `${this.del.speed} KM/H`, 120, y - 7, { color: C.white, align: 'center' });
    }

    // tier 2 main bar
    rect(g, 0, y, W, 14, '#0B0A1E');
    rect(g, 0, y, W, 1, T.main);
    // batting team block
    rect(g, 0, y + 1, 28, 13, T.main);
    rect(g, 0, y + 1, 28, 1, shade(T.main, 1.3));
    rect(g, 26, y + 1, 2, 13, T.trim);
    drawText(g, T.code, 13, y + 5, { color: T.text, align: 'center' });
    // score + overs
    drawText(g, `${this.runs}-${this.wkts}`, 32, y + 3, { color: C.white, scale: 2 });
    const ov = `${Math.floor(this.balls / 6)}.${this.balls % 6}`;
    drawText(g, ov, 76, y + 3, { color: C.white });
    drawText(g, `OF ${TOTAL_BALLS / 6}`, 76, y + 9, { color: C.grey });
    const divider = (x: number) => rect(g, x, y + 3, 1, 9, '#2A2650');
    divider(96);
    // batter (striker *)
    drawText(g, `NO.${this.shirtNumber()}*`, 100, y + 3, { color: C.white });
    drawText(g, `${this.batRuns} (${this.batBalls})`, 100, y + 9, { color: C.yellow });
    divider(138);
    // bowler
    drawText(g, this.bowler, 142, y + 3, { color: C.lavender });
    drawText(g, `${this.bowlWkts}-${this.bowlRuns} (${this.bowlBalls})`, 142, y + 9, { color: C.white });
    divider(186);
    // opponent
    drawText(g, 'VS', 190, y + 5, { color: C.grey });
    rect(g, 200, y + 3, 28, 9, O.main);
    rect(g, 200, y + 3, 28, 1, O.trim);
    drawText(g, O.code, 214, y + 5, { color: O.text, align: 'center' });
    divider(232);
    // this over
    drawText(g, 'THIS OVER', 236, y + 2, { color: C.grey });
    const over = this.log.slice(this.overStart, this.overStart + 6);
    for (let i = 0; i < 6; i++) {
      const cx = 236 + i * 14, cy = y + 8;
      const v = over[i];
      const bg = v === undefined ? '#1A1838' : v === '6' ? C.pink : v === '4' ? C.blue : v === 'W' ? C.red : v === '.' ? '#2A2650' : '#3A3460';
      rect(g, cx, cy, 12, 6, bg);
      if (v !== undefined) drawText(g, v === '.' ? '0' : v, cx + 6, cy + 1, { color: v === '.' ? C.grey : C.white, align: 'center' });
    }
  }

  private drawTeams(g: CanvasRenderingContext2D) {
    dim(g, 0.45);
    panel(g, 40, 12, 240, 136);
    drawText(g, 'CRICKET CHASE', W / 2, 19, { color: C.yellow, scale: 2, align: 'center', outline: C.ink });
    drawText(g, 'PICK YOUR TEAM', W / 2, 34, { color: C.lavender, align: 'center' });
    TEAMS.forEach((t, i) => {
      const { cx, top } = teamCell(i);
      const sel = i === this.teamSel;
      if (sel) {
        rect(g, cx - 19, top - 3, 38, 29, 'rgba(255,194,26,0.16)');
        rect(g, cx - 19, top - 3, 38, 1, C.yellow); rect(g, cx - 19, top + 25, 38, 1, C.yellow);
      }
      drawBadge(g, cx - 11, top + (sel && Math.floor(this.time * 5) % 2 ? -1 : 0), t);
    });
    const t = TEAMS[this.teamSel];
    rect(g, 52, 117, 216, 9, t.main);
    rect(g, 52, 117, 216, 1, t.trim);
    drawText(g, t.name, W / 2, 119, { color: t.text, align: 'center' });
    blinkText(g, `${tapWord()} A TEAM`, W / 2, 132, this.time);
    drawText(g, input.touch ? 'OR D-PAD + A' : 'OR ARROWS + ENTER', W / 2, 140, { color: C.grey, align: 'center' });
  }

  private drawTitle(g: CanvasRenderingContext2D) {
    dim(g, 0.35);
    panel(g, 62, 14, 196, 130);
    // back to team select
    const b = BACK_BTN;
    rect(g, b.x, b.y, b.w, b.h, C.purple);
    rect(g, b.x, b.y + b.h - 1, b.w, 1, C.violet);
    drawText(g, '< TEAM', b.x + b.w / 2, b.y + 3, { color: C.lavender, align: 'center' });
    // fixture
    drawBadge(g, 119, 19, this.T);
    drawText(g, 'VS', W / 2, 26, { color: C.yellow, align: 'center' });
    drawBadge(g, 179, 19, this.O);
    drawText(g, `${this.T.code} NEED`, W / 2 - 20, 46, { color: C.lavender, align: 'right' });
    drawText(g, String(this.target), W / 2, 44, { color: C.white, scale: 2, align: 'center', outline: C.pink });
    drawText(g, `TO WIN`, W / 2 + 20, 46, { color: C.lavender });
    drawText(g, `${TOTAL_BALLS} BALLS  -  ${MAX_WKTS} WICKETS  -  VS ${this.O.code}`, W / 2, 60, { color: C.white, align: 'center' });
    // difficulty
    drawText(g, 'LEVEL', 88, 74, { color: C.lavender, align: 'right' });
    LEVEL_BTNS.forEach((b, i) => {
      const Lv = LEVELS[i];
      const sel = i === this.level;
      rect(g, b.x, b.y, b.w, b.h, sel ? 'rgba(255,194,26,0.16)' : C.purple);
      const edge = sel ? Lv.color : C.violet;
      rect(g, b.x, b.y, b.w, 1, edge); rect(g, b.x, b.y + b.h - 1, b.w, 1, edge);
      rect(g, b.x, b.y, 1, b.h, edge); rect(g, b.x + b.w - 1, b.y, 1, b.h, edge);
      drawText(g, Lv.label, b.x + b.w / 2, b.y + 4, { color: sel ? Lv.color : C.grey, align: 'center' });
    });
    drawText(g, 'CHOOSE YOUR STANCE', W / 2, 86, { color: C.white, align: 'center' });
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
    blinkText(g, `${tapWord()} A STANCE TO START`, W / 2, 117, this.time);
    drawText(g, input.touch ? 'D-PAD UP/DOWN LEVEL - < > STANCE - A START' : 'UP/DOWN LEVEL - < > STANCE - ENTER START', W / 2, 127, { color: C.grey, align: 'center' });
    drawText(g, input.touch ? 'SWING: TAP LEFT/RIGHT HALF OR D-PAD' : 'SWING: CLICK LEFT/RIGHT HALF OR < >', W / 2, 136, { color: C.lavender, align: 'center' });
  }

  private drawOver(g: CanvasRenderingContext2D) {
    dim(g, 0.4);
    panel(g, 62, 30, 196, 96, this.won ? C.yellow : C.red);
    drawText(g, this.won ? `${this.T.code} WIN!` : this.wkts >= MAX_WKTS ? 'ALL OUT!' : 'SO CLOSE!', W / 2, 40, {
      color: this.won ? C.yellow : C.red, scale: 3, align: 'center', outline: C.ink,
    });
    drawText(g, `${this.T.code} ${this.runs}-${this.wkts} FROM ${this.balls} BALLS`, W / 2, 64, { color: C.white, align: 'center' });
    const margin = this.target - 1 - this.runs;
    const msg = this.won
      ? `BEAT ${this.O.code} WITH ${TOTAL_BALLS - this.balls} BALLS SPARE`
      : margin > 0 ? `${this.O.code} WIN BY ${margin} RUN${margin === 1 ? '' : 'S'}` : 'MATCH TIED!';
    drawText(g, msg, W / 2, 74, { color: C.lavender, align: 'center' });
    drawText(g, `${this.L.label} LEVEL`, W / 2, 84, { color: this.L.color, align: 'center' });
    if (this.won && this.level === 0) drawText(g, 'TRY INTERMEDIATE NEXT?', W / 2, 92, { color: C.lavender, align: 'center' });
    if (this.t > 0.8) blinkText(g, `${tapWord()} TO PLAY AGAIN`, W / 2, 102, this.time);
    drawText(g, 'NEW OPPONENT AND TARGET EVERY GAME', W / 2, 112, { color: C.grey, align: 'center' });
  }
}
