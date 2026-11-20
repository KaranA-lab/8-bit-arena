import { drawText } from './font';
import { rect } from './gfx';
import { C } from './util';

/** Bordered pixel panel used for title / game-over cards inside the games. */
export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string = C.violet) {
  x = Math.round(x); y = Math.round(y);
  rect(g, x + 2, y + 2, w, h, 'rgba(3,5,11,0.55)');
  rect(g, x, y, w, h, 'rgba(18,15,43,0.94)');
  rect(g, x, y, w, 1, accent);
  rect(g, x, y + h - 1, w, 1, accent);
  rect(g, x, y, 1, h, accent);
  rect(g, x + w - 1, y, 1, h, accent);
  rect(g, x + 2, y + 2, 3, 1, C.lavender);
  rect(g, x + 2, y + 2, 1, 3, C.lavender);
  rect(g, x + w - 5, y + h - 3, 3, 1, C.plum);
  rect(g, x + w - 3, y + h - 5, 1, 3, C.plum);
}

export function blinkText(g: CanvasRenderingContext2D, text: string, x: number, y: number, t: number, color: string = C.yellow) {
  if (Math.floor(t * 2.5) % 2 === 0) drawText(g, text, x, y, { color, align: 'center', outline: C.ink });
}

export function dim(g: CanvasRenderingContext2D, a = 0.45) {
  g.fillStyle = `rgba(3,5,11,${a})`;
  g.fillRect(0, 0, 320, 160);
}
