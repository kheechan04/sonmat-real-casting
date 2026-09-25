// M0 recording analysis — pure functions (no DOM), used by scripts/analyze.ts and the tests.
// Nothing here is a game rule: it only summarizes what the landmarks did, so that M1's casting /
// hook-set / reeling rules can be chosen from measured data instead of guesses.

import { ARM, LM, type P4, type Side } from './pose';
import type { Recording } from './recording';

export type V3 = [number, number, number];

const median = (a: number[]): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const quantile = (a: number[], q: number): number => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

// ---------------------------------------------------------------- timing

export interface TimingStats {
  frames: number;
  /** fraction of frames with a detected pose */
  detected: number;
  durationS: number;
  intervalMedianMs: number;
  intervalP90Ms: number;
  fps: number;
  inferMedianMs: number;
}

export function timing(rec: Recording): TimingStats {
  const f = rec.frames;
  const dts: number[] = [];
  for (let i = 1; i < f.length; i++) dts.push(f[i].t - f[i - 1].t);
  const im = median(dts);
  const ms = f.map((x) => x.ms).filter((x): x is number => typeof x === 'number');
  return {
    frames: f.length,
    detected: f.length ? f.filter((x) => x.wl && x.lm).length / f.length : 0,
    durationS: f.length ? (f[f.length - 1].t - f[0].t) / 1000 : 0,
    intervalMedianMs: im,
    intervalP90Ms: quantile(dts, 0.9),
    fps: im > 0 ? 1000 / im : NaN,
    inferMedianMs: median(ms),
  };
}

// ---------------------------------------------------------------- tracks

export interface Track {
  t: number[];
  /** null where the pose is missing or the point is not visible enough */
  p: (V3 | null)[];
}

/**
 * World track of a landmark relative to another (e.g. wrist − shoulder), so body sway cancels.
 * World units are meters.
 */
export function worldTrack(rec: Recording, idx: number, origin: number | null, minVis = 0.5): Track {
  const t: number[] = [];
  const p: (V3 | null)[] = [];
  for (const f of rec.frames) {
    t.push(f.t);
    const w = f.wl;
    if (!w || w[idx][3] < minVis) {
      p.push(null);
      continue;
    }
    const q: V3 = [w[idx][0], w[idx][1], w[idx][2]];
    p.push(origin === null ? q : sub(q, [w[origin][0], w[origin][1], w[origin][2]]));
  }
  return { t, p };
}

/**
 * Image-space torso length (shoulder midpoint → hip midpoint, isotropic units) — the unit that
 * makes image distances independent of camera distance. Not shoulder width: that shrinks toward
 * 0 when the player turns sideways (first test on a Shadow Mitts side-stance recording gave
 * 275 units/s "speeds" while standing still).
 */
export function torsoImg(lm: P4[], aspect: number): number {
  const mx = (i: number, j: number, k: 0 | 1) => (lm[i][k] + lm[j][k]) / 2;
  const dx = (mx(LM.SHOULDER_L, LM.SHOULDER_R, 0) - mx(LM.HIP_L, LM.HIP_R, 0)) * aspect;
  const dy = mx(LM.SHOULDER_L, LM.SHOULDER_R, 1) - mx(LM.HIP_L, LM.HIP_R, 1);
  return Math.hypot(dx, dy);
}

/**
 * Image position of `idx` relative to `origin` in torso lengths, x scaled by the aspect ratio.
 * z is MediaPipe's image-space depth (same scale as x), also / torso length.
 */
export function imageRel(lm: P4[], idx: number, origin: number | null, aspect: number): V3 {
  const u = torsoImg(lm, aspect) || 1;
  const o = origin === null ? [0, 0, 0] : lm[origin];
  return [((lm[idx][0] - o[0]) * aspect) / u, (lm[idx][1] - o[1]) / u, ((lm[idx][2] - o[2]) * aspect) / u];
}

