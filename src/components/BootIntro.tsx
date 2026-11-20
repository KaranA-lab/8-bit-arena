import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { sfx } from '../lib/audio';

// Our own little pixel PC logo (echoes the monitor in the arcade view).
const LOGO = [
  '................',
  '.LLLLLLLLLLLLLL.',
  '.LKKKKKKKKKKKKL.',
  '.LKDDDDDDDDDDKL.',
  '.LKDDDDYDDDDDKL.',
  '.LKDDDYYYDDDDKL.',
  '.LKDYYYYYYYDDKL.',
  '.LKDDYYYYYDDDKL.',
  '.LKDDYDDDYDDDKL.',
  '.LKDDDDDDDDDDKL.',
  '.LKKKKKKKKKKKKL.',
  '.LLLLLLLLGPGPRL.',
  '.LLLLLLLLLLLLLL.',
  '......LLLL......',
  '....LLLLLLLL....',
];
const COLORS: Record<string, string> = { L: '#D9D9DE', K: '#03050B', D: '#232229', Y: '#FFC21A', G: '#55555C', P: '#A3A3AA', R: '#F0503C' };

const BIOS = [
  'ARENA-OS BIOS V1.0  (C) 1989 PIXEL WORKS',
  'CPU: 8-BIT @ 1.79 MHZ ........ OK',
  'MEMORY TEST: 64K ............. OK',
  'LOADING SPRITES .............. OK',
  'TUNING CROWD NOISE ........... OK',
  'INSERTING CARTRIDGE: 8BIT_ARENA.ROM',
];

interface Props { onStart: () => void; onDone: () => void }

export function BootIntro({ onStart, onDone }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [phase, setPhase] = useState<'bios' | 'logo' | 'ready' | 'out'>('bios');
  const logoRef = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const started = useRef(false);

  // type out the BIOS text
  useEffect(() => {
    let li = 0, ci = 0;
    const id = window.setInterval(() => {
      if (li >= BIOS.length) {
        window.clearInterval(id);
        window.setTimeout(() => setPhase((p) => (p === 'bios' ? 'logo' : p)), 250);
        return;
      }
      ci += 3;
      const row = li;
      const cur = BIOS[row].slice(0, ci);
      setLines((prev) => { const n = prev.slice(0, row); n[row] = cur; return n; });
      if (ci >= BIOS[row].length) { li++; ci = 0; }
    }, 16);
    return () => window.clearInterval(id);
  }, []);

  // pixel logo assembles itself
  useLayoutEffect(() => {
    if (phase !== 'logo' || !logoRef.current) return;
    const cells = logoRef.current.querySelectorAll('.px-on');
    const tl = gsap.timeline({ onComplete: () => setPhase((p) => (p === 'logo' ? 'ready' : p)) });
    tl.fromTo(cells, { scale: 0 }, { scale: 1, duration: 0.12, ease: 'steps(2)', stagger: { each: 0.004, from: 'random' } })
      .fromTo('.boot-name .bc', { autoAlpha: 0, y: -10 }, { autoAlpha: 1, y: 0, duration: 0.12, ease: 'steps(2)', stagger: 0.045 }, '-=0.2')
      .fromTo('.boot-bar', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 })
      .fromTo('.boot-bar i', { width: '0%' }, { width: '100%', duration: 0.9, ease: 'steps(12)' });
    return () => { tl.kill(); };
  }, [phase]);

  // any input starts the game (and unlocks audio for the startup chime)
  useEffect(() => {
    const go = () => {
      if (started.current) return;
      started.current = true;
      sfx.unlock();
      sfx.play('chime');
      setPhase('out');
    };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
    return () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); };
  }, []);

  // pixel dissolve into the hero
  useEffect(() => {
    if (phase !== 'out') return;
    const c = canvas.current!;
    const g = c.getContext('2d')!;
    const cell = Math.max(16, Math.round(Math.min(window.innerWidth / 1440, window.innerHeight / 800) * 40));
    c.width = window.innerWidth; c.height = window.innerHeight;
    const cols = Math.ceil(c.width / cell), rows = Math.ceil(c.height / cell);
    const order: number[] = [];
    for (let i = 0; i < cols * rows; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    g.fillStyle = '#F4F1FF';
    g.fillRect(0, 0, c.width, c.height);
    let raf = 0;
    const t0 = performance.now();
    let cleared = 0;
    let flashed = false;
    onStart();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      if (!flashed && t > 0.08) { flashed = true; g.fillStyle = '#03050B'; g.fillRect(0, 0, c.width, c.height); }
      if (t > 0.15) {
        const target = Math.floor(Math.min(1, (t - 0.15) / 0.85) * order.length);
        for (; cleared < target; cleared++) {
          const k = order[cleared];
          g.clearRect((k % cols) * cell, Math.floor(k / cols) * cell, cell, cell);
        }
      }
      if (t < 1.05) raf = requestAnimationFrame(loop);
      else onDone();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const name = '8-BIT ARENA';
  return (
    <div className={`boot ${phase === 'out' ? 'is-out' : ''}`} role="dialog" aria-label="Start screen">
      {phase !== 'out' && (
        <>
          <pre className="boot-bios" aria-hidden>{lines.join('\n')}<span className="cursor">_</span></pre>
          <div className="boot-center" style={{ visibility: phase === 'bios' ? 'hidden' : 'visible' }}>
            <div className="boot-logo" ref={logoRef} aria-hidden>
              {LOGO.flatMap((row, y) => row.split('').map((c, x) => (
                <i key={`${x}-${y}`} className={c === '.' ? '' : 'px-on'} style={c === '.' ? undefined : { background: COLORS[c] }} />
              )))}
            </div>
            <h1 className="boot-name">{name.split('').map((c, i) => <span key={i} className="bc">{c === ' ' ? ' ' : c}</span>)}</h1>
            <div className="boot-bar"><i /></div>
            <p className="boot-press" style={{ visibility: phase === 'ready' ? 'visible' : 'hidden' }}>PRESS START</p>
            <p className="boot-sub" style={{ visibility: phase === 'ready' ? 'visible' : 'hidden' }}>CLICK OR PRESS ANY KEY · SOUND ON</p>
          </div>
        </>
      )}
      <canvas ref={canvas} className="boot-canvas" />
    </div>
  );
}
