// Fishing loop — a pure, time-driven state machine (no DOM, testable with a fake clock + RNG).
//
//   place ─(UI)→ bait ─(UI)→ ready ─(cast)→ flight → waiting ─(bite roll)→ nibble* → bite ─(hook-set)→ reeling → caught
//                                                       │ hippo          │           │                │
//                                                       └ wait restarts  too early   timeout   snap / escape / stolen → missed
//
// Hook-set differences between species are timing only (bite window + fake nibbles); strength
// is never judged (user decision, docs/VERIFICATION.md). Reeling length grows with size / rarity.
//
// Reeling fight, in metres of line: every reel turn brings in fish.mPerTurn (heavier fish a little
// less), and the fish is landed when no line is left. Every few seconds the fish RUNS — announced by
// a splash `fight.warnS` earlier — and strips line (fish.pullMps). Reeling during a run builds line
// tension; full tension snaps the line. A heavy fish also tears off fish.openM of line right after
// the hook-set (the opening run). Big fish fight longer through that extra line, not through dead
// turns (user, M2 playtest: "큰 물고기일수록 줄 감기는 속도가 느려서 릴링이 반영이 잘 안 되는 느낌").
//
// M3 (user: "더 창의적인 게임 진행 방식" → 펌핑 + 포인트 공략):
//  - SPOTS: 1–2 signs on the water (birds working, a boil) while you get ready. The cast lands where it
//    was aimed (gesture aim × AIM_MAX_DEG) at its distance; landing on a spot means a quicker bite and
//    bigger / rarer fish ("hit"; "near" = half of that).
//  - PUMPING: a heavy fish slips drag — reeling alone brings in less line. Lifting the rod (a pump)
//    drags it in at once and makes reeling efficient for a few seconds; pumping into a run spikes the
//    tension. After a pump you must reel a little before the next one counts (no rod-waving).
//  - ROD WORK (G6): a run heads left or right. Holding the rod arm out to the OTHER side (counter)
//    takes less line, builds less tension and tires the fish sooner.
//
// Interference (M2, user: animals only rarely and realistically): a THIEF (otter / orca / crocodile)
// may come for the hooked fish once per fight — reel `event.escapeTurns` turns within `event.warnS`
// to get away, or lose the fish. A SPOOKER (hippo) may surface near the float while you wait —
// the fish scatter and the wait starts over (no penalty).

import type { GestureEvent } from './gestures';
import type { Params } from './params';
import {
  BAITS,
  LOCATIONS,
  SPECIES,
  type BaitDef,
  type Behavior,
  type EventKind,
  type LocationDef,
  type LocationId,
  type SpeciesDef,
  type Tier,
} from './species';

export type Phase = 'place' | 'bait' | 'ready' | 'flight' | 'waiting' | 'nibble' | 'bite' | 'reeling' | 'caught' | 'missed';

export type MissReason = 'early' | 'late' | 'snap' | 'escape' | 'stolen';

/** A fish run: the plain one, or the species' own behaviour (species.ts Behavior). */
export type RunKind = 'run' | Behavior;

/**
 * How each kind of run plays. stop: the player should stop reeling (reeling builds tension ×tension);
 * dig is the opposite (keep reeling, at ×progress); shock just freezes reeling.
 */
const RUN_RULES: Record<RunKind, { dur: number; take: number; tension: number; progress: number; stop: boolean; warn: boolean }> = {
  run: { dur: 1, take: 1, tension: 1, progress: 0, stop: true, warn: true },
  jump: { dur: 0.6, take: 0.5, tension: 2.5, progress: 0, stop: true, warn: true },
  dive: { dur: 1, take: 1.2, tension: 1, progress: 0, stop: true, warn: true },
  thrash: { dur: 0.8, take: 0.8, tension: 1.5, progress: 0, stop: true, warn: true },
  dig: { dur: 1.5, take: 0, tension: 0, progress: 0.35, stop: false, warn: true },
  shock: { dur: 0.5, take: 0, tension: 0, progress: 0, stop: false, warn: false },
};
/** Share of runs that are the species' behaviour rather than a plain run. */
const BEHAVIOR_SHARE = 0.55;
export const MISS_TEXT: Record<MissReason, string> = {
  early: '너무 일찍 챘어요 — 톡톡 건드리는 건 가짜 입질이에요',
  late: '입질을 놓쳤어요 — 찌가 움직이면 바로 채요',
  snap: '줄이 끊어졌어요 — 물고기가 차고 나갈 땐 감지 말고 기다려요',
  escape: '물고기가 빠져나갔어요 — 줄을 너무 오래 안 감았어요',
  stolen: '물고기를 빼앗겼어요 — 다가오면 재빨리 감아서 따돌려요',
};

