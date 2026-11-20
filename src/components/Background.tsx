import { useEffect, useRef } from 'react';
import bgUrl from '../assets/bg-nebula.png';

const LEVELS = [5, 10, 20, 40, 80, 160, 0];

/** The Figma nebula background, drawn "cover" style. It un-pixelates in steps when revealed. */
export function Background({ reveal }: { reveal: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ level: 0, img: null as HTMLImageElement | null });

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d')!;

    const draw = () => {
      const img = state.current.img;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(window.innerWidth * dpr), ch = Math.round(window.innerHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      ctx.fillStyle = '#120F2B';
      ctx.fillRect(0, 0, cw, ch);
      if (!img) return;
      const sc = Math.max(cw / img.width, ch / img.height);
      const dw = img.width * sc, dh = img.height * sc;
      const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
      const lv = LEVELS[state.current.level];
      ctx.imageSmoothingEnabled = false;
      if (lv > 0) {
        small.width = lv;
        small.height = Math.max(1, Math.round((lv * img.height) / img.width));
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(img, 0, 0, small.width, small.height);
        ctx.drawImage(small, dx, dy, dw, dh);
      } else {
        ctx.drawImage(img, dx, dy, dw, dh);
      }
      // the Figma frame shows the nebula dimmed into the navy
      ctx.fillStyle = 'rgba(18,15,43,0.42)';
      ctx.fillRect(0, 0, cw, ch);
    };

    const img = new Image();
    img.onload = () => { state.current.img = img; draw(); };
    img.src = bgUrl;
    window.addEventListener('resize', draw);
    (canvas as unknown as { __draw: () => void }).__draw = draw;
    return () => window.removeEventListener('resize', draw);
  }, []);

  useEffect(() => {
    const canvas = ref.current as unknown as { __draw?: () => void };
    if (!reveal) return;
    let i = state.current.level;
    const id = window.setInterval(() => {
      i++;
      state.current.level = Math.min(i, LEVELS.length - 1);
      canvas.__draw?.();
      if (i >= LEVELS.length - 1) window.clearInterval(id);
    }, 120);
    return () => window.clearInterval(id);
  }, [reveal]);

  return (
    <div className="bg-layer" aria-hidden>
      <canvas ref={ref} className="bg-canvas" />
      {[
        [27.9, 8.9, 0], [29.2, 18.6, 1.2], [6.4, 74.9, 0.6], [89.7, 57, 2.1], [92.4, 63.3, 0.3], [92.4, 31.4, 1.6],
        [62, 14, 0.9], [44, 62, 2.6], [76, 82, 1.8], [15, 30, 3.1],
      ].map(([x, y, d], i) => (
        <span key={i} className={`twinkle ${i > 5 ? 'twinkle-sm' : ''}`} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}
