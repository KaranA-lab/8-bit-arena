import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { GAMES, designUnit } from '../lib/scene';
import type { GameId } from '../lib/gfx';
import { loadRecords, type Records } from '../lib/records';
import { runSprite, type SpriteKind } from '../lib/menuSprites';
import { sfx } from '../lib/audio';
import { CreatorPage } from './Creator';

interface Props {
  open: boolean;
  current: GameId;
  sound: boolean;
  crt: boolean;
  onSelect: (id: GameId) => void;
  onClose: () => void;
  onHome: () => void;
  onToggleSound: () => void;
  onToggleCrt: () => void;
}

type Page = 'list' | 'creator';

function recordLine(id: GameId, r: Records) {
  switch (id) {
    case 'cricket': return r.cricket.played ? `CHASES WON ${r.cricket.won}/${r.cricket.played} · BEST ${r.cricket.best}` : 'CHASE A TARGET UP TO 80';
    case 'football': return r.football.played ? `SHOOTOUTS WON ${r.football.won}/${r.football.played}` : 'PICK A NATION, WIN THE PENS';
    case 'golf': return r.golf.holes ? `HOLES ${r.golf.holes} · ACES ${r.golf.aces}` : 'ENDLESS RANDOM COURSES';
    case 'badminton': return r.badminton.played ? `MATCHES WON ${r.badminton.won}/${r.badminton.played}${r.badminton.bestLevel >= 0 ? ' · BEAT ' + ['BEGINNER', 'INTERMEDIATE', 'EXTREME'][r.badminton.bestLevel] : ''}` : '3 LEVELS · FIRST TO 5 WINS';
  }
}

