import { describe, expect, it } from 'vitest';
import { AIM_MAX_DEG, FishingGame, type GameEvent, type Tables } from '../src/core/game';
import type { GestureEvent } from '../src/core/gestures';
import { defaultParams, type Params } from '../src/core/params';
import { BAITS, LOCATIONS, SPECIES, type SpeciesDef } from '../src/core/species';

/** Deterministic RNG: cycles through the given values. */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length];
};

const cast = (t: number, strength = 0.5, aim = 0): GestureEvent => ({ type: 'cast', t, strength, peakSpeed: 8, aim });
const hook = (t: number): GestureEvent => ({ type: 'hookset', t, peakSpeed: 6, rise: 0.8 });

const fishDef = (over: Partial<SpeciesDef>): SpeciesDef => ({
  id: 'small', name: '작은고기', loc: 'reservoir', tier: 'common', lenMin: 10, lenMax: 30, weightK: 0.02,
  biteWindowS: 1, fakeMax: 0, bite: 'sink', power: 15, runEveryS: 100, runS: 1,
  trophyCm: 25, trophyLabel: '대물!', blurb: '', ...over,
});

/** A test world: one place with a thief and a spooker, one bait that always bites after 1 s. */
function tables(species: SpeciesDef[] = [fishDef({})]): Tables {
  return {
    species,
    baits: [{ id: 'b', name: '미끼', loc: 'reservoir', feel: '', waitMin: 1, waitMax: 1, biteChance: 1, sizeBias: 0 }],
    locations: [{ id: 'reservoir', name: '저수지', sub: '', thief: 'otter', spooker: 'hippo' }],
  };
}

/** No interference unless a test asks for it. */
/** No interference, and timing tests use unscaled waits (the play default shortens them). */
const QUIET: Partial<Params> = { 'event.thief': 0, 'event.spooker': 0, 'scale.wait': 1, 'wait.maxS': 40, 'spot.count': 0 };

function setup(over: Partial<Params> = {}, rng = seq(0.5), t = tables()) {
  const P = { ...defaultParams(), ...QUIET, ...over };
  const g = new FishingGame(() => P, rng, t);
  let now = 0;
  const log: GameEvent[] = [];
  /** Advance ms, reeling at `rate` turns/s. */
  const step = (ms: number, rate = 0, every = 50) => {
    for (let x = 0; x < ms; x += every) {
      now += every;
      g.update(now, rate);
      log.push(...g.drain());
    }
  };
  const act = (e: GestureEvent | 'bait') => {
    if (e === 'bait') {
      g.chooseLocation('reservoir', now);
      g.chooseBait('b', now);
    } else g.onGesture({ ...e, t: now }, now);
    log.push(...g.drain());
  };
  /** bait → cast → first bite (flight 1.2 s + wait 1 s) */
  const toBite = () => {
    act('bait');
    act(cast(0));
    step(2300);
  };
  return { g, P, step, act, toBite, log, now: () => now };
}

