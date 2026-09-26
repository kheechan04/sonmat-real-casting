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
//
// M3 (docs/VERIFICATION.md "M3 새 동작"): a cast also carries its AIM — the rod wrist's sideways travel
// in the last 0.4 s of the swing (G1–G3: left / centre / right never overlapped). The rod hand's
// sideways position (rodSide) drives rod work (G6). (Pumping, G4, was recognised but removed from the game.)

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
/** Aim = sideways wrist travel over this span before the cast fires (G1–G3: 0.4 s separated best). */
const AIM_SPAN_MS = 400;
/** Reeling: the circle's centre is the hand's mean position over this span, ms (≥ one slow turn). */
const REEL_CENTRE_MS = 700;
/** Reeling speed is averaged over at least this many frame steps (at 10 fps 300 ms is only 3). */
const REEL_MIN_STEPS = 4;

/**
 * A fast circle seen at a low frame rate is a few corners, and the straight steps between them cut the
 * circle short (in-game 10 fps: fast reeling read a third slower than at 30 fps, the close-up
 * recording at 6–8 fps lost up to two thirds — user: "빠르게 감아도 잘 안 감기네"). Stretch each step
 * back to its arc by the angle it spans around the circle's centre. Small steps (30 fps) stay ≈ 1×.
 */
function arcStretch(q0: V3, q1: V3, cx: number, cy: number): number {
  const r0 = Math.hypot(q0[0] - cx, q0[1] - cy);
  const r1 = Math.hypot(q1[0] - cx, q1[1] - cy);
  // only for circling: both ends at a similar distance from the centre, not through it
  if (Math.min(r0, r1) < 0.5 * Math.max(r0, r1) || Math.max(r0, r1) < 1e-4) return 1;
  let th = Math.abs(Math.atan2(q1[1] - cy, q1[0] - cx) - Math.atan2(q0[1] - cy, q0[0] - cx));
  if (th > Math.PI) th = 2 * Math.PI - th;
  if (th < 0.05) return 1;
  return Math.min(Math.PI / 2, th / 2 / Math.sin(th / 2));
}

export type GestureEvent =
  | { type: 'cast'; t: number; /** 0–1 */ strength: number; peakSpeed: number; /** −1 … 1, + = the player's left */ aim: number }
  | { type: 'hookset'; t: number; peakSpeed: number; rise: number };

export interface GestureState {
  rodVisible: boolean;
  reelVisible: boolean;
  /** current rod-wrist speed, torso lengths / s */
  rodSpeed: number;
  /** reel turns per second (0 when the reel hand is still or not visible) */
  reelRate: number;
  /** rod hand sideways from its shoulder, torso lengths, + = the player's left (null = not seen) */
  rodSide: number | null;
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
      rodSide: lastRod ? lastRod[0] : null,
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
        out.push({ type: 'cast', t, strength, peakSpeed: pc.peak, aim: this.aim(t, rodHand) });
        this.lastCastT = t;
        this.pendingCast = null;
      }
    }

    // ---- reel wrist: path speed (image, torso lengths/s, relative to its shoulder) → turns/s
    const reelP =
      lm && lm[reelArm.wrist][3] >= P.minVis ? imageRel(lm, reelArm.wrist, reelArm.shoulder, aspect) : null;
    this.reel.push(t, reelP, Math.max(P['reel.windowMs'], REEL_CENTRE_MS));
    if (reelP) {
      const rt = this.reel.t;
      const rp = this.reel.p;
      // the circle's centre ≈ the hand's mean position over the last REEL_CENTRE_MS
      let cx = 0;
      let cy = 0;
      let k = 0;
      for (let i = 0; i < rt.length; i++) {
        const q = rp[i];
        if (!q || t - rt[i] > REEL_CENTRE_MS) continue;
        cx += q[0];
        cy += q[1];
        k++;
      }
      cx /= k;
      cy /= k;
      // average over windowMs, but over at least REEL_MIN_STEPS frame steps (slow frame rates)
      let from = rt.length - 1;
      while (from > 0 && (t - rt[from - 1] <= P['reel.windowMs'] || rt.length - from <= REEL_MIN_STEPS)) from--;
      let path = 0;
      let span = 0;
      for (let i = from + 1; i < rt.length; i++) {
        const q0 = rp[i - 1];
        const q1 = rp[i];
        if (!q0 || !q1) continue;
        path += Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) * arcStretch(q0, q1, cx, cy);
        span += rt[i] - rt[i - 1];
      }
      const v = span > 0 ? path / (span / 1000) : 0;
      this.reelRate = v >= P['reel.speedMin'] ? Math.min(P['reel.maxRate'], v * P['reel.turnsPerTorso']) : 0;
      this.reelT = t;
    }
    return out;
  }

  /**
   * Where a cast went: the rod wrist's sideways travel over the last AIM_SPAN_MS, −1 … 1 (+ = the
   * player's left). Swings toward the rod-hand side travel further (G3: −1.1 vs +0.75 across the
   * body), so each side has its own full-scale value; a small dead zone keeps "straight" at 0.
   */
  private aim(t: number, rodHand: Side): number {
    const P = this.params();
    const now = this.rod.near(t, GAP_MS);
    const before = this.rod.near(t - AIM_SPAN_MS, GAP_MS);
    if (!now || !before || before.t >= now.t) return 0;
    const dx = now.p[0] - before.p[0];
    const rodSideSign = rodHand === 'right' ? -1 : 1; // x+ is the player's left
    const raw = dx / (dx * rodSideSign > 0 ? P['aim.rodSideFull'] : P['aim.acrossFull']);
    const mag = Math.max(0, (Math.abs(raw) - P['aim.dead']) / (1 - P['aim.dead']));
    return mag === 0 ? 0 : Math.sign(raw) * Math.min(1, mag);
  }
}
