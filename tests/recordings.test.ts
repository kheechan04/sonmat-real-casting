// Regression floor on the user's M0 recordings (recordings/*.json, not in git — skipped when
// absent). Expected counts are what the M0 analysis found and the user confirmed (docs/VERIFICATION.md;
// timed items were repeated until auto-stop, so e.g. B1 has 11 casts, not 10).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GestureTracker } from '../src/core/gestures';
import { defaultParams } from '../src/core/params';
import { matchNote } from '../src/core/protocol';
import { parseRecording, type Recording } from '../src/core/recording';

const DIR = 'recordings';
const recs = new Map<string, Recording>();
if (existsSync(DIR)) {
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    const rec = parseRecording(readFileSync(`${DIR}/${f}`, 'utf8'));
    const id = matchNote(rec.meta.note)?.id;
    if (id) recs.set(id, rec);
  }
}

/** Gesture counts, plus reeled turns = the reel rate integrated over time. */
function count(rec: Recording, step = 1) {
  const g = new GestureTracker(() => defaultParams());
  const c = { cast: 0, hookset: 0, pump: 0, reel: 0, aims: [] as number[] };
  let prevT: number | null = null;
  rec.frames.forEach((f, i) => {
    if (i % step) return;
    for (const e of g.update(f, rec.meta.rodHand ?? 'right', rec.meta.aspect)) {
      c[e.type]++;
      if (e.type === 'cast') c.aims.push(e.aim);
    }
    if (prevT !== null) c.reel += (g.state(f.t).reelRate * (f.t - prevT)) / 1000;
    prevT = f.t;
  });
  return c;
}

const has = (...ids: string[]) => ids.every((id) => recs.has(id));

// Framed from the navel up (hips out of frame 96–100%), recorded at 15 fps — the user's closer stance.
describe.skipIf(!has('F1', 'F2', 'F3'))('M1.5 recordings, standing close (hips out of frame)', () => {
  it('casts, hook-sets and reeling still register', () => {
    expect(count(recs.get('F1')!).cast).toBe(10);
    expect(count(recs.get('F2')!).hookset).toBe(14);
    expect(count(recs.get('F2')!).cast).toBe(0);
    expect(count(recs.get('F3')!).reel).toBeGreaterThanOrEqual(50); // 20 s, normal then fast
  });
  it.skipIf(!has('F4'))('no cast or hook-set while fidgeting close to the camera', () => {
    const c = count(recs.get('F4')!);
    expect(c.cast).toBe(0);
    expect(c.hookset).toBe(0);
  });
});

describe.skipIf(!has('B1', 'B3', 'E2', 'C1', 'C2', 'C3', 'E1', 'E3', 'D1', 'D3'))('M0 recordings', () => {
  // 30 fps as recorded, and thinned to 15 fps (dark rooms drop webcams to 15 fps — Shadow Mitts)
  for (const step of [1, 2]) {
    const fps = step === 1 ? '30fps' : '15fps';

    it(`casts: every cast found (${fps})`, () => {
      expect(count(recs.get('B1')!, step).cast).toBe(11);
      expect(count(recs.get('B3')!, step).cast).toBe(14);
      expect(count(recs.get('E2')!, step).cast).toBe(5);
    });

    it(`hook-sets: big, short and mixed all found (${fps})`, () => {
      expect(count(recs.get('C1')!, step).hookset).toBe(10);
      expect(count(recs.get('C2')!, step).hookset).toBe(11);
      expect(count(recs.get('C3')!, step).hookset).toBe(16);
    });

    it(`no cast or hook-set while standing still or fidgeting (${fps})`, () => {
      for (const id of ['E1', 'E3']) {
        const c = count(recs.get(id)!, step);
        expect(c.cast).toBe(0);
        expect(c.hookset).toBe(0);
      }
    });

  }

  // Reeling at 30 / 15 / 10 fps. Turn counting lost a third of fast reeling (D3: 83 → 55) at 10 fps.
  // The rate model keeps fast reeling ≥ normal at 30/15 fps and within 10% at 10 fps
  // (fast, small circles lose the most to sparse frames: 10 fps D1 58 / D3 55 turns).
  for (const step of [1, 2, 3]) {
    const fps = `${30 / step}fps`;
    it(`reeling: normal and fast reeling both register, standing still does not (${fps})`, () => {
      const d1 = count(recs.get('D1')!, step).reel; // 20 s, offline analysis ~70 turns
      const d3 = count(recs.get('D3')!, step).reel; // 20 s, ~86 turns (faster, smaller circles)
      expect(d1).toBeGreaterThanOrEqual(45);
      expect(d3).toBeGreaterThanOrEqual(d1 * (step === 3 ? 0.9 : 1));
      expect(count(recs.get('E1')!, step).reel).toBeLessThan(1);
    });
  }
});

