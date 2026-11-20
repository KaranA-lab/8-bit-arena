import { W, H, type Game, rect, px, line, Particles, Pops, Stands, floodlight, stars, shirt } from '../lib/gfx';
import { drawText, measure } from '../lib/font';
import { panel, blinkText, dim } from '../lib/ui';
import { C, clamp, lerp, randi, chance, pick, easeOut } from '../lib/util';
import { sfx } from '../lib/audio';
import { tapWord, input } from '../lib/input';
import { updateRecords } from '../lib/records';

type State = 'kits' | 'versus' | 'setup' | 'aim' | 'runup' | 'flight' | 'result' | 'over';
type Res = 'goal' | 'saved' | 'post' | 'over';
/** Home colours of eight fan-favourite national teams (colours only, no crests). */
interface Kit { name: string; code: string; main: string; trim: string; shorts: string; socks: string; stripe?: string; fam: string }

const KITS: Kit[] = [
  { name: 'BRAZIL', code: 'BRA', main: '#FFDF00', trim: '#009C3B', shorts: '#1E3FA0', socks: '#F4F1FF', fam: 'yellow' },
  { name: 'ARGENTINA', code: 'ARG', main: '#75AADB', stripe: '#F4F1FF', trim: '#1B1838', shorts: '#1B1838', socks: '#F4F1FF', fam: 'sky' },
  { name: 'FRANCE', code: 'FRA', main: '#2A3F8F', trim: '#F4F1FF', shorts: '#F4F1FF', socks: '#E1000F', fam: 'navy' },
  { name: 'PORTUGAL', code: 'POR', main: '#C8102E', trim: '#00A651', shorts: '#8A1020', socks: '#8A1020', fam: 'red' },
  { name: 'SPAIN', code: 'ESP', main: '#D2142A', trim: '#FFC400', shorts: '#1B2A6E', socks: '#1B2A6E', fam: 'red' },
  { name: 'GERMANY', code: 'GER', main: '#F4F1FF', trim: '#111111', shorts: '#111111', socks: '#F4F1FF', fam: 'white' },
  { name: 'ITALY', code: 'ITA', main: '#1F6FD1', trim: '#F4F1FF', shorts: '#F4F1FF', socks: '#1F6FD1', fam: 'blue' },
  { name: 'ENGLAND', code: 'ENG', main: '#F4F1FF', trim: '#1B2A6E', shorts: '#1B2A6E', socks: '#F4F1FF', fam: 'white' },
];
const KIT_COLS = 4;
const kitCell = (i: number) => ({ cx: 88 + (i % KIT_COLS) * 48, top: 52 + Math.floor(i / KIT_COLS) * 32 });

const GOAL_L = 112, GOAL_R = 208, BAR_Y = 52, LINE_Y = 80;
const SPOT_X = 160, SPOT_Y = 108;
const COLS = [127, 160, 193];
const ROWS = [59, 71];
const KICK_START = { x: 136, y: 152 };
const KICK_END = { x: 150, y: 124 };
const KEEPER_NEON = '#B6F23A';

const BALL6 = ['.WWWW.', 'WWKWWW', 'WKKKWW', 'WWKWWK', 'WWWWKW', '.WWWW.'];
const BALL6B = ['.WWWW.', 'WWWKWW', 'WWKKKW', 'KWWKWW', 'WKWWWW', '.WWWW.'];
const BALL4 = ['.WW.', 'WKWW', 'WWWK', '.WW.'];
const BALL3 = ['WWW', 'WKW', 'WWW'];

export class Football implements Game {
  state: State = 'kits';
  t = 0;
  time = 0;
  hoverKit = -1;
  userKit = 0;
  oppKit = 2;
  oppName = 'FRANCE';
  turn: 'user' | 'bot' = 'user';
  userRes: boolean[] = [];
  botRes: boolean[] = [];
  aimCol = 1;
  aimRow = 1;
  mouse = { x: 160, y: 66 };
  shotCol = 1;
  shotRow = 1;
  res: Res = 'goal';
  keeperCol = 1;
  keeperRow = 1;
  userDive: number | null = null;
  tx = 160;
  ty = 70;
  seg2: { fx: number; fy: number; tx: number; ty: number; dur: number; s0: number; s1: number; arc: number; t: number } | null = null;
  ripple: { x: number; y: number; t: number } | null = null;
  winner: 'user' | 'bot' | null = null;
  stands: Stands;
  parts = new Particles();
  pops = new Pops();
  netCache: HTMLCanvasElement;
  spin = 0;

  constructor() {
    this.stands = this.makeStands();
    this.netCache = document.createElement('canvas');
    this.netCache.width = W; this.netCache.height = H;
    this.paintNet(this.netCache.getContext('2d')!, null);
  }

  private get kit() { return KITS[this.userKit]; }
  private get opp() { return KITS[this.oppKit]; }