describe('fishing loop', () => {
  it('place → bait → cast → bite → hook-set → reel → caught', () => {
    const s = setup();
    expect(s.g.phase).toBe('place');
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
    // no runs (runEveryS 100): 28 m of line at 3 turns/s × mPerTurn
    const needS = s.g.lineM / (3 * s.g.fish!.mPerTurn);
    s.step(needS * 1000 - 300, 3);
    expect(s.g.phase).toBe('reeling');
    expect(s.g.lineOutM()).toBeGreaterThan(0);
    s.step(600, 3);
    expect(s.g.phase).toBe('caught');
    const caught = s.log.find((e) => e.type === 'caught');
    expect(caught && caught.type === 'caught' && caught.fish.def.id).toBe('small');
  });

  it('gestures outside their phase are ignored (wind-up ≠ hook-set, hook-set return ≠ cast)', () => {
    const s = setup();
    s.act(hook(0));
    s.act(cast(0));
    expect(s.g.phase).toBe('place');
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
    const t = tables();
    t.baits = [{ ...t.baits[0], waitMin: 5, waitMax: 5 }];
    const s = setup({}, seq(0.5), t);
    s.act('bait');
    s.act(cast(0));
    s.step(2000);
    s.act(hook(0));
    expect(s.g.phase).toBe('waiting');
    expect(s.log.some((e) => e.type === 'ignored')).toBe(true);
  });

  it('bite window: too late → missed "late"; the window comes from the species', () => {
    const s = setup({}, seq(0.5), tables([fishDef({ biteWindowS: 1 })]));
    s.toBite(); // bite started at 2200 ms
    expect(s.g.phase).toBe('bite');
    s.step(800);
    expect(s.g.phase).toBe('bite');
    s.step(150);
    expect(s.g.missReason).toBe('late');
  });

  it('fake nibble: hook-set during it → missed "early"; waiting it out → real bite', () => {
    const t = tables([fishDef({ fakeMax: 1 })]);
    // rng 0.99: fakeNibbles = floor(0.99 × 2) = 1
    const a = setup({}, seq(0.99), t);
    a.toBite();
    expect(a.g.phase).toBe('nibble');
    a.act(hook(0));
    expect(a.g.missReason).toBe('early');

    const b = setup({}, seq(0.99), t);
    b.toBite();
    b.step(4000);
    expect(b.log.filter((e) => e.type === 'nibble')).toHaveLength(1);
    expect(b.log.some((e) => e.type === 'bite')).toBe(true);
  });

  it('a run is announced first, takes line back, and reeling through it snaps the line', () => {
    const t = tables([fishDef({ runEveryS: 2, runS: 5 })]);
    const s = setup({ 'fight.warnS': 0.8, 'fight.tensionPerTurn': 0.2 }, seq(0.5), t);
    s.toBite();
    s.act(hook(0));
    s.step(1000, 3); // run due at 2 s; warning from 1.2 s
    expect(s.g.running).toBe(false);
    s.step(300, 3);
    expect(s.g.runSoon).toBe(true);
    s.step(800, 3);
    expect(s.g.running).toBe(true);
    const before = s.g.lineM;
    s.step(500, 0);
    expect(s.g.lineM).toBeGreaterThan(before); // the fish strips line
    expect(s.g.tension).toBe(0);
    s.step(2000, 3);
    expect(s.g.missReason).toBe('snap');
  });

  it('waiting out a run is safe and reeling resumes afterwards', () => {
    const s = setup({}, seq(0.5), tables([fishDef({ power: 30, runEveryS: 2, runS: 1 })]));
    s.toBite();
    s.act(hook(0));
    for (let i = 0; i < 400 && s.g.phase === 'reeling'; i++) s.step(50, s.g.running ? 0 : 3, 50);
    expect(s.g.phase).toBe('caught');
    expect(s.log.filter((e) => e.type === 'run' && e.on).length).toBeGreaterThan(0);
  });

  it('not reeling at all lets the fish escape after fight.slackS', () => {
    const s = setup({ 'fight.slackS': 3 });
    s.toBite();
    s.act(hook(0));
    s.step(3100, 0);
    expect(s.g.missReason).toBe('escape');
  });

  it('bigger / harder fish reel in a little less per turn and strip more line; scale.reel stretches every fight', () => {
    const fish = (size: number, over: Partial<Params> = {}, power = 15) => {
      // rng order: wait roll, hippo roll, bite roll, species roll, size roll, nibbles
      const s = setup(over, seq(0, 0.9, 0, 0, size, 0), tables([fishDef({ power })]));
      s.toBite();
      return s.g.fish!;
    };
    expect(fish(0.9).mPerTurn).toBeLessThan(fish(0.1).mPerTurn);
    expect(fish(0.9).pullMps).toBeGreaterThan(fish(0.1).pullMps);
    expect(fish(0.5, {}, 60).pullMps).toBeGreaterThan(fish(0.5).pullMps * 1.5);
    // only a heavy fish makes an opening run right after the hook-set
    expect(fish(0.5).openM).toBe(0);
    expect(fish(0.9, {}, 60).openM).toBeGreaterThan(5);
    // the heaviest fish still brings in ≥ 55% of the line per turn the lightest does (turns never feel dead)
    expect(fish(1, {}, 60).mPerTurn / fish(0, {}, 15).mPerTurn).toBeGreaterThanOrEqual(0.55 - 1e-9);
    expect(fish(0.5, { 'scale.reel': 2 }).mPerTurn).toBeCloseTo(fish(0.5).mPerTurn / 2, 9);
  });

  it('never waits longer than wait.maxS, even with a 0% bite chance', () => {
    const t = tables();
    t.baits = [{ ...t.baits[0], waitMin: 30, waitMax: 30, biteChance: 0 }];
    const s = setup({ 'wait.maxS': 40 }, seq(0.5), t);
    s.act('bait');
    s.act(cast(0));
    s.step(1300);
    s.step(39_000);
    expect(s.g.phase).toBe('waiting');
    s.step(1200);
    expect(s.g.phase).toBe('bite');
  });
});

