import { W, H, type Game, rect, px, line, ring, Particles, Pops, Stands, stars } from '../lib/gfx';
import { drawText } from '../lib/font';
import { panel, blinkText, dim } from '../lib/ui';
import { C, clamp, rand, randi, chance } from '../lib/util';
import { sfx } from '../lib/audio';
import { tapWord, input } from '../lib/input';
import { updateRecords } from '../lib/records';

const FLOOR_Y = 142;
const NET_X = 160;
const NET_TOP = 118;
const LEFT_LINE = 14;
const RIGHT_LINE = 306;
const GRAV = 420;
const DRAG = 1.45;
const WIN_SCORE = 5;

type Who = 'user' | 'bot';
type State = 'title' | 'serve' | 'rally' | 'point' | 'over';

// ---- bot difficulty ----
interface Level {
  label: string; color: string;
  speed: number;                 // px/s
  react: [number, number];       // seconds before it starts moving
  hit: number; hitSmash: number; // chance to return a normal shot / a smash
  leave: number;                 // chance to correctly leave a shuttle that's going out
  jump: number; smash: number;   // how often it jumps / smashes high shuttles
  err: number;                   // footwork error (px)
  smart: number;                 // chance to aim away from where you're standing
  shots: { clear: [number, number, number]; drop: [number, number, number]; drive: [number, number, number]; smash: [number, number, number] }; // [minX, maxX, angle]
}
const LEVELS: Level[] = [
  {
    label: 'BEGINNER', color: C.green, speed: 84, react: [0.28, 0.45], hit: 0.74, hitSmash: 0.3, leave: 0.5, jump: 0.08, smash: 0.12, err: 12, smart: 0,
    shots: { clear: [42, 76, 56], drop: [100, 130, 42], drive: [60, 112, 24], smash: [60, 130, -8] },
  },
  {
    label: 'INTERMEDIATE', color: C.yellow, speed: 120, react: [0.12, 0.26], hit: 0.9, hitSmash: 0.55, leave: 0.85, jump: 0.35, smash: 0.5, err: 4, smart: 0.45,
    shots: { clear: [18, 52, 52], drop: [116, 148, 36], drive: [50, 118, 16], smash: [40, 140, -14] },
  },
  {
    label: 'EXTREME', color: C.red, speed: 168, react: [0.04, 0.1], hit: 0.975, hitSmash: 0.82, leave: 0.97, jump: 0.65, smash: 0.9, err: 0, smart: 0.85,
    shots: { clear: [15, 32, 46], drop: [132, 150, 32], drive: [22, 70, 10], smash: [26, 150, -17] },
  },
];
const LEVEL_BTNS = [
  { x: 64, y: 98, w: 60, h: 15 },
  { x: 130, y: 98, w: 60, h: 15 },
  { x: 196, y: 98, w: 60, h: 15 },
];
type ShotType = 'smash' | 'clear' | 'drop' | 'drive' | 'lift' | 'serve';

interface Player { x: number; y: number; vy: number; face: 1 | -1; swingT: number; hitDone: boolean; moving: number; kit: string; kit2: string; skin: string; hair: string }
interface Shuttle { x: number; y: number; vx: number; vy: number; last: Who | null; type: ShotType }

function stepShuttle(s: { x: number; y: number; vx: number; vy: number }, dt: number) {
  s.vx -= s.vx * DRAG * dt;
  s.vy += GRAV * dt - s.vy * DRAG * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
}

function simulate(x: number, y: number, vx: number, vy: number) {
  const s = { x, y, vx, vy };
  const dt = 1 / 120;
  let crossed = false, clear = true, t = 0;
  while (t < 5) {
    const px0 = s.x;
    stepShuttle(s, dt);
    t += dt;
    if (!crossed && (px0 - NET_X) * (s.x - NET_X) <= 0 && px0 !== s.x) {
      crossed = true;
      if (s.y > NET_TOP - 3) clear = false;
    }
    if (s.y >= FLOOR_Y) break;
  }
  return { landX: s.x, t, crossed, clear };
}

