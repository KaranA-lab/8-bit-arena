import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import cloudUrl from './assets/cloud.png';
import { Background } from './components/Background';
import { Crowd } from './components/Crowd';
import { Plane, type PlaneMode } from './components/Plane';
import { Hero } from './components/Hero';
import { Monitor } from './components/Monitor';
import { Menu } from './components/Menu';
import { MenuIcon } from './components/MenuIcon';
import { BootIntro } from './components/BootIntro';
import { CLOUDS, CLOUDS_MOBILE, GAMES, applyLayoutVars, cloudZ, designUnit, isMobileLayout, monitorOffY, stageTop } from './lib/scene';
import type { GameId } from './lib/gfx';
import { sfx } from './lib/audio';
import { input } from './lib/input';

const snap = (n: number) => gsap.utils.unitize(gsap.utils.snap(n)) as (v: string | number) => string;

function useScramble(text: string) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    const glyphs = '#%&*+=?@$<>';
    let frame = 0;
    const id = window.setInterval(() => {
      frame++;
      const settled = Math.floor((frame / 10) * text.length);
      setOut(text.split('').map((c, i) => (c === ' ' || i < settled ? c : glyphs[Math.floor(Math.random() * glyphs.length)])).join(''));
      if (frame >= 10) { window.clearInterval(id); setOut(text); }
    }, 38);
    return () => window.clearInterval(id);
  }, [text]);
  return out;
}