  private makeStands() {
    const a = KITS[this.userKit].main, b = KITS[this.oppKit].main;
    return new Stands(0, 10, W, 31, '#1B1740', [a, a, b, b, C.lavender, C.white], 21);
  }

  // ---------------- net ----------------
  private inNet(x: number, y: number) {
    return (x >= 114 && x <= 206 && y >= 54 && y <= 79) || (y >= 48 && y < 54 && x >= 118 + (54 - y) * 0 && x <= 202);
  }
  private paintNet(g: CanvasRenderingContext2D, rp: { x: number; y: number; t: number } | null) {
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(244,241,255,0.32)';
    for (let y = 48; y <= 79; y++) {
      for (let x = 113; x <= 207; x++) {
        if (!this.inNet(x, y)) continue;
        let sx = x, sy = y;
        if (rp) {
          const d = Math.hypot(x - rp.x, (y - rp.y) * 1.4);
          if (d < 13) { const a = (1 - d / 13) * 3.2 * Math.sin(Math.PI * Math.min(1, rp.t / 0.6)); sy = y + a; sx = x + (x - rp.x) * 0.08 * a; }
        }
        if (Math.round(sx - 113) % 3 === 0 || Math.round(sy - 48) % 3 === 0) g.fillRect(x, y, 1, 1);
      }
    }
    // back frame
    g.fillStyle = 'rgba(200,196,220,0.55)';
    g.fillRect(118, 48, 1, 27); g.fillRect(202, 48, 1, 27); g.fillRect(118, 48, 85, 1);
    g.fillStyle = 'rgba(244,241,255,0.5)';
    g.fillRect(114, 74, 93, 1);
  }

  // ---------------- flow ----------------
  private startShootout() {
    this.userRes = []; this.botRes = []; this.turn = 'user'; this.winner = null;
    this.parts.list.length = 0; this.pops.clear();
    this.toSetup();
  }

  private toSetup() {
    this.state = 'setup'; this.t = 0;
    this.seg2 = null; this.ripple = null; this.userDive = null;
    this.keeperCol = 1; this.keeperRow = 1;
  }

  private resolve(c: number, r: number, kc: number, userShooting: boolean): Res {
    const missP = r === 0 ? 0.12 : c === 1 ? 0 : 0.04;
    if (chance(missP)) return (c === 1 && r === 0) || chance(0.5) ? 'over' : 'post';
    if (kc === c) {
      const saveP = c === 1 ? 0.85 : r === 0 ? (userShooting ? 0.45 : 0.55) : 0.85;
      return chance(saveP) ? 'saved' : 'goal';
    }
    if (c === 1 && chance(0.15)) return 'saved';
    return 'goal';
  }

  private kick() {
    sfx.play('kick');
    this.state = 'flight'; this.t = 0;
    const weighted = () => { const r = Math.random(); return r < 0.4 ? 0 : r < 0.6 ? 1 : 2; };
    if (this.turn === 'user') {
      this.shotCol = this.aimCol; this.shotRow = this.aimRow;
      this.keeperCol = weighted();
      this.res = this.resolve(this.shotCol, this.shotRow, this.keeperCol, true);
    } else {
      this.shotCol = weighted(); this.shotRow = chance(0.5) ? 0 : 1;
      this.keeperCol = this.userDive ?? 1;
      this.res = this.resolve(this.shotCol, this.shotRow, this.keeperCol, false);
    }
    this.keeperRow = this.keeperCol === this.shotCol ? this.shotRow : (chance(0.5) ? 0 : 1);
    this.tx = COLS[this.shotCol] + randi(-3, 3);
    this.ty = ROWS[this.shotRow] + randi(-2, 2);
    if (this.res === 'over') { this.ty = BAR_Y - 5 - randi(0, 4); this.tx += randi(-6, 6); }
    if (this.res === 'post') {
      if (this.shotCol === 0) this.tx = GOAL_L + 1;
      else if (this.shotCol === 2) this.tx = GOAL_R - 1;
      else this.ty = BAR_Y + 1;
    }
    if (this.res === 'saved') {
      // ball meets the keeper's gloves
      const kx = COLS[this.keeperCol];
      this.tx = lerp(this.tx, kx + (this.keeperCol === 0 ? -4 : this.keeperCol === 2 ? 4 : 0), 0.6);
    }
  }