export interface Fish {
  def: SpeciesDef;
  lengthCm: number;
  weightG: number;
  /** 0 = smallest of its species, 1 = largest */
  size: number;
  /** line one reel turn brings in, m */
  mPerTurn: number;
  /** line a plain run strips, m/s */
  pullMps: number;
  /** line the opening run strips right after the hook-set, m (0 = no opening run) */
  openM: number;
  /** how much it slips drag and needs pumping, 0 (light) … 1 (the heaviest fights) */
  heavy: number;
  fakeNibbles: number;
  biteWindowS: number;
}

export type GameEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'cast'; strength: number; distanceM: number; aim: number }
  | { type: 'spot'; result: SpotResult; kind: SpotKind | null }
  | { type: 'pump'; ok: boolean; gainM: number }
  | { type: 'counter'; on: boolean }
  | { type: 'nibble' }
  | { type: 'bite' }
  | { type: 'hooked' }
  | { type: 'runWarn'; kind: RunKind }
  | { type: 'run'; on: boolean; kind: RunKind }
  | { type: 'thief'; kind: EventKind }
  | { type: 'thiefEscaped'; kind: EventKind }
  | { type: 'spook'; kind: EventKind }
  | { type: 'caught'; fish: Fish }
  | { type: 'missed'; reason: MissReason; thief?: EventKind }
  | { type: 'ignored'; gesture: GestureEvent['type']; why: string };

export interface Tables {
  species: readonly SpeciesDef[];
  baits: readonly BaitDef[];
  locations: readonly LocationDef[];
}
const DEFAULT_TABLES: Tables = { species: SPECIES, baits: BAITS, locations: LOCATIONS };

export type SpotKind = 'birds' | 'boil';
export type SpotResult = 'hit' | 'near' | 'miss';
/** A sign of fish on the water: direction (degrees, + = the player's left) and distance. */
export interface Spot {
  kind: SpotKind;
  angleDeg: number;
  distM: number;
}
/** The widest a cast can be aimed, degrees either side. */
export const AIM_MAX_DEG = 30;
const THREE_DEG = Math.PI / 180;

/** Flight time of the cast, s. */
export const FLIGHT_S = 1.2;
const MIN_DISTANCE_M = 8;
const MAX_DISTANCE_M = 28;
/** How long the opening run of a heavy fish lasts, s. */
export const OPEN_RUN_S = 2.5;
const TIER_KEY: Record<Tier, 'tier.common' | 'tier.uncommon' | 'tier.rare' | 'tier.legend'> = {
  common: 'tier.common',
  uncommon: 'tier.uncommon',
  rare: 'tier.rare',
  legend: 'tier.legend',
};

export class FishingGame {
  phase: Phase = 'place';
  /** time the current phase started, ms */
  phaseT = 0;
  location: LocationDef;
  bait: BaitDef;
  castStrength = 0;
  distanceM = 0;
  fish: Fish | null = null;
  missReason: MissReason | null = null;
  /** the animal that stole the fish (missReason 'stolen') */
  stolenBy: EventKind | null = null;
  /** line out, m (the cast distance, less what was reeled in, plus what the fish took) */
  lineM = 0;
  /** most line out during this fight, m (for the progress bar) */
  peakLineM = 0;
  /** reeling: line tension 0–1 (1 = snap) */
  tension = 0;
  /** reeling: the fish is running (taking line) */
  running = false;
  /** reeling: a run is about to start (splash warning) */
  runSoon = false;
  /** what the current / next run is (plain run or the species' behaviour) */
  runKind: RunKind = 'run';
  /** which way the current / next run heads: 1 = the player's left, −1 = right */
  runDir: 1 | -1 = 1;
  /** the player is holding the rod against the run right now */
  countering = false;
  /** the player's rod arm sideways, torso lengths (+ = the player's left; null = unknown) */
  rodSide: number | null = null;
  /** reeling: an animal is coming for the fish */
  thief: { kind: EventKind; until: number; turns: number } | null = null;
  /** the reel rate the game last saw, turns/s (for the HUD) */
  reelRate = 0;
  /** in the nibble phase: is a fake nibble showing right now */
  nibbling = false;
  /** where this cast was aimed, −1 … 1 (+ = the player's left) */
  aim = 0;
  /** signs of fish on the water for the next cast */
  spots: Spot[] = [];
  /** how the last cast met the spots (null before landing) */
  spotResult: SpotResult | null = null;
  /** reeling: a pump now would count (reeled enough since the last one) */
  pumpReady = true;
  /** reeling: efficient reeling after a pump until this time, ms */
  pumpBoostUntil = 0;