function Item({ index, name, current, rec, onSelect, kind, extra }: { index: number; name: string; current: boolean; rec: string; onSelect: () => void; kind: SpriteKind; extra?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stop = useRef<null | (() => void)>(null);
  const start = () => {
    if (stop.current || !canvas.current) return;
    stop.current = runSprite(canvas.current, kind, Math.max(3, Math.round(4 * designUnit())));
    sfx.play('blip');
  };
  const end = () => { stop.current?.(); stop.current = null; };
  useEffect(() => end, []);
  return (
    <li className={`menu-item menu-anim ${current ? 'current' : ''} ${extra ?? ''}`} onMouseEnter={start} onMouseLeave={end}>
      <button type="button" onFocus={start} onBlur={end} onClick={onSelect} aria-current={current ? 'true' : undefined}>
        <span className="idx">{String(index).padStart(2, '0')}</span>
        <span className="name">
          <canvas ref={canvas} className="menu-sprite" aria-hidden />
          {current && <span className="cur" aria-hidden />}
          {name}
        </span>
        <span className="rec">{rec}</span>
      </button>
    </li>
  );
}

export function Menu({ open, current, sound, crt, onSelect, onClose, onHome, onToggleSound, onToggleCrt }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [grid, setGrid] = useState({ cols: 24, rows: 14 });
  const [records, setRecords] = useState<Records>(loadRecords());
  const [page, setPage] = useState<Page>('list');
  const first = useRef(true);
  const pageFirst = useRef(true);

  useLayoutEffect(() => {
    const calc = () => {
      const cell = Math.max(40, Math.round(64 * designUnit()));
      setGrid({ cols: Math.ceil(window.innerWidth / cell), rows: Math.ceil(window.innerHeight / cell) });
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  // open / close: pixel-block wipe from the menu icon's corner
  useLayoutEffect(() => {
    const el = root.current!;
    const blocks = el.querySelectorAll('.menu-blocks i');
    const items = el.querySelectorAll('.menu-anim');
    if (first.current) {
      first.current = false;
      gsap.set(el, { autoAlpha: 0 });
      gsap.set(blocks, { scale: 0 });
      gsap.set(items, { autoAlpha: 0 });
      return;
    }
    gsap.killTweensOf([el, ...Array.from(blocks), ...Array.from(items)]);
    // grid ratios: [x, y] -> start the wipe at the top-right, where the menu icon lives
    const stagger = (amount: number) => ({ grid: [grid.rows, grid.cols] as [number, number], from: [1, 0] as [number, number], amount });
    if (open) {
      setRecords(loadRecords());
      sfx.play('open');
      gsap.timeline()
        .set(el, { autoAlpha: 1 })
        .fromTo(blocks, { scale: 0 }, { scale: 1.02, duration: 0.18, ease: 'steps(3)', stagger: stagger(0.38) })
        .fromTo(items, { autoAlpha: 0, x: -40 }, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'steps(4)', stagger: 0.05 }, '-=0.12');
      const btn = el.querySelector<HTMLButtonElement>('.menu-item.current button') ?? el.querySelector<HTMLButtonElement>('.menu-item button');
      const id = window.setTimeout(() => btn?.focus({ preventScroll: true }), 450);
      return () => window.clearTimeout(id);
    }
    sfx.play('close');
    const anim = el.querySelectorAll('.menu-anim, .c-anim');
    gsap.timeline()
      .to(anim, { autoAlpha: 0, x: 30, duration: 0.15, ease: 'steps(3)', stagger: 0.02 })
      .to(blocks, { scale: 0, duration: 0.15, ease: 'steps(3)', stagger: stagger(0.3) }, '-=0.05')
      .set(el, { autoAlpha: 0 })
      .add(() => setPage('list'));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // page switch (list <-> meet the creator): new page's pieces step in
  useLayoutEffect(() => {
    if (pageFirst.current) { pageFirst.current = false; return; }
    if (!open) return;
    const el = root.current!;
    const sel = page === 'creator' ? '.c-anim' : '.menu-anim';
    gsap.fromTo(el.querySelectorAll(sel), { autoAlpha: 0, x: page === 'creator' ? 40 : -40 }, { autoAlpha: 1, x: 0, duration: 0.28, ease: 'steps(4)', stagger: 0.045 });
    const focus = el.querySelector<HTMLElement>(page === 'creator' ? '.creator-back' : '.menu-item.creator-item button');
    focus?.focus({ preventScroll: true });
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to: Page) => {
    const el = root.current!;
    const sel = page === 'creator' ? '.c-anim' : '.menu-anim';
    sfx.play(to === 'creator' ? 'open' : 'close');
    gsap.to(el.querySelectorAll(sel), { autoAlpha: 0, x: to === 'creator' ? -30 : 30, duration: 0.14, ease: 'steps(3)', stagger: 0.015, onComplete: () => setPage(to) });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (page === 'creator') go('list'); else onClose(); return; }
      if (page === 'list' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault();
        const btns = Array.from(root.current!.querySelectorAll<HTMLButtonElement>('.menu-item button'));
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length;
        btns[n]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, page]); // eslint-disable-line react-hooks/exhaustive-deps

  const blocks = grid.cols * grid.rows;
  return (
    <div className={`menu page-${page}`} ref={root} aria-hidden={!open} role="dialog" aria-label="Game menu">
      <div className="menu-blocks" style={{ ['--cols' as string]: grid.cols, ['--rows' as string]: grid.rows }}>
        {Array.from({ length: blocks }, (_, i) => <i key={i} />)}
      </div>
      <div className="menu-panel">
        {page === 'list' ? (
          <>
            <div className="menu-head menu-anim"><span className="blink">&gt;</span> SELECT A GAME</div>
            <ul className="menu-list">
              {GAMES.map((g, i) => (
                <Item
                  key={g.id}
                  index={i + 1}
                  name={g.name}
                  current={g.id === current}
                  rec={recordLine(g.id, records)}
                  onSelect={() => onSelect(g.id)}
                  kind={g.id}
                />
              ))}
              <Item index={5} name="MEET THE CREATOR" current={false} rec="THE HUMAN BEHIND THE PIXELS" kind="creator" extra="creator-item" onSelect={() => go('creator')} />
            </ul>
            <div className="menu-foot menu-anim">
              <button type="button" className="pix-btn" onClick={onHome} onMouseEnter={() => sfx.play('blip')}>&lt; HOME</button>
              <button type="button" className="pix-btn" onClick={onToggleSound} aria-pressed={sound} onMouseEnter={() => sfx.play('blip')}>SOUND: {sound ? 'ON' : 'OFF'}</button>
              <button type="button" className="pix-btn" onClick={onToggleCrt} aria-pressed={crt} onMouseEnter={() => sfx.play('blip')}>CRT FX: {crt ? 'ON' : 'OFF'}</button>
              <span className="menu-hint">ESC TO CLOSE</span>
            </div>
          </>
        ) : (
          <CreatorPage onBack={() => go('list')} />
        )}
      </div>
    </div>
  );
}