  private outcome() {
    const scored = this.res === 'goal';
    const userTurn = this.turn === 'user';
    (userTurn ? this.userRes : this.botRes).push(scored);
    switch (this.res) {
      case 'goal':
        this.ripple = { x: this.tx, y: this.ty, t: 0 };
        this.seg2 = { fx: this.tx, fy: this.ty, tx: lerp(this.tx, 160, 0.1), ty: this.ty - 5, dur: 0.18, s0: 3, s1: 3, arc: 0, t: 0 };
        this.pops.add('GOAL!', { scale: 5, rainbow: userTurn, color: C.red, dur: 1.6 });
        sfx.play(userTurn ? 'goal' : 'groan');
        if (userTurn) { sfx.play('cheer'); this.parts.confetti(110); this.stands.cheer(1); }
        else this.stands.cheer(0.5);
        break;
      case 'saved': {
        const dir = this.tx < 160 ? -1 : this.tx > 160 ? 1 : chance(0.5) ? -1 : 1;
        this.seg2 = { fx: this.tx, fy: this.ty, tx: this.tx + dir * randi(36, 60), ty: randi(96, 120), dur: 0.55, s0: 3, s1: 5, arc: 10, t: 0 };
        this.pops.add('SAVED!', { scale: 4, color: userTurn ? C.lavender : C.green, rainbow: !userTurn });
        sfx.play('save');
        if (!userTurn) { sfx.play('cheer'); this.parts.confetti(80); this.stands.cheer(1); }
        break;
      }
      case 'post': {
        const dir = this.tx < 160 ? 1 : -1;
        this.seg2 = { fx: this.tx, fy: this.ty, tx: this.tx + dir * randi(10, 26), ty: randi(118, 136), dur: 0.5, s0: 3, s1: 6, arc: 8, t: 0 };
        this.pops.add(this.shotCol === 1 ? 'CROSSBAR!' : 'POST!', { scale: 4, color: C.orange });
        sfx.play('post');
        break;
      }
      case 'over':
        this.seg2 = { fx: this.tx, fy: this.ty, tx: this.tx + randi(-8, 8), ty: 16, dur: 0.35, s0: 3, s1: 2, arc: 0, t: 0 };
        this.pops.add('OVER THE BAR!', { scale: 3, color: C.orange });
        sfx.play(userTurn ? 'groan' : 'cheer');
        break;
    }
    this.state = 'result'; this.t = 0;
    this.winner = this.decide();
  }

  private decide(): 'user' | 'bot' | null {
    const ug = this.userRes.filter(Boolean).length, bg = this.botRes.filter(Boolean).length;
    const un = this.userRes.length, bn = this.botRes.length;
    if (un <= 5 && bn <= 5) {
      if (ug > bg + (5 - bn)) return 'user';
      if (bg > ug + (5 - un)) return 'bot';
      if (un === 5 && bn === 5 && ug !== bg) return ug > bg ? 'user' : 'bot';
      return null;
    }
    if (un === bn && ug !== bg) return ug > bg ? 'user' : 'bot';
    return null;
  }

  private endMatch() {
    this.state = 'over'; this.t = 0;
    this.pops.clear();
    const won = this.winner === 'user';
    if (won) { sfx.play('win'); sfx.play('cheer'); this.parts.confetti(160); this.stands.cheer(1); }
    else sfx.play('lose');
    const goals = this.userRes.filter(Boolean).length;
    updateRecords((r) => { r.football.played++; if (won) r.football.won++; r.football.goals += goals; });
  }

  // ---------------- input ----------------
  private kitAt(x: number, y: number) {
    for (let i = 0; i < KITS.length; i++) {
      const { cx, top } = kitCell(i);
      if (x >= cx - 22 && x <= cx + 22 && y >= top - 3 && y <= top + 26) return i;
    }
    return -1;
  }

  private setAimFrom(x: number, y: number) {
    if (x >= 100 && x <= 220 && y >= 40 && y <= 92) {
      this.aimCol = x < 143 ? 0 : x > 177 ? 2 : 1;
      this.aimRow = y < 65 ? 0 : 1;
    } else {
      this.aimCol = x < 120 ? 0 : x > 200 ? 2 : 1;
    }
  }

  pointerMove(x: number, y: number) {
    this.mouse = { x, y };
    if (this.state === 'kits') {
      const k = this.kitAt(x, y);
      if (k !== this.hoverKit && k >= 0) sfx.play('blip');
      this.hoverKit = k;
    }
    if (this.state === 'aim') this.setAimFrom(x, y);
  }

  pointerDown(x: number, y: number) {
    this.mouse = { x, y };
    switch (this.state) {
      case 'kits': {
        const k = this.kitAt(x, y);
        if (k < 0) return;
        sfx.play('select');
        this.userKit = k;
        // a random rival in clearly different colours
        this.oppKit = pick(KITS.map((_, i) => i).filter((i) => KITS[i].fam !== KITS[k].fam));
        this.oppName = KITS[this.oppKit].name;
        this.stands = this.makeStands();
        this.state = 'versus'; this.t = 0;
        break;
      }
      case 'versus':
        if (this.t > 0.4) { sfx.play('select'); this.startShootout(); }
        break;
      case 'aim':
        this.setAimFrom(x, y);
        this.state = 'runup'; this.t = 0;
        break;
      case 'setup':
      case 'runup':
        if (this.turn === 'bot' && this.userDive === null) {
          this.userDive = x < 140 ? 0 : x > 180 ? 2 : 1;
          sfx.play('blip');
        }
        break;
      case 'over':
        if (this.t > 0.8) { sfx.play('select'); this.state = 'kits'; this.t = 0; this.hoverKit = this.userKit; }
        break;
    }
  }

