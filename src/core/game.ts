// Fishing loop — a pure, time-driven state machine (no DOM, testable with a fake clock + RNG).
//
//   bait ─(UI click)→ ready ─(cast)→ flight → waiting ─(bite roll)→ nibble* → bite ─(hook-set)→ reeling → caught
//                                                                     │           │                │
//                                                           hook-set too early   timeout   line snap / escape → missed
//
// Hook-set differences between species are timing only (bite window + fake nibbles); strength
// is never judged (user decision, docs/VERIFICATION.md). Reeling length grows with size / rarity.
//
// Reeling fight: progress fills at the player's reel rate. Every few seconds the fish RUNS —
// announced by a splash `fight.warnS` earlier — and takes line back (progress drops). Reeling
// during a run builds line tension; full tension snaps the line. So the rule the player learns is
// "when it splashes and runs, stop reeling; reel again when it stops".

import type { GestureEvent } from './gestures';
import { baitKey, baitSpeciesKey, fishKey, SPECIES, type Bait, type Params, type Species } from './params';

export type Phase = 'bait' | 'ready' | 'flight' | 'waiting' | 'nibble' | 'bite' | 'reeling' | 'caught' | 'missed';

export type MissReason = 'early' | 'late' | 'snap' | 'escape';
export const MISS_TEXT: Record<MissReason, string> = {
  early: '너무 일찍 챘어요 — 톡톡 건드리는 건 가짜 입질이에요',
  late: '입질을 놓쳤어요 — 찌가 쑥 들어가면 바로 채요',
  snap: '줄이 끊어졌어요 — 물고기가 차고 나갈 땐 감지 말고 기다려요',
  escape: '물고기가 빠져나갔어요 — 줄을 너무 오래 안 감았어요',
};

export interface Fish {
  species: Species;
  lengthCm: number;
  weightG: number;
  /** 0 = smallest of its species, 1 = largest */
  size: number;
  turnsNeeded: number;
  fakeNibbles: number;
}

export type GameEvent =
  | { type: 'phase'; phase: Phase }
  | { type: 'cast'; strength: number; distanceM: number }
  | { type: 'nibble' }
  | { type: 'bite' }
  | { type: 'hooked' }
  | { type: 'runWarn' }
  | { type: 'run'; on: boolean }
  | { type: 'caught'; fish: Fish }
  | { type: 'missed'; reason: MissReason }
  | { type: 'ignored'; gesture: GestureEvent['type']; why: string };

/** Flight time of the cast, s. */
export const FLIGHT_S = 1.2;
const MIN_DISTANCE_M = 8;
const MAX_DISTANCE_M = 28;
/** Weight from length: w = k·L³ (g, cm). Rough freshwater-fish constants; flavour only. */
const WEIGHT_K: Record<Species, number> = { crucian: 0.02, carp: 0.016 };

export class FishingGame {
  phase: Phase = 'bait';
  /** time the current phase started, ms */
  phaseT = 0;
  bait: Bait = 'paste';
  castStrength = 0;
  distanceM = 0;
  fish: Fish | null = null;
  missReason: MissReason | null = null;
  /** reeling: turns reeled so far (fractional) */
  progress = 0;
  /** reeling: line tension 0–1 (1 = snap) */
  tension = 0;
  /** reeling: the fish is running (taking line) */
  running = false;
  /** reeling: a run is about to start (splash warning) */
  runSoon = false;
  /** the reel rate the game last saw, turns/s (for the HUD) */
  reelRate = 0;
  /** in the nibble phase: is a fake nibble showing right now */
  nibbling = false;

  private events: GameEvent[] = [];
  private waitStart = 0;
  private nextCheck = 0;
  private nibblesLeft = 0;
  private nibbleUntil = 0;
  private nextNibble = 0;
  private biteUntil = 0;
  private nextRun = 0;
  private runUntil = 0;
  private lastReelT = 0;
  private lastT = 0;

  constructor(
    private params: () => Params,
    private rng: () => number = Math.random,
  ) {}

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

  chooseBait(b: Bait, now: number): void {
    if (this.phase !== 'bait') return;
    this.bait = b;
    this.setPhase('ready', now);
  }

  /** Back to bait selection (after a result, or to give up a cast). */
  again(now: number): void {
    this.fish = null;
    this.missReason = null;
    this.progress = 0;
    this.tension = 0;
    this.running = false;
    this.runSoon = false;
    this.nibbling = false;
    this.setPhase('bait', now);
  }

  // ---------------------------------------------------------------- gestures

