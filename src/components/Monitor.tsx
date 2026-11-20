import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { GameScreen } from './GameScreen';
import type { GameId } from '../lib/gfx';
import { sfx } from '../lib/audio';
import { input, pressKey } from '../lib/input';

interface Props {
  game: GameId;
  mounted: boolean;
  powered: boolean;
  active: boolean;
  sound: boolean;
  crt: boolean;
  resetKey: number;
  /** phones: render as a handheld console with on-screen controls */
  handheld: boolean;
  onToggleSound: () => void;
  onToggleCrt: () => void;
  onReset: () => void;
  onPower: () => void;
}

/** A touch button that holds a keyboard key down while pressed. */
function Pad({ code, className, label, children }: { code: string; className: string; label: string; children?: ReactNode }) {
  const held = useRef(false);
  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    if (held.current) return;
    held.current = true;
    sfx.unlock();
    navigator.vibrate?.(8);
    e.currentTarget.classList.add('is-down');
    pressKey(code, true);
  };
  const up = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!held.current) return;
    held.current = false;
    e.currentTarget.classList.remove('is-down');
    pressKey(code, false);
  };
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={up}
      onLostPointerCapture={up}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/** Analog thumbstick (phones, badminton): drag the knob; x moves, pushing up jumps. */
function Stick() {
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const active = useRef<number | null>(null);

  const set = (dx: number, dy: number) => {
    const R = (base.current?.clientWidth ?? 120) * 0.32;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    input.stickX = dx / R;
    input.stickY = dy / R;
    const s = 3; // move the knob on a 3px grid so it stays pixel-y
    if (knob.current) knob.current.style.transform = `translate(${Math.round(dx / s) * s}px, ${Math.round(dy / s) * s}px)`;
  };
  const fromEvent = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    set(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
  };
  const release = () => {
    active.current = null;
    set(0, 0);
    base.current?.classList.remove('is-down');
  };
  useEffect(() => release, []);

  return (
    <div
      ref={base}
      className="stick"
      role="slider"
      aria-label="Movement stick"
      aria-valuemin={-1}
      aria-valuemax={1}
      aria-valuenow={0}
      onPointerDown={(e) => {
        e.preventDefault();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        active.current = e.pointerId;
        sfx.unlock();
        navigator.vibrate?.(8);
        base.current?.classList.add('is-down');
        fromEvent(e);
      }}
      onPointerMove={(e) => { if (active.current === e.pointerId) fromEvent(e); }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
    >
      <i className="stick-groove h" />
      <i className="stick-groove v" />
      <span ref={knob} className="stick-knob" />
    </div>
  );
}

/**
 * Desktop: the retro PC from "Desktop - 2", built from the Figma rectangles at their exact positions.
 * Phones: the same screen inside a pocket console (zoomed in, with a D-pad and A/B buttons).
 */
export function Monitor(p: Props) {
  const inner = useRef<HTMLDivElement>(null);
  const resetLed = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    gsap.killTweensOf(el);
    if (p.powered) {
      sfx.play('power-on');
      gsap.timeline()
        .fromTo(el, { scaleX: 0, scaleY: 0.006, filter: 'brightness(6)' }, { scaleX: 1, duration: 0.16, ease: 'steps(4)' })
        .to(el, { scaleY: 1, duration: 0.22, ease: 'power3.out' })
        .to(el, { filter: 'brightness(1)', duration: 0.35, ease: 'steps(5)' }, '-=0.1');
    } else {
      gsap.timeline()
        .to(el, { scaleY: 0.006, filter: 'brightness(5)', duration: 0.16, ease: 'power2.in' })
        .to(el, { scaleX: 0, duration: 0.14, ease: 'steps(3)' });
    }
  }, [p.powered, p.handheld]);

  const flashReset = () => {
    p.onReset();
    const led = resetLed.current;
    if (led) { led.dataset.on = 'true'; window.setTimeout(() => { led.dataset.on = 'false'; }, 450); }
  };

  const screen = (
    <>
      <div className="screen-inner" ref={inner}>
        {p.mounted && <GameScreen gameId={p.game} active={p.active} resetKey={p.resetKey} />}
      </div>
      <div className="crt" aria-hidden />
      <div className="glass" aria-hidden />
    </>
  );

  if (p.handheld) {
    return (
      <div className={`monitor-pos handheld ${p.crt ? '' : 'crt-off'}`}>
        <div className="monitor-anim hh-body">
          <div className="hh-top">
            <span className="hh-led" data-on={p.powered} />
            <span>POWER</span>
            <span className="hh-model">POCKET ARENA</span>
          </div>
          <div className="hh-bezel">
            <div className="hh-screen">{screen}</div>
          </div>
          <div className="hh-brand">8-BIT<span>ARENA</span></div>
          <div className="hh-controls">
            {p.game === 'badminton' ? (
              <div className="stick-wrap">
                <Stick />
                <small>MOVE · PUSH UP TO JUMP</small>
              </div>
            ) : (
              <div className="dpad">
                <Pad code="ArrowUp" className="dp up" label="Up"><i /></Pad>
                <Pad code="ArrowLeft" className="dp left" label="Left"><i /></Pad>
                <Pad code="ArrowRight" className="dp right" label="Right"><i /></Pad>
                <Pad code="ArrowDown" className="dp down" label="Down"><i /></Pad>
                <span className="dp-mid" />
              </div>
            )}
            <div className="ab">
              <div className="ab-btn"><Pad code="KeyW" className="hh-btn b" label="B button">B</Pad><small>JUMP</small></div>
              <div className="ab-btn"><Pad code="Enter" className="hh-btn a" label="A button">A</Pad><small>ACTION</small></div>
            </div>
          </div>
          <div className="hh-keys">
            <button type="button" className="hh-key" aria-pressed={p.sound} onClick={p.onToggleSound}>SOUND</button>
            <button type="button" className="hh-key" aria-pressed={p.crt} onClick={p.onToggleCrt}>CRT</button>
            <button type="button" className="hh-key" onClick={flashReset}>RESET</button>
            <button type="button" className="hh-key home" onClick={p.onPower}>HOME</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`monitor-pos ${p.crt ? '' : 'crt-off'}`}>
      <div className="monitor-anim">
        <i className="m r14" />
        <i className="m r13" />
        <i className="m r11" />
        <i className="m r10" />
        <i className="m r9" />
        <i className="m r8" />
        <div className="m screen">{screen}</div>
        <i className="m r12" />
        <div className="m leds">
          <button type="button" className="led-pair" style={{ left: 0 }} data-on={p.sound} onClick={p.onToggleSound} data-tip={`SOUND ${p.sound ? 'ON' : 'OFF'}`} aria-label="Toggle sound">
            <span className="led" /><span className="key" />
          </button>
          <button type="button" className="led-pair" style={{ left: 69 }} data-on={p.crt} onClick={p.onToggleCrt} data-tip={`CRT FX ${p.crt ? 'ON' : 'OFF'}`} aria-label="Toggle CRT effect">
            <span className="led" /><span className="key" />
          </button>
          <button type="button" ref={resetLed} className="led-pair amber" style={{ left: 138 }} data-on="false" onClick={flashReset} data-tip="RESTART GAME" aria-label="Restart game">
            <span className="led" /><span className="key" />
          </button>
          <button type="button" className="power" onClick={p.onPower} data-tip="POWER OFF / HOME" aria-label="Power off and go home">
            <span />
          </button>
        </div>
      </div>
    </div>
  );
}
