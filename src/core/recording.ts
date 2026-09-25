// Recording format — the same v1 JSON as Shadow Mitts (recordings/README.md), so files and tools
// stay interchangeable. Fishing adds optional meta (rod hand, mirror) and per-frame inference time.

import type { P4, PoseFrame, Side } from './pose';

export const RECORDING_VERSION = 1;

export interface RecordingMeta {
  version: number;
  createdAt: string;
  /** Free text, e.g. "오른손 대, 오버헤드 캐스팅 10회 (정면)". */
  note: string;
  /** videoWidth / videoHeight. Needed to turn normalized x/y into an isotropic space. */
  aspect: number;
  videoWidth: number;
  videoHeight: number;
  model: string;
  delegate: string;
  /** Hand holding the (imaginary) rod. Reeling hand is the other one. */
  rodHand?: Side;
  /** Whether the on-screen view was mirrored while recording (display only — data is never mirrored). */
  mirrorView?: boolean;
  /** Frame rate the camera reported (track settings). */
  cameraFps?: number;
}

export interface RecordedFrame extends PoseFrame {
  /** detectForVideo time for this frame, ms (camera recordings only). */
  ms?: number;
}

export interface Recording {
  meta: RecordingMeta;
  frames: RecordedFrame[];
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;
const roundPoints = (pts: P4[] | null): P4[] | null =>
  pts ? pts.map((p) => [round(p[0]), round(p[1]), round(p[2]), round(p[3])] as P4) : null;

/** Frame times are rebased so the first frame is t=0. */
export function serializeRecording(rec: Recording): string {
  const t0 = rec.frames.length ? rec.frames[0].t : 0;
  const frames = rec.frames.map((f) => {
    const out: Record<string, unknown> = {
      t: Math.round((f.t - t0) * 10) / 10,
      lm: roundPoints(f.lm),
      wl: roundPoints(f.wl),
    };
    if (typeof f.ms === 'number') out.ms = Math.round(f.ms * 10) / 10;
    return out;
  });
  return JSON.stringify({ meta: rec.meta, frames });
}

function parsePoints(v: unknown, where: string): P4[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) throw new Error(`${where}: 배열이 아님`);
  return v.map((p, i) => {
    if (!Array.isArray(p) || p.length !== 4 || !p.every((n) => typeof n === 'number')) {
      throw new Error(`${where}[${i}]: [x,y,z,v] 형식이 아님`);
    }
    return p as P4;
  });
}

export function parseRecording(text: string): Recording {
  const raw = JSON.parse(text) as { meta?: Partial<RecordingMeta>; frames?: unknown[] };
  if (!raw || typeof raw !== 'object' || !raw.meta || !Array.isArray(raw.frames)) {
    throw new Error('녹화 파일 형식이 아닙니다 (meta/frames 없음)');
  }
  if (raw.meta.version !== RECORDING_VERSION) {
    throw new Error(`지원하지 않는 녹화 버전: ${String(raw.meta.version)}`);
  }
  const aspect = raw.meta.aspect;
  if (typeof aspect !== 'number' || !(aspect > 0)) throw new Error('meta.aspect가 없거나 잘못됨');

  let prevT = -Infinity;
  const frames = raw.frames.map((f, i): RecordedFrame => {
    const fr = f as { t?: unknown; lm?: unknown; wl?: unknown; ms?: unknown };
    if (typeof fr.t !== 'number') throw new Error(`frames[${i}].t가 숫자가 아님`);
    if (fr.t < prevT) throw new Error(`frames[${i}].t가 감소함`);
    prevT = fr.t;
    const out: RecordedFrame = { t: fr.t, lm: parsePoints(fr.lm, `frames[${i}].lm`), wl: parsePoints(fr.wl, `frames[${i}].wl`) };
    if (typeof fr.ms === 'number') out.ms = fr.ms;
    return out;
  });

  const m = raw.meta;
  return {
    meta: {
      version: RECORDING_VERSION,
      createdAt: String(m.createdAt ?? ''),
      note: String(m.note ?? ''),
      aspect,
      videoWidth: Number(m.videoWidth ?? 0),
      videoHeight: Number(m.videoHeight ?? 0),
      model: String(m.model ?? ''),
      delegate: String(m.delegate ?? ''),
      ...(m.rodHand === 'left' || m.rodHand === 'right' ? { rodHand: m.rodHand } : {}),
      ...(typeof m.mirrorView === 'boolean' ? { mirrorView: m.mirrorView } : {}),
      ...(typeof m.cameraFps === 'number' ? { cameraFps: m.cameraFps } : {}),
    },
    frames,
  };
}