export default function App() {
  const scope = useRef<HTMLDivElement>(null);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<'home' | 'arcade'>('home');
  const [busy, setBusy] = useState(true);
  const [game, setGame] = useState<GameId>('cricket');
  const [menuOpen, setMenuOpen] = useState(false);
  const [sound, setSound] = useState(!sfx.muted);
  const [crt, setCrt] = useState(() => { try { return localStorage.getItem('arena.crt') !== '0'; } catch { return true; } });
  const [resetKey, setResetKey] = useState(0);
  const [screenMounted, setScreenMounted] = useState(false);
  const [powered, setPowered] = useState(false);
  const [planeMode, setPlaneMode] = useState<PlaneMode>('off');
  const [crowdOn, setCrowdOn] = useState(false);
  const [revealBg, setRevealBg] = useState(false);
  const [mobile, setMobile] = useState(isMobileLayout);
  const title = useScramble(GAMES.find((g) => g.id === game)!.name);
  const clouds = mobile ? CLOUDS_MOBILE : CLOUDS;

  const viewRef = useRef(view);
  viewRef.current = view;

  // layout vars + mouse parallax
  useLayoutEffect(() => {
    applyLayoutVars();
    input.touch = window.matchMedia('(pointer: coarse)').matches || isMobileLayout();
    const onResize = () => {
      applyLayoutVars();
      setMobile(isMobileLayout());
      input.touch = window.matchMedia('(pointer: coarse)').matches || isMobileLayout();
      if (viewRef.current === 'home') gsap.set('.monitor-anim', { y: monitorOffY() });
    };
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = document.documentElement.style;
        r.setProperty('--mx', ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        r.setProperty('--my', ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    // belt and braces for browsers without overflow: clip
    const scene = scope.current!;
    const unscroll = () => { if (scene.scrollTop || scene.scrollLeft) { scene.scrollTop = 0; scene.scrollLeft = 0; } };
    scene.addEventListener('scroll', unscroll);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointermove', onMove);
    return () => {
      scene.removeEventListener('scroll', unscroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  // hidden starting state for every animated element
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.set('.cloud', { y: -500 });
      gsap.set('.hero .ch', { autoAlpha: 0 });
      gsap.set('.btn-wrap', { autoAlpha: 0, scale: 0 });
      gsap.set('.crowd', { yPercent: 105 });
      gsap.set('.monitor-anim', { y: monitorOffY() });
      gsap.set('.arcade-head > *', { autoAlpha: 0, y: -80 });
    }, scope);
    return () => ctx.kill();
  }, []);

  const introTl = useRef<gsap.core.Timeline | null>(null);

  const startIntro = useCallback(() => {
    setRevealBg(true);
    setCrowdOn(true);
    const u = designUnit();
    const tl = gsap.timeline({ delay: 0.35 });
    introTl.current = tl;
    tl.add(() => setBusy(false), 1.85); // clickable the moment the button pops in
    tl.to('.cloud', { y: 0, duration: 1.1, ease: 'back.out(1.3)', stagger: 0.09, modifiers: { y: snap(Math.max(2, Math.round(4 * u))) } }, 0)
      .fromTo('.hero-title .ch', { autoAlpha: 0, scale: 0, y: -20 }, {
        autoAlpha: 1, scale: 1, y: 0, duration: 0.22, ease: 'steps(3)',
        stagger: { each: 0.04, onStart: () => sfx.play('type') },
      }, 0.45)
      .fromTo('.hero-sub .ch', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01, stagger: { each: 0.018, onStart: () => sfx.play('type') } }, 1.25)
      .to('.btn-wrap', { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'steps(4)' }, 1.8)
      .add(() => document.querySelector('.btn-wrap')?.classList.add('ready'), 2.2)
      .to('.crowd', { yPercent: 0, duration: 1.0, ease: 'steps(10)' }, 0.5)
      .add(() => setPlaneMode('fly'), 1.5);
  }, []);

  const toArcade = useCallback((id: GameId) => {
    // an eager click during the intro: finish the intro instantly, then go
    // (isActive() is false during the timeline's start delay, so check progress instead)
    const introRunning = !!introTl.current && introTl.current.progress() < 1;
    if (busy && !introRunning) return;
    if (introRunning) introTl.current!.progress(1);
    setBusy(true);
    sfx.unlock();
    sfx.play('select');
    setGame(id);
    const u = designUnit();
    const px = snap(Math.max(2, Math.round(4 * u)));
    const gap = stageTop();
    const layout = isMobileLayout() ? CLOUDS_MOBILE : CLOUDS;
    const tl = gsap.timeline({ onComplete: () => setBusy(false) });
    tl.to('.btn-start', { y: 4, duration: 0.08, yoyo: true, repeat: 1, ease: 'steps(1)' }, 0)
      .to('.hero', { x: Math.max(1132 * u, window.innerWidth), duration: 0.6, ease: 'power2.in', modifiers: { x: px } }, 0.1)
      .add(() => setPlaneMode('exit'), 0.05);
    // Figma "Desktop - 2" positions: clouds shrink and float up out of frame
    document.querySelectorAll<HTMLElement>('.cloud').forEach((el, i) => {
      const c = layout[i];
      tl.to(el, { x: (c.ax - c.x) * u, y: (c.ay - c.y) * u - gap, scale: c.aw / c.w, duration: 0.9, ease: 'power2.inOut', modifiers: { x: px, y: px } }, 0.05 + i * 0.03);
    });
    tl.to('.crowd', { yPercent: 110, duration: 0.7, ease: 'steps(8)' }, 0.05)
      .add(() => { setView('arcade'); setScreenMounted(true); }, 0.3)
      .fromTo('.monitor-anim', { y: monitorOffY() }, { y: 0, duration: 0.95, ease: 'back.out(1.05)', modifiers: { y: snap(4) } }, 0.35)
      .to('.arcade-head > *', { autoAlpha: 1, y: 0, duration: 0.45, ease: 'steps(5)', stagger: 0.12 }, 0.85)
      .add(() => { setCrowdOn(false); setPowered(true); }, 1.25);
  }, [busy]);

  const toHome = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setMenuOpen(false);
    setPowered(false);
    sfx.play('power-off');
    const u = designUnit();
    const px = snap(Math.max(2, Math.round(4 * u)));
    const tl = gsap.timeline({ onComplete: () => { setBusy(false); } });
    tl.to('.arcade-head > *', { autoAlpha: 0, y: -80, duration: 0.3, ease: 'steps(3)' }, 0.25)
      .to('.monitor-anim', { y: monitorOffY(), duration: 0.6, ease: 'power2.in' }, 0.4)
      .add(() => { setView('home'); setScreenMounted(false); setCrowdOn(true); }, 0.95)
      .to('.hero', { x: 0, duration: 0.7, ease: 'power3.out', modifiers: { x: px } }, 0.9)
      .to('.cloud', { x: 0, y: 0, scale: 1, duration: 0.9, ease: 'power2.out', stagger: 0.04, modifiers: { x: px, y: px } }, 0.8)
      .to('.crowd', { yPercent: 0, duration: 0.8, ease: 'steps(8)' }, 0.9)
      .add(() => setPlaneMode('fly'), 1.3);
  }, [busy]);

  const selectGame = useCallback((id: GameId) => {
    sfx.play('select');
    setMenuOpen(false);
    if (view === 'arcade') setGame(id);
    else toArcade(id);
  }, [view, toArcade]);

  const toggleSound = useCallback(() => {
    sfx.unlock();
    const next = !sound;
    sfx.setMuted(!next);
    setSound(next);
    if (next) sfx.play('select');
  }, [sound]);

  const toggleCrt = useCallback(() => {
    setCrt((c) => {
      try { localStorage.setItem('arena.crt', c ? '0' : '1'); } catch { /* ignore */ }
      return !c;
    });
    sfx.play('blip');
  }, []);

  const active = view === 'arcade' && powered && !menuOpen;

  return (
    <div className={`scene view-${view}`} ref={scope}>
      <Background reveal={revealBg} />

      <div className="stage">
        {/* each cloud is its own depth layer so the plane can fly between them */}
        {clouds.map((c, i) => (
          <div
            key={i}
            className="cloud-wrap"
            data-depth={c.depth}
            style={{
              left: `calc(${c.x} * var(--u))`,
              top: `calc(${c.y} * var(--u))`,
              width: `calc(${c.w} * var(--u))`,
              zIndex: cloudZ(c.depth),
              ['--pd' as string]: (6 + c.depth * 30).toFixed(1),
            }}
          >
            <div className={`cloud ${c.flip ? 'flip' : ''}`}>
              <img src={cloudUrl} alt="" draggable={false} style={{ animationDelay: `${c.bob * -1.3}s` }} />
            </div>
          </div>
        ))}
        <Hero onStart={() => toArcade('cricket')} disabled={view !== 'home'} />
      </div>

      <Crowd running={crowdOn} />
      <Plane mode={planeMode} />

      <div className={`arcade ${view === 'arcade' ? 'is-active' : ''}`}>
        <Monitor
          game={game}
          mounted={screenMounted}
          powered={powered}
          active={active}
          sound={sound}
          crt={crt}
          resetKey={resetKey}
          handheld={mobile}
          onToggleSound={toggleSound}
          onToggleCrt={toggleCrt}
          onReset={() => { sfx.play('select'); setResetKey((k) => k + 1); }}
          onPower={toHome}
        />
      </div>

      <header className={`arcade-head ${view === 'arcade' ? 'is-active' : ''}`}>
        <h2 className="arcade-title" aria-live="polite">{title}</h2>
        <button
          type="button"
          className="menu-btn"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          onClick={() => { sfx.unlock(); setMenuOpen((o) => !o); }}
          onMouseEnter={() => sfx.play('blip')}
        >
          <MenuIcon open={menuOpen} />
        </button>
      </header>

      <Menu
        open={menuOpen}
        current={game}
        sound={sound}
        crt={crt}
        onSelect={selectGame}
        onClose={() => setMenuOpen(false)}
        onHome={toHome}
        onToggleSound={toggleSound}
        onToggleCrt={toggleCrt}
      />

      {booting && <BootIntro onStart={startIntro} onDone={() => setBooting(false)} />}
    </div>
  );
}
