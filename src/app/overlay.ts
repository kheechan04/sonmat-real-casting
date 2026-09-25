// Webcam view + skeleton overlay (adapted from Shadow Mitts src/app/overlay.ts).
// Landmarks stay in camera space; only the drawing is mirrored.

import { LM, UPPER_BODY_EDGES, type P4, type PoseFrame, type Side } from '../core/pose';

export const SIDE_COLOR = { left: '#22d3ee', right: '#fb923c' } as const;

const LEFT_POINTS = new Set<number>([LM.SHOULDER_L, LM.ELBOW_L, LM.WRIST_L, LM.INDEX_L, LM.PINKY_L, LM.HIP_L]);
const RIGHT_POINTS = new Set<number>([LM.SHOULDER_R, LM.ELBOW_R, LM.WRIST_R, LM.INDEX_R, LM.PINKY_R, LM.HIP_R]);

export function colorFor(i: number): string {
  if (LEFT_POINTS.has(i)) return SIDE_COLOR.left;
  if (RIGHT_POINTS.has(i)) return SIDE_COLOR.right;
  return '#e5e7eb';
}

export interface OverlayOptions {
  /** Draw as a mirror (selfie view). */
  mirror: boolean;
  video: HTMLVideoElement | null;
  minVisibility: number;
  rodHand: Side;
  /** Recent frames for the wrist trails (oldest first). */
  trail?: PoseFrame[];
  /** Big text in the middle (recording countdown). */
  banner?: string;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, frame: PoseFrame | null, opts: OverlayOptions): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.save();
  if (opts.video && opts.video.readyState >= 2) {
    if (opts.mirror) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(opts.video, 0, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();

  const px = (p: P4) => (opts.mirror ? 1 - p[0] : p[0]) * w;
  const py = (p: P4) => p[1] * h;
  const lw = Math.max(2, w / 220);

  // wrist trails
  if (opts.trail && opts.trail.length > 1) {
    for (const [idx, color] of [
      [LM.WRIST_L, SIDE_COLOR.left],
      [LM.WRIST_R, SIDE_COLOR.right],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      let prev: P4 | null = null;
      opts.trail.forEach((f, k) => {
        const p = f.lm?.[idx];
        const ok = p && p[3] >= opts.minVisibility;
        if (ok && prev) {
          ctx.globalAlpha = 0.1 + 0.6 * (k / opts.trail!.length);
          ctx.beginPath();
          ctx.moveTo(px(prev), py(prev));
          ctx.lineTo(px(p), py(p));
          ctx.stroke();
        }
        prev = ok ? p : null;
      });
    }
    ctx.globalAlpha = 1;
  }

  if (frame?.lm) {
    const lm = frame.lm;
    ctx.lineWidth = lw;
    for (const [a, b] of UPPER_BODY_EDGES) {
      const pa = lm[a];
      const pb = lm[b];
      const weak = pa[3] < opts.minVisibility || pb[3] < opts.minVisibility;
      const same = colorFor(a) === colorFor(b);
      ctx.strokeStyle = weak ? 'rgba(148,163,184,0.35)' : same ? colorFor(a) : '#e5e7eb';
      ctx.setLineDash(weak ? [lw * 2, lw * 2] : []);
      ctx.beginPath();
      ctx.moveTo(px(pa), py(pa));
      ctx.lineTo(px(pb), py(pb));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const i of [LM.NOSE, ...LEFT_POINTS, ...RIGHT_POINTS]) {
      const p = lm[i];
      ctx.fillStyle = p[3] < opts.minVisibility ? 'rgba(148,163,184,0.5)' : colorFor(i);
      ctx.beginPath();
      ctx.arc(px(p), py(p), lw * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Wrist labels — the main tool for checking left/right under mirroring.
    const font = Math.round(Math.max(12, w / 40));
    ctx.font = `bold ${font}px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    for (const side of ['left', 'right'] as const) {
      const i = side === 'left' ? LM.WRIST_L : LM.WRIST_R;
      const role = side === opts.rodHand ? '대' : '릴';
      const label = `${side === 'left' ? 'L 왼손' : 'R 오른손'} (${i}) · ${role}`;
      const p = lm[i];
      const x = Math.min(w - font * 6, Math.max(4, px(p) - font));
      const y = py(p) - lw * 3;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(label, x, y);
      ctx.fillStyle = SIDE_COLOR[side];
      ctx.fillText(label, x, y);
    }
  }

  if (opts.banner) {
    const big = Math.round(h / 4);
    ctx.font = `900 ${big}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(opts.banner, w / 2, h / 2);
    ctx.fillStyle = '#fde047';
    ctx.fillText(opts.banner, w / 2, h / 2);
    ctx.textAlign = 'start';
  }
}