describe('species, places and baits (M2)', () => {
  it('rarity tiers and bait multipliers decide what bites', () => {
    const species = [fishDef({ id: 'common', tier: 'common' }), fishDef({ id: 'legend', tier: 'legend' })];
    const pick = (over: Partial<Params>, speciesMul?: Record<string, number>) => {
      const t = tables(species);
      t.baits = [{ ...t.baits[0], ...(speciesMul ? { speciesMul } : {}) }];
      const s = setup(over, seq(0, 0.9, 0, 0.5, 0.5, 0), t);
      s.toBite();
      return s.g.fish!.def.id;
    };
    expect(pick({})).toBe('common'); // 60 vs 2.5
    expect(pick({ 'tier.common': 0 })).toBe('legend');
    expect(pick({}, { legend: 100 })).toBe('legend');
  });

  it('rarity weights are per tier, not per species (three commons do not drown the legend)', () => {
    const species = [
      fishDef({ id: 'c1' }), fishDef({ id: 'c2' }), fishDef({ id: 'c3' }),
      fishDef({ id: 'L', tier: 'legend' }),
    ];
    const s = setup({ 'tier.common': 50, 'tier.uncommon': 0, 'tier.rare': 0, 'tier.legend': 50 }, seq(0, 0.9, 0, 0.6, 0.5, 0), tables(species));
    s.toBite();
    // commons share 50 of 100 → a roll of 0.6 lands on the legend (per-species weights would give 150 vs 50)
    expect(s.g.fish!.def.id).toBe('L');
  });

  it('bait size bias skews the length', () => {
    const size = (bias: number) => {
      const t = tables();
      t.baits = [{ ...t.baits[0], sizeBias: bias }];
      const s = setup({}, seq(0, 0.9, 0, 0, 0.4, 0), t);
      s.toBite();
      return s.g.fish!.lengthCm;
    };
    expect(size(1)).toBeGreaterThan(size(0));
    expect(size(-0.5)).toBeLessThan(size(0));
  });

  it('every place has baits and species, and every bait belongs to a place', () => {
    for (const loc of LOCATIONS) {
      expect(BAITS.some((b) => b.loc === loc.id)).toBe(true);
      expect(SPECIES.some((s) => s.loc === loc.id)).toBe(true);
    }
    const ids = new Set(SPECIES.map((s) => s.id));
    expect(ids.size).toBe(SPECIES.length);
    for (const b of BAITS) for (const k of Object.keys(b.speciesMul ?? {})) expect(ids.has(k)).toBe(true);
  });
});

describe('species behaviours (M2)', () => {
  /** hooked, reeling up to just before the first run (due at 2 s, rng 0.5 → behaviour: 0.5 < 0.55) */
  const fight = (behavior: SpeciesDef['behavior'], over: Partial<Params> = {}) => {
    const s = setup({ 'fight.warnS': 0.5, ...over }, seq(0.5), tables([fishDef({ behavior, power: 20, runEveryS: 2, runS: 2 })]));
    s.toBite();
    s.act(hook(0));
    s.step(2000, 0);
    return s;
  };

  it('jump: announced, and reeling through it builds tension 2.5× faster than a plain run', () => {
    const tensionAfter = (b: SpeciesDef['behavior']) => {
      const s = fight(b, { 'fight.tensionPerTurn': 0.05 });
      expect(s.g.running).toBe(true);
      s.step(400, 2);
      return s.g.tension;
    };
    const s = fight('jump');
    expect(s.g.runKind).toBe('jump');
    expect(s.g.mustStop).toBe(true);
    expect(s.log.some((e) => e.type === 'runWarn' && e.kind === 'jump')).toBe(true);
    expect(tensionAfter('jump')).toBeCloseTo(tensionAfter(undefined) * 2.5, 5);
  });

  it('shock: reeling does nothing for a moment, and there is no warning', () => {
    const s = fight('shock');
    expect(s.g.runKind).toBe('shock');
    expect(s.log.some((e) => e.type === 'runWarn')).toBe(false);
    const before = s.g.lineM;
    s.step(300, 3);
    expect(s.g.lineM).toBe(before);
  });

  it('a species without a behaviour only ever does plain runs', () => {
    const s = fight(undefined);
    expect(s.g.runKind).toBe('run');
  });
});

