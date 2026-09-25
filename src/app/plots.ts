// M0 plots: raw coordinates over time, and the wrist paths seen from the front / side / top.
// Stateless — every draw takes the frames to show, so camera and replay share the same code.

import { imageRel } from '../core/analysis';
import { LM, type PoseFrame } from '../core/pose';
import { SIDE_COLOR, colorFor } from './overlay';

export type Space = 'world-rel' | 'world' | 'image-rel';

export const SPACE_LABEL: Record<Space, string> = {
  'world-rel': '월드 좌표 − 같은 쪽 어깨 (m)',
  world: '월드 좌표 원본 (m, 원점 = 골반 중심)',
  'image-rel': '이미지 좌표 − 같은 쪽 어깨 (몸통 길이 단위)',
};

const SHOULDER_OF: Record<number, number> = {
  [LM.WRIST_L]: LM.SHOULDER_L, [LM.ELBOW_L]: LM.SHOULDER_L, [LM.INDEX_L]: LM.SHOULDER_L,
  [LM.WRIST_R]: LM.SHOULDER_R, [LM.ELBOW_R]: LM.SHOULDER_R, [LM.INDEX_R]: LM.SHOULDER_R,
};

/** x, y, z of one landmark in the chosen space, or null. */
export function coords(f: PoseFrame, idx: number, space: Space, aspect: number, minVis: number): [number, number, number] | null {
  if (space === 'image-rel') {
    const l = f.lm;
    if (!l || l[idx][3] < minVis) return null;
    return imageRel(l, idx, SHOULDER_OF[idx] ?? LM.SHOULDER_L, aspect);
  }
  const w = f.wl;
  if (!w || w[idx][3] < minVis) return null;
  if (space === 'world') return [w[idx][0], w[idx][1], w[idx][2]];
  const o = w[SHOULDER_OF[idx] ?? LM.SHOULDER_L];
  return [w[idx][0] - o[0], w[idx][1] - o[1], w[idx][2] - o[2]];
}

const AXIS_COLOR = ['#f87171', '#4ade80', '#60a5fa'];

