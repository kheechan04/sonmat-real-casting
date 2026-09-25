// Mirror a pose left↔right (copied from Shadow Mitts). Turns a right-hand-rod recording into
// left-hand-rod test data, so both hand setups are covered by one set of recordings.
// Axes (verified in Shadow Mitts M0; re-checked here — docs/VERIFICATION.md): image +x and
// world +x both point to the person's LEFT, so mirroring
// flips x (image: x → 1 − x, world: x → −x) and swaps every left/right landmark pair.

import type { P4, PoseFrame } from './pose';
import type { Recording } from './recording';

// MediaPipe Pose 33-landmark left/right pairs.
const PAIRS: [number, number][] = [
  [1, 4], [2, 5], [3, 6], [7, 8], [9, 10],
  [11, 12], [13, 14], [15, 16], [17, 18], [19, 20], [21, 22],
  [23, 24], [25, 26], [27, 28], [29, 30], [31, 32],
];
const SWAP: number[] = Array.from({ length: 33 }, (_, i) => i);
for (const [a, b] of PAIRS) {
  SWAP[a] = b;
  SWAP[b] = a;
}

function mirrorPoints(pts: P4[] | null, flipX: (x: number) => number): P4[] | null {
  if (!pts) return null;
  return pts.map((_, i) => {
    const p = pts[SWAP[i]];
    return [flipX(p[0]), p[1], p[2], p[3]] as P4;
  });
}

export function mirrorFrame(f: PoseFrame): PoseFrame {
  return {
    t: f.t,
    lm: mirrorPoints(f.lm, (x) => 1 - x),
    wl: mirrorPoints(f.wl, (x) => -x),
  };
}

export function mirrorRecording(rec: Recording): Recording {
  const rodHand = rec.meta.rodHand && (rec.meta.rodHand === 'left' ? 'right' : 'left');
  return {
    meta: { ...rec.meta, note: `${rec.meta.note} (mirrored)`, ...(rodHand ? { rodHand } : {}) },
    frames: rec.frames.map((f) => ({ ...mirrorFrame(f), ...(f.ms !== undefined ? { ms: f.ms } : {}) })),
  };
}