/** Image track relative to another landmark, in torso lengths (see imageRel). */
export function imageTrack(rec: Recording, idx: number, origin: number | null, minVis = 0.5): Track {
  const t: number[] = [];
  const p: (V3 | null)[] = [];
  for (const f of rec.frames) {
    t.push(f.t);
    const l = f.lm;
    p.push(!l || l[idx][3] < minVis ? null : imageRel(l, idx, origin, rec.meta.aspect));
  }
  return { t, p };
}

/** Speed (units/s) of a track, central difference; NaN where undefined. */
export function speed(tr: Track, axes: readonly (0 | 1 | 2)[] = [0, 1, 2]): number[] {
  const out: number[] = [];
  for (let i = 0; i < tr.p.length; i++) {
    const a = tr.p[Math.max(0, i - 1)];
    const b = tr.p[Math.min(tr.p.length - 1, i + 1)];
    const dt = (tr.t[Math.min(tr.p.length - 1, i + 1)] - tr.t[Math.max(0, i - 1)]) / 1000;
    if (!a || !b || dt <= 0) {
      out.push(NaN);
      continue;
    }
    let s = 0;
    for (const k of axes) s += (b[k] - a[k]) ** 2;
    out.push(Math.sqrt(s) / dt);
  }
  return out;
}

/** Total path length of a track (skipping gaps). */
export function pathLength(tr: Track): number {
  let s = 0;
  for (let i = 1; i < tr.p.length; i++) {
    const a = tr.p[i - 1];
    const b = tr.p[i];
    if (a && b) s += len(sub(b, a));
  }
  return s;
}

/** Linear interpolation of a track at time t (null if it falls in a gap). */
export function sampleAt(tr: Track, t: number): V3 | null {
  const { t: ts, p } = tr;
  if (!ts.length || t < ts[0] || t > ts[ts.length - 1]) return null;
  let i = 0;
  while (i < ts.length - 1 && ts[i + 1] < t) i++;
  const a = p[i];
  const b = p[Math.min(i + 1, p.length - 1)];
  if (!a || !b) return a ?? b ?? null;
  const span = ts[Math.min(i + 1, ts.length - 1)] - ts[i];
  const u = span > 0 ? (t - ts[i]) / span : 0;
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}

/**
 * sampleAt, but when t falls in a tracking gap, the nearest valid frame within `maxMs` — searched
 * first in direction `prefer` (-1 = earlier). The wrist drops out while it passes behind the head
 * in an overhead cast wind-up (B1: gaps of 250–500 ms right before most casts).
 */
export function sampleNear(tr: Track, t: number, prefer: -1 | 1, maxMs = 300): V3 | null {
  const direct = sampleAt(tr, t);
  if (direct) return direct;
  let best: { d: number; p: V3 } | null = null;
  for (let i = 0; i < tr.t.length; i++) {
    const p = tr.p[i];
    const dt = tr.t[i] - t;
    if (!p || Math.abs(dt) > maxMs) continue;
    // same-direction candidates win ties by a wide margin
    const d = Math.abs(dt) + (Math.sign(dt) === prefer ? 0 : maxMs);
    if (!best || d < best.d) best = { d, p };
  }
  return best?.p ?? null;
}

// ---------------------------------------------------------------- which hand moved

export interface HandActivity {
  /** world path length of each wrist relative to its shoulder, m */
  path: Record<Side, number>;
  dominant: Side;
  /** dominant / other path length */
  ratio: number;
}

export function handActivity(rec: Recording): HandActivity {
  const path = {
    left: pathLength(worldTrack(rec, ARM.left.wrist, ARM.left.shoulder)),
    right: pathLength(worldTrack(rec, ARM.right.wrist, ARM.right.shoulder)),
  };
  const dominant: Side = path.left >= path.right ? 'left' : 'right';
  const o = dominant === 'left' ? path.right : path.left;
  return { path, dominant, ratio: o > 0 ? path[dominant] / o : Infinity };
}

// ---------------------------------------------------------------- reach direction (axis check)

