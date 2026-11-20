import { useEffect, useRef } from 'react';
import { planeState, designUnit, isMobileLayout } from '../lib/scene';

interface Person {
  x: number; w: number; top: number; head: number; ph: number; amp: number; speed: number;
  arms: number; flag?: string; phone?: boolean;
}

const BACK = '#551B52';
const FRONT = '#120F2B';
const FLAGS = ['#A8457E', '#6236AE', '#8A7BC3', '#FFC21A'];

function build(cw: number, ch: number, front: boolean): Person[] {
  const out: Person[] = [];
  let x = -6;
  while (x < cw + 6) {
    const w = front ? 6 + Math.floor(Math.random() * 4) : 5 + Math.floor(Math.random() * 4);
    const lo = front ? 0.46 : 0.16, hi = front ? 0.7 : 0.5;
    const flag = !front && Math.random() < 0.1 ? FLAGS[Math.floor(Math.random() * FLAGS.length)] : undefined;
    out.push({
      x, w,
      top: Math.round(ch * (flag ? 0.34 + Math.random() * 0.16 : lo + Math.random() * (hi - lo))),
      head: w >= 7 ? 4 : 3,
      ph: Math.random() * 6.28,
      amp: 1 + Math.random() * 3,
      speed: 6 + Math.random() * 5,
      arms: Math.floor(Math.random() * 4),
      flag,
      phone: front && Math.random() < 0.12,
    });
    x += w - 1 - Math.floor(Math.random() * 2);
  }
  return out;
}

/**
 * Two layers of pixel-silhouette fans (plum behind, navy in front, like the Figma frame).
 * They jump in a travelling "Mexican wave" and go wild when the plane flies past.
 */
export function Crowd({ running }: { running: boolean }) {
  const backRef = useRef<HTMLCanvasElement>(null);
  const frontRef = useRef<HTMLCanvasElement>(null);
  const runRef = useRef(running);
  runRef.current = running;

  useEffect(() => {
    const back = backRef.current!, front = frontRef.current!;
    const bctx = back.getContext('2d')!, fctx = front.getContext('2d')!;
    let P = 4, cw = 0, ch = 0;
    let backPeople: Person[] = [], frontPeople: Person[] = [];

    const resize = () => {
      const u = designUnit();
      P = Math.max(3, Math.round(4.5 * u));
      const cssH = Math.round(isMobileLayout() ? window.innerHeight * 0.3 : 260 * u);
      cw = Math.ceil(window.innerWidth / P);
      ch = Math.ceil(cssH / P);
      for (const c of [back, front]) {
        c.width = cw; c.height = ch;
        c.style.height = `${ch * P}px`;
        c.style.width = `${cw * P}px`;
      }
      backPeople = build(cw, ch, false);
      frontPeople = build(cw, ch, true);
    };
    resize();
    window.addEventListener('resize', resize);

    const drawLayer = (ctx: CanvasRenderingContext2D, people: Person[], color: string, t: number, frontLayer: boolean) => {
      ctx.clearRect(0, 0, cw, ch);
      const rect = back.getBoundingClientRect();
      const crowdTop = rect.top;
      for (const p of people) {
        const cx = (p.x + p.w / 2) * P;
        // travelling wave + plane excitement
        const wave = Math.pow(Math.max(0, Math.sin(t * 1.4 - cx * 0.005)), 6);
        let ex = 0.25 + wave * 1.1;
        if (planeState.visible) {
          const dx = Math.abs(planeState.x + planeState.w / 2 - cx);
          const near = planeState.y > crowdTop - 260;
          if (near && dx < 220) ex += (1 - dx / 220) * 1.6;
        }
        const jump = Math.round(Math.max(0, Math.sin(t * p.speed + p.ph)) * p.amp * Math.min(1.8, ex));
        const top = p.top - jump;
        const sh = top + p.head + 1;
        ctx.fillStyle = color;
        // head
        const hx = p.x + Math.floor((p.w - p.head) / 2);
        ctx.fillRect(hx + 1, top, p.head - 2, 1);
        ctx.fillRect(hx, top + 1, p.head, p.head - 2);
        ctx.fillRect(hx + 1, top + p.head - 1, p.head - 2, 1);
        // body
        ctx.fillRect(p.x + 1, sh - 1, p.w - 2, 1);
        ctx.fillRect(p.x, sh, p.w, ch - sh);
        // arms
        const up = p.arms === 3 || (ex > 0.7 && p.arms > 0) || jump > 1;
        const waveArm = p.arms === 1 && Math.floor(t * 4 + p.ph) % 2 === 0;
        const armL = up || waveArm, armR = up || p.arms === 2 || !!p.flag || !!p.phone;
        const len = 5 + (up ? 1 : 0);
        if (armL) {
          for (let i = 0; i < len; i++) ctx.fillRect(p.x - 1 - Math.floor(i / 3), sh - i, 2, 1);
          ctx.fillRect(p.x - 2 - Math.floor(len / 3), sh - len - 1, 2, 2);
        }
        if (armR) {
          const rx = p.x + p.w - 1;
          for (let i = 0; i < len; i++) ctx.fillRect(rx + Math.floor(i / 3), sh - i, 2, 1);
          const hxr = rx + 1 + Math.floor(len / 3) - 1;
          const hy = sh - len - 1;
          ctx.fillRect(hxr, hy, 2, 2);
          if (p.flag) {
            ctx.fillRect(hxr + 1, hy - 9, 1, 9);
            ctx.fillStyle = p.flag;
            const f = Math.floor(t * 6 + p.ph) % 2;
            ctx.fillRect(hxr + 2, hy - 9, 5, 2);
            ctx.fillRect(hxr + 2 + f, hy - 7, 5 - f, 2);
            ctx.fillStyle = color;
          }
          if (p.phone && frontLayer) {
            ctx.fillRect(hxr, hy - 3, 2, 3);
            if (Math.sin(t * 3 + p.ph) > -0.3) { ctx.fillStyle = '#F4F1FF'; ctx.fillRect(hxr, hy - 3, 1, 1); ctx.fillStyle = color; }
          }
        }
      }
    };

    let last = 0;
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 1000 / 12) return; // choppy 12fps on purpose: feels 8-bit
      last = now;
      if (!runRef.current) return;
      const t = now / 1000;
      drawLayer(bctx, backPeople, BACK, t, false);
      drawLayer(fctx, frontPeople, FRONT, t + 0.37, true);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <>
      <canvas ref={backRef} className="crowd crowd-back" aria-hidden />
      <canvas ref={frontRef} className="crowd crowd-front" aria-hidden />
    </>
  );
}
