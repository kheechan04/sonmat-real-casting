import { describe, expect, it } from 'vitest';
import { FishingGame, type GameEvent } from '../src/core/game';
import type { GestureEvent } from '../src/core/gestures';
import { defaultParams, type Params } from '../src/core/params';

/** Deterministic RNG: cycles through the given values. */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

const cast = (t: number, strength = 0.5): GestureEvent => ({ type: 'cast', t, strength, peakSpeed: 8 });
const hook = (t: number): GestureEvent => ({ type: 'hookset', t, peakSpeed: 6, rise: 0.8 });

function setup(over: Partial<Params> = {}, rng = seq(0.5)) {
  const P = { ...defaultParams(), ...over };
  const g = new FishingGame(() => P, rng);
  let now = 0;
  const log: GameEvent[] = [];
  /** Advance ms, reeling at `rate` turns/s. */
  const step = (ms: number, rate = 0, every = 50) => {
    for (let t = 0; t < ms; t += every) {
      now += every;
      g.update(now, rate);
      log.push(...g.drain());
    }
  };
  const act = (e: GestureEvent | 'bait') => {
    if (e === 'bait') g.chooseBait('worm', now);
    else g.onGesture({ ...e, t: now }, now);
    log.push(...g.drain());
  };
  return { g, P, step, act, log, now: () => now };
}

/** Params that make the loop fast and certain: bite on the first check, no fake nibbles. */
const FAST: Partial<Params> = {
  'bait.worm.waitMin': 1, 'bait.worm.waitMax': 1, 'bait.worm.biteChance': 1,
  'fish.crucian.spawn': 100, 'fish.carp.spawn': 0, 'fish.crucian.fakeMax': 0,
  'fish.crucian.reelTurns': 10, 'fish.crucian.pullEveryS': 100,
  'bait.worm.crucianMul': 1, 'bait.worm.carpMul': 1, 'bait.worm.sizeBias': 0,
};