describe('M3: spots', () => {
  /** aim + strength that land exactly on a spot */
  const castAt = (spot: { angleDeg: number; distM: number }) => cast(0, (spot.distM - 8) / 20, spot.angleDeg / AIM_MAX_DEG);

  it('a cast onto a spot is a hit and bites sooner; a cast the other way misses', () => {
    const waitFor = (onSpot: boolean) => {
      const s = setup({ 'spot.count': 1, 'wait.maxS': 60, 'scale.wait': 5 }, seq(0.5));
      s.act('bait');
      const spot = s.g.spots[0];
      s.act(onSpot ? castAt(spot) : castAt({ angleDeg: -spot.angleDeg, distM: spot.distM }));
      s.step(1250);
      const res = s.log.find((e) => e.type === 'spot');
      let ms = 0;
      while (s.g.phase === 'waiting' && ms < 60000) (s.step(50), (ms += 50));
      return { res: res?.type === 'spot' ? res.result : null, ms };
    };
    const hit = waitFor(true);
    const miss = waitFor(false);
    expect(hit.res).toBe('hit');
    expect(miss.res).toBe('miss');
    expect(hit.ms).toBeLessThan(miss.ms * 0.6);
  });

});

describe('M3: rod work (G6)', () => {
  /** reel to the first run, then hold the rod arm at `side` through it; line taken + how long it ran */
  const through = (side: (dir: number) => number | null, behavior?: SpeciesDef['behavior']) => {
    // rng 0.5 < BEHAVIOR_SHARE: with a behaviour, the first run is that behaviour
    const s = setup({ 'fight.openM': 0 }, seq(0.5), tables([fishDef({ power: 40, runEveryS: 2, runS: 2, behavior })]));
    s.toBite();
    s.act(hook(0));
    for (let i = 0; i < 200 && !s.g.running; i++) s.step(50, 3);
    const line0 = s.g.lineM;
    let ms = 0;
    while (s.g.running && ms < 10000) {
      ms += 50;
      s.g.update(s.now() + ms, 0, side(s.g.runDir));
    }
    return { taken: s.g.lineM - line0, ms, log: s.g.drain(), kind: s.g.runKind };
  };

  it('holding the rod out against the run takes less line and ends it sooner', () => {
    const still = through(() => 0);
    const against = through((dir) => -dir * 0.7);
    const along = through((dir) => dir * 0.7);
    expect(against.taken).toBeLessThan(still.taken * 0.6);
    expect(against.ms).toBeLessThan(still.ms);
    expect(along.taken).toBeCloseTo(still.taken, 5); // same side as the fish: no help
    expect(against.log.some((e) => e.type === 'counter' && e.on)).toBe(true);
  });

  it('a jump or a dive is not sideways: holding the arm out does nothing — just stop and wait', () => {
    for (const b of ['jump', 'dive'] as const) {
      const still = through(() => 0, b);
      const against = through((dir) => -dir * 0.7, b);
      expect(against.taken, b).toBeCloseTo(still.taken, 5);
      expect(against.log.some((e) => e.type === 'counter'), b).toBe(false);
    }
  });
});

describe('interference events (M2)', () => {
  const thiefSetup = () => {
    // event.thief 1: the thief always comes; rng 0.5 → when 25–70% of the line is left (≈ 48%)
    const s = setup({ 'event.thief': 1, 'event.warnS': 2, 'event.escapeTurns': 4 }, seq(0.5), tables([fishDef({ power: 20 })]));
    s.toBite();
    s.act(hook(0));
    return s;
  };

  it('a thief comes mid-fight; reeling fast gets away', () => {
    const s = thiefSetup();
    for (let i = 0; i < 200 && !s.g.thief; i++) s.step(50, 3);
    expect(s.g.thief?.kind).toBe('otter');
    s.step(1500, 3); // 4.5 turns in 1.5 s ≥ 4 needed, within 2 s
    expect(s.log.some((e) => e.type === 'thiefEscaped')).toBe(true);
    expect(s.g.phase === 'reeling' || s.g.phase === 'caught').toBe(true);
  });

  it('a thief takes the fish if you do not reel', () => {
    const s = thiefSetup();
    for (let i = 0; i < 200 && !s.g.thief; i++) s.step(50, 3);
    s.step(2100, 0);
    expect(s.g.missReason).toBe('stolen');
    expect(s.g.stolenBy).toBe('otter');
  });

  it('a hippo scatters the fish: the wait starts over, nothing is lost', () => {
    const t = tables();
    t.baits = [{ ...t.baits[0], waitMin: 10, waitMax: 10 }];
    const s = setup({ 'event.spooker': 1 }, seq(0.5), t);
    s.act('bait');
    s.act(cast(0));
    s.step(1300 + 6500); // spook at 30–90% of the 10 s wait (rng 0.5 → 6 s)
    expect(s.log.some((e) => e.type === 'spook' && e.kind === 'hippo')).toBe(true);
    expect(s.g.phase).toBe('waiting');
    s.step(6000);
    expect(s.g.phase).toBe('waiting'); // the old 10 s check was pushed back
    s.step(4000); // new check at 7.2 + 10 = 17.2 s
    expect(s.g.phase).toBe('bite');
  });
});