  keyDown(code: string) {
    const left = code === 'ArrowLeft' || code === 'KeyA';
    const right = code === 'ArrowRight' || code === 'KeyD';
    const up = code === 'ArrowUp' || code === 'KeyW';
    const down = code === 'ArrowDown' || code === 'KeyS';
    const go = code === 'Space' || code === 'Enter';
    if (this.state === 'kits') {
      const h = Math.max(0, this.hoverKit);
      if (left) { this.hoverKit = (h + KITS.length - 1) % KITS.length; sfx.play('blip'); }
      if (right) { this.hoverKit = (this.hoverKit + 1) % KITS.length; sfx.play('blip'); }
      if (up || down) { this.hoverKit = (h + KIT_COLS) % KITS.length; sfx.play('blip'); }
      if (go && this.hoverKit >= 0) { const { cx, top } = kitCell(this.hoverKit); this.pointerDown(cx, top + 8); }
    } else if (this.state === 'versus' || this.state === 'over') {
      if (go) this.pointerDown(160, 80);
    } else if (this.state === 'aim') {
      if (left) this.aimCol = Math.max(0, this.aimCol - 1);
      if (right) this.aimCol = Math.min(2, this.aimCol + 1);
      if (up) this.aimRow = 0;
      if (down) this.aimRow = 1;
      if (go) { this.state = 'runup'; this.t = 0; }
    } else if ((this.state === 'setup' || this.state === 'runup') && this.turn === 'bot' && this.userDive === null) {
      if (left) this.userDive = 0;
      else if (right) this.userDive = 2;
      else if (up || down || go) this.userDive = 1;
      if (this.userDive !== null) sfx.play('blip');
    }
  }

  cursor() { return this.state === 'aim' ? 'crosshair' : 'pointer'; }

  // ---------------- update ----------------
  update(dt: number) {
    this.t += dt; this.time += dt;
    this.stands.update(dt); this.parts.update(dt); this.pops.update(dt);
    if (this.ripple) {
      this.ripple.t += dt;
      this.paintNet(this.netCache.getContext('2d')!, this.ripple.t < 0.6 ? this.ripple : null);
      if (this.ripple.t >= 0.6) this.ripple = null;
    }
    const runDur = this.turn === 'user' ? 0.55 : 1.15;
    switch (this.state) {
      case 'setup':
        if (this.t > 0.9) {
          sfx.play('whistle');
          if (this.turn === 'user') { this.state = 'aim'; this.setAimFrom(this.mouse.x, this.mouse.y); }
          else this.state = 'runup';
          this.t = 0;
        }
        break;
      case 'runup':
        if (this.t >= runDur) this.kick();
        break;
      case 'flight':
        this.spin += dt * 20;
        if (this.t >= 0.42) this.outcome();
        break;
      case 'result':
        if (this.seg2) this.seg2.t += dt;
        this.spin += dt * 8;
        if (this.t > 1.7) {
          if (this.winner) this.endMatch();
          else { this.turn = this.turn === 'user' ? 'bot' : 'user'; this.toSetup(); }
        }
        break;
    }
  }

  // ---------------- draw ----------------
  draw(g: CanvasRenderingContext2D) {
    this.drawScene(g);
    const ballBehind = this.state === 'result' && this.res === 'goal';
    g.drawImage(this.netCache, 0, 0);
    if (ballBehind) this.drawBall(g);
    this.drawKeeper(g);
    this.drawGoalFrame(g);
    if (!ballBehind) this.drawBall(g);
    if (this.state !== 'kits' && this.state !== 'versus') this.drawKicker(g);
    if (this.state === 'aim') this.drawReticle(g);
    if (this.turn === 'bot' && (this.state === 'setup' || this.state === 'runup')) this.drawDiveZones(g);
    this.parts.draw(g);
    this.drawHud(g);
    this.pops.draw(g);
    if (this.state === 'kits') this.drawKits(g);
    if (this.state === 'versus') this.drawVersus(g);
    if (this.state === 'over') this.drawOver(g);
  }

