// Every tunable number in one place. ALL of these are placeholders: gesture thresholds come from
// the M0 recordings (docs/VERIFICATION.md), bait / species numbers from DESIGN.md §3 examples or
// first guesses. They are adjusted with the user in playtests via the ⚙ sliders (src/app/tuning.ts).
//
// Units: "torso" = image distance shoulder-midpoint → hip-midpoint (camera-distance free).

export interface ParamMeta {
  label: string;
  group: string;
  min: number;
  max: number;
  step: number;
  unit?: string;
}

const m = (group: string, label: string, min: number, max: number, step: number, unit?: string): ParamMeta => ({
  group, label, min, max, step, unit,
});

// Species, places and baits (M2) live in species.ts as data tables; only global multipliers are here.

/** [default, meta] per key. Keys are flat so the slider panel and storage stay trivial. */
const DEFS = {
  // ---- recognition (M0 recordings)
  minVis: [0.5, m('인식', '관절 신뢰도 최소', 0.2, 0.9, 0.05)],
  // casts 6.3–12.5 at normal distance; framed close at 15 fps (F1) the first cast measured 4.4 → 4.5.
  // Only counted in the 'ready' phase, where the fastest non-cast movement seen was 1.98 (E3 fidgeting).
  'cast.speedMin': [4.5, m('캐스팅', '최소 속도', 2, 12, 0.5, '몸통/s')],
  'cast.moveMin': [0.6, m('캐스팅', '최소 이동 (0.45초)', 0.2, 1.5, 0.05, '몸통')], // casts ≥ 0.63
  'cast.dropMin': [0.3, m('캐스팅', '최소 하강 (0.45초)', 0, 1, 0.05, '몸통')], // side casts drop 0.45+
  'cast.speedFull': [12, m('캐스팅', '최대 세기 속도', 6, 20, 0.5, '몸통/s')],
  'cast.cooldownMs': [1000, m('캐스팅', '재인식 간격', 200, 3000, 100, 'ms')],
  'hook.speedMin': [3, m('챔질', '최소 속도', 1, 8, 0.25, '몸통/s')], // weakest hook-set 4.3, fidget max 1.98
  'hook.riseMin': [0.4, m('챔질', '최소 상승 (0.45초)', 0.1, 1.2, 0.05, '몸통')], // weakest 0.52, fidget max 0.26
  // Reeling is measured as a RATE, not counted turn by turn: counting lost a third of fast reeling at
  // 10 fps (M1 playtest "빠르게 하면 인식을 잘 못 해"). Reel-hand speed (torso lengths/s over ~0.4 s):
  // still 95% ≤ 0.39, slow reeling median 1.3–1.6 → rate = speed × turnsPerTorso, capped at maxRate.
  'reel.speedMin': [0.6, m('릴링', '감는 중으로 볼 최소 손 속도', 0.2, 2, 0.05, '몸통/s')],
  'reel.turnsPerTorso': [2.2, m('릴링', '손 속도 → 회/초 배율', 0.5, 5, 0.1)], // D1: 3.5 turns/s at 1.56
  'reel.maxRate': [4, m('릴링', '최대 감기 속도 (이보다 빨라도 같음)', 1, 8, 0.25, '회/초')],
  'reel.windowMs': [400, m('릴링', '속도 평균 창', 150, 1000, 50, 'ms')],

  // ---- how often each rarity shows up (weights; each bait multiplies them — species.ts)
  // per rarity TIER (shared by the tier's species at a place): ≈ 55 / 25 / 12 / 8 % before bait bonuses.
  // User (M2): legends should show up "종종", not almost never.
  'tier.common': [55, m('출현 비중', '흔함', 0, 100, 1)],
  'tier.uncommon': [25, m('출현 비중', '보통', 0, 100, 1)],
  'tier.rare': [12, m('출현 비중', '희귀', 0, 100, 0.5)],
  'tier.legend': [8, m('출현 비중', '전설', 0, 30, 0.5)],

  // ---- global multipliers over the per-species / per-bait tables in species.ts
  // A bite check happens after a random wait in [bait waitMin, waitMax] × scale.wait; it succeeds with the
  // bait's biteChance, otherwise the next check comes after half as long. wait.maxS forces a bite.
  'scale.wait': [0.6, m('전체 배율', '대기 시간', 0.2, 3, 0.05)], // user (M2): shorter waits — a game, not a stakeout
  'wait.maxS': [25, m('전체 배율', '최대 대기 (넘으면 무조건 입질)', 5, 90, 1, '초')], // DESIGN §3: never over 40 s
  'scale.biteWindow': [1, m('전체 배율', '챔질 제한 시간', 0.3, 3, 0.05)],
  'scale.reel': [1, m('전체 배율', '릴링 길이', 0.2, 3, 0.05)],
  'scale.runEvery': [1, m('전체 배율', '차고 나가는 간격', 0.3, 3, 0.05)],
  // Reeling length = species reelTurns × size factor (bigger / rarer → longer, user suggestion).
  'size.turnsMin': [0.7, m('전체 배율', '가장 작을 때 릴링 배율', 0.2, 1.5, 0.05)],
  'size.turnsMax': [1.3, m('전체 배율', '가장 클 때 릴링 배율', 0.5, 3, 0.05)],

  // ---- interference events (user: otters / crocodiles / hippos only rarely and realistically)
  // thief (수달·범고래·악어): once per fight at most, comes for the hooked fish — reel fast to get away.
  // spooker (하마): surfaces near the float while you wait; the fish scatter and the wait starts over.
  'event.thief': [0.07, m('훼방 이벤트', '도둑이 나타날 확률 (한 판당)', 0, 1, 0.01)],
  'event.warnS': [2.8, m('훼방 이벤트', '도둑이 오기까지 시간', 0.5, 6, 0.1, '초')],
  'event.escapeTurns': [6, m('훼방 이벤트', '그 안에 감아야 하는 횟수', 1, 20, 0.5, '회')],
  'event.spooker': [0.08, m('훼방 이벤트', '하마가 나타날 확률 (한 번 던질 때)', 0, 1, 0.01)],

  // ---- reeling fight ("밀당")
  // A fish run ("차고 나감"): announced by a splash warnS before it starts, the fish takes line back
  // (distance grows) and reeling against it builds line tension — full tension snaps the line.
  'fight.warnS': [0.8, m('릴링 밀당', '차고 나가기 전 예고', 0, 2, 0.1, '초')],
  'fight.takeRate': [0.9, m('릴링 밀당', '차고 나갈 때 풀리는 줄', 0, 5, 0.1, '회/초')],
  'fight.tensionPerTurn': [0.12, m('릴링 밀당', '차고 나갈 때 1회 감으면 긴장 +', 0.02, 0.6, 0.01)],
  'fight.tensionDecay': [0.6, m('릴링 밀당', '긴장 회복 /초', 0.05, 2, 0.05)],
  'fight.slackS': [10, m('릴링 밀당', '안 감으면 빠져나감', 3, 60, 1, '초')],
  'fight.nibbleS': [0.6, m('입질', '가짜 입질 길이', 0.2, 2, 0.1, '초')],
  'fight.nibbleGapS': [1.2, m('입질', '가짜 입질 뒤 쉼', 0.3, 4, 0.1, '초')],
} as const satisfies Record<string, readonly [number, ParamMeta]>;

export type ParamKey = keyof typeof DEFS;
export type Params = Record<ParamKey, number>;

export const PARAM_KEYS = Object.keys(DEFS) as ParamKey[];
export const PARAM_META: Record<ParamKey, ParamMeta> = Object.fromEntries(
  PARAM_KEYS.map((k) => [k, DEFS[k][1]]),
) as Record<ParamKey, ParamMeta>;

export function defaultParams(): Params {
  return Object.fromEntries(PARAM_KEYS.map((k) => [k, DEFS[k][0]])) as Params;
}
