// Synthetic pose frames for camera-free tests. Geometry follows the axis convention measured in
// Shadow Mitts (re-checked in this project, docs/VERIFICATION.md): world origin = hip midpoint,
// +x = the person's LEFT, +y = down, −z = toward the camera; the UN-mirrored image matches (+x left).

import { LM, type P4, type PoseFrame } from '../../src/core/pose';
import type { Recording } from '../../src/core/recording';
import type { V3 } from '../../src/core/analysis';

export const ASPECT = 4 / 3;

/** World positions (m) of a person standing facing the camera, arms down. */
export function standing(): Record<number, V3> {
  return {
    [LM.NOSE]: [0, -0.6, -0.1],
    [LM.SHOULDER_L]: [0.18, -0.45, 0],
    [LM.SHOULDER_R]: [-0.18, -0.45, 0],
    [LM.ELBOW_L]: [0.2, -0.18, 0],
    [LM.ELBOW_R]: [-0.2, -0.18, 0],
    [LM.WRIST_L]: [0.2, 0.05, -0.05],
    [LM.WRIST_R]: [-0.2, 0.05, -0.05],
    [LM.INDEX_L]: [0.2, 0.12, -0.05],
    [LM.INDEX_R]: [-0.2, 0.12, -0.05],
    [LM.HIP_L]: [0.1, 0, 0],
    [LM.HIP_R]: [-0.1, 0, 0],
  };
}

/**
 * One frame: world = the given body, image = a simple orthographic camera (1 m → 0.4 image
 * height) centered on the hips, with image depth = world z scaled the same way.
 */
export function frameFrom(t: number, body: Record<number, V3>, vis = 0.99): PoseFrame {
  const lm: P4[] = [];
  const wl: P4[] = [];
  for (let i = 0; i < 33; i++) {
    const p = body[i] ?? [0, 0.5, 0];
    wl.push([p[0], p[1], p[2], vis]);
    lm.push([0.5 + (p[0] * 0.4) / ASPECT, 0.6 + p[1] * 0.4, (p[2] * 0.4) / ASPECT, vis]);
  }
  return { t, lm, wl };
}

export function recordingOf(frames: PoseFrame[], note = 'synthetic'): Recording {
  return {
    meta: { version: 1, createdAt: '2026-01-01T00:00:00Z', note, aspect: ASPECT, videoWidth: 640, videoHeight: 480, model: 'lite', delegate: 'CPU' },
    frames,
  };
}

/** Frames at `fps` for `ms`, the body produced by `at(tMs)`. */
export function animate(ms: number, at: (t: number) => Record<number, V3>, fps = 30): PoseFrame[] {
  const out: PoseFrame[] = [];
  for (let t = 0; t <= ms; t += 1000 / fps) out.push(frameFrom(t, at(t)));
  return out;
}

export function withWrist(body: Record<number, V3>, idx: number, offset: V3): Record<number, V3> {
  const p = body[idx];
  return { ...body, [idx]: [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]] };
}
