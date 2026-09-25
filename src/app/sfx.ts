// Small synthesized sound set (Web Audio, no files). The fish run needs sound most: the drag
// "지이익" is how anglers know the fish is taking line. Created on the start click (browsers only
// allow audio after a user gesture).

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drag: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private reelAcc = 0;
  muted = false;

  start(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // no audio — the game still works
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  private noiseBurst(dur: number, freq: number, q: number, vol: number, delay = 0): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.master) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(freq * 0.4, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, glide = 1): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  whoosh(): void {
    this.noiseBurst(0.35, 1800, 0.8, 0.25);
  }
  plop(): void {
    this.tone(420, 0.12, 0.25, 'sine', 0, 0.45);
    this.noiseBurst(0.25, 900, 1.2, 0.18, 0.02);
  }
  tick(): void {
    this.tone(760, 0.05, 0.12, 'sine', 0, 0.7);
  }
  bite(): void {
    this.tone(300, 0.18, 0.3, 'sine', 0, 0.5);
    this.noiseBurst(0.3, 700, 1, 0.22, 0.03);
  }
  hook(): void {
    this.noiseBurst(0.2, 2400, 0.7, 0.2);
    this.tone(180, 0.2, 0.25, 'triangle', 0, 0.6);
  }
  splash(): void {
    this.noiseBurst(0.5, 1200, 0.6, 0.35);
    this.noiseBurst(0.35, 500, 0.8, 0.25, 0.08);
  }
  snap(): void {
    this.tone(1600, 0.08, 0.3, 'square', 0, 0.3);
    this.noiseBurst(0.15, 3000, 2, 0.2);
  }
  miss(): void {
    this.tone(330, 0.25, 0.15, 'sine', 0, 0.8);
    this.tone(247, 0.35, 0.15, 'sine', 0.18, 0.9);
  }
  caught(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, 0.16, 'triangle', i * 0.09));
  }

  /** Reel clicks at the reel rate (turns/s); call every frame with dt in s. */
  reel(rate: number, dt: number): void {
    if (!this.ctx || rate <= 0) return;
    this.reelAcc += rate * 3 * dt; // ~3 clicks per turn
    while (this.reelAcc >= 1) {
      this.reelAcc -= 1;
      this.tone(2200 + Math.random() * 300, 0.018, 0.05, 'square');
    }
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
}
