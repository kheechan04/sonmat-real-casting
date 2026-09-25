import { describe, expect, it } from 'vitest';
import {
  circleStats,
  findSwings,
  handActivity,
  oscillations,
  reachDirection,
  reelCircles,
  timing,
  worldImageAgreement,
  worldTrack,
} from '../src/core/analysis';
import { mirrorRecording } from '../src/core/mirror';
import { ARM, LM } from '../src/core/pose';
import { matchNote, noteFor, PROTOCOL } from '../src/core/protocol';
import { parseRecording, serializeRecording } from '../src/core/recording';
import { animate, recordingOf, standing, withWrist } from './helpers/synth';

const R = LM.WRIST_R;

describe('recording format', () => {
  it('round-trips meta extras and per-frame inference time', () => {
    const rec = recordingOf(animate(200, () => standing()));
    rec.meta.rodHand = 'right';
    rec.meta.mirrorView = true;
    rec.meta.cameraFps = 30;
    rec.frames[1].lm = null;
    rec.frames[1].wl = null;
    (rec.frames[2] as { ms?: number }).ms = 41.234;
    const back = parseRecording(serializeRecording(rec));
    expect(back.meta.rodHand).toBe('right');
    expect(back.meta.mirrorView).toBe(true);
    expect(back.meta.cameraFps).toBe(30);
    expect(back.frames[0].t).toBe(0);
    expect(back.frames[1].wl).toBeNull();
    expect(back.frames[2].ms).toBe(41.2);
    expect(back.frames).toHaveLength(rec.frames.length);
  });

  it('reads Shadow Mitts files (no fishing meta)', () => {
    const text = JSON.stringify({
      meta: { version: 1, createdAt: 'x', note: '사우스포, 리드 잽 10회', aspect: 1.333, videoWidth: 640, videoHeight: 480, model: 'lite', delegate: 'GPU' },
      frames: [{ t: 0, lm: null, wl: null }],
    });
    const rec = parseRecording(text);
    expect(rec.meta.rodHand).toBeUndefined();
    expect(rec.frames[0].ms).toBeUndefined();
  });

  it('rejects other versions', () => {
    expect(() => parseRecording('{"meta":{"version":2,"aspect":1},"frames":[]}')).toThrow(/버전/);
  });
});

describe('protocol notes', () => {
  it('every checklist note maps back to its item, for either rod hand and mirrored', () => {
    for (const item of PROTOCOL) {
      for (const rod of ['left', 'right'] as const) {
        expect(matchNote(noteFor(item, rod))?.id).toBe(item.id);
        expect(matchNote(`${noteFor(item, rod)} (mirrored)`)?.id).toBe(item.id);
      }
    }
    expect(noteFor(PROTOCOL.find((p) => p.id === 'D1')!, 'right')).toMatch(/^왼손 릴/);
    expect(matchNote('자유롭게')).toBeNull();
  });
});

describe('mirror', () => {
  it('swaps the rod hand and the wrists, and is its own inverse', () => {
    const rec = recordingOf(animate(300, (t) => withWrist(standing(), R, [-0.3 * (t / 300), 0, 0])));
    rec.meta.rodHand = 'right';
    const m = mirrorRecording(rec);
    expect(m.meta.rodHand).toBe('left');
    expect(handActivity(m).dominant).toBe('left');
    const mm = mirrorRecording(m);
    expect(mm.frames[5].wl![R][0]).toBeCloseTo(rec.frames[5].wl![R][0], 9);
  });
});