export interface ReachDirection {
  /** unit vector rest → reached position, world (relative to shoulder) */
  world: V3;
  /** unit vector rest → reached position, image (x right, y down, z image depth) */
  image: V3;
  /** mean reach distance, world meters */
  reachM: number;
}

/**
 * For an "arm out in one direction, N times" recording: where did the wrist go, in each space?
 * Rest = median of the first 0.5 s; "reached" = frames farther than 70% of the maximum reach.
 * A wrist hanging at the hips reads visibility ~0.35 when the hips are near the frame edge
 * (A1: hips at the bottom edge), so callers may lower `minVis`.
 */
export function reachDirection(rec: Recording, side: Side, minVis = 0.5): ReachDirection | null {
  const arm = ARM[side];
  const w = worldTrack(rec, arm.wrist, arm.shoulder, minVis);
  const im = imageTrack(rec, arm.wrist, arm.shoulder, minVis);
  const t0 = rec.frames[0]?.t ?? 0;
  const restOf = (tr: Track): V3 | null => {
    const pts = tr.p.filter((p, i): p is V3 => !!p && tr.t[i] - t0 < 500);
    if (!pts.length) return null;
    return [median(pts.map((p) => p[0])), median(pts.map((p) => p[1])), median(pts.map((p) => p[2]))];
  };
  const rw = restOf(w);
  const ri = restOf(im);
  if (!rw || !ri) return null;
  const dists = w.p.map((p) => (p ? len(sub(p, rw)) : 0));
  const max = Math.max(...dists);
  if (!(max > 0)) return null;
  const sumW: V3 = [0, 0, 0];
  const sumI: V3 = [0, 0, 0];
  let n = 0;
  let reach = 0;
  for (let i = 0; i < w.p.length; i++) {
    const pw = w.p[i];
    const pi = im.p[i];
    if (!pw || !pi || dists[i] < 0.7 * max) continue;
    const dw = sub(pw, rw);
    const di = sub(pi, ri);
    for (let k = 0; k < 3; k++) {
      sumW[k] += dw[k];
      sumI[k] += di[k];
    }
    reach += dists[i];
    n++;
  }
  const unit = (v: V3): V3 => {
    const l = len(v) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  return { world: unit(sumW), image: unit(sumI), reachM: n ? reach / n : 0 };
}

/** Pearson correlation, ignoring NaN pairs. */
export function correlation(a: number[], b: number[]): number {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
      xs.push(a[i]);
      ys.push(b[i]);
    }
  }
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : NaN;
}

/** Per-axis correlation between the world track and the image track of the same landmark. */
export function worldImageAgreement(rec: Recording, idx: number, origin: number): V3 {
  const w = worldTrack(rec, idx, origin);
  const im = imageTrack(rec, idx, origin);
  const axis = (tr: Track, k: number) => tr.p.map((p) => (p ? p[k] : NaN));
  return [0, 1, 2].map((k) => correlation(axis(w, k), axis(im, k))) as V3;
}

// ---------------------------------------------------------------- swings (casting / hook-set)

export interface Swing {
  /** time of peak image speed, ms from recording start */
  t: number;
  /** peak image speed of the wrist, torso lengths / s */
  peakSpeed: number;
  /** wrist displacement from 300 ms before to 150 ms after the peak, world m (rel. shoulder) */
  dWorld: V3;
  /** same, image (torso lengths; x right, y down, z image depth) */
  dImage: V3;
  /** elbow angle (3D, world) at the start and end of that window, degrees */
  elbowFrom: number;
  elbowTo: number;
}