  private drawScene(g: CanvasRenderingContext2D) {
    rect(g, 0, 0, W, 12, C.navy);
    stars(g, 9, 16, 0, 0, W, 10, this.time);
    floodlight(g, 24, 1, 9, this.time);
    floodlight(g, 296, 1, 9, this.time);
    this.stands.draw(g);
    const ads = ['8-BIT', 'ARENA', 'GOAL!', 'PIXEL'];
    for (let i = 0; i < 10; i++) {
      rect(g, i * 32, 41, 31, 5, i % 2 ? C.pink : C.violet);
      rect(g, i * 32 + 31, 41, 1, 5, C.ink);
      drawText(g, ads[i % 4], i * 32 + 16, 41, { color: i % 2 ? C.white : C.yellow, align: 'center' });
    }
    const N = 9;
    for (let k = 0; k < N; k++) {
      const y0 = Math.round(46 + 114 * Math.pow(k / N, 1.4));
      const y1 = Math.round(46 + 114 * Math.pow((k + 1) / N, 1.4));
      rect(g, 0, y0, W, y1 - y0, k % 2 ? '#2F6E4D' : '#357A55');
    }
    const lc = 'rgba(244,241,255,0.75)';
    rect(g, 0, LINE_Y, W, 1, lc);
    // six-yard box
    line(g, 98, LINE_Y, 94, 88, lc); line(g, 222, LINE_Y, 226, 88, lc); rect(g, 94, 88, 133, 1, lc);
    // penalty box
    line(g, 54, LINE_Y, 36, 120, lc); line(g, 266, LINE_Y, 284, 120, lc); rect(g, 36, 120, 249, 1, lc);
    // arc
    for (let a = 0.15; a < Math.PI - 0.15; a += 0.05) px(g, 160 + Math.cos(a) * 26, 120 + Math.sin(a) * 7, lc);
    rect(g, 159, SPOT_Y + 2, 2, 1, lc);
  }

  private drawGoalFrame(g: CanvasRenderingContext2D) {
    rect(g, GOAL_L, BAR_Y, 2, LINE_Y - BAR_Y + 1, C.white);
    rect(g, GOAL_R - 1, BAR_Y, 2, LINE_Y - BAR_Y + 1, C.white);
    rect(g, GOAL_L, BAR_Y, GOAL_R - GOAL_L + 1, 2, C.white);
    rect(g, GOAL_L + 2, BAR_Y + 2, 1, LINE_Y - BAR_Y - 2, '#B9B5C9');
    rect(g, GOAL_R + 1, BAR_Y + 1, 1, LINE_Y - BAR_Y, '#B9B5C9');
  }

  private keeperColor() {
    if (this.turn === 'bot') return this.kit.fam === 'yellow' ? C.orange : C.yellow;
    return KEEPER_NEON;
  }

  private drawKeeper(g: CanvasRenderingContext2D) {
    const kc = this.keeperColor();
    const diving = this.state === 'flight' || this.state === 'result';
    const u = diving ? clamp((this.state === 'flight' ? this.t - 0.04 : 0.42 + this.t) / 0.34, 0, 1) : 0;
    const col = this.keeperCol, row = this.keeperRow;
    if (diving && col !== 1 && u > 0) {
      const dir = col === 0 ? -1 : 1;
      const e = easeOut(u);
      const cx = Math.round(lerp(160, COLS[col] + dir * 2, e));
      const peak = row === 0 ? 14 : 6;
      const land = this.state === 'result' && this.t > 0.5 ? Math.min(1, (this.t - 0.5) / 0.3) : 0;
      const cy = Math.round(lerp(LINE_Y - 11, LINE_Y - 4, e) - Math.sin(Math.PI * Math.min(1, e)) * peak * (1 - land) + land * 3);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(cx - 7, LINE_Y - 1, 14, 2);
      // trailing legs
      rect(g, cx - dir * 11 - (dir > 0 ? 0 : -1), cy, 7, 2, '#120F2B');
      rect(g, cx - dir * 13 - (dir > 0 ? 0 : -1), cy + 1, 3, 2, kc);
      // torso
      rect(g, cx - 4, cy - 3, 9, 5, kc);
      rect(g, cx - 4, cy + 1, 9, 1, 'rgba(0,0,0,0.25)');
      // head
      rect(g, cx + dir * 5 - 1, cy - 6, 4, 4, C.skin2);
      rect(g, cx + dir * 5 - 1, cy - 6, 4, 1, '#2A1A10');
      // arms stretched
      const ax = dir > 0 ? cx + 5 : cx - 11;
      rect(g, ax, cy - 4, 7, 2, kc);
      rect(g, dir > 0 ? cx + 12 : cx - 13, cy - 5, 2, 3, C.white);
      return;
    }
    let x = 160 + (diving ? 0 : Math.round(Math.sin(this.time * 3) * 2));
    let y = LINE_Y;
    let armsUp = false;
    if (diving && col === 1 && u > 0) {
      if (row === 0) { y -= Math.round(Math.sin(Math.PI * u) * 7); armsUp = true; }
      else y += 1;
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 5, LINE_Y - 1, 10, 2);
    rect(g, x - 3, y - 7, 2, 7, kc); rect(g, x + 1, y - 7, 2, 7, kc);
    rect(g, x - 3, y - 2, 2, 2, C.ink); rect(g, x + 1, y - 2, 2, 2, C.ink);
    rect(g, x - 4, y - 10, 8, 3, '#120F2B');
    rect(g, x - 4, y - 17, 8, 7, kc);
    rect(g, x + 2, y - 17, 2, 7, 'rgba(0,0,0,0.2)');
    if (armsUp) {
      rect(g, x - 6, y - 23, 2, 7, kc); rect(g, x + 4, y - 23, 2, 7, kc);
      rect(g, x - 6, y - 25, 2, 2, C.white); rect(g, x + 4, y - 25, 2, 2, C.white);
    } else {
      rect(g, x - 7, y - 16, 3, 2, kc); rect(g, x + 4, y - 16, 3, 2, kc);
      rect(g, x - 7, y - 14, 2, 3, kc); rect(g, x + 5, y - 14, 2, 3, kc);
      rect(g, x - 7, y - 11, 2, 2, C.white); rect(g, x + 5, y - 11, 2, 2, C.white);
    }
    rect(g, x - 2, y - 21, 4, 4, C.skin2);
    rect(g, x - 2, y - 21, 4, 1, '#2A1A10');
    if (this.turn === 'bot' && !diving && this.state !== 'kits' && this.state !== 'versus' && this.state !== 'over') {
      drawText(g, 'YOU', x, y - 30, { color: C.yellow, align: 'center', outline: C.ink });
      if (this.userDive !== null) {
        const arrow = this.userDive === 0 ? '<' : this.userDive === 2 ? '>' : '^';
        drawText(g, arrow, x + (this.userDive - 1) * 12, y - 22, { color: C.yellow, align: 'center', outline: C.ink, scale: 1 });
      }
    }
  }