describe('analysis', () => {
  it('timing: fps from the frame interval', () => {
    const s = timing(recordingOf(animate(2000, () => standing(), 25)));
    expect(s.fps).toBeCloseTo(25, 0);
    expect(s.detected).toBe(1);
  });

  it('handActivity: finds the hand that moved', () => {
    const rec = recordingOf(animate(1000, (t) => withWrist(standing(), R, [0, -0.4 * Math.sin(t / 150) ** 2, 0])));
    const a = handActivity(rec);
    expect(a.dominant).toBe('right');
    expect(a.ratio).toBeGreaterThan(10);
  });

  it('reachDirection: right arm out to the side → world −x, image −x', () => {
    // out and back three times; rest for the first 0.6 s
    const rec = recordingOf(
      animate(4000, (t) => {
        const u = t < 600 ? 0 : Math.max(0, Math.sin(((t - 600) / 3400) * 3 * Math.PI));
        return withWrist(standing(), R, [-0.45 * u, 0, 0]);
      }),
    );
    const d = reachDirection(rec, 'right')!;
    expect(d.world[0]).toBeLessThan(-0.95);
    expect(d.image[0]).toBeLessThan(-0.95);
    expect(d.reachM).toBeGreaterThan(0.3);
    const agree = worldImageAgreement(rec, R, ARM.right.shoulder);
    expect(agree[0]).toBeGreaterThan(0.99);
  });

  it('findSwings: one entry per fast forward-down swing, with consistent direction', () => {
    // three casts: slow wind-up back/up (600 ms), fast swing forward/down (150 ms), hold
    const cast = (t: number) => {
      const k = t % 1500;
      if (k < 600) return (k / 600);
      if (k < 750) return 1 - (k - 600) / 150;
      return 0;
    };
    const rec = recordingOf(
      animate(4500, (t) => {
        const u = cast(t);
        return withWrist(standing(), R, [0, -0.5 * u, 0.3 * u]);
      }, 60),
    );
    const s = findSwings(rec, 'right');
    expect(s).toHaveLength(3);
    for (const sw of s) {
      expect(sw.dWorld[1]).toBeGreaterThan(0); // moving down
      expect(sw.dWorld[2]).toBeLessThan(0); // moving toward the camera
    }
  });

  it('findSwings: still finds a swing when the wrist is lost just before it (behind the head)', () => {
    const cast = (t: number) => {
      const k = t % 1500;
      if (k < 600) return k / 600;
      if (k < 750) return 1 - (k - 600) / 150;
      return 0;
    };
    const rec = recordingOf(animate(4500, (t) => withWrist(standing(), R, [0, -0.5 * cast(t), 0.3 * cast(t)]), 30));
    // drop the wrist for 300 ms at the top of each wind-up
    for (const f of rec.frames) {
      const k = f.t % 1500;
      if (k > 300 && k < 600) f.wl![R][3] = f.lm![R][3] = 0.2;
    }
    const s = findSwings(rec, 'right');
    expect(s).toHaveLength(3);
    for (const sw of s) expect(sw.dWorld[1]).toBeGreaterThan(0.2);
  });

  it('oscillations: counts crank wobble, ignores standing-still jitter', () => {
    const ms = 10_000;
    const reel = recordingOf(
      animate(ms, (t) => {
        const a = (t / 1000) * 3 * 2 * Math.PI; // 3 turns/s, small flat ellipse
        return withWrist(standing(), LM.WRIST_L, [0.01 * Math.cos(a), 0.04 * Math.sin(a), 0.03 * Math.cos(a)]);
      }),
    );
    const n = oscillations(worldTrack(reel, LM.WRIST_L, ARM.left.shoulder), 1, 0.015);
    expect(n).toBeGreaterThanOrEqual(29);
    expect(n).toBeLessThanOrEqual(31);
    const still = recordingOf(
      animate(ms, (t) => withWrist(standing(), LM.WRIST_L, [0, 0.005 * Math.sin(t * 0.37), 0])),
    );
    expect(oscillations(worldTrack(still, LM.WRIST_L, ARM.left.shoulder), 1, 0.015)).toBe(0);
  });

  it('circleStats: a crank circle in the side (y–z) plane shows up only there', () => {
    const turnsWanted = 6;
    const ms = 6000;
    const rec = recordingOf(
      animate(ms, (t) => {
        const a = (t / ms) * turnsWanted * 2 * Math.PI;
        return withWrist(standing(), LM.WRIST_L, [0, 0.1 * Math.sin(a), 0.1 * Math.cos(a)]);
      }),
    );
    const c = Object.fromEntries(reelCircles(rec, 'left').map((x) => [x.plane, x]));
    expect(c['world-yz'].roundness).toBeGreaterThan(0.9);
    expect(Math.abs(c['world-yz'].turns)).toBeCloseTo(turnsWanted, 0);
    // seen from the front it is a vertical line
    expect(c['world-xy'].roundness).toBeLessThan(0.1);
    expect(c['image-xy'].roundness).toBeLessThan(0.1);
  });

  it('circleStats: turning direction has a sign', () => {
    const ms = 3000;
    const mk = (dir: 1 | -1) =>
      worldTrack(
        recordingOf(
          animate(ms, (t) => {
            const a = dir * (t / ms) * 3 * 2 * Math.PI;
            return withWrist(standing(), R, [0.1 * Math.cos(a), 0.1 * Math.sin(a), 0]);
          }),
        ),
        R,
        ARM.right.shoulder,
      );
    expect(circleStats(mk(1), 'world-xy').turns).toBeGreaterThan(2.5);
    expect(circleStats(mk(-1), 'world-xy').turns).toBeLessThan(-2.5);
  });
});