describe('fight length (real species table)', () => {
  // A player who stops ~0.25 s into each run must land every species — slow (1.8 turns/s) within
  // 2 minutes, normal (2.5) within 90 s — and reeling faster must always land it sooner (the M2
  // table made some sharks unlandable; the turn-count model made fast reeling look no faster).
  /** seconds to land `def` at `rate`, or Infinity if not landed in 4 minutes */
  const landS = (def: SpeciesDef, rate: number): number => {
    {
      let seed = 4242;
      const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const P = { ...defaultParams(), ...QUIET };
      const t: Tables = {
        species: [def],
        baits: [{ ...BAITS[0], loc: def.loc, waitMin: 1, waitMax: 1, biteChance: 1 }],
        locations: LOCATIONS.filter((l) => l.id === def.loc),
      };
      const g = new FishingGame(() => P, rng, t);
      let now = 1;
      g.chooseLocation(def.loc, now);
      g.chooseBait(BAITS[0].id, now);
      g.onGesture(cast(now), now);
      while (g.phase !== 'bite' && now < 60000) (now += 50), g.update(now, 0);
      g.onGesture(hook(now), now);
      const t0 = now;
      while (g.phase === 'reeling' && now - t0 < 240000) {
        now += 50;
        g.update(now, g.mustStop && g.runFrac(now) > 0.08 ? 0 : rate);
        g.drain();
      }
      return g.phase === 'caught' ? (now - t0) / 1000 : Infinity;
    }
  };
  it('every species lands in time at slow and normal speed, and faster is always sooner', () => {
    for (const def of SPECIES) {
      const slow = landS(def, 1.8);
      const normal = landS(def, 2.5);
      const fast = landS(def, 4);
      expect(slow, def.id).toBeLessThan(120);
      expect(normal, def.id).toBeLessThan(90);
      expect(fast, def.id).toBeLessThan(normal * 0.8);
    }
  });
});

describe('M4: 인면어 (face fish)', () => {
  /** how many of `n` bites are the 인면어 */
  const faceShare = (enabled: boolean, n = 2000) => {
    let seed = 99;
    const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const s = setup({}, rng);
    s.g.faceFish = enabled;
    let faces = 0;
    for (let i = 0; i < n; i++) {
      s.g.again(s.now());
      s.act('bait');
      s.act(cast(0));
      for (let k = 0; k < 200 && s.g.phase !== 'bite' && s.g.phase !== 'nibble'; k++) s.step(50);
      if (s.g.fish?.def.id === 'face_fish') faces++;
    }
    return faces / n;
  };
  it('never bites without a saved face; about 5% of bites with one', () => {
    expect(faceShare(false, 400)).toBe(0);
    const share = faceShare(true);
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.07);
  });
});

describe('cast distance', () => {
  // user: "새떼가 가까이 있을 때는 약하게 던지는데도 멀리 캐스팅"
  it('a gentle cast lands near, a full one at the far end', () => {
    const at = (strength: number) => {
      const s = setup();
      s.act('bait');
      s.act(cast(0, strength));
      return s.g.distanceM;
    };
    expect(at(0.2)).toBeLessThan(10); // 6 body/s
    expect(at(0.5)).toBeLessThan(16); // a usual cast (8.5 body/s) no longer 18 m
    expect(at(1)).toBe(28);
  });
});