/** Find launch velocity so the shuttle lands at targetX, raising the angle until it clears the net. */
function solveShot(x: number, y: number, targetX: number, angleDeg: number, dir: 1 | -1) {
  let ang = angleDeg;
  let best = { vx: 0, vy: 0 };
  for (let tries = 0; tries < 10; tries++) {
    const a = (ang * Math.PI) / 180;
    let lo = 30, hi = 1200;
    for (let i = 0; i < 22; i++) {
      const v = (lo + hi) / 2;
      const r = simulate(x, y, Math.cos(a) * v * dir, -Math.sin(a) * v);
      if ((r.landX - x) * dir < (targetX - x) * dir) lo = v; else hi = v;
    }
    const v = (lo + hi) / 2;
    best = { vx: Math.cos(a) * v * dir, vy: -Math.sin(a) * v };
    const r = simulate(x, y, best.vx, best.vy);
    if (r.crossed && r.clear) return best;
    ang += 7;
  }
  return best;
}

export class Badminton implements Game {
  state: State = 'title';
  t = 0;
  time = 0;
  user: Player = { x: 60, y: FLOOR_Y, vy: 0, face: 1, swingT: -1, hitDone: false, moving: 0, kit: C.pink, kit2: C.yellow, skin: C.skin, hair: '#2A1A10' };
  bot: Player = { x: 260, y: FLOOR_Y, vy: 0, face: -1, swingT: -1, hitDone: false, moving: 0, kit: C.yellow, kit2: C.violet, skin: C.skin2, hair: '#120F2B' };
  sh: Shuttle = { x: 0, y: 0, vx: 0, vy: 0, last: null, type: 'serve' };
  keys = { left: false, right: false };
  mouse = { x: 240, y: 100 };
  score = { user: 0, bot: 0 };
  server: Who = 'user';
  pointWinner: Who = 'user';
  netHit = false;
  plan = { hit: -1, standX: 250, leave: false, success: true, reactAt: 0, jump: false };
  hits = 0;
  trail: { x: number; y: number }[] = [];
  // muted crowd so the white shuttle always pops against it
  stands = new Stands(0, 14, W, 54, '#15122F', ['#3A2459', '#551B52', '#4B3F80', '#2A2160', '#6B4F8F', '#7A3B6A'], 31);
  parts = new Particles();
  pops = new Pops();
  rallyLen = 0;
  levelIdx = 1;
  levelSel = 1;
  /** swing came from the A button / keyboard, so pick a sensible target automatically */
  autoAim = false;
  stickJumpLatch = false;

  private get L() { return LEVELS[this.levelIdx]; }

  // ---------------- flow ----------------
  private newMatch() {
    this.score = { user: 0, bot: 0 };
    this.server = 'user';
    this.parts.list.length = 0;
    this.pops.clear();
    this.toServe();
  }

  private toServe() {
    this.state = 'serve'; this.t = 0;
    this.user.x = this.server === 'user' ? 112 : 56; this.user.y = FLOOR_Y; this.user.vy = 0; this.user.swingT = -1;
    this.bot.x = this.server === 'bot' ? 208 : 262; this.bot.y = FLOOR_Y; this.bot.vy = 0; this.bot.swingT = -1;
    this.netHit = false; this.trail = []; this.rallyLen = 0;
    this.sh.last = null;
    this.holdShuttle();
  }

  private holdShuttle() {
    const p = this.server === 'user' ? this.user : this.bot;
    this.sh.x = p.x + p.face * 7; this.sh.y = p.y - 13; this.sh.vx = 0; this.sh.vy = 0;
  }

  private serve(who: Who) {
    const p = who === 'user' ? this.user : this.bot;
    p.swingT = 0; p.hitDone = true;
    const tx = who === 'user' ? randi(236, 296) : randi(22, 76);
    this.sh.x = p.x + p.face * 8; this.sh.y = p.y - 14;
    const v = solveShot(this.sh.x, this.sh.y, tx, 58, p.face);
    this.sh.vx = v.vx; this.sh.vy = v.vy; this.sh.last = who; this.sh.type = 'serve';
    this.hits++;
    this.state = 'rally'; this.t = 0;
    sfx.play('shuttle');
  }

  private inReach(p: Player) {
    const dx = (this.sh.x - p.x) * p.face;
    const dy = this.sh.y - p.y;
    return dx > -10 && dx < 23 && dy > -52 && dy < -3;
  }

