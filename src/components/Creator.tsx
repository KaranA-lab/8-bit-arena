import { useEffect, useRef, useState } from 'react';
import creatorUrl from '../assets/creator.jpg';
import { sfx } from '../lib/audio';

// ---- edit the copy here ----
const RESUME = `${import.meta.env.BASE_URL}Karan-Anilkumar-Resume.pdf`;
const LINKS = [
  { label: 'PORTFOLIO', href: 'https://karananilkumar.in' },
  { label: 'LINKEDIN', href: 'https://www.linkedin.com/in/karan-anilkumar' },
];
const LEVELS_CLEARED = [
  { when: '2023-26', what: 'Senior Product Designer', where: 'Kyros Tecsol' },
  { when: '2022-23', what: 'Senior UX/UI Designer', where: 'Deepsense Digital Solutions' },
  { when: '2023-25', what: 'MSc International Business Management, Distinction', where: 'London Met' },
  { when: '2018-21', what: 'BSc Visual Communication', where: 'Loyola College, Chennai' },
];
const INVENTORY = ['Figma', 'ProtoPie', 'Framer', 'Design systems', 'User research', 'Usability testing', 'Accessibility (WCAG 2.1)', 'Workshops'];

const STEPS = [34, 56, 96, 170, 0]; // avatar resolution steps, 0 = the real photo

/** Pixel-art portrait that "de-pixelates" into the real photo on hover / tap. */
function Avatar() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [sharp, setSharp] = useState(false);
  const api = useRef<{ go: (to: number) => void } | null>(null);

  useEffect(() => {
    const c = ref.current!;
    const g = c.getContext('2d')!;
    const small = document.createElement('canvas');
    const sg = small.getContext('2d', { willReadFrequently: true })!;
    const img = new Image();
    let level = 0;
    let timer = 0;

    const draw = () => {
      if (!img.complete || !img.naturalWidth) return;
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      g.imageSmoothingEnabled = false;
      const lv = STEPS[level];
      if (!lv) { g.drawImage(img, 0, 0); return; }
      small.width = lv;
      small.height = Math.round((lv * img.naturalHeight) / img.naturalWidth);
      sg.imageSmoothingEnabled = true;
      sg.drawImage(img, 0, 0, small.width, small.height);
      if (level === 0) {
        // crunch the colours down to an 8-bit-ish palette for the resting state
        const d = sg.getImageData(0, 0, small.width, small.height);
        for (let i = 0; i < d.data.length; i += 4) {
          for (let k = 0; k < 3; k++) {
            const v = Math.min(255, d.data[i + k] * 1.12);
            d.data[i + k] = Math.round((v / 255) * 5) * 51;
          }
        }
        sg.putImageData(d, 0, 0);
      }
      g.drawImage(small, 0, 0, c.width, c.height);
    };

    api.current = {
      go(to: number) {
        window.clearInterval(timer);
        timer = window.setInterval(() => {
          if (level === to) { window.clearInterval(timer); return; }
          level += level < to ? 1 : -1;
          sfx.play('type');
          draw();
        }, 85);
      },
    };
    img.onload = draw;
    img.src = creatorUrl;
    return () => window.clearInterval(timer);
  }, []);

  const toggle = (on: boolean) => { setSharp(on); api.current?.go(on ? STEPS.length - 1 : 0); };

  return (
    <button
      type="button"
      className="avatar"
      onMouseEnter={() => toggle(true)}
      onMouseLeave={() => toggle(false)}
      onFocus={() => toggle(true)}
      onBlur={() => toggle(false)}
      onClick={() => toggle(!sharp)}
      aria-label="Photo of Karan. Hover or tap to de-pixelate"
    >
      <canvas ref={ref} />
      <span className="avatar-hint">{sharp ? 'HELLO!' : 'HOVER TO DE-PIXEL'}</span>
    </button>
  );
}

export function CreatorPage({ onBack }: { onBack: () => void }) {
  return (
    <section className="creator" aria-label="Meet the creator">
      <button type="button" className="pix-btn creator-back c-anim" onClick={onBack} onMouseEnter={() => sfx.play('blip')}>
        &lt; BACK
      </button>
      <div className="creator-grid">
        <figure className="creator-card c-anim">
          <span className="card-tag">PLAYER 1</span>
          <Avatar />
          <figcaption>
            <strong>KARAN ANILKUMAR</strong>
            <span>PRODUCT DESIGNER · UX/UI</span>
          </figcaption>
          <dl className="card-stats">
            <div><dt>XP</dt><dd>4+ YEARS</dd></div>
            <div><dt>BASE</dt><dd>CHENNAI, IN</dd></div>
            <div><dt>SPECIAL</dt><dd>DESIGN SYSTEMS</dd></div>
          </dl>
          <div className="creator-actions">
            <a className="pix-btn pix-primary" href={RESUME} download onClick={() => sfx.play('select')}>
              DOWNLOAD RESUME
            </a>
            {LINKS.map((l) => (
              <a key={l.label} className="pix-btn" href={l.href} target="_blank" rel="noopener noreferrer" onMouseEnter={() => sfx.play('blip')}>
                {l.label}
              </a>
            ))}
          </div>
        </figure>

        <div className="creator-copy">
          <h3 className="c-anim">MEET THE CREATOR</h3>
          <p className="c-anim">
            Hi, I&apos;m Karan, a product and UX/UI designer with 4+ years of designing user-centred products across SaaS,
            eCommerce, healthcare and mobile-first platforms. Most recently I was a Senior Product Designer at Kyros Tecsol,
            leading design for AI-powered web and mobile products.
          </p>
          <h4 className="c-anim"><span>&gt;</span> HOW THIS STARTED</h4>
          <p className="c-anim">
            8-Bit Arena began as a Figma experiment: could a whole sports arcade live inside one hero section? I wanted
            the feeling of early-2000s games on old PCs and phones (tiny pixels, chiptune beeps, zero pressure),
            so I designed every screen in Figma and then brought it to life in code.
          </p>
          <h4 className="c-anim"><span>&gt;</span> LEVELS CLEARED</h4>
          <ul className="levels c-anim">
            {LEVELS_CLEARED.map((l) => (
              <li key={l.what}><b>{l.when}</b><span>{l.what}</span><em>{l.where}</em></li>
            ))}
          </ul>
          <h4 className="c-anim"><span>&gt;</span> INVENTORY</h4>
          <ul className="chips c-anim">
            {INVENTORY.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
