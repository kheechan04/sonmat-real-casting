// Synthesized sound (Web Audio, no files — nothing to license). Created on the start click
// (browsers only allow audio after a user gesture).
//
// Deliberately exaggerated (user, M1.5: "소리 이펙트랑 화면 이펙트 더 과장돼도 좋을 거 같아"):
// event sounds go through a reverb bus, big moments get a sub-bass boom and a brass-like stab,
// the last stretch of reeling gets a drum roll, high line tension a heartbeat.
//
// Layers:
//  - ambience: lapping water, light wind, birds now and then (quiet bed, not reverbed)
//  - events: cast whoosh + line peeling, plop, nibble ticks, bite gulp + chime, hook-set HIT, reel
//    clicks, run warning splash, drag scream, rod creak + heartbeat under tension, drum roll near the
//    end, catch splash + flops + fanfare (bigger for 월척), snap, miss
//  - UI: soft clicks

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** event bus: dry to master + wet through the reverb */
  private fx: GainNode | null = null;
  private amb: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private drag: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private roll: { src: AudioBufferSourceNode; gain: GainNode; lfo: OscillatorNode } | null = null;
  private reelAcc = 0;
  private creakAcc = 0;
  private beatAcc = 0;
  muted = false;
  /** M5: what the ambience sounds like — birds by day, fewer at dusk, insects and frogs at night */
  private time: 'day' | 'dusk' | 'night' = 'day';

  start(): void {
    if (this.ctx) return;
    try {
      this.ctx = new AudioContext();
    } catch {
      return; // no audio — the game still works
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.75;
    // gentle limiter so stacked hits don't clip
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(c.destination);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // reverb: 1.8 s decaying noise impulse ("open lake" space)
    const irLen = Math.floor(c.sampleRate * 1.8);
    const ir = c.createBuffer(2, irLen, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const x = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) x[i] = (Math.random() * 2 - 1) * (1 - i / irLen) ** 3;
    }
    const verb = c.createConvolver();
    verb.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.35;
    this.fx = c.createGain();
    this.fx.connect(this.master);
    this.fx.connect(verb).connect(wet).connect(this.master);
    this.startAmbience();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.75;
  }

  // ---------------------------------------------------------------- building blocks

  private noiseBurst(dur: number, freq: number, q: number, vol: number, delay = 0, endFreq = freq * 0.4, type: BiquadFilterType = 'bandpass', out: AudioNode | null = this.fx): void {
    const c = this.ctx;
    if (!c || !this.noise || !out) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random());
    src.stop(t + dur + 0.02);
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', delay = 0, glide = 1, out: AudioNode | null = this.fx, attack = 0.01): void {
    const c = this.ctx;
    if (!c || !out) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
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

  /** Sub-bass hit — the "쿵" under big moments. */
  private boom(vol: number, delay = 0): void {
    this.tone(95, 0.7, vol, 'sine', delay, 0.42);
    this.noiseBurst(0.25, 180, 0.8, vol * 0.5, delay, 60, 'lowpass');
  }

  /** Brass-like chord stab (detuned saws). */
  private stab(freqs: number[], vol: number, dur = 0.5, delay = 0): void {
    for (const f of freqs) {
      this.tone(f, dur, vol, 'sawtooth', delay, 1, this.fx, 0.015);
      this.tone(f * 1.006, dur, vol * 0.7, 'sawtooth', delay, 1, this.fx, 0.015);
    }
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

  /** M5: the ambience follows the time of day on screen. */
  setTime(t: 'day' | 'dusk' | 'night'): void {
    this.time = t;
  }

  private scheduleBird(): void {
    // day: a bird every 4–13 s; dusk: every 10–25 s; night: crickets now, a frog now and then
    const wait = this.time === 'night' ? 700 + Math.random() * 1600 : this.time === 'dusk' ? 10000 + Math.random() * 15000 : 4000 + Math.random() * 9000;
    window.setTimeout(() => {
      if (this.time === 'night') {
        this.cricket();
        if (Math.random() < 0.12) this.frog();
      } else this.bird();
      this.scheduleBird();
    }, wait);
  }

  /** a cricket: a few fast chirps of a high, pure tone */
  private cricket(): void {
    if (!this.amb) return;
    const f = 4200 + Math.random() * 700;
    const n = 2 + Math.floor(Math.random() * 3);
    const vol = 0.008 + Math.random() * 0.01;
    for (let i = 0; i < n; i++) this.tone(f, 0.035, vol, 'sine', i * 0.075, 1, this.amb, 0.004);
  }

  /** a frog far off: two low, buzzy croaks */
  private frog(): void {
    if (!this.amb) return;
    const f = 110 + Math.random() * 60;
    for (let i = 0; i < 2; i++) {
      this.tone(f, 0.12, 0.03, 'square', i * 0.22, 0.8, this.amb, 0.02);
      this.tone(f * 2.01, 0.1, 0.012, 'sawtooth', i * 0.22, 0.8, this.amb, 0.02);
    }
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
    this.tone(1100, 0.04, 0.05, 'sine', 0, 0.8, this.master);
  }
  pick(): void {
    this.tone(660, 0.08, 0.1, 'triangle', 0, 1.2);
    this.tone(990, 0.12, 0.08, 'triangle', 0.06, 1.1);
  }

  // ---------------------------------------------------------------- casting & waiting

  /** Rod swish (brighter and longer the stronger the cast), then line peeling off the spool. */
  cast(flightS: number, strength: number): void {
    this.noiseBurst(0.35 + strength * 0.2, 2200 + strength * 2000, 0.6, 0.35 + strength * 0.2, 0, 500);
    this.noiseBurst(flightS, 5600, 3, 0.1, 0.12, 1500);
    this.tone(1200 + strength * 800, flightS * 0.9, 0.035, 'sine', 0.12, 0.4); // the line's whistle
  }
  plop(): void {
    this.drop(0.45, 0.45);
  }
  nibble(): void {
    this.tone(820, 0.05, 0.14, 'sine', 0, 0.7);
    this.drop(0.08, 0.12, 0.03);
  }
  /** The real bite: gulp + boom + alarm chime — heard even when not watching the float. */
  bite(): void {
    this.drop(0.7, 0.45);
    this.boom(0.35);
    [1318, 1760, 2093].forEach((f, i) => this.tone(f, 0.22, 0.12, 'triangle', 0.04 + i * 0.06));
  }
  /** Last second of the bite window. */
  hurry(): void {
    this.tone(1500, 0.06, 0.08, 'square', 0, 1);
  }
  /** Hook-set: whip crack + sub boom + brass stab. */
  hook(): void {
    this.noiseBurst(0.18, 5000, 0.8, 0.45, 0, 1200, 'highpass');
    this.boom(0.6);
    this.stab([392, 494, 587], 0.07, 0.45, 0.02);
    this.drop(0.6, 0.3, 0.06);
  }

  // ---------------------------------------------------------------- the fight

  /** Reel clicks at the reel rate (turns/s); call every frame with dt in s. */
  reel(rate: number, dt: number): void {
    if (!this.ctx || rate <= 0) return;
    this.reelAcc += rate * 3 * dt; // ~3 clicks per turn
    while (this.reelAcc >= 1) {
      this.reelAcc -= 1;
      this.tone(2200 + Math.random() * 300, 0.02, 0.06, 'square', 0, 1, this.master);
    }
  }

  /** The fish is about to run: it thrashes at the surface. */
  splash(): void {
    this.noiseBurst(0.6, 1300, 0.6, 0.5);
    this.noiseBurst(0.5, 600, 0.8, 0.35, 0.1);
    this.drop(0.8, 0.35, 0.05);
    this.boom(0.3, 0.02);
  }

  /** Small splash when the hooked fish comes close. */
  nearSplash(): void {
    this.noiseBurst(0.3 + Math.random() * 0.2, 1500, 0.8, 0.3);
  }

  /** The drag screaming while the fish runs. */
  setDrag(on: boolean, pitch = 1): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.fx) return;
    if (on && !this.drag) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200 * pitch;
      f.Q.value = 6;
      const lfo = c.createOscillator();
      lfo.frequency.value = 38 * pitch;
      const lfoGain = c.createGain();
      lfoGain.gain.value = 900;
      lfo.connect(lfoGain).connect(f.frequency);
      lfo.start();
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.gain.exponentialRampToValueAtTime(0.32, c.currentTime + 0.06);
      src.connect(f).connect(gain).connect(this.fx);
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

  /** Rod creak, warning beep and a heartbeat as line tension climbs; call every frame. */
  tension(t: number, dt: number): void {
    if (!this.ctx) return;
    if (t >= 0.35) {
      this.creakAcc += (1 + t * 6) * dt;
      if (this.creakAcc >= 1) {
        this.creakAcc = 0;
        this.noiseBurst(0.14, 240 + t * 200, 8, 0.18 * t, 0, 160);
        if (t >= 0.75) this.tone(1900, 0.07, 0.1, 'square', 0, 1, this.master);
      }
    }
    if (t >= 0.5) {
      // heartbeat speeds up with tension: 70 → 150 bpm
      this.beatAcc += ((70 + (t - 0.5) * 160) / 60) * dt;
      if (this.beatAcc >= 1) {
        this.beatAcc = 0;
        this.tone(58, 0.16, 0.5, 'sine', 0, 0.7, this.master);
        this.tone(52, 0.14, 0.35, 'sine', 0.16, 0.7, this.master);
      }
    } else this.beatAcc = 0;
  }

  /** Drum roll while the fish is almost in (building up to the catch). */
  setRoll(on: boolean): void {
    const c = this.ctx;
    if (!c || !this.noise || !this.fx) return;
    if (on && !this.roll) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 1.2;
      const gain = c.createGain();
      gain.gain.value = 0.12;
      // 14 Hz amplitude flutter = a snare roll
      const lfo = c.createOscillator();
      lfo.frequency.value = 14;
      const lg = c.createGain();
      lg.gain.value = 0.1;
      lfo.connect(lg).connect(gain.gain);
      lfo.start();
      src.connect(f).connect(gain).connect(this.fx);
      src.start();
      this.roll = { src, gain, lfo };
    } else if (!on && this.roll) {
      const { src, gain, lfo } = this.roll;
      gain.gain.cancelScheduledValues(c.currentTime);
      gain.gain.setValueAtTime(gain.gain.value, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.1);
      src.stop(c.currentTime + 0.12);
      lfo.stop(c.currentTime + 0.12);
      this.roll = null;
    }
  }

  /** Line snaps: sharp twang, boom, falling "뚜-둥". */
  snap(): void {
    this.tone(1600, 0.1, 0.35, 'square', 0, 0.25);
    this.noiseBurst(0.2, 3000, 2, 0.3);
    this.boom(0.5, 0.03);
    this.tone(330, 0.3, 0.16, 'sawtooth', 0.25, 0.94);
    this.tone(220, 0.6, 0.16, 'sawtooth', 0.55, 0.9);
  }
  /** Missed: a sad "wah-wah". */
  miss(): void {
    [392, 370, 349, 330].forEach((f, i) => this.tone(f, i === 3 ? 0.7 : 0.26, 0.12, 'triangle', i * 0.26, i === 3 ? 0.94 : 0.98));
  }

  /** Lifted out of the water: big splash, flops on the deck, cymbal swell + fanfare (longer for a trophy). */
  caught(trophy: boolean): void {
    this.noiseBurst(0.8, 1100, 0.6, 0.55);
    this.boom(0.55);
    for (let i = 0; i < 5; i++) this.noiseBurst(0.07, 500 + Math.random() * 300, 1.5, 0.25, 0.6 + i * (0.15 + Math.random() * 0.1), 200);
    this.noiseBurst(1.4, 7000, 0.5, 0.18, 0.25, 9000, 'highpass'); // cymbal swell
    const notes = trophy ? [523, 659, 784, 1047, 1319, 1568] : [523, 659, 784, 1047];
    notes.forEach((f, i) => this.tone(f, 0.5, 0.16, 'triangle', 0.3 + i * 0.09));
    const end = 0.3 + notes.length * 0.09;
    this.stab(trophy ? [523, 659, 784, 1047] : [523, 659, 784], 0.06, trophy ? 1.4 : 0.8, end);
    if (trophy) {
      this.boom(0.5, end);
      [2093, 2637, 3136].forEach((f, i) => this.tone(f, 1.0, 0.07, 'sine', end + 0.1 + i * 0.12));
    }
  }

  /** Each interference animal's call: otter chirps, orca blow, crocodile jaw snap, hippo grunt. */
  animal(kind: 'otter' | 'orca' | 'crocodile' | 'hippo'): void {
    switch (kind) {
      case 'otter':
        for (let i = 0; i < 4; i++) this.tone(2400 + Math.random() * 600, 0.06, 0.08, 'sine', i * 0.09, 1.4);
        break;
      case 'orca':
        this.noiseBurst(0.9, 900, 0.5, 0.45, 0, 300, 'lowpass'); // the blow "푸-"
        this.tone(700, 0.5, 0.06, 'sine', 0.5, 1.6); // a whistle
        break;
      case 'crocodile':
        this.noiseBurst(0.08, 1800, 3, 0.5, 0.02, 600); // jaw snap
        this.boom(0.4, 0.02);
        this.tone(70, 0.6, 0.25, 'sawtooth', 0.1, 0.8); // low growl
        break;
      case 'hippo':
        [0, 0.28, 0.5].forEach((d) => this.tone(90 - d * 20, 0.25, 0.3, 'sawtooth', d, 0.7)); // honking grunts
        this.boom(0.35);
        break;
    }
  }

  /** The fish leaps clear of the water: rush out, and the slap back in. */
  jump(): void {
    this.noiseBurst(0.5, 2000, 0.6, 0.45, 0, 4000);
    this.drop(0.9, 0.5, 0.55);
    this.boom(0.3, 0.55);
  }
  /** Hugging the bottom: a low strain and rod creak. */
  strain(): void {
    this.tone(55, 1.2, 0.3, 'sawtooth', 0, 0.9);
    this.noiseBurst(0.5, 260, 8, 0.25, 0.1, 180);
  }
  /** Electric catfish: a crackling zap. */
  zap(): void {
    for (let i = 0; i < 6; i++) this.tone(900 + Math.random() * 2500, 0.05, 0.12, 'square', i * 0.05, 0.3);
    this.noiseBurst(0.35, 5000, 1, 0.3, 0, 8000, 'highpass');
  }

  /** Short rising "ding" for milestones (e.g. the fish is almost in). */
  milestone(): void {
    this.tone(880, 0.12, 0.12, 'triangle', 0, 1.5);
    this.tone(1320, 0.18, 0.1, 'triangle', 0.08, 1.2);
  }
}