  onGesture(ev: GestureEvent, now: number): void {
    switch (ev.type) {
      case 'cast':
        if (this.phase !== 'ready') return;
        this.castStrength = ev.strength;
        this.distanceM = MIN_DISTANCE_M + (MAX_DISTANCE_M - MIN_DISTANCE_M) * ev.strength;
        this.emit({ type: 'cast', strength: ev.strength, distanceM: this.distanceM });
        this.setPhase('flight', now);
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
    this.progress = 0;
    this.tension = 0;
    this.running = false;
    this.runSoon = false;
    this.lastReelT = now;
    this.scheduleRun(now);
    this.emit({ type: 'hooked' });
    this.setPhase('reeling', now);
  }

  private scheduleRun(now: number): void {
    const s = this.fish!.species;
    this.nextRun = now + this.params()[fishKey(s, 'pullEveryS')] * 1000 * this.uniform(0.7, 1.3);
  }

  private miss(reason: MissReason, now: number): void {
    this.missReason = reason;
    this.running = false;
    this.runSoon = false;
    this.nibbling = false;
    this.emit({ type: 'missed', reason });
    this.setPhase('missed', now);
  }

  // ---------------------------------------------------------------- fish

  private pickFish(): Fish {
    const P = this.params();
    const weight = (sp: Species) => Math.max(0, P[fishKey(sp, 'spawn')] * P[baitSpeciesKey(this.bait, sp)]);
    const total = SPECIES.reduce((s, sp) => s + weight(sp), 0);
    let r = this.rng() * (total || 1);
    let species: Species = SPECIES[0];
    for (const sp of SPECIES) {
      r -= weight(sp);
      if (r < 0) {
        species = sp;
        break;
      }
    }
    const lo = P[fishKey(species, 'lenMin')];
    const hi = Math.max(lo, P[fishKey(species, 'lenMax')]);
    // bait size bias: > 0 skews toward big fish, < 0 toward small ones
    const u = this.rng();
    const bias = P[baitKey(this.bait, 'sizeBias')];
    const size = bias >= 0 ? 1 - (1 - u) ** (1 + bias) : u ** (1 - bias);
    const lengthCm = Math.round((lo + (hi - lo) * size) * 10) / 10;
    const factor = P['size.turnsMin'] + (P['size.turnsMax'] - P['size.turnsMin']) * size;
    return {
      species,
      lengthCm,
      weightG: Math.round(WEIGHT_K[species] * lengthCm ** 3),
      size,
      turnsNeeded: Math.max(1, Math.round(P[fishKey(species, 'reelTurns')] * factor)),
      fakeNibbles: Math.floor(this.rng() * (P[fishKey(species, 'fakeMax')] + 1)),
    };
  }

  // ---------------------------------------------------------------- clock

  /** Advance to `now` (ms). `reelRate` = the player's current reel rate, turns/s. */
  update(now: number, reelRate = 0): void {
    const P = this.params();
    const dt = this.lastT ? Math.max(0, Math.min(0.25, (now - this.lastT) / 1000)) : 0;
    this.lastT = now;
    this.reelRate = reelRate;
    switch (this.phase) {
      case 'flight':
        if (now - this.phaseT >= FLIGHT_S * 1000) {
          this.waitStart = now;
          this.nextCheck = now + this.waitRoll(1);
          this.setPhase('waiting', now);
        }
        break;
      case 'waiting':
        if (now >= this.nextCheck) {
          const forced = now - this.waitStart >= P['wait.maxS'] * 1000;
          if (forced || this.rng() < P[baitKey(this.bait, 'biteChance')]) {
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
    // run schedule: warning → run → pause
    if (!this.running && !this.runSoon && now >= this.nextRun - P['fight.warnS'] * 1000) {
      this.runSoon = true;
      this.emit({ type: 'runWarn' });
    }
    if (!this.running && now >= this.nextRun) {
      this.running = true;
      this.runSoon = false;
      this.runUntil = now + P[fishKey(fish.species, 'pullS')] * 1000 * this.uniform(0.8, 1.2);
      this.emit({ type: 'run', on: true });
    } else if (this.running && now >= this.runUntil) {
      this.running = false;
      this.lastReelT = now; // the player was told to wait — don't count the run as slack
      this.scheduleRun(now);
      this.emit({ type: 'run', on: false });
    }

    if (this.running) {
      this.progress = Math.max(0, this.progress - P['fight.takeRate'] * dt);
      this.tension += P['fight.tensionPerTurn'] * rate * dt;
      if (rate === 0) this.tension = Math.max(0, this.tension - P['fight.tensionDecay'] * dt);
      if (this.tension >= 1) {
        this.tension = 1;
        this.miss('snap', now);
        return;
      }
    } else {
      this.progress += rate * dt;
      this.tension = Math.max(0, this.tension - P['fight.tensionDecay'] * dt);
      if (rate > 0) this.lastReelT = now;
      else if (now - this.lastReelT >= P['fight.slackS'] * 1000) {
        this.miss('escape', now);
        return;
      }
    }
    if (this.progress >= fish.turnsNeeded) {
      this.progress = fish.turnsNeeded;
      this.running = false;
      this.runSoon = false;
      this.emit({ type: 'caught', fish });
      this.setPhase('caught', now);
    }
  }

  private waitRoll(scale: number): number {
    const P = this.params();
    const lo = P[baitKey(this.bait, 'waitMin')];
    const hi = Math.max(lo, P[baitKey(this.bait, 'waitMax')]);
    return Math.max(1, this.uniform(lo, hi) * scale) * 1000;
  }

  private startBite(now: number): void {
    this.nibbling = false;
    this.biteUntil = now + this.params()[fishKey(this.fish!.species, 'biteWindowS')] * 1000;
    this.emit({ type: 'bite' });
    this.setPhase('bite', now);
  }

  /** Seconds left to hook-set in the bite phase (for the HUD). */
  biteLeftS(now: number): number {
    return this.phase === 'bite' ? Math.max(0, (this.biteUntil - now) / 1000) : 0;
  }

  /** Line still out while reeling, m (for the HUD and the scene). */
  lineOutM(): number {
    if (!this.fish) return this.distanceM;
    return this.distanceM * (1 - this.progress / this.fish.turnsNeeded);
  }
}
