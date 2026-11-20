// Tiny shared input context: lets games word their hints for touch vs mouse.
export const input = {
  touch: false,
  /** analog thumbstick on the phone handheld, -1..1 (x: left/right, y: up/down) */
  stickX: 0,
  stickY: 0,
};

export const tapWord = () => (input.touch ? 'TAP' : 'CLICK');

/** Fire a synthetic key event (used by the on-screen handheld buttons on phones). */
export function pressKey(code: string, down: boolean) {
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true }));
}