  private events: GameEvent[] = [];
  private waitStart = 0;
  private nextCheck = 0;
  private spookAt = Infinity;
  private nibblesLeft = 0;
  private nibbleUntil = 0;
  private nextNibble = 0;
  private biteUntil = 0;
  private nextRun = 0;
  private runUntil = 0;
  private runStart = 0;
  private lastReelT = 0;
  /** the current run is the opening run after the hook-set */
  private openRun = false;
  /** 0 … 1: how well the cast met a spot (1 = hit, 0.5 = near) */
  private spotBonus = 0;
  private hookT = 0;
  private reelSincePump = 0;
  private lastT = 0;
  /** line left (m) at which the thief shows up this fight (-Infinity = not this time) */
  private thiefAt = -Infinity;

  constructor(
    private params: () => Params,
    private rng: () => number = Math.random,
    private tables: Tables = DEFAULT_TABLES,
  ) {
    this.location = tables.locations[0];
    this.bait = tables.baits.find((b) => b.loc === this.location.id) ?? tables.baits[0];
  }

  /** Events since the last call (for UI / sound). */
  drain(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private emit(e: GameEvent): void {
    this.events.push(e);
  }

  private setPhase(p: Phase, now: number): void {
    this.phase = p;
    this.phaseT = now;
    this.emit({ type: 'phase', phase: p });
  }

  private uniform(a: number, b: number): number {
    return a + (b - a) * this.rng();
  }

  // ---------------------------------------------------------------- UI actions

  baitsHere(): BaitDef[] {
    return this.tables.baits.filter((b) => b.loc === this.location.id);
  }

  speciesHere(): SpeciesDef[] {
    return this.tables.species.filter((s) => s.loc === this.location.id);
  }

  chooseLocation(id: LocationId, now: number): void {
    const loc = this.tables.locations.find((l) => l.id === id);
    if (!loc || (this.phase !== 'place' && this.phase !== 'bait')) return;
    this.location = loc;
    this.setPhase('bait', now);
  }

  chooseBait(id: string, now: number): void {
    const b = this.baitsHere().find((x) => x.id === id);
    if (this.phase !== 'bait' || !b) return;
    this.bait = b;
    this.spawnSpots();
    this.setPhase('ready', now);
  }

  /** Back to bait selection at the same place (after a result, or to give up a cast). */
  again(now: number): void {
    this.reset();
    this.setPhase('bait', now);
  }

  /** Back to choosing a place. */
  toPlaces(now: number): void {
    this.reset();
    this.setPhase('place', now);
  }

  private reset(): void {
    this.fish = null;
    this.missReason = null;
    this.stolenBy = null;
    this.lineM = 0;
    this.peakLineM = 0;
    this.tension = 0;
    this.running = false;
    this.runSoon = false;
    this.thief = null;
    this.nibbling = false;
    this.spotResult = null;
    this.spotBonus = 0;
  }

  // ---------------------------------------------------------------- gestures

  onGesture(ev: GestureEvent, now: number): void {
    switch (ev.type) {
      case 'cast':
        if (this.phase !== 'ready') return;
        this.castStrength = ev.strength;
        this.distanceM = MIN_DISTANCE_M + (MAX_DISTANCE_M - MIN_DISTANCE_M) * ev.strength;
        this.aim = Math.max(-1, Math.min(1, ev.aim ?? 0));
        this.emit({ type: 'cast', strength: ev.strength, distanceM: this.distanceM, aim: this.aim });
        this.setPhase('flight', now);
        return;
      case 'pump':
        this.pump(ev.rise, now);
        return;
      case 'hookset':
        if (this.phase === 'bite') this.hook(now);
        else if (this.phase === 'nibble') this.miss('early', now);
        else if (this.phase === 'waiting') {
          // no penalty: nothing is on the line yet
          this.emit({ type: 'ignored', gesture: 'hookset', why: '아직 입질이 없어요' });
        }
        return;
    }
  }

  private hook(now: number): void {
    const P = this.params();
    this.lineM = this.distanceM;
    this.peakLineM = this.distanceM;
    this.tension = 0;
    this.running = false;
    this.runSoon = false;
    this.runKind = 'run';
    this.thief = null;
    this.lastReelT = now;
    this.scheduleRun(now);
    this.openRun = false;
    this.hookT = now;
    this.pumpReady = true;
    this.pumpBoostUntil = 0;
    this.reelSincePump = 0;
    const fish = this.fish!;
    // a thief may come once this fight, somewhere in the middle of it
    this.thiefAt =
      this.location.thief && this.rng() < P['event.thief'] ? (this.distanceM + fish.openM) * this.uniform(0.25, 0.7) : -Infinity;
    this.emit({ type: 'hooked' });
    this.setPhase('reeling', now);
    // a heavy fish runs the moment it feels the hook (HIT is the warning)
    if (fish.openM > 0.5) {
      this.openRun = true;
      this.running = true;
      this.runStart = now;
      this.runUntil = now + OPEN_RUN_S * 1000;
      this.emit({ type: 'run', on: true, kind: 'run' });
    }
  }

  private scheduleRun(now: number): void {
    const P = this.params();
    this.nextRun = now + this.fish!.def.runEveryS * P['scale.runEvery'] * 1000 * this.uniform(0.7, 1.3);
    const b = this.fish!.def.behavior;
    this.runKind = b && this.rng() < BEHAVIOR_SHARE ? b : 'run';
    this.runDir = this.rng() < 0.5 ? 1 : -1;
  }

  /** The player should stop reeling right now (run, jump, dive, thrash — not dig or shock). */
  get mustStop(): boolean {
    return this.running && RUN_RULES[this.runKind].stop;
  }

  private miss(reason: MissReason, now: number): void {
    this.missReason = reason;
    this.running = false;
    this.runSoon = false;
    this.nibbling = false;
    const thief = reason === 'stolen' ? this.thief?.kind : undefined;
    this.stolenBy = thief ?? null;
    this.thief = null;
    this.emit({ type: 'missed', reason, ...(thief ? { thief } : {}) });
    this.setPhase('missed', now);
  }

  // ---------------------------------------------------------------- fish

  private pickFish(): Fish {
    const P = this.params();
    const here = this.speciesHere();
    const b = this.bait;
    // tier weights are per TIER (split among that tier's species here), so every place gives each
    // rarity the same odds no matter how many species it has (per-species weights made legends ~1%)
    const tierCount = (t: SpeciesDef['tier']) => here.filter((x) => x.tier === t).length || 1;
    const weight = (s: SpeciesDef) =>
      Math.max(0, (P[TIER_KEY[s.tier]] / tierCount(s.tier)) * (b.tierMul?.[s.tier] ?? 1) * (b.speciesMul?.[s.id] ?? 1) * spotMul(s.tier));
    // a cast onto a spot: rare / legend more likely (common less)
    const spotMul = (t: Tier) =>
      t === 'rare' || t === 'legend' ? 1 + (P['spot.rareMul'] - 1) * this.spotBonus : t === 'common' ? 1 - 0.4 * this.spotBonus : 1;
    const total = here.reduce((sum, s) => sum + weight(s), 0);
    let r = this.rng() * (total || 1);
    let def = here[0];
    for (const s of here) {
      r -= weight(s);
      if (r < 0) {
        def = s;
        break;
      }
    }
    // bait size bias: > 0 skews toward big fish, < 0 toward small ones
    const u = this.rng();
    const bias = b.sizeBias + P['spot.sizeBias'] * this.spotBonus;
    const size = bias >= 0 ? 1 - (1 - u) ** (1 + bias) : u ** (1 - bias);
    const lengthCm = Math.round((def.lenMin + (def.lenMax - def.lenMin) * size) * 10) / 10;
    // 0 = the lightest fight (small 붕어), 1 = the heaviest (a big 백상아리)
    const heavy = Math.min(1, Math.max(0, ((def.power - 15) / 45) * 0.75 + size * 0.25));
    return {
      def,
      lengthCm,
      weightG: Math.round(def.weightK * lengthCm ** 3),
      size,
      mPerTurn: (P['reel.mPerTurn'] * (1 - P['fight.heavy'] * heavy)) / P['scale.reel'],
      pullMps: P['fight.takeRate'] * (0.4 + 0.6 * heavy),
      openM: P['fight.openM'] * Math.max(0, (heavy - 0.3) / 0.7),
      heavy: Math.max(0, (heavy - 0.3) / 0.7),
      fakeNibbles: Math.floor(this.rng() * (def.fakeMax + 1)),
      biteWindowS: def.biteWindowS * P['scale.biteWindow'],
    };
  }

  // ---------------------------------------------------------------- clock

  /** Advance to `now` (ms). `reelRate` = the player's current reel rate, turns/s. */
  update(now: number, reelRate = 0, rodSide: number | null = null): void {
    const P = this.params();
    const dt = this.lastT ? Math.max(0, Math.min(0.25, (now - this.lastT) / 1000)) : 0;
    this.lastT = now;
    this.reelRate = reelRate;
    this.rodSide = rodSide;
    switch (this.phase) {
      case 'flight':
        if (now - this.phaseT >= FLIGHT_S * 1000) {
          this.judgeLanding();
          this.waitStart = now;
          this.nextCheck = now + this.waitRoll(1);
          // a hippo may surface somewhere before the first bite check
          this.spookAt =
            this.location.spooker && this.rng() < P['event.spooker'] ? now + (this.nextCheck - now) * this.uniform(0.3, 0.9) : Infinity;
          this.setPhase('waiting', now);
        }
        break;
      case 'waiting':
        if (now >= this.spookAt) {
          this.spookAt = Infinity;
          this.emit({ type: 'spook', kind: this.location.spooker! });
          // the fish scatter: the wait starts over (still capped by wait.maxS)
          this.nextCheck = Math.min(this.waitStart + P['wait.maxS'] * 1000, now + this.waitRoll(1));
          break;
        }
        if (now >= this.nextCheck) {
          const forced = now - this.waitStart >= P['wait.maxS'] * 1000;
          if (forced || this.rng() < this.bait.biteChance) {
            this.fish = this.pickFish();
            this.nibblesLeft = this.fish.fakeNibbles;
            if (this.nibblesLeft > 0) {
              this.nextNibble = now;
              this.setPhase('nibble', now);
            } else this.startBite(now);
          } else {
            // no bite this time: check again sooner, never past the maximum wait
            const cap = this.waitStart + P['wait.maxS'] * 1000;
            this.nextCheck = Math.min(cap, now + this.waitRoll(0.5));
          }
        }
        break;
      case 'nibble':
        if (this.nibbling && now >= this.nibbleUntil) {
          this.nibbling = false;
          this.nibblesLeft--;
          this.nextNibble = now + P['fight.nibbleGapS'] * 1000 * this.uniform(0.7, 1.4);
        }
        if (!this.nibbling && now >= this.nextNibble) {
          if (this.nibblesLeft > 0) {
            this.nibbling = true;
            this.nibbleUntil = now + P['fight.nibbleS'] * 1000;
            this.emit({ type: 'nibble' });
          } else this.startBite(now);
        }
        break;
      case 'bite':
        if (now >= this.biteUntil) this.miss('late', now);
        break;
      case 'reeling':
        this.fight(now, dt, reelRate);
        break;
      default:
        break;
    }
  }

  private fight(now: number, dt: number, rate: number): void {
    const P = this.params();
    const fish = this.fish!;

    // ---- a thief comes for the fish: reel hard to get away, or lose it
    if (!this.thief && this.lineM <= this.thiefAt) {
      this.thiefAt = -Infinity;
      this.thief = { kind: this.location.thief!, until: now + P['event.warnS'] * 1000, turns: 0 };
      this.running = false;
      this.runSoon = false;
      this.emit({ type: 'thief', kind: this.thief.kind });
    }
    if (this.thief) {
      this.lineM -= rate * fish.mPerTurn * this.reelEfficiency(now) * dt;
      this.thief.turns += rate * dt;
      this.tension = Math.max(0, this.tension - P['fight.tensionDecay'] * dt);
      if (this.thief.turns >= P['event.escapeTurns']) {
        this.emit({ type: 'thiefEscaped', kind: this.thief.kind });
        this.thief = null;
        this.lastReelT = now;
        this.scheduleRun(now);
      } else if (now >= this.thief.until) {
        this.miss('stolen', now);
        return;
      }
    } else {
      // ---- runs: warning → run → pause
      const rule = RUN_RULES[this.runKind];
      if (!this.running && !this.runSoon && rule.warn && now >= this.nextRun - P['fight.warnS'] * 1000) {
        this.runSoon = true;
        this.emit({ type: 'runWarn', kind: this.runKind });
      }
      if (!this.running && now >= this.nextRun) {
        this.running = true;
        this.runSoon = false;
        this.runStart = now;
        this.runUntil = now + fish.def.runS * rule.dur * 1000 * this.uniform(0.8, 1.2);
        this.emit({ type: 'run', on: true, kind: this.runKind });
      } else if (this.running && now >= this.runUntil) {
        const kind = this.runKind;
        this.running = false;
        this.openRun = false;
        if (this.countering) {
          this.countering = false;
          this.emit({ type: 'counter', on: false });
        }
        this.lastReelT = now; // the player was told to wait — don't count the run as slack
        this.scheduleRun(now);
        this.emit({ type: 'run', on: false, kind });
      }

      // rod work: the rod arm held out against the run's direction (only for runs you must stop for)
      const counter = this.running && rule.stop && !this.openRun && this.rodSide !== null && this.rodSide * -this.runDir >= P['sweep.min'];
      if (counter !== this.countering) {
        this.countering = counter;
        this.emit({ type: 'counter', on: counter });
      }
      if (this.running) {
        const take = (this.openRun ? fish.openM / OPEN_RUN_S : fish.pullMps * rule.take) * (counter ? 1 - P['sweep.takeCut'] : 1);
        this.lineM += (take - rate * fish.mPerTurn * this.reelEfficiency(now) * rule.progress) * dt;
        this.peakLineM = Math.max(this.peakLineM, this.lineM);
        if (counter) this.runUntil -= P['sweep.tire'] * dt * 1000; // the fish tires sooner
        this.tension += P['fight.tensionPerTurn'] * rule.tension * rate * dt * (counter ? 1 - P['sweep.tensionCut'] : 1);
        if (rate === 0 || rule.tension === 0) this.tension = Math.max(0, this.tension - P['fight.tensionDecay'] * dt);
        if (rate > 0) this.lastReelT = now;
        if (this.tension >= 1) {
          this.tension = 1;
          this.miss('snap', now);
          return;
        }
      } else {
        this.lineM -= rate * fish.mPerTurn * this.reelEfficiency(now) * dt;
        this.reelSincePump += rate * dt;
        if (!this.pumpReady && this.reelSincePump >= P['pump.rearmTurns']) this.pumpReady = true;
        this.tension = Math.max(0, this.tension - P['fight.tensionDecay'] * dt);
        if (rate > 0) this.lastReelT = now;
        else if (now - this.lastReelT >= P['fight.slackS'] * 1000) {
          this.miss('escape', now);
          return;
        }
      }
    }
    if (this.lineM <= 0) {
      this.lineM = 0;
      this.running = false;
      this.runSoon = false;
      this.thief = null;
      this.emit({ type: 'caught', fish });
      this.setPhase('caught', now);
    }
  }

  private waitRoll(scale: number): number {
    const P = this.params();
    const lo = this.bait.waitMin;
    const hi = Math.max(lo, this.bait.waitMax);
    const spot = 1 - P['spot.waitCut'] * this.spotBonus;
    return Math.max(1, this.uniform(lo, hi) * scale * P['scale.wait'] * spot) * 1000;
  }

  private startBite(now: number): void {
    this.nibbling = false;
    this.biteUntil = now + this.fish!.biteWindowS * 1000;
    this.emit({ type: 'bite' });
    this.setPhase('bite', now);
  }

  /** New signs of fish for the next cast (called when the player gets ready). */
  private spawnSpots(): void {
    const P = this.params();
    this.spots = [];
    const n = Math.round(P['spot.count']);
    for (let i = 0; i < n; i++) {
      const kinds: SpotKind[] = this.location.id === 'reservoir' || this.location.id === 'river' ? ['boil', 'boil', 'birds'] : ['birds', 'boil'];
      this.spots.push({
        kind: kinds[Math.floor(this.rng() * kinds.length)],
        // keep two spots apart: one on each side when there are two
        angleDeg: (n > 1 ? (i === 0 ? 1 : -1) : this.rng() < 0.5 ? 1 : -1) * this.uniform(4, AIM_MAX_DEG * 0.9),
        distM: this.uniform(MIN_DISTANCE_M + 2, MAX_DISTANCE_M - 2),
      });
    }
  }

  /** Where the last cast landed: x (m, + = the player's left), forward distance (m). */
  landing(): { x: number; z: number } {
    const a = THREE_DEG * this.aim * AIM_MAX_DEG;
    return { x: Math.sin(a) * this.distanceM, z: Math.cos(a) * this.distanceM };
  }

  private judgeLanding(): void {
    const P = this.params();
    const at = this.landing();
    let best: { d: number; s: Spot } | null = null;
    for (const s of this.spots) {
      const a = THREE_DEG * s.angleDeg;
      const d = Math.hypot(at.x - Math.sin(a) * s.distM, at.z - Math.cos(a) * s.distM);
      if (!best || d < best.d) best = { d, s };
    }
    if (!best) return;
    const r = P['spot.radiusM'];
    this.spotResult = best.d <= r ? 'hit' : best.d <= r * 2 ? 'near' : 'miss';
    this.spotBonus = this.spotResult === 'hit' ? 1 : this.spotResult === 'near' ? 0.5 : 0;
    this.emit({ type: 'spot', result: this.spotResult, kind: this.spotResult === 'miss' ? null : best.s.kind });
  }

  /** Line brought in per turn, relative: heavy fish slip drag unless just pumped. */
  reelEfficiency(now: number): number {
    const P = this.params();
    const h = this.fish?.heavy ?? 0;
    return now < this.pumpBoostUntil ? 1 + P['pump.boost'] * h : 1 - P['pump.slip'] * h;
  }

  /** The rod was lifted (gesture 'pump'). Counts only while reeling, not right after the hook-set. */
  private pump(rise: number, now: number): void {
    const P = this.params();
    if (this.phase !== 'reeling' || !this.fish || this.thief || now - this.hookT < 800) return;
    if (this.mustStop) {
      // pulling against a running fish: the line takes it
      this.tension = Math.min(1, this.tension + P['pump.runTension']);
      this.emit({ type: 'pump', ok: false, gainM: 0 });
      if (this.tension >= 1) this.miss('snap', now);
      return;
    }
    if (!this.pumpReady) return;
    const gainM = P['pump.m'] * Math.min(1.6, Math.max(0.6, rise)) * (0.4 + this.fish.heavy);
    this.lineM = Math.max(0, this.lineM - gainM);
    this.pumpBoostUntil = now + P['pump.boostS'] * 1000;
    this.pumpReady = false;
    this.reelSincePump = 0;
    this.lastReelT = now;
    this.emit({ type: 'pump', ok: true, gainM });
  }

  /** How far through the current run we are, 0–1 (0 when not running) — drives the jump animation. */
  runFrac(now: number): number {
    if (!this.running) return 0;
    return Math.min(1, (now - this.runStart) / Math.max(1, this.runUntil - this.runStart));
  }

  /** Seconds left to hook-set in the bite phase (for the HUD). */
  biteLeftS(now: number): number {
    return this.phase === 'bite' ? Math.max(0, (this.biteUntil - now) / 1000) : 0;
  }

  /** Seconds left before the thief takes the fish (0 = none). */
  thiefLeftS(now: number): number {
    return this.thief ? Math.max(0, (this.thief.until - now) / 1000) : 0;
  }

  /** Line still out while reeling, m (for the HUD and the scene). */
  lineOutM(): number {
    return this.phase === 'reeling' || this.phase === 'caught' ? this.lineM : this.distanceM;
  }

  /** How far the fight is, 0–1 (the progress bar): line reeled in out of the most that was out. */
  reelFrac(): number {
    return this.fish && this.peakLineM > 0 ? 1 - this.lineM / this.peakLineM : 0;
  }
}