  private ballPos(): { x: number; y: number; size: number; sx: number; sy: number } | null {
    if (this.state === 'flight') {
      const u = clamp(this.t / 0.42, 0, 1);
      const arc = this.shotRow === 0 ? 7 : 3;
      const x = lerp(SPOT_X, this.tx, u);
      const y = lerp(SPOT_Y, this.ty, u) - arc * Math.sin(Math.PI * u);
      const size = u < 0.35 ? 6 : u < 0.75 ? 4 : 3;
      return { x, y, size, sx: x, sy: lerp(SPOT_Y + 3, LINE_Y, u) };
    }
    if (this.state === 'result' && this.seg2) {
      const s = this.seg2;
      const u = clamp(s.t / s.dur, 0, 1);
      let x = lerp(s.fx, s.tx, u);
      let y = lerp(s.fy, s.ty, u) - s.arc * Math.sin(Math.PI * u);
      if (this.res === 'goal' && u >= 1) {
        // drop down the back of the net
        const d = clamp((s.t - s.dur) / 0.3, 0, 1);
        y = lerp(s.ty, LINE_Y - 7, d * d);
      }
      if (this.res === 'over' && u >= 1) return null;
      const size = Math.round(lerp(s.s0, s.s1, u));
      return { x, y, size, sx: x, sy: this.res === 'goal' ? LINE_Y - 6 : lerp(LINE_Y, s.ty, u) };
    }
    if (this.state === 'setup' || this.state === 'aim' || this.state === 'runup') return { x: SPOT_X, y: SPOT_Y, size: 6, sx: SPOT_X, sy: SPOT_Y + 3 };
    return null;
  }

  private drawBall(g: CanvasRenderingContext2D) {
    const b = this.ballPos();
    if (!b) return;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(Math.round(b.sx - b.size / 2), Math.round(b.sy), b.size, 1);
    const frame = b.size >= 5 ? (Math.floor(this.spin) % 2 ? BALL6B : BALL6) : b.size >= 4 ? BALL4 : BALL3;
    const n = frame.length;
    const x0 = Math.round(b.x - n / 2), y0 = Math.round(b.y - n / 2);
    for (let yy = 0; yy < n; yy++)
      for (let xx = 0; xx < n; xx++) {
        const ch = frame[yy][xx];
        if (ch === '.') continue;
        g.fillStyle = ch === 'W' ? C.white : C.ink;
        g.fillRect(x0 + xx, y0 + yy, 1, 1);
      }
  }

