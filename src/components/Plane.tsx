import { useEffect, useRef } from 'react';
import planeUrl from '../assets/plane.png';
import { planeState, designUnit, Z } from '../lib/scene';

export type PlaneMode = 'off' | 'fly' | 'exit';

const smooth = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/**
 * How near the plane is (0 = far away, 1 = right by the camera) as it crosses the screen.
 * Far behind the left clouds, swinging close in front of the big one, then settling
 * between the two right-hand clouds.
 */
const depthAt = (xf: number) =>
  0.18 + 0.67 * smooth(0.17, 0.27, xf) - 0.3 * smooth(0.53, 0.68, xf) - 0.15 * smooth(0.93, 1.05, xf);

const ASPECT = 231 / 457; // plane.png height / width

interface CloudRef { el: HTMLElement; depth: number; z: number; front: boolean }

/**
 * The Figma plane. Loops left -> right with perspective: it scales and hazes with depth and
 * weaves between the clouds (each cloud has a depth; the plane only switches in front/behind
 * while it is clear of that cloud, so it never pops through one). Every other pass it swoops
 * down *through* the crowd, between the two crowd layers.
 */
export function Plane({ mode }: { mode: PlaneMode }) {
  const ref = useRef<HTMLDivElement>(null);
  const puffs = useRef<HTMLSpanElement[]>([]);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const el = ref.current!;
    let raf = 0;
    let pass = 0;
    let u = 0;
    let lastT = performance.now();
    let lastPuff = 0;
    let puffIdx = 0;
    let exitFrom: { x: number; y: number; d: number } | null = null;
    let exitT = 0;
    let pos = { x: -200, y: 160, d: 0.2 };
    let clouds: CloudRef[] = [];
    let lastFilter = -1;

    const collectClouds = () => {
      const wraps = Array.from(document.querySelectorAll<HTMLElement>('.cloud-wrap'));
      clouds = wraps.map((w) => {
        const depth = Number(w.dataset.depth ?? 0.5);
        return { el: w.querySelector('img') ?? w, depth, z: Number(w.style.zIndex || 0), front: false };
      });
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const vw = window.innerWidth, vh = window.innerHeight;
      const unit = designUnit();
      const base = Math.max(46, Math.round(72 * unit));
      const m = modeRef.current;

      if (m === 'off') {
        if (el.style.visibility !== 'hidden') el.style.visibility = 'hidden';
        planeState.visible = false;
        exitFrom = null;
        return;
      }
      el.style.visibility = 'visible';
      if (clouds.length === 0 || !clouds[0].el.isConnected) collectClouds();

      let x: number, y: number, d: number, ang = 0, z: number;

      if (m === 'exit') {
        if (!exitFrom) { exitFrom = { ...pos }; exitT = 0; }
        exitT += dt;
        const k = Math.min(1, exitT / 1.1);
        const e = k * k;
        x = exitFrom.x + (vw + 160 - exitFrom.x) * e;
        y = exitFrom.y + (-160 - exitFrom.y) * e;
        d = exitFrom.d + (1 - exitFrom.d) * k;
        ang = -18;
        z = Z.planeExit;
        if (k >= 1) { u = 0; pass = 0; }
      } else {
        exitFrom = null;
        const low = pass % 2 === 1;
        const dur = low ? 11.5 : 9.5;
        u += dt / dur;
        if (u >= 1) { u = 0; pass++; for (const c of clouds) c.front = false; }
        const path = (uu: number) => {
          const px = -base * 2 + (vw + base * 4) * uu;
          let dd = depthAt((px + base / 2) / vw);
          let py = vh * (0.1 + 0.11 * dd) + Math.sin(uu * Math.PI * 4) * vh * 0.008;
          let dip = 0;
          if (low) {
            dip = smooth(0.12, 0.4, uu) * (1 - smooth(0.62, 0.9, uu));
            py = py + (vh * 0.8 - py) * dip + Math.sin(uu * 30) * 3 * dip;
            dd = Math.max(dd, dip * 0.95);
          }
          return { px, py, dd, dip };
        };
        const p = path(u), p2 = path(u + 0.004);
        x = p.px; y = p.py; d = p.dd;
        ang = Math.max(-20, Math.min(20, (Math.atan2(p2.py - p.py, p2.px - p.px) * 180) / Math.PI));

        // z-order against each cloud (decided only while not overlapping it)
        const w = base * (0.42 + 0.85 * d), h = w * ASPECT;
        z = Z.planeFar;
        for (const c of clouds) {
          const r = c.el.getBoundingClientRect();
          const pad = 4;
          const overlap = !(x + w < r.left + pad || x > r.right - pad || y + h < r.top + pad || y > r.bottom - pad);
          if (!overlap) c.front = d > c.depth;
          if (c.front) z = Math.max(z, c.z + 1);
        }
        if (low && p.dip > 0.5) z = Z.planeLow;
      }

      const w = Math.round(base * (0.42 + 0.85 * d));
      ang = Math.round(ang / 4) * 4;
      const snap = Math.max(2, Math.round(2 * unit));
      x = Math.round(x / snap) * snap;
      y = Math.round(y / snap) * snap;
      pos = { x, y, d };
      el.style.width = `${w}px`;
      el.style.zIndex = String(z);
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${ang}deg)`;
      // far away = hazier, like it's deep in the night sky
      const f = Math.round((0.6 + 0.4 * Math.min(1, d)) * 50) / 50;
      if (f !== lastFilter) { el.style.filter = f >= 1 ? '' : `brightness(${f}) saturate(${f})`; lastFilter = f; }
      planeState.x = x; planeState.y = y; planeState.w = w; planeState.visible = true;

      if (now - lastPuff > 110) {
        lastPuff = now;
        const pf = puffs.current[puffIdx++ % puffs.current.length];
        if (pf) {
          const s = Math.max(3, Math.round(6 * unit * (0.5 + 0.7 * d)));
          pf.style.width = `${s}px`; pf.style.height = `${s}px`;
          pf.style.zIndex = String(z);
          pf.style.left = `${x - s * 0.5}px`;
          pf.style.top = `${y + w * 0.22 + (Math.random() * 4 - 2)}px`;
          pf.animate(
            [
              { transform: 'scale(1)', opacity: 0.85 * (0.5 + 0.5 * d) },
              { transform: `translate(${-8 - Math.random() * 10}px, ${-4 - Math.random() * 6}px) scale(2.4)`, opacity: 0 },
            ],
            { duration: 900, easing: 'steps(6)', fill: 'forwards' },
          );
        }
      }
    };
    raf = requestAnimationFrame(frame);
    window.addEventListener('resize', collectClouds);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', collectClouds); planeState.visible = false; };
  }, []);

  return (
    <>
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="puff" ref={(el) => { if (el) puffs.current[i] = el; }} aria-hidden />
      ))}
      <div ref={ref} className="plane" aria-hidden>
        <img src={planeUrl} alt="" draggable={false} />
      </div>
    </>
  );
}