// M3 moves (standing close, 30 fps; also checked at 15 / 10 fps). docs/VERIFICATION.md "M3 새 동작".
describe.skipIf(!has('G1', 'G2', 'G3', 'G4', 'G5'))('M3 recordings: cast aim and pumping', () => {
  for (const step of [1, 2, 3]) {
    const fps = `${30 / step}fps`;
    it(`cast aim: left, right and left→centre→right are told apart (${fps})`, () => {
      const g1 = count(recs.get('G1')!, step);
      const g2 = count(recs.get('G2')!, step);
      expect(g1.cast).toBe(7);
      expect(g2.cast).toBe(7);
      for (const a of g1.aims) expect(a).toBeGreaterThan(0.5); // + = the player's left
      for (const a of g2.aims) expect(a).toBeLessThan(-0.4);
      const g3 = count(recs.get('G3')!, step);
      expect(g3.cast).toBe(15); // 5 rounds of left, centre, right
      g3.aims.forEach((a, i) => {
        if (i % 3 === 0) expect(a).toBeGreaterThan(0.5);
        else if (i % 3 === 1) expect(a).toBe(0);
        else expect(a).toBeLessThan(-0.5);
      });
    });

    it(`pumping: every lift in G4 counts, reeling alone never does (${fps})`, () => {
      expect(count(recs.get('G4')!, step).pump).toBe(6);
      for (const id of ['D1', 'D3', 'F3', 'G5', 'E1', 'E3']) {
        if (recs.has(id)) expect(count(recs.get(id)!, step).pump, id).toBe(0);
      }
    });
  }
});

// M3 rod work: the rod arm held out to a side (G6) vs reeling / fidgeting with the arm in place.
describe.skipIf(!has('G6', 'F3', 'E3'))('M3 recordings: rod work (arm held out sideways)', () => {
  /** share of seen frames with the rod arm beyond sweep.min to the left / right */
  const sides = (rec: Recording) => {
    const P = defaultParams();
    const g = new GestureTracker(() => P);
    let left = 0;
    let right = 0;
    let n = 0;
    for (const f of rec.frames) {
      g.update(f, rec.meta.rodHand ?? 'right', rec.meta.aspect);
      const s = g.state(f.t).rodSide;
      if (s === null) continue;
      n++;
      if (s >= P['sweep.min']) left++;
      if (s <= -P['sweep.min']) right++;
    }
    return { left: left / n, right: right / n };
  };
  it('G6 holds the arm out to both sides for a good part of the time; reeling and fidgeting never do', () => {
    const g6 = sides(recs.get('G6')!);
    expect(g6.left).toBeGreaterThan(0.1);
    expect(g6.right).toBeGreaterThan(0.1);
    for (const id of ['F3', 'E3', 'D1', 'G4', 'G5']) {
      if (!recs.has(id)) continue;
      const s = sides(recs.get(id)!);
      expect(s.left + s.right, id).toBe(0);
    }
  });
});