function elbowAngleAt(rec: Recording, side: Side, t: number): number {
  const arm = ARM[side];
  const s = sampleAt(worldTrack(rec, arm.shoulder, null), t);
  const e = sampleAt(worldTrack(rec, arm.elbow, null), t);
  const w = sampleAt(worldTrack(rec, arm.wrist, null), t);
  if (!s || !e || !w) return NaN;
  const a = sub(s, e);
  const b = sub(w, e);
  const c = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/**
 * Fast wrist movements: local maxima of image speed above `minFrac` of the recording's top speed
 * and above `floor` torso lengths/s, at least `gapMs` apart. floor 4: a still boxing guard peaked at
 * 2.3–3.6, raising/lowering the arms at 6.7–9.5 (placeholder until the idle recording E1).
 * Deliberately generic (no casting rule yet) — M0 only reports them.
 */
export function findSwings(rec: Recording, side: Side, minFrac = 0.45, gapMs = 700, floor = 4): Swing[] {
  const arm = ARM[side];
  const im = imageTrack(rec, arm.wrist, arm.shoulder);
  const w = worldTrack(rec, arm.wrist, arm.shoulder);
  // speed over ±50 ms rather than neighbouring frames: at 50 fps single-frame jitter alone
  // reached 7–9 torso lengths/s on a still guard (Shadow Mitts recording)
  const sp = im.t.map((t, i) => {
    const a = sampleAt(im, t - 50);
    const b = sampleAt(im, t + 50);
    return im.p[i] && a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1 : NaN;
  });
  const finite = sp.filter(Number.isFinite);
  if (!finite.length) return [];
  const top = quantile(finite, 0.98);
  const cand: number[] = [];
  for (let i = 1; i < sp.length - 1; i++) {
    if (sp[i] >= Math.max(floor, minFrac * top) && sp[i] >= (sp[i - 1] || 0) && sp[i] >= (sp[i + 1] || 0)) cand.push(i);
  }
  // keep the strongest peak within each gap
  cand.sort((a, b) => sp[b] - sp[a]);
  const kept: number[] = [];
  for (const i of cand) if (kept.every((k) => Math.abs(im.t[k] - im.t[i]) >= gapMs)) kept.push(i);
  kept.sort((a, b) => a - b);
  const t0 = rec.frames[0]?.t ?? 0;
  const out: Swing[] = [];
  for (const i of kept) {
    const t = im.t[i];
    const w0 = sampleNear(w, t - 300, -1);
    const w1 = sampleNear(w, t + 150, 1);
    const i0 = sampleNear(im, t - 300, -1);
    const i1 = sampleNear(im, t + 150, 1);
    if (!w0 || !w1 || !i0 || !i1) continue;
    out.push({
      t: t - t0,
      peakSpeed: sp[i],
      dWorld: sub(w1, w0),
      dImage: sub(i1, i0),
      elbowFrom: elbowAngleAt(rec, side, t - 300),
      elbowTo: elbowAngleAt(rec, side, t + 150),
    });
  }
  return out;
}

// ---------------------------------------------------------------- circles (reeling)

export type Plane = 'world-xy' | 'world-yz' | 'world-xz' | 'image-xy';
export const PLANES: readonly Plane[] = ['world-xy', 'world-yz', 'world-xz', 'image-xy'];

export interface CircleStats {
  plane: Plane;
  /** sqrt(minor/major) variance of the centered path: 1 = circle, 0 = back-and-forth line */
  roundness: number;
  /** net signed turns around the moving center (+ = counter-clockwise in the plane's axes) */
  turns: number;
  /** typical radius (RMS distance from the moving center), plane units */
  radius: number;
}

function planeOf(p: V3, plane: Plane): [number, number] {
  switch (plane) {
    case 'world-xy':
    case 'image-xy':
      return [p[0], p[1]];
    case 'world-yz':
      return [p[2], p[1]];
    case 'world-xz':
      return [p[0], p[2]];
  }
}

/**
 * How circular the wrist path is in one plane. Points are centered on a running mean
 * (±`windowMs`/2) so slow drift of the whole hand doesn't count as turning. Turns are counted only
 * beyond `minRadius` (plane units) from that center.
 */
export function circleStats(tr: Track, plane: Plane, windowMs = 1000, minRadius = 0): CircleStats {
  const pts: { t: number; q: [number, number] }[] = [];
  tr.p.forEach((p, i) => {
    if (p) pts.push({ t: tr.t[i], q: planeOf(p, plane) });
  });
  const centered: [number, number][] = [];
  let lo = 0;
  let hi = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = pts[i].t;
    while (hi < pts.length && pts[hi].t <= t + windowMs / 2) {
      sx += pts[hi].q[0];
      sy += pts[hi].q[1];
      hi++;
    }
    while (pts[lo].t < t - windowMs / 2) {
      sx -= pts[lo].q[0];
      sy -= pts[lo].q[1];
      lo++;
    }
    const n = hi - lo;
    centered.push([pts[i].q[0] - sx / n, pts[i].q[1] - sy / n]);
  }
  if (centered.length < 3) return { plane, roundness: NaN, turns: 0, radius: NaN };
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const [x, y] of centered) {
    cxx += x * x;
    cyy += y * y;
    cxy += x * y;
  }
  const n = centered.length;
  cxx /= n;
  cyy /= n;
  cxy /= n;
  const tr2 = cxx + cyy;
  const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (tr2 * tr2) / 4 - det));
  const major = tr2 / 2 + disc;
  const minor = Math.max(0, tr2 / 2 - disc);
  // Only count turning while the hand is clearly away from the center: near the center the angle
  // of pure jitter spins freely (idle Shadow Mitts recording: "7 turns" at 0.04 m radius).
  const rms = Math.sqrt(tr2);
  const minR = Math.max(minRadius, 0.4 * rms);
  const far = (q: [number, number]) => Math.hypot(q[0], q[1]) >= minR;
  let turns = 0;
  for (let i = 1; i < n; i++) {
    if (!far(centered[i - 1]) || !far(centered[i])) continue;
    const a = Math.atan2(centered[i - 1][1], centered[i - 1][0]);
    const b = Math.atan2(centered[i][1], centered[i][0]);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    turns += d;
  }
  return {
    plane,
    roundness: major > 0 ? Math.sqrt(minor / major) : NaN,
    turns: turns / (2 * Math.PI),
    radius: rms,
  };
}