describe('fishing loop', () => {
  it('bait → cast → bite → hook-set → reel → caught', () => {
    const s = setup(FAST);
    s.act('bait');
    expect(s.g.phase).toBe('ready');
    s.act(cast(0, 1));
    expect(s.g.phase).toBe('flight');
    expect(s.g.distanceM).toBe(28);
    s.step(1300);
    expect(s.g.phase).toBe('waiting');
    s.step(1000);
    expect(s.g.phase).toBe('bite');
    s.act(hook(0));
    expect(s.g.phase).toBe('reeling');
    const need = s.g.fish!.turnsNeeded;
    s.step((need / 3) * 1000 - 300, 3);
    expect(s.g.phase).toBe('reeling');
    expect(s.g.lineOutM()).toBeGreaterThan(0);
    s.step(600, 3);
    expect(s.g.phase).toBe('caught');
    const caught = s.log.find((e) => e.type === 'caught');
    expect(caught && caught.type === 'caught' && caught.fish.species).toBe('crucian');
  });

  it('gestures outside their phase are ignored (wind-up ≠ hook-set, hook-set return ≠ cast)', () => {
    const s = setup(FAST);
    s.act(hook(0)); // in bait selection
    s.act(cast(0)); // in bait selection
    expect(s.g.phase).toBe('bait');
    s.act('bait');
    s.act(hook(0)); // cast wind-up looks like a hook-set
    expect(s.g.phase).toBe('ready');
    s.act(cast(0));
    s.step(2500);
    s.act(hook(0));
    s.act(cast(0)); // the hook-set's return swing
    expect(s.g.phase).toBe('reeling');
  });

  it('hook-set during waiting is harmless', () => {
    const s = setup({ ...FAST, 'bait.worm.waitMin': 5, 'bait.worm.waitMax': 5 });
    s.act('bait');
    s.act(cast(0));
    s.step(2000);
    s.act(hook(0));
    expect(s.g.phase).toBe('waiting');
    expect(s.log.some((e) => e.type === 'ignored')).toBe(true);
  });

  it('bite window: too late → missed "late"; size of the window comes from the species', () => {
    const s = setup({ ...FAST, 'fish.crucian.biteWindowS': 1.0 });
    s.act('bait');
    s.act(cast(0));
    s.step(2300); // bite started at 2200 ms (flight 1.2 s + wait 1 s)
    expect(s.g.phase).toBe('bite');
    s.step(800); // 0.9 s into a 1.0 s window
    expect(s.g.phase).toBe('bite');
    s.step(150);
    expect(s.g.phase).toBe('missed');
    expect(s.g.missReason).toBe('late');
  });

  it('fake nibble: hook-set during it → missed "early"; waiting it out → real bite', () => {
    const over = { ...FAST, 'fish.crucian.fakeMax': 1 };
    // rng 0.99: spawn roll, size, fakeNibbles = floor(0.99 * 2) = 1
    const a = setup(over, seq(0.99));
    a.act('bait');
    a.act(cast(0));
    a.step(2300);
    expect(a.g.phase).toBe('nibble');
    a.act(hook(0));
    expect(a.g.missReason).toBe('early');

    const b = setup(over, seq(0.99));
    b.act('bait');
    b.act(cast(0));
    b.step(2300);
    b.step(4000);
    expect(b.g.phase === 'bite' || b.g.phase === 'missed').toBe(true);
    expect(b.log.filter((e) => e.type === 'nibble')).toHaveLength(1);
    expect(b.log.some((e) => e.type === 'bite')).toBe(true);
  });

  it('a run is announced first, takes line back, and reeling through it snaps the line', () => {
    const over = { ...FAST, 'fish.crucian.pullEveryS': 2, 'fish.crucian.pullS': 5, 'fight.warnS': 0.8, 'fight.tensionPerTurn': 0.2 };
    const s = setup(over);
    s.act('bait');
    s.act(cast(0));
    s.step(2300);
    s.act(hook(0));
    s.step(1000, 3); // run due at 2 s (rng 0.5 → ×1.0); warning from 1.2 s
    expect(s.g.running).toBe(false);
    s.step(300, 3);
    expect(s.g.runSoon).toBe(true);
    expect(s.log.some((e) => e.type === 'runWarn')).toBe(true);
    s.step(800, 3);
    expect(s.g.running).toBe(true);
    const before = s.g.progress;
    s.step(500, 0); // waiting it out: line goes back out, no tension
    expect(s.g.progress).toBeLessThan(before);
    expect(s.g.tension).toBe(0);
    s.step(2000, 3); // 3 turns/s × 0.2 per turn = 0.6/s → snaps within 2 s
    expect(s.g.missReason).toBe('snap');
  });

  it('waiting out a run is safe and reeling resumes afterwards', () => {
    const over = { ...FAST, 'fish.crucian.reelTurns': 30, 'fish.crucian.pullEveryS': 2, 'fish.crucian.pullS': 1 };
    const s = setup(over);
    s.act('bait');
    s.act(cast(0));
    s.step(2300);
    s.act(hook(0));
    // reel only while the fish is not running
    for (let i = 0; i < 400 && s.g.phase === 'reeling'; i++) s.step(50, s.g.running ? 0 : 3, 50);
    expect(s.g.phase).toBe('caught');
    expect(s.log.filter((e) => e.type === 'run' && e.on).length).toBeGreaterThan(0);
  });

  it('not reeling at all lets the fish escape after fight.slackS', () => {
    const s = setup({ ...FAST, 'fight.slackS': 3 });
    s.act('bait');
    s.act(cast(0));
    s.step(2300);
    s.act(hook(0));
    s.step(3100, 0);
    expect(s.g.missReason).toBe('escape');
  });

  it('bigger fish need more reel turns (size factor), rarer species more by default', () => {
    const turns = (size: number, species: 'crucian' | 'carp') => {
      const over: Partial<Params> = {
        ...FAST,
        'fish.crucian.spawn': species === 'crucian' ? 100 : 0,
        'fish.carp.spawn': species === 'carp' ? 100 : 0,
        'fish.carp.fakeMax': 0,
      };
      const s = setup(over, seq(0, size));
      s.act('bait');
      s.act(cast(0));
      s.step(2300);
      return s.g.fish!.turnsNeeded;
    };
    expect(turns(0.9, 'crucian')).toBeGreaterThan(turns(0.1, 'crucian'));
    expect(turns(0.5, 'carp')).toBeGreaterThan(turns(0.5, 'crucian'));
  });

  it('baits change which fish bite and how big', () => {
    const pick = (bait: 'worm' | 'corn', u: number[]) => {
      const P = { ...defaultParams(), [`bait.${bait}.waitMin`]: 1, [`bait.${bait}.waitMax`]: 1, [`bait.${bait}.biteChance`]: 1 } as Params;
      const g = new FishingGame(() => P, seq(...u));
      g.chooseBait(bait, 0);
      g.onGesture(cast(0), 0);
      for (let t = 50; t < 2600; t += 50) g.update(t);
      return g.fish!;
    };
    // same random numbers: [wait roll, bite roll, species roll, size roll, nibbles]
    const u = [0, 0, 0.5, 0.5, 0];
    expect(pick('worm', u).species).toBe('crucian'); // worm: crucian ×1.5 vs carp ×0.5
    expect(pick('corn', u).species).toBe('carp'); // corn: carp ×3
    expect(pick('corn', [0, 0, 0.5, 0.4, 0]).size).toBeGreaterThan(pick('worm', [0, 0, 0.5, 0.4, 0]).size);
  });

  it('never waits longer than wait.maxS, even with a 0% bite chance', () => {
    const s = setup({ ...FAST, 'bait.worm.biteChance': 0, 'bait.worm.waitMin': 30, 'bait.worm.waitMax': 30, 'wait.maxS': 40 });
    s.act('bait');
    s.act(cast(0));
    s.step(1300);
    s.step(39_000);
    expect(s.g.phase).toBe('waiting');
    s.step(1200);
    expect(s.g.phase).toBe('bite');
  });
});