  private hit(who: Who) {
    const p = who === 'user' ? this.user : this.bot;
    const s = this.sh;
    const head = p.y - 26;
    const airborne = p.y < FLOOR_Y - 2;
    let type: ShotType;
    let tx: number;
    let ang: number;
    if (who === 'user') {
      const aimX = !this.autoAim && this.mouse.x > NET_X + 4 ? clamp(this.mouse.x, 172, 300) : -1;
      if (s.y < head - 2 && (airborne || p.x > 70)) { type = 'smash'; tx = aimX > 0 ? aimX : randi(196, 290); ang = -14; }
      else if (s.y > p.y - 12) { type = 'lift'; tx = aimX > 0 ? Math.max(aimX, 240) : randi(250, 298); ang = 60; }
      else {
        tx = aimX > 0 ? aimX : randi(230, 298);
        type = tx < 205 ? 'drop' : tx > 262 ? 'clear' : 'drive';
        ang = type === 'drop' ? 38 : type === 'clear' ? 50 : 16;
      }
    } else {
      const L = this.L;
      const pickShot = (k: 'clear' | 'drop' | 'drive' | 'smash'): [number, number] => {
        const [a, b, an] = L.shots[k];
        return [randi(a, b), an];
      };
      if (s.y < head - 2 && p.x < 262 && (airborne || chance(L.smash))) { type = 'smash'; [tx, ang] = pickShot('smash'); }
      else {
        // smarter bots play it away from you: deep when you're at the net, short when you're back
        const u = this.user.x;
        let r = Math.random();
        if (chance(L.smart)) r = u > 95 ? 0.1 : u < 55 ? 0.55 : r;
        if (r < 0.4) { type = 'clear'; [tx, ang] = pickShot('clear'); }
        else if (r < 0.7) { type = 'drop'; [tx, ang] = pickShot('drop'); }
        else { type = 'drive'; [tx, ang] = pickShot('drive'); }
      }
    }
    const v = solveShot(s.x, s.y, tx, ang, p.face);
    s.vx = v.vx; s.vy = v.vy; s.last = who; s.type = type;
    this.hits++;
    this.rallyLen++;
    if (type === 'smash') {
      sfx.play('smash');
      this.parts.burst(s.x, s.y, 10, { colors: [C.white, C.yellow], speed: 70, life: 0.35, g: 0 });
      if (who === 'user') this.pops.add('SMASH!', { scale: 2, color: C.yellow, x: s.x, y: s.y - 12, dur: 0.8 });
    } else sfx.play('shuttle');
  }

  private awardPoint(winner: Who, why: string) {
    this.score[winner]++;
    this.pointWinner = winner;
    this.server = winner;
    this.state = 'point'; this.t = 0;
    const u = winner === 'user';
    this.pops.add(u ? (why || 'POINT!') : (why || 'BOT POINT'), { scale: 3, color: u ? C.green : C.red, y: 48 });
    if (u) { sfx.play('point'); this.stands.cheer(0.9); if (this.rallyLen >= 6) this.pops.add(`${this.rallyLen} SHOT RALLY`, { scale: 1, color: C.lavender, y: 64 }); }
    else { sfx.play('lose-point'); this.stands.cheer(0.4); }
    this.parts.burst(this.sh.x, FLOOR_Y, 8, { colors: ['#C9A15A', '#E3C27E'], speed: 25, up: true, life: 0.4 });
  }

  private land() {
    const x = this.sh.x;
    const last = this.sh.last;
    if (this.netHit) { this.awardPoint(last === 'user' ? 'bot' : 'user', 'NET!'); return; }
    if (x < NET_X) {
      if (x < LEFT_LINE - 1) this.awardPoint(last === 'bot' ? 'user' : 'bot', 'OUT!');
      else this.awardPoint('bot', '');
    } else {
      if (x > RIGHT_LINE + 1) this.awardPoint(last === 'user' ? 'bot' : 'user', 'OUT!');
      else this.awardPoint('user', '');
    }
  }

  private endMatch() {
    this.state = 'over'; this.t = 0;
    this.pops.clear();
    const won = this.score.user > this.score.bot;
    if (won) { sfx.play('win'); sfx.play('cheer'); this.parts.confetti(150); this.stands.cheer(1); }
    else sfx.play('lose');
    const lvl = this.levelIdx;
    updateRecords((r) => {
      r.badminton.played++;
      if (won) { r.badminton.won++; r.badminton.bestLevel = Math.max(r.badminton.bestLevel ?? -1, lvl); }
    });
  }

