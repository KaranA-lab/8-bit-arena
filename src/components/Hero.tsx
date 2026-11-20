import { sfx } from '../lib/audio';

function Letters({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, wi, arr) => (
        <span className="w" key={wi}>
          {word.split('').map((c, i) => <span className="ch" key={i}>{c}</span>)}
          {wi < arr.length - 1 && <span className="ch sp">{' '}</span>}
        </span>
      ))}
    </>
  );
}

export function Hero({ onStart, disabled }: { onStart: () => void; disabled: boolean }) {
  return (
    <section className="hero" aria-label="Welcome">
      <h1 className="hero-title" aria-label="Welcome to the 8-bit arena.">
        <span className="line" aria-hidden><Letters text="WELCOME TO THE" /></span>
        <span className="line" aria-hidden><Letters text="8-BIT ARENA." /></span>
      </h1>
      <p className="hero-sub" aria-label="Big games. Tiny pixels. Zero pressure.">
        <span aria-hidden><Letters text="BIG GAMES. TINY PIXELS. ZERO PRESSURE." /></span>
      </p>
      <div className="btn-wrap">
        <button type="button" className="btn-start" onClick={onStart} disabled={disabled} onMouseEnter={() => sfx.play('blip')}>
          <span className="arrow" aria-hidden />
          START PLAYING
        </button>
      </div>
    </section>
  );
}
