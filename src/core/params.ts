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

// Baits (user, 2026-09-25: the DESIGN.md trio was only an example). Freshwater reservoir baits that
// differ in more than bite speed: which species they attract and how big. Controls stay the same.
export const BAITS = ['worm', 'paste', 'corn'] as const;
export type Bait = (typeof BAITS)[number];
export const BAIT_NAME: Record<Bait, string> = { worm: '지렁이', paste: '떡밥', corn: '옥수수' };

export const SPECIES = ['crucian', 'carp'] as const;
export type Species = (typeof SPECIES)[number];
export const SPECIES_NAME: Record<Species, string> = { crucian: '붕어', carp: '잉어' };

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

  // ---- baits. A bite check happens after a random wait in [waitMin, waitMax]; it succeeds with
  // biteChance, otherwise the next check comes after half as long. wait.maxS forces a bite.
  // Species weight = spawn × the bait's multiplier. sizeBias > 0 skews toward bigger fish.
  'bait.worm.waitMin': [5, m('미끼: 지렁이', '대기 최소', 1, 60, 1, '초')],
  'bait.worm.waitMax': [10, m('미끼: 지렁이', '대기 최대', 1, 60, 1, '초')],
  'bait.worm.biteChance': [0.6, m('미끼: 지렁이', '입질 확률', 0, 1, 0.05)],
  'bait.worm.crucianMul': [1.5, m('미끼: 지렁이', '붕어 배율', 0, 5, 0.1)],
  'bait.worm.carpMul': [0.5, m('미끼: 지렁이', '잉어 배율', 0, 5, 0.1)],
  'bait.worm.sizeBias': [-0.3, m('미끼: 지렁이', '크기 치우침 (−작게 +크게)', -0.9, 3, 0.1)],
  'bait.paste.waitMin': [10, m('미끼: 떡밥', '대기 최소', 1, 60, 1, '초')],
  'bait.paste.waitMax': [18, m('미끼: 떡밥', '대기 최대', 1, 60, 1, '초')],
  'bait.paste.biteChance': [0.4, m('미끼: 떡밥', '입질 확률', 0, 1, 0.05)],
  'bait.paste.crucianMul': [1, m('미끼: 떡밥', '붕어 배율', 0, 5, 0.1)],
  'bait.paste.carpMul': [1, m('미끼: 떡밥', '잉어 배율', 0, 5, 0.1)],
  'bait.paste.sizeBias': [0, m('미끼: 떡밥', '크기 치우침 (−작게 +크게)', -0.9, 3, 0.1)],
  'bait.corn.waitMin': [20, m('미끼: 옥수수', '대기 최소', 1, 60, 1, '초')],
  'bait.corn.waitMax': [32, m('미끼: 옥수수', '대기 최대', 1, 60, 1, '초')],
  'bait.corn.biteChance': [0.25, m('미끼: 옥수수', '입질 확률', 0, 1, 0.05)],
  'bait.corn.crucianMul': [0.4, m('미끼: 옥수수', '붕어 배율', 0, 5, 0.1)],
  'bait.corn.carpMul': [3, m('미끼: 옥수수', '잉어 배율', 0, 5, 0.1)],
  'bait.corn.sizeBias': [1, m('미끼: 옥수수', '크기 치우침 (−작게 +크게)', -0.9, 3, 0.1)],
  'wait.maxS': [40, m('미끼: 공통', '최대 대기 (넘으면 무조건 입질)', 5, 90, 1, '초')], // DESIGN §3: never over 40 s

  // ---- species. Hook-set differences are timing only (user decision): bite window + fake nibbles.
  // Reeling length = reelTurns × size factor (bigger / rarer → longer, user suggestion).
  'fish.crucian.spawn': [75, m('어종: 붕어', '출현 비중', 0, 100, 1)],
  'fish.crucian.biteWindowS': [1.2, m('어종: 붕어', '챔질 제한 시간', 0.3, 5, 0.1, '초')],
  'fish.crucian.fakeMax': [1, m('어종: 붕어', '가짜 입질 최대', 0, 4, 1, '회')],
  'fish.crucian.reelTurns': [20, m('어종: 붕어', '기본 릴링 횟수', 3, 150, 1, '회')],
  'fish.crucian.pullEveryS': [4, m('어종: 붕어', '당김 간격', 1, 15, 0.5, '초')],
  'fish.crucian.pullS': [1.0, m('어종: 붕어', '당김 길이', 0.2, 5, 0.1, '초')],
  'fish.crucian.lenMin': [12, m('어종: 붕어', '길이 최소', 3, 100, 1, 'cm')],
  'fish.crucian.lenMax': [30, m('어종: 붕어', '길이 최대', 3, 100, 1, 'cm')],
  'fish.carp.spawn': [25, m('어종: 잉어', '출현 비중', 0, 100, 1)],
  'fish.carp.biteWindowS': [2.0, m('어종: 잉어', '챔질 제한 시간', 0.3, 5, 0.1, '초')],
  'fish.carp.fakeMax': [2, m('어종: 잉어', '가짜 입질 최대', 0, 4, 1, '회')],
  'fish.carp.reelTurns': [45, m('어종: 잉어', '기본 릴링 횟수', 3, 150, 1, '회')],
  'fish.carp.pullEveryS': [3, m('어종: 잉어', '당김 간격', 1, 15, 0.5, '초')],
  'fish.carp.pullS': [1.8, m('어종: 잉어', '당김 길이', 0.2, 5, 0.1, '초')],
  'fish.carp.lenMin': [30, m('어종: 잉어', '길이 최소', 3, 120, 1, 'cm')],
  'fish.carp.lenMax': [70, m('어종: 잉어', '길이 최대', 3, 120, 1, 'cm')],
  'size.turnsMin': [0.7, m('어종: 공통', '가장 작을 때 릴링 배율', 0.2, 1.5, 0.05)],
  'size.turnsMax': [1.3, m('어종: 공통', '가장 클 때 릴링 배율', 0.5, 3, 0.05)],

  // ---- reeling fight ("밀당")
  // A fish run ("차고 나감"): announced by a splash warnS before it starts, the fish takes line back
  // (distance grows) and reeling against it builds line tension — full tension snaps the line.
  'fight.warnS': [0.8, m('릴링 밀당', '차고 나가기 전 예고', 0, 2, 0.1, '초')],
  'fight.takeRate': [1.5, m('릴링 밀당', '차고 나갈 때 풀리는 줄', 0, 5, 0.1, '회/초')],
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

export const baitKey = (b: Bait, f: 'waitMin' | 'waitMax' | 'biteChance' | 'crucianMul' | 'carpMul' | 'sizeBias') =>
  `bait.${b}.${f}` as ParamKey;
export const baitSpeciesKey = (b: Bait, s: Species) => `bait.${b}.${s}Mul` as ParamKey;
export const fishKey = (
  s: Species,
  f: 'spawn' | 'biteWindowS' | 'fakeMax' | 'reelTurns' | 'pullEveryS' | 'pullS' | 'lenMin' | 'lenMax',
) => `fish.${s}.${f}` as ParamKey;
