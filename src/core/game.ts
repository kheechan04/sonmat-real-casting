// M1 fishing loop — a pure, time-driven state machine (no DOM, testable with a fake clock + RNG).
//
//   bait ─(UI click)→ ready ─(cast)→ flight → waiting ─(bite roll)→ nibble* → bite ─(hook-set)→ reeling → caught
//                                                                     │           │                │
//                                                           hook-set too early   timeout   line break / escape → missed
//
// Hook-set differences between species are timing only (bite window + fake nibbles); strength
// is never judged (user decision, docs/VERIFICATION.md). Reeling length grows with size / rarity.

import type { GestureEvent } from './gestures';
import { baitKey, fishKey, SPECIES, type Bait, type Params, type Species } from './params';

export type Phase = 'bait' | 'ready' | 'flight' | 'waiting' | 'nibble' | 'bite' | 'reeling' | 'caught' | 'missed';

export type MissReason = 'early' | 'late' | 'snap' | 'escape';
export const MISS_TEXT: Record<MissReason, string> = {
  early: '너무 일찍 챘어요 — 가짜 입질이었어요',
  late: '입질을 놓쳤어요',
  snap: '줄이 끊어졌어요 — 물고기가 당길 땐 잠깐 멈춰요',
  escape: '물고기가 빠져나갔어요',
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
  | { type: 'reel'; progress: number }
  | { type: 'pull'; on: boolean }
  | { type: 'caught'; fish: Fish }
  | { type: 'missed'; reason: MissReason }
  | { type: 'ignored'; gesture: GestureEvent['type']; why: string };

/** Flight time of the cast, s. */
const FLIGHT_S = 1.2;
const MIN_DISTANCE_M = 6;
const MAX_DISTANCE_M = 26;
/** Weight from length: w = k·L³ (g, cm). Rough freshwater-fish constants; placeholder flavour only. */
const WEIGHT_K: Record<Species, number> = { crucian: 0.02, carp: 0.016 };

export class FishingGame {
  phase: Phase = 'bait';
  /** time the current phase started, ms */
  phaseT = 0;
  bait: Bait = 'normal';
  castStrength = 0;
  distanceM = 0;
  fish: Fish | null = null;
  missReason: MissReason | null = null;
  /** reeling */
  progress = 0;
  tension = 0;
  pulling = false;
  /** in the nibble phase: is a fake nibble showing right now */
  nibbling = false;

  private events: GameEvent[] = [];
  private waitStart = 0;
  private nextCheck = 0;
  private nibblesLeft = 0;
  private nibbleUntil = 0;
  private nextNibble = 0;
  private biteUntil = 0;
  private nextPull = 0;
  private pullUntil = 0;
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
    this.pulling = false;
    this.nibbling = false;
    this.setPhase('bait', now);
  }

  // ---------------------------------------------------------------- gestures

  onGesture(ev: GestureEvent, now: number): void {
    const P = this.params();
    switch (ev.type) {
      case 'cast':
        if (this.phase !== 'ready') return;
        this.castStrength = ev.strength;
        this.distanceM = MIN_DISTANCE_M + (MAX_DISTANCE_M - MIN_DISTANCE_M) * ev.strength;
        this.emit({ type: 'cast', strength: ev.strength, distanceM: this.distanceM });
        this.setPhase('flight', now);
        return;
      case 'hookset':
        if (this.phase === 'bite') {
          this.hook(now);
        } else if (this.phase === 'nibble') {
          this.miss('early', now);
        } else if (this.phase === 'waiting') {
          // no penalty: nothing is on the line yet
          this.emit({ type: 'ignored', gesture: 'hookset', why: '아직 입질이 없어요' });
        }
        return;
      case 'reel':
        if (this.phase !== 'reeling') return;
        this.lastReelT = now;
        if (this.pulling) {
          this.tension += P['fight.tensionPerTurn'];
          if (this.tension >= 1) this.miss('snap', now);
        } else if (this.fish) {
          this.progress = Math.min(this.fish.turnsNeeded, this.progress + 1);
          this.emit({ type: 'reel', progress: this.progress });
          if (this.progress >= this.fish.turnsNeeded) {
            this.pulling = false;
            this.emit({ type: 'caught', fish: this.fish });
            this.setPhase('caught', now);
          }
        }
        return;
    }
  }

  private hook(now: number): void {
    const P = this.params();
    const s = this.fish!.species;
    this.progress = 0;
    this.tension = 0;
    this.pulling = false;
    this.lastReelT = now;
    this.nextPull = now + P[fishKey(s, 'pullEveryS')] * 1000 * this.uniform(0.7, 1.3);
    this.emit({ type: 'hooked' });
    this.setPhase('reeling', now);
  }

  private miss(reason: MissReason, now: number): void {
    this.missReason = reason;
    this.pulling = false;
    this.nibbling = false;
    this.emit({ type: 'missed', reason });
    this.setPhase('missed', now);
  }

  // ---------------------------------------------------------------- fish

  private pickFish(): Fish {
    const P = this.params();
    const total = SPECIES.reduce((s, sp) => s + Math.max(0, P[fishKey(sp, 'spawn')]), 0);
    let r = this.rng() * (total || 1);
    let species: Species = SPECIES[0];
    for (const sp of SPECIES) {
      r -= Math.max(0, P[fishKey(sp, 'spawn')]);
      if (r < 0) {
        species = sp;
        break;
      }
    }
    const lo = P[fishKey(species, 'lenMin')];
    const hi = Math.max(lo, P[fishKey(species, 'lenMax')]);
    const size = this.rng();
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

  update(now: number): void {
    const P = this.params();
    const dt = Math.max(0, (now - this.lastT) / 1000);
    this.lastT = now;
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
      case 'reeling': {
        const s = this.fish!.species;
        if (!this.pulling && now >= this.nextPull) {
          this.pulling = true;
          this.pullUntil = now + P[fishKey(s, 'pullS')] * 1000 * this.uniform(0.8, 1.2);
          this.emit({ type: 'pull', on: true });
        } else if (this.pulling && now >= this.pullUntil) {
          this.pulling = false;
          this.nextPull = now + P[fishKey(s, 'pullEveryS')] * 1000 * this.uniform(0.7, 1.3);
          this.emit({ type: 'pull', on: false });
        }
        this.tension = Math.max(0, this.tension - P['fight.tensionDecay'] * dt);
        if (now - this.lastReelT >= P['fight.slackS'] * 1000) this.miss('escape', now);
        break;
      }
      default:
        break;
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
}
