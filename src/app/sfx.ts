// Synthesized sound (Web Audio, no files — nothing to license). Created on the start click
// (browsers only allow audio after a user gesture).
//
// Layers:
//  - ambience: lapping water, light wind, and birds now and then (quiet bed under everything)
//  - events: cast whoosh + line peeling off the spool, plop, nibble ticks, bite gulp + chime,
//    hook-set swish, reel clicks, splash warning, drag scream on a run, rod creak under tension,
//    the fish splashing close in, catch splash + flops + fanfare (bigger for 월척), snap, miss
//  - UI: soft clicks on buttons
// The drag "지이익" is how anglers know the fish is taking line — the most important cue.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private amb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drag: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private reelAcc = 0;
  private creakAcc = 0;
  muted = false;

  start(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // no audio — the game still works
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  // ---------------------------------------------------------------- building blocks

  private noiseBurst(dur: number, freq: number, q: number, vol: number, delay = 0, endFreq = freq * 0.4, type: BiquadFilterType = 'bandpass'): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loopStart = Math.random();
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, glide = 1, out: AudioNode | null = this.master): void {
    const c = this.ctx;
    if (!c || !out) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** A drop into water: pitched "bloop" + splash noise. size 0–1. */
  private drop(size: number, vol: number, delay = 0): void {
    this.tone(700 - size * 450, 0.08 + size * 0.1, vol * 0.8, 'sine', delay, 0.45);
    this.noiseBurst(0.15 + size * 0.35, 1400 - size * 700, 0.9, vol * 0.7, delay + 0.015);
  }

  // ---------------------------------------------------------------- ambience

  private startAmbience(): void {
    const c = this.ctx!;
    this.amb = c.createGain();
    this.amb.gain.value = 0.55;
    this.amb.connect(this.master!);
    const loop = (freq: number, q: number, vol: number, lfoHz: number, lfoDepth: number, type: BiquadFilterType) => {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = vol;
      const lfo = c.createOscillator();
      lfo.frequency.value = lfoHz;
      const lg = c.createGain();
      lg.gain.value = lfoDepth;
      lfo.connect(lg).connect(g.gain);
      src.connect(f).connect(g).connect(this.amb!);
      src.start();
      lfo.start();
    };
    loop(450, 0.7, 0.05, 0.35, 0.035, 'lowpass'); // water lapping against the deck posts
    loop(900, 0.4, 0.018, 0.07, 0.014, 'bandpass'); // wind
    this.scheduleBird();
  }

  private scheduleBird(): void {
    window.setTimeout(() => {
      this.bird();
      this.scheduleBird();
    }, 4000 + Math.random() * 9000);
  }

  private bird(): void {
    if (!this.amb) return;
    const base = 2600 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const up = Math.random() < 0.5;
      this.tone(base * (up ? 0.85 : 1.15), 0.07 + Math.random() * 0.06, 0.035, 'sine', i * (0.11 + Math.random() * 0.08), up ? 1.3 : 0.75, this.amb);
    }
  }

  // ---------------------------------------------------------------- UI

  click(): void {
    this.tone(1100, 0.04, 0.05, 'sine', 0, 0.8);
  }
  pick(): void {
    this.tone(660, 0.07, 0.07, 'triangle', 0, 1.2);
    this.tone(990, 0.09, 0.05, 'triangle', 0.05, 1.1);
  }

  // ---------------------------------------------------------------- casting & waiting

  /** Rod swish, then line peeling off the spool for the flight time. */
  cast(flightS: number): void {
    this.noiseBurst(0.3, 2600, 0.7, 0.28, 0, 700);
    this.noiseBurst(flightS, 5200, 3, 0.07, 0.12, 1800, 'bandpass');
  }
  plop(): void {
    this.drop(0.35, 0.3);
  }
  nibble(): void {
    this.tone(820, 0.04, 0.1, 'sine', 0, 0.7);
    this.drop(0.05, 0.08, 0.03);
  }
  /** The real bite: the float goes — a gulp in the water and a bright chime so it's heard, not only seen. */
  bite(): void {
    this.drop(0.6, 0.3);
    this.tone(1318, 0.18, 0.09, 'triangle', 0.02);
    this.tone(1760, 0.25, 0.08, 'triangle', 0.1);
  }
  /** Last second of the bite window. */
  hurry(): void {
    this.tone(1500, 0.05, 0.05, 'square', 0, 1);
  }
  hook(): void {
    this.noiseBurst(0.22, 3000, 0.7, 0.25, 0, 800);
    this.tone(160, 0.25, 0.22, 'triangle', 0.03, 0.6);
    this.drop(0.5, 0.18, 0.08);
  }

  // ---------------------------------------------------------------- the fight

  /** Reel clicks at the reel rate (turns/s); call every frame with dt in s. */
  reel(rate: number, dt: number): void {
    if (!this.ctx || rate <= 0) return;
    this.reelAcc += rate * 3 * dt; // ~3 clicks per turn
    while (this.reelAcc >= 1) {
      this.reelAcc -= 1;
      this.tone(2200 + Math.random() * 300, 0.018, 0.045, 'square');
    }
  }

  /** The fish is about to run: it thrashes at the surface. */
  splash(): void {
    this.noiseBurst(0.5, 1300, 0.6, 0.35);
    this.noiseBurst(0.4, 600, 0.8, 0.25, 0.1);
    this.drop(0.7, 0.2, 0.05);
  }

  /** Small splash when the hooked fish comes close. */
  nearSplash(): void {
    this.noiseBurst(0.25 + Math.random() * 0.2, 1500, 0.8, 0.18);
  }

  /** The drag screaming while the fish runs. */
  setDrag(on: boolean): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    if (on && !this.drag) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 6;
      const lfo = c.createOscillator();
      lfo.frequency.value = 38;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 900;
      lfo.connect(lfoGain).connect(f.frequency);
      lfo.start();
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 0.08);
      src.connect(f).connect(gain).connect(this.master);
      src.start();
      src.onended = () => lfo.stop();
      this.drag = { src, gain };
    } else if (!on && this.drag) {
      const { src, gain } = this.drag;
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.15);
      src.stop(c.currentTime + 0.16);
      this.drag = null;
    }
  }

  /** Rod creaking and a warning beep as line tension climbs; call every frame. */
  tension(t: number, dt: number): void {
    if (!this.ctx || t < 0.35) return;
    this.creakAcc += (1 + t * 6) * dt;
    if (this.creakAcc >= 1) {
      this.creakAcc = 0;
      this.noiseBurst(0.12, 240 + t * 200, 8, 0.12 * t, 0, 160);
      if (t >= 0.75) this.tone(1900, 0.06, 0.07, 'square');
    }
  }

  snap(): void {
    this.tone(1600, 0.08, 0.3, 'square', 0, 0.3);
    this.noiseBurst(0.15, 3000, 2, 0.2);
    this.tone(90, 0.4, 0.15, 'sine', 0.05, 0.7);
  }
  miss(): void {
    this.tone(330, 0.25, 0.14, 'sine', 0, 0.8);
    this.tone(247, 0.35, 0.14, 'sine', 0.18, 0.9);
  }

  /** Lifted out of the water: splash, flops on the deck, fanfare (longer for a trophy). */
  caught(trophy: boolean): void {
    this.noiseBurst(0.6, 1100, 0.6, 0.35);
    for (let i = 0; i < 4; i++) this.noiseBurst(0.07, 500 + Math.random() * 300, 1.5, 0.18, 0.55 + i * (0.16 + Math.random() * 0.1), 200);
    const notes = trophy ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.45, 0.13, 'triangle', 0.3 + i * 0.09));
    if (trophy) this.tone(2093, 0.9, 0.08, 'sine', 0.3 + notes.length * 0.09);
  }
}
