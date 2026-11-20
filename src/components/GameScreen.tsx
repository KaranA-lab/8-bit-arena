import { useEffect, useRef } from 'react';
import { W, H, type Game, type GameId } from '../lib/gfx';
import { drawText } from '../lib/font';
import { sfx } from '../lib/audio';
import { C } from '../lib/util';
import { Cricket } from '../games/cricket';
import { Football } from '../games/football';
import { Golf } from '../games/golf';
import { Badminton } from '../games/badminton';

const FACTORY: Record<GameId, () => Game> = {
  cricket: () => new Cricket(),
  football: () => new Football(),
  golf: () => new Golf(),
  badminton: () => new Badminton(),
};
const CHANNEL: Record<GameId, string> = { cricket: '01', football: '02', golf: '03', badminton: '04' };

interface Props {
  gameId: GameId;
  /** true when the player can interact (arcade visible, menu closed) */
  active: boolean;
  /** bump to restart the current game */
  resetKey: number;
}

/**
 * Runs a game at 320x160 in an offscreen buffer, then scales it up by an integer factor
 * into the visible canvas. The browser's smooth downscale to the CSS size gives even,
 * crisp "sharp-bilinear" pixels at any monitor size.
 */
export function GameScreen({ gameId, active, resetKey }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ gameId, active, resetKey });
  live.current = { gameId, active, resetKey };

  useEffect(() => {
    const canvas = ref.current!;
    const out = canvas.getContext('2d')!;
    const buf = document.createElement('canvas');
    buf.width = W; buf.height = H;
    const g = buf.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    const noise = g.createImageData(W, H);

    let game: Game | null = null;
    let curId: GameId | null = null;
    let curReset = live.current.resetKey;
    let staticT = 0;
    let raf = 0;
    let last = performance.now();
    let k = 4;
    let lastCursor = '';

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      k = Math.max(1, Math.min(8, Math.ceil((r.width * dpr) / W)));
      if (canvas.width !== W * k) { canvas.width = W * k; canvas.height = H * k; }
      out.imageSmoothingEnabled = false;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
    };
    const onDown = (e: PointerEvent) => {
      if (!live.current.active || !game || staticT > 0) return;
      sfx.unlock();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      const [x, y] = local(e);
      game.pointerMove?.(x, y);
      game.pointerDown?.(x, y, e.button);
      e.preventDefault();
    };
    const onMove = (e: PointerEvent) => { if (game && live.current.active) { const [x, y] = local(e); game.pointerMove?.(x, y); } };
    const onUp = (e: PointerEvent) => { if (game && live.current.active) { const [x, y] = local(e); game.pointerUp?.(x, y); } };
    const onKeyDown = (e: KeyboardEvent) => {
      if (!live.current.active || !game || staticT > 0) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      sfx.unlock();
      game.keyDown?.(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => { game?.keyUp?.(e.code); };
    const onBlur = () => { game?.keyUp?.('KeyA'); game?.keyUp?.('KeyD'); game?.keyUp?.('ArrowLeft'); game?.keyUp?.('ArrowRight'); };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    const drawStatic = (t: number) => {
      const d = noise.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() < 0.5 ? 20 + Math.random() * 40 : 120 + Math.random() * 135;
        d[i] = v * 0.9; d[i + 1] = v * 0.85; d[i + 2] = v; d[i + 3] = 255;
      }
      g.putImageData(noise, 0, 0);
      const band = Math.floor((t * 400) % H);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, band, W, 6);
      if (curId) {
        drawText(g, `CH ${CHANNEL[curId]}`, W - 8, 8, { color: C.green, scale: 2, align: 'right', outline: C.ink });
      }
    };

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const L = live.current;

      if (L.gameId !== curId) {
        game?.destroy?.();
        game = null;
        curId = L.gameId;
        staticT = 0.45;
        sfx.play('static');
      } else if (L.resetKey !== curReset) {
        curReset = L.resetKey;
        game?.destroy?.();
        game = null;
        staticT = 0.2;
        sfx.play('static');
      }

      if (staticT > 0) {
        staticT -= dt;
        drawStatic(now / 1000);
        if (staticT <= 0 && curId) {
          game = FACTORY[curId]();
          if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
        }
      } else if (game) {
        if (L.active) game.update(dt);
        game.draw(g);
        const cur = L.active ? game.cursor?.() ?? 'pointer' : 'default';
        if (cur !== lastCursor) { canvas.style.cursor = cur; lastCursor = cur; }
      }
      out.drawImage(buf, 0, 0, W * k, H * k);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      game?.destroy?.();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  return <canvas ref={ref} className="game-canvas" aria-label={`${gameId} game screen`} tabIndex={0} />;
}
