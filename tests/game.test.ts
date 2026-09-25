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
const reel = (t: number): GestureEvent => ({ type: 'reel', t, rate: 3 });

function setup(over: Partial<Params> = {}, rng = seq(0.5)) {
  const P = { ...defaultParams(), ...over };
  const g = new FishingGame(() => P, rng);
  let now = 0;
  const log: GameEvent[] = [];
  const step = (ms: number, every = 50) => {
    for (let t = 0; t < ms; t += every) {
      now += every;
      g.update(now);
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
};

describe('fishing loop', () => {
  it('bait → cast → bite → hook-set → reel → caught', () => {
    const s = setup(FAST);
    s.act('bait');
    expect(s.g.phase).toBe('ready');
    s.act(cast(0, 1));
    expect(s.g.phase).toBe('flight');
    expect(s.g.distanceM).toBe(26);
    s.step(1300);
    expect(s.g.phase).toBe('waiting');
    s.step(1000);
    expect(s.g.phase).toBe('bite');
    s.act(hook(0));
    expect(s.g.phase).toBe('reeling');
    const need = s.g.fish!.turnsNeeded;
    for (let i = 0; i < need; i++) {
      s.step(300);
      s.act(reel(0));
    }
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

  it('reeling while the fish pulls raises tension until the line snaps', () => {
    const s = setup({ ...FAST, 'fish.crucian.pullEveryS': 1, 'fish.crucian.pullS': 5, 'fight.tensionPerTurn': 0.3 });
    s.act('bait');
    s.act(cast(0));
    s.step(2300);
    s.act(hook(0));
    s.step(1400); // pull starts (0.7–1.3 s)
    expect(s.g.pulling).toBe(true);
    for (let i = 0; i < 4; i++) s.act(reel(0));
    expect(s.g.phase).toBe('missed');
    expect(s.g.missReason).toBe('snap');
  });

  it('not reeling at all lets the fish escape after fight.slackS', () => {
    const s = setup({ ...FAST, 'fight.slackS': 3 });
    s.act('bait');
    s.act(cast(0));
    s.step(2300);
    s.act(hook(0));
    s.step(3100);
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