/** Circle stats of a wrist in every plane (world and image, both relative to the shoulder). */
export function reelCircles(rec: Recording, side: Side): CircleStats[] {
  const arm = ARM[side];
  const w = worldTrack(rec, arm.wrist, arm.shoulder);
  const im = imageTrack(rec, arm.wrist, arm.shoulder);
  // noise floor: ~0.03 m in world, ~0.06 torso lengths in the image (placeholder, see idle recording E1)
  return PLANES.map((pl) => (pl === 'image-xy' ? circleStats(im, pl, 1000, 0.06) : circleStats(w, pl, 1000, 0.03)));
}

// ---------------------------------------------------------------- oscillation count (reeling)

/**
 * Count back-and-forth cycles of one coordinate: the value minus its ±500 ms running mean must swing
 * above +amp and then below −amp for one cycle. A real reel crank, seen from the front, is a small
 * ellipse (D1: 4 cm radius, roundness 0.3–0.4) whose angle-based turn count failed (10 of ~60),
 * but its vertical wobble counted the same ~60 cycles on every axis.
 */
export function oscillations(tr: Track, axis: 0 | 1 | 2, amp: number, halfWindowMs = 500): number {
  const pts: { t: number; v: number }[] = [];
  tr.p.forEach((p, i) => {
    if (p) pts.push({ t: tr.t[i], v: p[axis] });
  });
  let lo = 0;
  let hi = 0;
  let sum = 0;
  let state = 0;
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    const t = pts[i].t;
    while (hi < pts.length && pts[hi].t <= t + halfWindowMs) sum += pts[hi++].v;
    while (pts[lo].t < t - halfWindowMs) sum -= pts[lo++].v;
    const d = pts[i].v - sum / (hi - lo);
    if (state <= 0 && d > amp) {
      state = 1;
      n++;
    } else if (state >= 0 && d < -amp) state = -1;
  }
  return n;
}
