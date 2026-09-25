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

function count(rec: Recording, step = 1) {
  const g = new GestureTracker(() => defaultParams());
  const c = { cast: 0, hookset: 0, reel: 0 };
  rec.frames.forEach((f, i) => {
    if (i % step) return;
    for (const e of g.update(f, rec.meta.rodHand ?? 'right', rec.meta.aspect)) c[e.type]++;
  });
  return c;
}

const has = (...ids: string[]) => ids.every((id) => recs.has(id));

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

    it(`reel turns: counted while reeling, none standing still (${fps})`, () => {
      const d1 = count(recs.get('D1')!, step).reel; // offline analysis: ~70
      const d3 = count(recs.get('D3')!, step).reel; // ~86, faster
      expect(d1).toBeGreaterThanOrEqual(55);
      expect(d3).toBeGreaterThan(d1);
      expect(count(recs.get('E1')!, step).reel).toBeLessThanOrEqual(2);
    });
  }
});