  private drawKicker(g: CanvasRenderingContext2D) {
    const kit = this.turn === 'user' ? this.kit : this.opp;
    let x = KICK_START.x, y = KICK_START.y;
    let phase: 'stand' | 'run1' | 'run2' | 'kick' = 'stand';
    if (this.state === 'runup') {
      const dur = this.turn === 'user' ? 0.55 : 1.15;
      const u = clamp(this.t / dur, 0, 1);
      x = lerp(KICK_START.x, KICK_END.x, u); y = lerp(KICK_START.y, KICK_END.y, u);
      phase = u > 0.88 ? 'kick' : Math.floor(this.t * 9) % 2 ? 'run1' : 'run2';
    } else if (this.state === 'flight' || this.state === 'result' || this.state === 'over') {
      x = KICK_END.x; y = KICK_END.y; phase = this.state === 'flight' ? 'kick' : 'stand';
    }
    x = Math.round(x); y = Math.round(y);
    const shorts = kit.shorts;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 7, y - 1, 15, 2);
    // legs
    const leg = (lx: number, lift: number, len = 12) => {
      rect(g, lx, y - len - lift, 3, len - 6, C.skin);
      rect(g, lx, y - 6 - lift, 3, 4, kit.socks);
      rect(g, lx, y - 2 - lift, 3, 2, C.ink);
    };
    if (phase === 'run1') { leg(x - 4, 2); leg(x + 1, 0); }
    else if (phase === 'run2') { leg(x - 4, 0); leg(x + 1, 2); }
    else if (phase === 'kick') { leg(x - 4, 0); leg(x + 2, 7, 10); }
    else { leg(x - 4, 0); leg(x + 1, 0); }
    rect(g, x - 5, y - 15, 10, 4, shorts);
    // torso
    rect(g, x - 6, y - 26, 12, 11, kit.main);
    if (kit.stripe) for (let sx = x - 5; sx < x + 6; sx += 3) rect(g, sx, y - 26, 1, 11, kit.stripe);
    rect(g, x + 3, y - 26, 3, 11, 'rgba(0,0,0,0.2)');
    rect(g, x - 6, y - 26, 12, 1, kit.trim);
    drawText(g, '10', x, y - 23, { color: kit.trim, align: 'center' });
    const swing = phase === 'run1' ? 1 : phase === 'run2' ? -1 : 0;
    rect(g, x - 8, y - 25 + swing, 2, 7, C.skin); rect(g, x - 8, y - 25 + swing, 2, 2, kit.main);
    rect(g, x + 6, y - 25 - swing, 2, 7, C.skin); rect(g, x + 6, y - 25 - swing, 2, 2, kit.main);
    // head (from behind)
    rect(g, x - 1, y - 27, 3, 1, C.skin);
    rect(g, x - 3, y - 33, 7, 6, '#2A1A10');
    rect(g, x - 4, y - 30, 1, 2, C.skin); rect(g, x + 4, y - 30, 1, 2, C.skin);
  }

  private drawReticle(g: CanvasRenderingContext2D) {
    const cx = COLS[this.aimCol], cy = ROWS[this.aimRow];
    const x0 = Math.max(115, cx - 15), x1 = Math.min(205, cx + 15);
    const y0 = cy - 6, y1 = cy + 6;
    g.fillStyle = 'rgba(255,194,26,0.14)';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    const c = Math.floor(this.time * 6) % 2 ? C.yellow : C.white;
    rect(g, x0, y0, 3, 1, c); rect(g, x0, y0, 1, 3, c);
    rect(g, x1 - 3, y0, 3, 1, c); rect(g, x1 - 1, y0, 1, 3, c);
    rect(g, x0, y1 - 1, 3, 1, c); rect(g, x0, y1 - 3, 1, 3, c);
    rect(g, x1 - 3, y1 - 1, 3, 1, c); rect(g, x1 - 1, y1 - 3, 1, 3, c);
    rect(g, cx - 1, cy, 3, 1, c); rect(g, cx, cy - 1, 1, 3, c);
  }

  private drawDiveZones(g: CanvasRenderingContext2D) {
    const labels = ['DIVE <', 'STAY', 'DIVE >'];
    for (let i = 0; i < 3; i++) {
      const cx = COLS[i];
      const sel = this.userDive === i;
      if (sel || this.userDive === null) {
        g.fillStyle = sel ? 'rgba(255,194,26,0.22)' : 'rgba(244,241,255,0.07)';
        g.fillRect(cx - 15, BAR_Y + 3, 30, LINE_Y - BAR_Y - 3);
      }
      if (this.userDive === null || sel) drawText(g, labels[i], cx, LINE_Y + 4, { color: sel ? C.yellow : C.white, align: 'center', outline: C.ink });
    }
  }

  private dots(g: CanvasRenderingContext2D, x: number, res: boolean[], start: number) {
    for (let i = 0; i < 5; i++) {
      const idx = start + i;
      const dx = x + i * 5;
      if (idx < res.length) {
        if (res[idx]) { rect(g, dx, 4, 3, 3, C.green); }
        else { px(g, dx, 4, C.red); px(g, dx + 2, 4, C.red); px(g, dx + 1, 5, C.red); px(g, dx, 6, C.red); px(g, dx + 2, 6, C.red); }
      } else {
        rect(g, dx, 4, 3, 1, C.lavender); rect(g, dx, 6, 3, 1, C.lavender); px(g, dx, 5, C.lavender); px(g, dx + 2, 5, C.lavender);
      }
    }
  }

  private drawHud(g: CanvasRenderingContext2D) {
    if (this.state === 'kits' || this.state === 'versus') return;
    rect(g, 0, 0, W, 12, 'rgba(3,5,11,0.85)');
    const st = Math.max(0, Math.max(this.userRes.length, this.botRes.length) - 5);
    rect(g, 4, 3, 5, 6, this.kit.main);
    if (this.kit.stripe) rect(g, 6, 3, 1, 6, this.kit.stripe);
    drawText(g, 'YOU', 12, 4, { color: C.white });
    this.dots(g, 28, this.userRes, st);
    const nw = measure(this.oppName);
    rect(g, W - 9, 3, 5, 6, this.opp.main);
    drawText(g, this.oppName, W - 12, 4, { color: C.white, align: 'right' });
    this.dots(g, W - 12 - nw - 6 - 24, this.botRes, st);
    const ug = this.userRes.filter(Boolean).length, bg = this.botRes.filter(Boolean).length;
    drawText(g, `${ug}-${bg}`, W / 2, 1, { color: C.yellow, scale: 2, align: 'center' });
    const sd = this.userRes.length >= 5 && this.botRes.length >= 5 && !this.winner;
    if (sd || (this.userRes.length > 5)) drawText(g, 'SUDDEN DEATH', W / 2, 15, { color: C.red, align: 'center', outline: C.ink });

    let msg = '';
    if (this.state === 'aim') msg = `${tapWord()} WHERE YOU WANT TO SHOOT`;
    else if (this.state === 'setup' && this.turn === 'user') msg = 'YOUR KICK';
    else if ((this.state === 'setup' || this.state === 'runup') && this.turn === 'bot') msg = this.userDive === null ? `YOU'RE IN GOAL! ${tapWord()} LEFT / MIDDLE / RIGHT` : 'DIVE LOCKED IN';
    if (msg) {
      rect(g, 0, H - 11, W, 11, 'rgba(3,5,11,0.7)');
      drawText(g, msg, W / 2, H - 8, { color: C.white, align: 'center' });
    }
  }

  private drawKits(g: CanvasRenderingContext2D) {
    dim(g, 0.45);
    panel(g, 50, 16, 220, 128);
    drawText(g, 'PENALTY SHOOTOUT', W / 2, 23, { color: C.yellow, scale: 2, align: 'center', outline: C.ink });
    drawText(g, 'PICK YOUR NATION', W / 2, 38, { color: C.lavender, align: 'center' });
    for (let i = 0; i < KITS.length; i++) {
      const k = KITS[i];
      const { cx, top } = kitCell(i);
      const hov = i === this.hoverKit;
      const bob = hov ? (Math.floor(this.time * 6) % 2 ? -2 : -1) : 0;
      if (hov) rect(g, cx - 22, top - 3, 44, 29, 'rgba(255,194,26,0.16)');
      shirt(g, cx - 8, top + bob, k.main, k.trim, '10', k.stripe);
      drawText(g, k.name, cx, top + 19, { color: hov ? C.yellow : C.white, align: 'center' });
    }
    drawText(g, 'YOU SHOOT FIRST - 5 KICKS EACH, THEN SUDDEN DEATH', W / 2, 118, { color: C.grey, align: 'center' });
    blinkText(g, `${tapWord()} A SHIRT TO PLAY`, W / 2, 130, this.time);
  }

  private drawVersus(g: CanvasRenderingContext2D) {
    dim(g, 0.45);
    panel(g, 52, 26, 216, 108, C.pink);
    drawText(g, 'TONIGHT', W / 2, 34, { color: C.lavender, align: 'center' });
    shirt(g, 92, 48, this.kit.main, this.kit.trim, '10', this.kit.stripe);
    shirt(g, 212, 48, this.opp.main, this.opp.trim, '9', this.opp.stripe);
    drawText(g, this.kit.name, 100, 68, { color: C.white, align: 'center' });
    drawText(g, '(YOU)', 100, 75, { color: C.yellow, align: 'center' });
    drawText(g, this.oppName, 220, 68, { color: C.white, align: 'center' });
    drawText(g, 'VS', W / 2, 53, { color: C.yellow, scale: 3, align: 'center', outline: C.ink });
    drawText(g, `AIM: ${tapWord()} A CORNER OF THE GOAL`, W / 2, 90, { color: C.white, align: 'center' });
    drawText(g, `SAVE: ${tapWord()} LEFT / MIDDLE / RIGHT`, W / 2, 98, { color: C.white, align: 'center' });
    drawText(g, input.touch ? 'OR D-PAD + A' : 'KEYS: ARROWS + SPACE', W / 2, 106, { color: C.grey, align: 'center' });
    if (this.t > 0.4) blinkText(g, `${tapWord()} TO KICK OFF`, W / 2, 120, this.time);
  }

  private drawOver(g: CanvasRenderingContext2D) {
    dim(g, 0.35);
    const won = this.winner === 'user';
    panel(g, 62, 34, 196, 88, won ? C.yellow : C.red);
    drawText(g, won ? 'CHAMPIONS!' : 'DEFEATED', W / 2, 44, { color: won ? C.yellow : C.red, scale: 3, align: 'center', outline: C.ink });
    const ug = this.userRes.filter(Boolean).length, bg = this.botRes.filter(Boolean).length;
    drawText(g, `YOU ${ug} - ${bg} ${this.oppName}`, W / 2, 68, { color: C.white, align: 'center' });
    drawText(g, won ? 'THE CROWD GOES WILD' : 'SO CLOSE. GO AGAIN?', W / 2, 78, { color: C.lavender, align: 'center' });
    if (this.t > 0.8) blinkText(g, `${tapWord()} TO PLAY AGAIN`, W / 2, 100, this.time);
  }
}