function bg(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#0b0f17';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * Three lanes (x, y, z) of one landmark over the last `windowMs`, plus a speed lane.
 * Each lane autoscales symmetrically around its window mean so small motions stay visible;
 * the printed range tells the actual size.
 */
export function drawTimeSeries(
  canvas: HTMLCanvasElement,
  frames: PoseFrame[],
  idx: number,
  space: Space,
  aspect: number,
  minVis: number,
  windowMs = 6000,
  marks: number[] = [],
): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  bg(ctx);
  if (!frames.length) return;
  const tEnd = frames[frames.length - 1].t;
  const win = frames.filter((f) => f.t >= tEnd - windowMs);
  const pts = win.map((f) => ({ t: f.t, p: coords(f, idx, space, aspect, minVis) }));
  const x = (t: number) => w - ((tEnd - t) / windowMs) * w;
  const lanes = 4;
  const lh = h / lanes;
  ctx.font = '11px system-ui, sans-serif';

  // speed lane source
  const spd: { t: number; v: number }[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (!a.p || !b.p || b.t <= a.t) continue;
    spd.push({ t: b.t, v: Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]) / ((b.t - a.t) / 1000) });
  }

  for (let lane = 0; lane < lanes; lane++) {
    const top = lane * lh;
    ctx.strokeStyle = 'rgba(148,163,184,0.25)';
    ctx.beginPath();
    ctx.moveTo(0, top + lh);
    ctx.lineTo(w, top + lh);
    ctx.stroke();
    let series: { t: number; v: number }[];
    let label: string;
    if (lane < 3) {
      series = pts.filter((q) => q.p).map((q) => ({ t: q.t, v: q.p![lane] }));
      label = ['x', 'y', 'z'][lane];
    } else {
      series = spd;
      label = '속도 (/s)';
    }
    ctx.fillStyle = lane < 3 ? AXIS_COLOR[lane] : '#e5e7eb';
    if (!series.length) {
      ctx.fillText(`${label}: —`, 4, top + 12);
      continue;
    }
    const vs = series.map((s) => s.v);
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    if (lane === 3) lo = 0;
    const minSpan = space === 'image-rel' ? 0.2 : 0.05;
    if (hi - lo < minSpan) {
      const c = (hi + lo) / 2;
      lo = lane === 3 ? 0 : c - minSpan / 2;
      hi = lane === 3 ? minSpan : c + minSpan / 2;
    }
    const y = (v: number) => top + lh - 3 - ((v - lo) / (hi - lo)) * (lh - 16);
    const last = series[series.length - 1].v;
    ctx.fillText(`${label}  ${last >= 0 ? '+' : ''}${last.toFixed(3)}   [${lo.toFixed(2)} … ${hi.toFixed(2)}]`, 4, top + 12);
    if (lane < 3 && lo < 0 && hi > 0) {
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y(0));
      ctx.lineTo(w, y(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = lane < 3 ? AXIS_COLOR[lane] : '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let prevT = -Infinity;
    for (const s of series) {
      // break the line across detection gaps
      if (s.t - prevT > 250) ctx.moveTo(x(s.t), y(s.v));
      else ctx.lineTo(x(s.t), y(s.v));
      prevT = s.t;
    }
    ctx.stroke();
  }
  // markers (e.g. recording start/stop)
  ctx.strokeStyle = '#fde047';
  for (const m of marks) {
    if (m < tEnd - windowMs) continue;
    ctx.beginPath();
    ctx.moveTo(x(m), 0);
    ctx.lineTo(x(m), h);
    ctx.stroke();
  }
}

export type View = 'front' | 'side' | 'top';

export const VIEW_LABEL: Record<View, string> = {
  front: '정면 (월드 x–y)',
  side: '옆 (월드 z–y)',
  top: '위 (월드 x–z)',
};

/**
 * One projection of the world skeleton (origin = hip midpoint) with both wrist trails.
 * Axis signs are drawn raw (+x right, +y down; side: +z right; top: +z down) — the
 * meaning of each sign is what M0 is measuring, so nothing is flipped to "look right".
 */
export function drawView(canvas: HTMLCanvasElement, frames: PoseFrame[], view: View, minVis: number, trailMs = 2500): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  bg(ctx);
  const scale = Math.min(w, h) / 1.6; // 1.6 m across
  const cx = w / 2;
  const cy = view === 'top' ? h / 2 : h * 0.62;
  const proj = (p: number[]): [number, number] => {
    switch (view) {
      case 'front':
        return [cx + p[0] * scale, cy + p[1] * scale];
      case 'side':
        return [cx + p[2] * scale, cy + p[1] * scale];
      case 'top':
        return [cx + p[0] * scale, cy + p[2] * scale];
    }
  };
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(VIEW_LABEL[view], 4, 12);
  const [ha, va] = { front: ['+x →', '+y ↓'], side: ['+z →', '+y ↓'], top: ['+x →', '+z ↓'] }[view];
  ctx.fillText(ha, w - 34, h - 4);
  ctx.fillText(va, 4, h - 4);
  // crosshair at the origin
  ctx.strokeStyle = 'rgba(148,163,184,0.2)';
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
  if (!frames.length) return;
  const tEnd = frames[frames.length - 1].t;
  const trail = frames.filter((f) => f.t >= tEnd - trailMs);

  for (const [idx, color] of [
    [LM.WRIST_L, SIDE_COLOR.left],
    [LM.WRIST_R, SIDE_COLOR.right],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    let prev: [number, number] | null = null;
    trail.forEach((f, k) => {
      const p = f.wl?.[idx];
      const q = p && p[3] >= minVis ? proj(p) : null;
      if (q && prev) {
        ctx.globalAlpha = 0.15 + 0.85 * (k / trail.length);
        ctx.beginPath();
        ctx.moveTo(prev[0], prev[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
      }
      prev = q;
    });
  }
  ctx.globalAlpha = 1;

  const cur = frames[frames.length - 1].wl;
  if (!cur) return;
  const edges: [number, number][] = [
    [LM.SHOULDER_L, LM.SHOULDER_R], [LM.HIP_L, LM.HIP_R],
    [LM.SHOULDER_L, LM.HIP_L], [LM.SHOULDER_R, LM.HIP_R],
    [LM.SHOULDER_L, LM.ELBOW_L], [LM.ELBOW_L, LM.WRIST_L],
    [LM.SHOULDER_R, LM.ELBOW_R], [LM.ELBOW_R, LM.WRIST_R],
  ];
  ctx.lineWidth = 2;
  for (const [a, b] of edges) {
    ctx.strokeStyle = colorFor(a) === colorFor(b) ? colorFor(a) : '#e5e7eb';
    const [x1, y1] = proj(cur[a]);
    const [x2, y2] = proj(cur[b]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  const [nx, ny] = proj(cur[LM.NOSE]);
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath();
  ctx.arc(nx, ny, 4, 0, Math.PI * 2);
  ctx.fill();
}
