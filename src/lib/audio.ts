// Chiptune-ish sound effects synthesised with WebAudio (no audio files needed).
type Wave = OscillatorType;

interface ToneOpts { type?: Wave; vol?: number; slide?: number; delay?: number; attack?: number }
interface NoiseOpts { vol?: number; freq?: number; slide?: number; q?: number; delay?: number; filter?: BiquadFilterType; attack?: number }

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private lastPlay: Record<string, number> = {};
  private crowdBuf: AudioBuffer | null = null;
  private crowd: { sources: AudioScheduledSourceNode[]; out: GainNode } | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('arena.muted') === '1';
    } catch { /* storage blocked */ }
  }

  /** Must be called from a user gesture before anything is audible. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.6;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('arena.muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}) {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type ?? 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
    const v = o.vol ?? 0.12;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + (o.attack ?? 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, o: NoiseOpts = {}) {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = o.filter ?? 'bandpass';
    filt.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.slide) filt.frequency.exponentialRampToValueAtTime(o.slide, t0 + dur);
    filt.Q.value = o.q ?? 1;
    const gain = ctx.createGain();
    const v = o.vol ?? 0.2;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(v, t0 + (o.attack ?? 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt).connect(gain).connect(master);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  // ---------- stadium crowd bed (cricket + football) ----------
  /** Smooth "brown" noise, 4s long, with a crossfaded loop point so it never clicks. */
  private makeCrowdBuffer(ctx: AudioContext) {
    const len = ctx.sampleRate * 4;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const fade = Math.floor(ctx.sampleRate * 0.25);
    for (let i = 0; i < fade; i++) { const k = i / fade; d[len - fade + i] = d[len - fade + i] * (1 - k) + d[i] * k; }
    return b;
  }

  /** Quiet background murmur of a crowd, with slow swells. Safe to call repeatedly. */
  startCrowd(level = 0.012) {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || this.crowd || !this.noiseBuf) return;
    if (!this.crowdBuf) this.crowdBuf = this.makeCrowdBuffer(ctx);
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(1, now + 2);
    out.connect(master);
    // low rumble of thousands of voices
    const rumble = ctx.createBufferSource();
    rumble.buffer = this.crowdBuf; rumble.loop = true;
    const rbp = ctx.createBiquadFilter(); rbp.type = 'bandpass'; rbp.frequency.value = 480; rbp.Q.value = 0.55;
    const rg = ctx.createGain(); rg.gain.value = level;
    rumble.connect(rbp).connect(rg).connect(out);
    // a thin layer of chatter on top
    const chatter = ctx.createBufferSource();
    chatter.buffer = this.noiseBuf; chatter.loop = true;
    const cbp = ctx.createBiquadFilter(); cbp.type = 'bandpass'; cbp.frequency.value = 1300; cbp.Q.value = 1.1;
    const cg = ctx.createGain(); cg.gain.value = level * 0.06;
    chatter.connect(cbp).connect(cg).connect(out);
    // slow swells, like a stadium breathing
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
    const lfoAmt = ctx.createGain(); lfoAmt.gain.value = level * 0.35;
    lfo.connect(lfoAmt).connect(rg.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.23;
    const lfo2Amt = ctx.createGain(); lfo2Amt.gain.value = level * 0.025;
    lfo2.connect(lfo2Amt).connect(cg.gain);
    const sources = [rumble, chatter, lfo, lfo2];
    sources.forEach((s) => s.start(now, s instanceof AudioBufferSourceNode ? Math.random() * 3 : 0));
    this.crowd = { sources, out };
  }

  stopCrowd() {
    const ctx = this.ctx, c = this.crowd;
    if (!ctx || !c) return;
    this.crowd = null;
    const now = ctx.currentTime;
    c.out.gain.cancelScheduledValues(now);
    c.out.gain.setTargetAtTime(0.0001, now, 0.2);
    c.sources.forEach((s) => { try { s.stop(now + 1); } catch { /* already stopped */ } });
  }

  /**
   * Stadium roar for a boundary: a swell of voices (wobbling like thousands of people
   * shouting), scattered applause, and on big moments a couple of whistles. The background
   * crowd bed swells with it. intensity: ~0.7 for a four, 1 for a six.
   */
  roar(intensity = 1) {
    const ctx = this.ctx, master = this.master;
    if (!ctx || !master || !this.noiseBuf || this.muted) return;
    if (!this.crowdBuf) this.crowdBuf = this.makeCrowdBuffer(ctx);
    const t0 = ctx.currentTime;
    const dur = 1.6 + intensity * 1.3;
    const voices = (buf: AudioBuffer, freq: number, q: number, peak: number, wobbleHz: number) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t0);
      env.gain.exponentialRampToValueAtTime(peak, t0 + 0.3);
      env.gain.setValueAtTime(peak, t0 + dur * 0.45);
      env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      const wob = ctx.createGain(); wob.gain.value = 1;
      const lfo = ctx.createOscillator(); lfo.frequency.value = wobbleHz;
      const depth = ctx.createGain(); depth.gain.value = 0.28;
      lfo.connect(depth).connect(wob.gain);
      src.connect(f).connect(env).connect(wob).connect(master);
      src.start(t0, Math.random() * 2); src.stop(t0 + dur + 0.1);
      lfo.start(t0); lfo.stop(t0 + dur + 0.1);
    };
    voices(this.crowdBuf, 620, 0.5, 0.11 * intensity, 5.3);  // the big "ohhh / yeahhh"
    voices(this.noiseBuf, 1450, 0.9, 0.05 * intensity, 8.7); // brighter shouting on top
    // applause: lots of little claps scattered through the roar
    const claps = Math.round(12 + 16 * intensity);
    for (let i = 0; i < claps; i++) {
      this.noise(0.03, { vol: 0.035 * intensity, freq: 1800 + Math.random() * 1800, q: 1.3, delay: 0.12 + Math.random() * dur * 0.75, attack: 0.002 });
    }
    // a couple of fans whistling for the big ones
    if (intensity > 0.85) {
      for (let i = 0; i < 2; i++) {
        const at = t0 + 0.25 + Math.random() * 0.9;
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2400 + Math.random() * 500;
        const vib = ctx.createOscillator(); vib.frequency.value = 13; const vibAmt = ctx.createGain(); vibAmt.gain.value = 90;
        vib.connect(vibAmt).connect(o.frequency);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.03, at + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.45);
        o.connect(g).connect(master);
        o.start(at); o.stop(at + 0.5); vib.start(at); vib.stop(at + 0.5);
      }
    }
    // the background crowd swells up with it, then settles
    const c = this.crowd;
    if (c) {
      c.out.gain.cancelScheduledValues(t0);
      c.out.gain.setTargetAtTime(1 + 1.6 * intensity, t0, 0.12);
      c.out.gain.setTargetAtTime(1, t0 + dur * 0.6, 0.7);
    }
  }

  /** Lower the crowd while the menu is open / the game is paused. */
  duckCrowd(duck: boolean) {
    const ctx = this.ctx, c = this.crowd;
    if (!ctx || !c) return;
    c.out.gain.cancelScheduledValues(ctx.currentTime);
    c.out.gain.setTargetAtTime(duck ? 0.25 : 1, ctx.currentTime, 0.25);
  }

  private arp(notes: number[], step: number, o: ToneOpts = {}) {
    notes.forEach((n, i) => this.tone(n, step * 1.6, { ...o, delay: (o.delay ?? 0) + i * step }));
  }

  play(name: SoundName) {
    if (!this.ctx || this.muted) return;
    // throttle rapid repeats of the same sound
    const now = performance.now();
    const min = name === 'type' || name === 'blip' ? 30 : 15;
    if (now - (this.lastPlay[name] ?? 0) < min) return;
    this.lastPlay[name] = now;

    switch (name) {
      case 'blip': this.tone(880, 0.05, { vol: 0.05 }); break;
      case 'type': this.tone(1100 + Math.random() * 250, 0.02, { type: 'triangle', vol: 0.03 }); break;
      case 'select': this.tone(660, 0.06, { vol: 0.08 }); this.tone(990, 0.1, { vol: 0.08, delay: 0.06 }); break;
      case 'open': this.arp([440, 660, 880], 0.045, { vol: 0.07 }); break;
      case 'close': this.arp([880, 660, 440], 0.045, { vol: 0.07 }); break;
      case 'chime':
        // soft startup chord: triangle waves instead of square, gentler attack, about a third as loud
        [261.6, 329.6, 392, 523.3].forEach((f) => this.tone(f, 1.6, { type: 'triangle', vol: 0.035, attack: 0.04 }));
        this.tone(130.8, 1.6, { type: 'triangle', vol: 0.05, attack: 0.04 });
        this.tone(1046.5, 0.8, { type: 'sine', vol: 0.015, delay: 0.05, attack: 0.03 });
        break;
      case 'static': this.noise(0.35, { vol: 0.08, filter: 'highpass', freq: 2000 }); break;
      case 'power-on': this.tone(60, 0.25, { type: 'triangle', vol: 0.05, slide: 900 }); this.noise(0.25, { vol: 0.025, freq: 3000 }); break;
      case 'power-off': this.tone(900, 0.3, { type: 'triangle', vol: 0.04, slide: 40 }); break;
      case 'bat':
        // willow-on-leather "tock": a sharp click plus two short wooden resonances
        this.noise(0.018, { vol: 0.5, freq: 3200, q: 1.2 });
        this.tone(1180, 0.07, { type: 'sine', vol: 0.32, slide: 1020, attack: 0.002 });
        this.tone(690, 0.11, { type: 'triangle', vol: 0.3, slide: 610, attack: 0.002 });
        this.tone(2450, 0.035, { type: 'sine', vol: 0.09, attack: 0.001 });
        this.tone(170, 0.06, { type: 'sine', vol: 0.18, slide: 120, attack: 0.002 });
        break;
      case 'swing': this.noise(0.12, { vol: 0.12, freq: 2600, slide: 700, q: 1.5 }); break;
      case 'bounce': this.tone(170, 0.05, { type: 'triangle', vol: 0.2 }); break;
      case 'stumps': this.noise(0.15, { vol: 0.35, freq: 900, q: 3 }); this.tone(520, 0.12, { vol: 0.1, slide: 260 }); break;
      case 'cheer':
        this.noise(1.6, { vol: 0.16, freq: 1100, q: 0.7, attack: 0.25 });
        this.noise(1.2, { vol: 0.06, freq: 2400, q: 1.5, attack: 0.2, delay: 0.1 });
        break;
      case 'groan': this.noise(0.9, { vol: 0.09, freq: 500, slide: 250, q: 0.8, attack: 0.15 }); break;
      case 'six': this.arp([523, 659, 784, 1046, 1318], 0.07, { vol: 0.08 }); break;
      case 'four': this.arp([523, 784, 1046], 0.07, { vol: 0.08 }); break;
      case 'run': this.tone(740, 0.06, { vol: 0.07 }); break;
      case 'out': this.tone(440, 0.45, { type: 'sawtooth', vol: 0.08, slide: 90 }); break;
      case 'whistle':
        this.tone(2150, 0.12, { type: 'sine', vol: 0.12 });
        this.tone(2150, 0.32, { type: 'sine', vol: 0.12, delay: 0.16 });
        this.tone(2300, 0.32, { type: 'sine', vol: 0.04, delay: 0.16 });
        break;
      case 'kick': this.noise(0.06, { vol: 0.5, freq: 600, filter: 'lowpass' }); this.tone(110, 0.12, { type: 'sine', vol: 0.35, slide: 45 }); break;
      case 'goal': this.arp([523, 659, 784, 1046], 0.09, { vol: 0.09 }); this.tone(1046, 0.5, { vol: 0.07, delay: 0.36 }); break;
      case 'save': this.noise(0.1, { vol: 0.35, freq: 700 }); this.tone(300, 0.15, { vol: 0.1, slide: 140 }); break;
      case 'post': this.tone(1500, 0.35, { type: 'triangle', vol: 0.12, slide: 1400 }); this.tone(2250, 0.3, { type: 'sine', vol: 0.05 }); break;
      case 'putt': this.tone(1400, 0.03, { type: 'triangle', vol: 0.14 }); this.noise(0.03, { vol: 0.1, freq: 4000, filter: 'highpass' }); break;
      case 'wall': this.tone(320, 0.035, { vol: 0.07 }); break;
      case 'sink': this.tone(240, 0.08, { type: 'triangle', vol: 0.2, slide: 90 }); this.arp([784, 988, 1175, 1568], 0.06, { vol: 0.07, delay: 0.12 }); break;
      case 'splash': this.noise(0.5, { vol: 0.25, freq: 2500, slide: 300, filter: 'lowpass' }); break;
      case 'smash':
        // harder string crack + body thump + feathers ripping through the air
        this.noise(0.03, { vol: 0.65, freq: 5200, q: 0.9, filter: 'bandpass', attack: 0.001 });
        this.tone(2100, 0.09, { type: 'sine', vol: 0.2, slide: 1500, attack: 0.001 });
        this.tone(320, 0.08, { type: 'sine', vol: 0.22, slide: 140, attack: 0.002 });
        this.noise(0.22, { vol: 0.08, freq: 1600, slide: 500, q: 1.2, delay: 0.02, attack: 0.02 });
        break;
      case 'shuttle':
        // taut strings flicking the cork: bright "tik" with a short string ping, then a soft swish
        this.noise(0.022, { vol: 0.45, freq: 5600, q: 0.8, attack: 0.001 });
        this.tone(1950, 0.07, { type: 'sine', vol: 0.16, slide: 1550, attack: 0.001 });
        this.tone(3900, 0.035, { type: 'sine', vol: 0.06, attack: 0.001 });
        this.noise(0.14, { vol: 0.04, freq: 1300, slide: 450, q: 1.1, delay: 0.02, attack: 0.02 });
        break;
      case 'point': this.tone(988, 0.07, { vol: 0.08 }); this.tone(1318, 0.12, { vol: 0.08, delay: 0.07 }); break;
      case 'lose-point': this.tone(392, 0.1, { vol: 0.08 }); this.tone(262, 0.18, { vol: 0.08, delay: 0.1 }); break;
      case 'win': this.arp([523, 659, 784, 659, 784, 1046], 0.11, { vol: 0.08 }); break;
      case 'lose': this.arp([392, 330, 262, 196], 0.16, { type: 'triangle', vol: 0.16 }); break;
      case 'jump': this.tone(300, 0.12, { vol: 0.06, slide: 700 }); break;
      // knees skidding across the turf
      case 'slide': this.noise(0.5, { vol: 0.1, freq: 1600, slide: 380, q: 0.6, attack: 0.02 }); break;
    }
  }
}

export type SoundName =
  | 'blip' | 'type' | 'select' | 'open' | 'close' | 'chime' | 'static' | 'power-on' | 'power-off'
  | 'bat' | 'swing' | 'bounce' | 'stumps' | 'cheer' | 'groan' | 'six' | 'four' | 'run' | 'out'
  | 'whistle' | 'kick' | 'goal' | 'save' | 'post'
  | 'putt' | 'wall' | 'sink' | 'splash'
  | 'smash' | 'shuttle' | 'point' | 'lose-point' | 'win' | 'lose' | 'jump' | 'slide';

export const sfx = new Sfx();
