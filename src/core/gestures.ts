// Real-time gesture recognition (M1): cast, hook-set events + a continuous reel rate. Causal versions of the M0
// analysis measures (src/core/analysis.ts) — each decision uses only frames up to "now".
// Rules and numbers: docs/VERIFICATION.md "M1 판정". Thresholds live in params.ts.
//
// The tracker reports every gesture it sees; the game (game.ts) decides which ones count in its
// current phase. That is how a cast wind-up (fast upward) is kept apart from a hook-set, and a
// hook-set's return (fast downward) from a cast.
//
// Reeling is a rate (turns/s from the reel hand's speed), not a turn count: counting single turns
// lost a third of fast reeling at 10 fps, and "faster than we can count" should never hurt.

import { imageRel, type V3 } from './analysis';
import type { Params } from './params';
import { ARM, other, type PoseFrame, type Side } from './pose';

/** Look-back window for displacement, ms (M0 analysis used 300 ms before + 150 ms after the peak). */
export const WINDOW_MS = 450;
/** Speed is measured over this span, ms (single-frame speed is too jittery — M0). */
const SPEED_SPAN_MS = 100;
/** Wind-up gaps: the wrist vanishes behind the head for up to ~0.5 s (M0 B1). */
const GAP_MS = 350;
const HOOK_COOLDOWN_MS = 800;
/** A pending cast fires once the swing slows below this fraction of its peak, or after this long. */
const CAST_SETTLE_FRAC = 0.5;
const CAST_SETTLE_MS = 200;

export type GestureEvent =
  | { type: 'cast'; t: number; /** 0–1 */ strength: number; peakSpeed: number }
  | { type: 'hookset'; t: number; peakSpeed: number; rise: number };

export interface GestureState {
  rodVisible: boolean;
  reelVisible: boolean;
  /** current rod-wrist speed, torso lengths / s */
  rodSpeed: number;
  /** reel turns per second (0 when the reel hand is still or not visible) */
  reelRate: number;
}

class Ring {
  t: number[] = [];
  p: (V3 | null)[] = [];
  push(t: number, p: V3 | null, keepMs: number): void {
    this.t.push(t);
    this.p.push(p);
    while (this.t.length && this.t[0] < t - keepMs) {
      this.t.shift();
      this.p.shift();
    }
  }
  /**
   * Valid sample nearest to `target`: the latest one at or before it (within `maxMs`), else the
   * earliest one after it (within `maxMs`). Bridges tracking gaps like the wind-up behind the head.
   */
  near(target: number, maxMs: number): { t: number; p: V3 } | null {
    for (let i = this.t.length - 1; i >= 0; i--) {
      if (this.t[i] > target) continue;
      if (target - this.t[i] > maxMs) break;
      const p = this.p[i];
      if (p) return { t: this.t[i], p };
    }
    for (let i = 0; i < this.t.length; i++) {
      if (this.t[i] <= target) continue;
      if (this.t[i] - target > maxMs) break;
      const p = this.p[i];
      if (p) return { t: this.t[i], p };
    }
    return null;
  }
  clear(): void {
    this.t = [];
    this.p = [];
  }
}

export class GestureTracker {
  private rod = new Ring();
  private speeds: { t: number; v: number }[] = [];
  private reel = new Ring();
  private pendingCast: { since: number; peak: number } | null = null;
  private lastCastT = -Infinity;
  private lastHookT = -Infinity;
  private reelRate = 0;
  private reelT = -Infinity;
  private lastSpeed = 0;

  constructor(private params: () => Params) {}

  reset(): void {
    this.rod.clear();
    this.reel.clear();
    this.speeds = [];
    this.pendingCast = null;
    this.reelRate = 0;
  }

  state(now: number): GestureState {
    const lastRod = this.rod.p[this.rod.p.length - 1];
    const lastReel = this.reel.p[this.reel.p.length - 1];
    return {
      rodVisible: !!lastRod,
      reelVisible: !!lastReel,
      rodSpeed: this.lastSpeed,
      // a stale estimate (no reel-hand frame lately) counts as not reeling
      reelRate: now - this.reelT > 300 ? 0 : this.reelRate,
    };
  }