  // ---------------- input ----------------
  private levelAt(x: number, y: number) {
    return LEVEL_BTNS.findIndex((b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 3 && y <= b.y + b.h + 3);
  }

  private startLevel(i: number) {
    this.levelSel = i;
    this.levelIdx = i;
    sfx.play('select');
    this.newMatch();
  }

  private swingNow(auto: boolean) {
    if (this.state === 'serve' && this.server === 'user' && this.t > 0.3) { this.autoAim = auto; this.serve('user'); return; }
    if (this.state !== 'rally' && this.state !== 'serve') return;
    if (this.user.swingT < 0) { this.autoAim = auto; this.user.swingT = 0; this.user.hitDone = false; sfx.play('swing'); }
  }

  private jumpNow() {
    if (this.user.y >= FLOOR_Y && (this.state === 'rally' || this.state === 'serve')) { this.user.vy = -185; sfx.play('jump'); }
  }

  pointerDown(x: number, y: number) {
    this.mouse = { x, y };
    if (this.state === 'title') {
      const i = this.levelAt(x, y);
      if (i >= 0) this.startLevel(i);
      return;
    }
    if (this.state === 'over') {
      if (this.t > 0.8) { sfx.play('select'); this.state = 'title'; this.t = 0; this.pops.clear(); }
      return;
    }
    this.swingNow(false);
  }
  pointerMove(x: number, y: number) {
    this.mouse = { x, y };
    if (this.state === 'title') {
      const i = this.levelAt(x, y);
      if (i >= 0 && i !== this.levelSel) { this.levelSel = i; sfx.play('blip'); }
    }
  }
  keyDown(code: string) {
    const go = code === 'Enter' || code === 'Space';
    if (this.state === 'title') {
      if (code === 'ArrowLeft' || code === 'KeyA') { this.levelSel = (this.levelSel + 2) % 3; sfx.play('blip'); }
      if (code === 'ArrowRight' || code === 'KeyD') { this.levelSel = (this.levelSel + 1) % 3; sfx.play('blip'); }
      if (go) this.startLevel(this.levelSel);
      return;
    }
    if (this.state === 'over') { if (go) this.pointerDown(this.mouse.x, this.mouse.y); return; }
    if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = true;
    if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = true;
    if (code === 'Space' && this.state === 'serve' && this.server === 'user') { this.swingNow(true); return; }
    if (code === 'KeyW' || code === 'ArrowUp' || code === 'Space') this.jumpNow();
    // Enter = the handheld's A button, S / down = keyboard swing
    if (code === 'Enter' || code === 'KeyS' || code === 'ArrowDown') this.swingNow(true);
  }
  keyUp(code: string) {
    if (code === 'KeyA' || code === 'ArrowLeft') this.keys.left = false;
    if (code === 'KeyD' || code === 'ArrowRight') this.keys.right = false;
  }
  destroy() { this.keys.left = this.keys.right = false; }
  cursor() { return this.state === 'rally' || this.state === 'serve' ? 'crosshair' : 'pointer'; }

  // ---------------- update ----------------
  private movePlayer(p: Player, dir: number, dt: number, min: number, max: number, speed: number) {
    p.x = clamp(p.x + dir * speed * dt, min, max);
    p.moving = dir;
    p.vy += 560 * dt;
    p.y += p.vy * dt;
    if (p.y >= FLOOR_Y) { p.y = FLOOR_Y; p.vy = 0; }
    if (p.swingT >= 0) { p.swingT += dt; if (p.swingT > 0.3) { p.swingT = -1; p.hitDone = false; } }
  }

  private updateBot(dt: number) {
    const b = this.bot, s = this.sh;
    let dir = 0;
    if (this.state === 'rally') {
      if (this.plan.hit !== this.hits) {
        this.plan.hit = this.hits;
        if (s.last === 'user') {
          // predict where the shuttle comes down on our side
          const sim = { ...s };
          let standX = 250, landX = 250;
          for (let i = 0; i < 600; i++) {
            const py = sim.y;
            stepShuttle(sim, 1 / 120);
            if (sim.x > NET_X + 6 && py < FLOOR_Y - 28 && sim.y >= FLOOR_Y - 28 && standX === 250) standX = sim.x + 9;
            if (sim.y >= FLOOR_Y) { landX = sim.x; break; }
          }
          if (standX === 250) standX = landX + 9;
          const L = this.L;
          const smash = s.type === 'smash';
          const leave = landX > RIGHT_LINE + 3 && chance(L.leave);
          const rallyTire = Math.min(0.12, this.rallyLen * 0.01);
          this.plan = {
            hit: this.hits,
            standX: clamp(standX + rand(-L.err, L.err), NET_X + 10, 314),
            leave,
            success: chance(smash ? L.hitSmash : L.hit - rallyTire),
            reactAt: this.time + rand(L.react[0], L.react[1]),
            jump: !smash && chance(L.jump),
          };
        } else {
          this.plan = { hit: this.hits, standX: 236, leave: false, success: true, reactAt: this.time + 0.25, jump: false };
        }
      }
      if (this.time > this.plan.reactAt) {
        const d = this.plan.standX - b.x;
        if (Math.abs(d) > 2) dir = Math.sign(d);
      }
      // jump for high balls
      if (s.last === 'user' && this.plan.jump && b.y >= FLOOR_Y && s.vy > 0 && s.x > NET_X && Math.abs(s.x - (b.x - 8)) < 26 && s.y < b.y - 44) {
        b.vy = -175;
      }
      if (s.last === 'user' && !this.plan.leave && b.swingT < 0 && this.inReach(b) && s.vy > -60) {
        b.swingT = 0;
        b.hitDone = true;
        if (this.plan.success) this.hit('bot');
        else sfx.play('swing');
      }
    } else if (this.state === 'serve' && this.server === 'bot') {
      if (this.t > 1.1) this.serve('bot');
    } else {
      const home = 262;
      if (Math.abs(home - b.x) > 2 && this.state !== 'serve') dir = Math.sign(home - b.x);
    }
    this.movePlayer(b, dir, dt, NET_X + 8, 314, this.L.speed);
  }

  update(dt: number) {
    this.t += dt; this.time += dt;
    this.stands.update(dt); this.parts.update(dt); this.pops.update(dt);
    if (this.state === 'title' || this.state === 'over') return;

    const u = this.user;
    // keyboard or the phone's analog thumbstick (stick wins when it's pushed)
    let dir = (this.keys.left ? -1 : 0) + (this.keys.right ? 1 : 0);
    if (Math.abs(input.stickX) > 0.15) dir = clamp(input.stickX * 1.15, -1, 1);
    if (input.stickY < -0.6 && !this.stickJumpLatch) { this.stickJumpLatch = true; this.jumpNow(); }
    else if (input.stickY > -0.3) this.stickJumpLatch = false;
    this.movePlayer(u, this.state === 'point' ? 0 : dir, dt, 6, NET_X - 8, 118);
    this.updateBot(dt);

    if (this.state === 'serve') {
      this.holdShuttle();
      return;
    }

    if (this.state === 'rally') {
      // user's swing connects during the active window
      if (u.swingT >= 0 && u.swingT < 0.17 && !u.hitDone && this.sh.last !== 'user' && this.inReach(u)) {
        u.hitDone = true;
        this.hit('user');
      }
      const s = this.sh;
      const steps = 3;
      for (let i = 0; i < steps; i++) {
        const prevX = s.x;
        stepShuttle(s, dt / steps);
        if (!this.netHit && (prevX - NET_X) * (s.x - NET_X) <= 0 && prevX !== s.x && s.y > NET_TOP && s.y < FLOOR_Y) {
          this.netHit = true;
          s.x = NET_X + (prevX < NET_X ? -3 : 3);
          s.vx = -s.vx * 0.12;
          s.vy = Math.max(s.vy, 0) * 0.3;
          sfx.play('wall');
        }
        if (s.y >= FLOOR_Y) { s.y = FLOOR_Y; this.land(); break; }
      }
      this.trail.push({ x: s.x, y: s.y });
      if (this.trail.length > (s.type === 'smash' ? 8 : 4)) this.trail.shift();
    } else if (this.state === 'point') {
      if (this.t > 1.5) {
        if (this.score.user >= WIN_SCORE || this.score.bot >= WIN_SCORE) this.endMatch();
        else this.toServe();
      }
    }
  }

  // ---------------- draw ----------------
  draw(g: CanvasRenderingContext2D) {
    this.drawArena(g);
    this.drawPlayer(g, this.bot);
    this.drawPlayer(g, this.user);
    this.drawNet(g);
    this.drawShuttle(g);
    if (this.state === 'rally' || this.state === 'serve') this.drawAim(g);
    this.parts.draw(g);
    this.drawHud(g);
    this.pops.draw(g);
    if (this.state === 'title') this.drawTitle(g);
    if (this.state === 'over') this.drawOver(g);
  }

  private drawArena(g: CanvasRenderingContext2D) {
    rect(g, 0, 0, W, 14, C.navy);
    stars(g, 4, 10, 0, 0, W, 12, this.time);
    for (let i = 0; i < 6; i++) {
      const lx = 26 + i * 54;
      rect(g, lx, 0, 12, 3, '#2A2440');
      rect(g, lx + 1, 2, 10, 1, Math.sin(this.time * 2 + i) > 0.98 ? C.lavender : '#FFF6D6');
      g.fillStyle = 'rgba(255,246,214,0.05)';
      g.fillRect(lx - 6, 3, 24, 10);
    }
    this.stands.draw(g);
    rect(g, 0, 68, W, 2, C.lavender);
    for (let x = 0; x < W; x += 6) rect(g, x, 70, 1, 4, C.purple);
    rect(g, 0, 74, W, 10, C.purple);
    const ads = ['8-BIT ARENA', 'SMASH IT', 'PIXEL OPEN', 'FIRST TO 5'];
    for (let i = 0; i < 4; i++) {
      rect(g, i * 80 + 2, 75, 76, 8, i % 2 ? C.pink : C.violet);
      drawText(g, ads[i], i * 80 + 40, 76, { color: i % 2 ? C.white : C.yellow, align: 'center' });
    }
    rect(g, 0, 84, W, 50, '#17132F');
    for (let y = 88; y < 134; y += 6) rect(g, 0, y, W, 1, '#1D1838');
    // floor
    rect(g, 0, 134, W, 26, '#5A3B2A');
    for (let y = 136; y < H; y += 4) rect(g, 0, y, W, 1, '#4E3324');
    for (let x = 6; x < W; x += 22) rect(g, x + ((x / 22) % 2) * 6, 134, 1, 26, '#4E3324');
    // court surface strip
    rect(g, 4, FLOOR_Y - 4, W - 8, 12, '#2F7A5A');
    rect(g, 4, FLOOR_Y - 4, W - 8, 1, '#3E9470');
    rect(g, 4, FLOOR_Y + 7, W - 8, 1, '#22573F');
    for (const lx of [LEFT_LINE, RIGHT_LINE, 110, 210]) rect(g, lx, FLOOR_Y - 4, 1, 12, C.white);
    rect(g, 4, FLOOR_Y + 3, W - 8, 1, 'rgba(244,241,255,0.35)');
  }

  private drawNet(g: CanvasRenderingContext2D) {
    rect(g, NET_X - 1, NET_TOP - 1, 2, FLOOR_Y - NET_TOP + 4, '#C9C6D6');
    for (let y = NET_TOP + 1; y < NET_TOP + 16; y++)
      for (let x = NET_X - 3; x <= NET_X + 3; x++)
        if ((x + y) % 2 === 0) px(g, x, y, 'rgba(244,241,255,0.45)');
    rect(g, NET_X - 4, NET_TOP - 1, 8, 2, C.white);
    rect(g, NET_X - 4, FLOOR_Y + 2, 8, 2, '#22213A');
  }

  private drawPlayer(g: CanvasRenderingContext2D, p: Player) {
    const x = Math.round(p.x), y = Math.round(p.y), f = p.face;
    const sh = Math.max(3, 9 - Math.round((FLOOR_Y - p.y) / 6));
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(Math.round(p.x) - sh, FLOOR_Y + 1, sh * 2, 2);
    const run = p.moving !== 0 && p.y >= FLOOR_Y ? Math.floor(this.time * 10) % 2 : -1;
    const air = p.y < FLOOR_Y;
    // legs
    const legA = run === 0 ? -1 : 0, legB = run === 1 ? -1 : 0;
    const lx1 = x - 3 + (air ? -1 : run === 0 ? -1 : 0), lx2 = x + 1 + (air ? 1 : run === 1 ? 1 : 0);
    rect(g, lx1, y - 9 + legA, 2, 7, p.skin); rect(g, lx1, y - 4 + legA, 2, 2, C.white); rect(g, lx1 - (f < 0 ? 1 : 0), y - 2 + legA, 3, 2, C.ink);
    rect(g, lx2, y - 9 + legB, 2, 7, p.skin); rect(g, lx2, y - 4 + legB, 2, 2, C.white); rect(g, lx2 - (f < 0 ? 1 : 0), y - 2 + legB, 3, 2, C.ink);
    // shorts + torso
    rect(g, x - 3, y - 12, 6, 3, '#120F2B');
    rect(g, x - 3, y - 20, 6, 8, p.kit);
    rect(g, f > 0 ? x - 3 : x + 2, y - 20, 1, 8, 'rgba(0,0,0,0.25)');
    rect(g, x - 3, y - 17, 6, 1, p.kit2);
    // head
    rect(g, x - 2, y - 26, 5, 5, p.skin);
    rect(g, x - 2, y - 27, 5, 2, p.hair);
    rect(g, f > 0 ? x - 2 : x + 2, y - 25, 1, 2, p.hair);
    rect(g, x - 2, y - 25, 5, 1, p.kit2);
    px(g, f > 0 ? x + 2 : x - 2, y - 24, C.ink);
    // off arm
    rect(g, x - f * 3 - (f > 0 ? 1 : 0), y - 19, 1, 5, p.skin);
    // racket arm
    let a: number;
    if (p.swingT >= 0) {
      const u = clamp(p.swingT / 0.17, 0, 1);
      a = p.swingT < 0.17 ? -150 + u * 200 : 50 - clamp((p.swingT - 0.17) / 0.13, 0, 1) * 110;
    } else a = -60;
    const r = (a * Math.PI) / 180;
    const sx = x + f * 2, sy = y - 19;
    const hx = sx + Math.cos(r) * 6 * f, hy = sy + Math.sin(r) * 6;
    line(g, sx, sy, hx, hy, p.skin, 1);
    const rx = hx + Math.cos(r) * 4 * f, ry = hy + Math.sin(r) * 4;
    line(g, hx, hy, rx, ry, '#2A2440', 1);
    const cx = hx + Math.cos(r) * 8 * f, cy = hy + Math.sin(r) * 8;
    ring(g, cx, cy, 2, 3, C.white);
    px(g, cx, cy, 'rgba(244,241,255,0.4)');
  }

  private drawShuttle(g: CanvasRenderingContext2D) {
    const s = this.sh;
    if (this.state === 'title') return;
    // shadow on the floor
    if (s.y < FLOOR_Y - 1) rect(g, s.x - 1, FLOOR_Y + 2, 3, 1, 'rgba(0,0,0,0.4)');
    if (s.type === 'smash') for (let i = 0; i < this.trail.length; i++) if (i % 2 === 0) px(g, this.trail[i].x, this.trail[i].y, C.yellow);
    let dx = s.vx, dy = s.vy;
    if (this.state === 'serve' || (Math.abs(dx) + Math.abs(dy) < 1)) { dx = 0; dy = 1; }
    const d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d;
    const x = Math.round(s.x), y = Math.round(s.y);
    const pts: [number, number, string][] = [];
    for (let i = 1; i <= 3; i++) pts.push([x - ux * i, y - uy * i, C.white]);
    pts.push([x - ux * 4 - uy, y - uy * 4 + ux, C.white]);
    pts.push([x - ux * 4 + uy, y - uy * 4 - ux, C.white]);
    pts.push([x - ux * 3 - uy, y - uy * 3 + ux, C.white]);
    pts.push([x - ux * 3 + uy, y - uy * 3 - ux, C.white]);
    // dark halo first so it reads against the crowd, then feathers + cork
    g.fillStyle = C.ink;
    for (const [qx, qy] of pts) g.fillRect(Math.round(qx) - 1, Math.round(qy) - 1, 3, 3);
    g.fillRect(x - 1, y - 1, 4, 4);
    for (const [qx, qy, c] of pts) px(g, qx, qy, c);
    rect(g, x, y, 2, 2, C.red);
  }

  private drawAim(g: CanvasRenderingContext2D) {
    if (this.mouse.x <= NET_X + 4) return;
    const ax = Math.round(clamp(this.mouse.x, 172, 300));
    const c = Math.floor(this.time * 4) % 2 ? C.yellow : C.orange;
    rect(g, ax - 2, FLOOR_Y + 5, 5, 1, c);
    px(g, ax, FLOOR_Y + 4, c);
    px(g, ax, FLOOR_Y + 6, c);
  }

  private drawHud(g: CanvasRenderingContext2D) {
    if (this.state === 'title') return;
    rect(g, 0, 0, W, 12, 'rgba(3,5,11,0.85)');
    drawText(g, this.L.label, 4, 4, { color: this.L.color });
    drawText(g, 'YOU', W / 2 - 22, 4, { color: C.pinkHi, align: 'right' });
    drawText(g, `${this.score.user}-${this.score.bot}`, W / 2, 1, { color: C.white, scale: 2, align: 'center' });
    drawText(g, 'BOT', W / 2 + 22, 4, { color: C.yellow });
    drawText(g, `SERVE: ${this.server === 'user' ? 'YOU' : 'BOT'}`, W - 4, 4, { color: C.white, align: 'right' });
    const mp = (this.score.user === WIN_SCORE - 1 || this.score.bot === WIN_SCORE - 1) && this.state !== 'over';
    if (mp && Math.floor(this.time * 3) % 2) drawText(g, 'MATCH POINT', W / 2, 15, { color: C.red, align: 'center', outline: C.ink });
    if (this.state === 'serve' && this.server === 'user') drawText(g, `${tapWord()} TO SERVE`, W / 2, 24, { color: C.yellow, align: 'center', outline: C.ink });
    if (this.score.user + this.score.bot === 0 && (this.state === 'serve' || this.state === 'rally')) {
      rect(g, 0, H - 10, W, 10, 'rgba(3,5,11,0.7)');
      drawText(g, input.touch ? 'STICK MOVE   PUSH UP / B JUMP   A SWING' : 'A/D MOVE  W JUMP  CLICK SWING  MOUSE AIMS', W / 2, H - 7, { color: C.white, align: 'center' });
    }
  }

  private drawTitle(g: CanvasRenderingContext2D) {
    dim(g, 0.45);
    panel(g, 56, 16, 208, 128, C.yellow);
    drawText(g, 'BADMINTON', W / 2, 24, { color: C.yellow, scale: 3, align: 'center', outline: C.ink });
    drawText(g, 'FIRST TO 5 POINTS WINS', W / 2, 44, { color: C.lavender, align: 'center' });
    const t = input.touch;
    drawText(g, t ? 'STICK - MOVE    PUSH UP OR B - JUMP' : 'A / D - MOVE    W - JUMP', W / 2, 55, { color: C.white, align: 'center' });
    drawText(g, t ? 'A - SWING    JUMP + HIT = SMASH' : 'CLICK - SWING    JUMP + HIT = SMASH', W / 2, 63, { color: C.white, align: 'center' });
    drawText(g, t ? 'TAP THEIR SIDE TO AIM A SHOT' : 'MOUSE OVER THEIR SIDE TO AIM', W / 2, 71, { color: C.white, align: 'center' });
    drawText(g, 'CHOOSE YOUR OPPONENT', W / 2, 87, { color: C.white, align: 'center' });
    LEVEL_BTNS.forEach((b, i) => {
      const L = LEVELS[i];
      const sel = i === this.levelSel;
      rect(g, b.x, b.y, b.w, b.h, sel ? 'rgba(255,194,26,0.18)' : C.purple);
      const edge = sel ? L.color : C.lavender;
      rect(g, b.x, b.y, b.w, 1, edge); rect(g, b.x, b.y + b.h - 1, b.w, 1, edge);
      rect(g, b.x, b.y, 1, b.h, edge); rect(g, b.x + b.w - 1, b.y, 1, b.h, edge);
      const bob = sel && Math.floor(this.time * 4) % 2 ? -1 : 0;
      drawText(g, L.label, b.x + b.w / 2, b.y + 5 + bob, { color: sel ? L.color : C.white, align: 'center' });
      // difficulty pips
      for (let k = 0; k <= i; k++) rect(g, b.x + b.w / 2 - i * 3 + k * 6 - 1, b.y + b.h + 2, 3, 2, sel ? L.color : C.grey);
    });
    blinkText(g, `${tapWord()} A LEVEL TO START`, W / 2, 124, this.time);
    drawText(g, t ? 'OR TAP, THEN A' : 'OR < >  THEN  ENTER', W / 2, 133, { color: C.grey, align: 'center' });
  }

  private drawOver(g: CanvasRenderingContext2D) {
    dim(g, 0.35);
    const won = this.score.user > this.score.bot;
    panel(g, 70, 32, 180, 92, won ? C.yellow : C.red);
    drawText(g, won ? 'YOU WIN!' : 'BOT WINS', W / 2, 42, { color: won ? C.yellow : C.red, scale: 3, align: 'center', outline: C.ink });
    drawText(g, `${this.score.user} - ${this.score.bot}`, W / 2, 64, { color: C.white, scale: 2, align: 'center' });
    drawText(g, `VS ${this.L.label} BOT`, W / 2, 80, { color: this.L.color, align: 'center' });
    if (won && this.levelIdx < 2) drawText(g, `TRY ${LEVELS[this.levelIdx + 1].label} NEXT?`, W / 2, 89, { color: C.lavender, align: 'center' });
    if (this.t > 0.8) blinkText(g, `${tapWord()} TO PLAY AGAIN`, W / 2, 106, this.time);
  }
}