  update(frame: PoseFrame, rodHand: Side, aspect: number): GestureEvent[] {
    const P = this.params();
    const t = frame.t;
    const out: GestureEvent[] = [];
    const rodArm = ARM[rodHand];
    const reelArm = ARM[other(rodHand)];

    // ---- rod wrist, image space (torso lengths, relative to its shoulder)
    const lm = frame.lm;
    const rodP = lm && lm[rodArm.wrist][3] >= P.minVis ? imageRel(lm, rodArm.wrist, rodArm.shoulder, aspect) : null;
    this.rod.push(t, rodP, WINDOW_MS + GAP_MS + 200);
    if (rodP) {
      const prev = this.rod.near(t - SPEED_SPAN_MS, GAP_MS);
      const dt = prev ? (t - prev.t) / 1000 : 0;
      const v = prev && dt > 0 ? Math.hypot(rodP[0] - prev.p[0], rodP[1] - prev.p[1]) / dt : 0;
      this.lastSpeed = v;
      this.speeds.push({ t, v });
    }
    while (this.speeds.length && this.speeds[0].t < t - WINDOW_MS) this.speeds.shift();
    const peak = this.speeds.reduce((mx, s) => Math.max(mx, s.v), 0);
    const start = rodP ? this.rod.near(t - WINDOW_MS, GAP_MS) : null;

    if (rodP && start && start.t < t) {
      const dx = rodP[0] - start.p[0];
      const dy = rodP[1] - start.p[1]; // image +y = down
      const move = Math.hypot(dx, dy);

      // cast: fast swing with a downward component; fires when the swing settles
      if (
        !this.pendingCast &&
        t - this.lastCastT >= P['cast.cooldownMs'] &&
        dy >= P['cast.dropMin'] &&
        move >= P['cast.moveMin'] &&
        peak >= P['cast.speedMin']
      ) {
        this.pendingCast = { since: t, peak };
      }

      // hook-set: fast rise; fires at once (timing matters more than the exact peak)
      if (t - this.lastHookT >= HOOK_COOLDOWN_MS && -dy >= P['hook.riseMin'] && peak >= P['hook.speedMin']) {
        this.lastHookT = t;
        out.push({ type: 'hookset', t, peakSpeed: peak, rise: -dy });
      }
    }
    if (this.pendingCast) {
      this.pendingCast.peak = Math.max(this.pendingCast.peak, peak);
      const pc = this.pendingCast;
      if (this.lastSpeed < CAST_SETTLE_FRAC * pc.peak || t - pc.since >= CAST_SETTLE_MS) {
        const span = Math.max(0.01, P['cast.speedFull'] - P['cast.speedMin']);
        const strength = Math.max(0, Math.min(1, (pc.peak - P['cast.speedMin']) / span));
        out.push({ type: 'cast', t, strength, peakSpeed: pc.peak });
        this.lastCastT = t;
        this.pendingCast = null;
      }
    }

    // ---- reel wrist: path speed (image, torso lengths/s, relative to its shoulder) → turns/s
    const reelP =
      lm && lm[reelArm.wrist][3] >= P.minVis ? imageRel(lm, reelArm.wrist, reelArm.shoulder, aspect) : null;
    this.reel.push(t, reelP, P['reel.windowMs']);
    if (reelP) {
      let path = 0;
      let span = 0;
      for (let i = 1; i < this.reel.t.length; i++) {
        const q0 = this.reel.p[i - 1];
        const q1 = this.reel.p[i];
        if (!q0 || !q1) continue;
        path += Math.hypot(q1[0] - q0[0], q1[1] - q0[1]);
        span += this.reel.t[i] - this.reel.t[i - 1];
      }
      const v = span > 0 ? path / (span / 1000) : 0;
      this.reelRate = v >= P['reel.speedMin'] ? Math.min(P['reel.maxRate'], v * P['reel.turnsPerTorso']) : 0;
      this.reelT = t;
    }
    return out;
  }
}
