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
  'reel.maxRate': [6, m('릴링', '최대 감기 속도 (이보다 빨라도 같음)', 1, 10, 0.25, '회/초')], // was 4: fast reeling (D3 ~5/s) looked no faster than normal (~3.5)
  // M3 (G1–G3): cast aim from the wrist's sideways travel. Full aim at this travel (torso lengths)
  'aim.rodSideFull': [1.1, m('캐스팅 방향', '대 든 쪽으로 끝까지 겨냥 = 손 이동', 0.3, 2, 0.05, '몸통')],
  'aim.acrossFull': [0.75, m('캐스팅 방향', '반대쪽으로 끝까지 겨냥 = 손 이동', 0.3, 2, 0.05, '몸통')],
  'aim.dead': [0.2, m('캐스팅 방향', '정면으로 볼 범위 (조준값 비율)', 0, 0.6, 0.05)],
  // M3 (G4): pumping — rod hand rises this much above its lowest point of the last 2.5 s
  'pump.riseMin': [0.6, m('펌핑', '대 들어 올리기로 볼 높이', 0.2, 1.5, 0.05, '몸통')],
  'pump.rearmDrop': [0.4, m('펌핑', '다시 펌핑하려면 내려야 하는 높이', 0.1, 1.2, 0.05, '몸통')],
  'reel.windowMs': [300, m('릴링', '속도 평균 창', 150, 1000, 50, 'ms')],

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
  'scale.reel': [1, m('전체 배율', '릴링 길이 (1회당 감기는 줄 ÷)', 0.2, 3, 0.05)],
  'scale.runEvery': [1, m('전체 배율', '차고 나가는 간격', 0.3, 3, 0.05)],
  // Reeling is in metres of line: every turn brings in reel.mPerTurn, at most fight.heavy less for
  // the heaviest fish (was: more turns for bigger fish — "릴링이 반영이 잘 안 되는 느낌"). Big fish
  // fight longer by stripping line on their runs (fight.takeRate, scaled by power and size).
  'reel.mPerTurn': [0.9, m('릴링', '1회 감으면 들어오는 줄', 0.2, 3, 0.05, 'm')],
  'fight.heavy': [0.45, m('릴링 밀당', '가장 무거운 물고기는 1회당 이만큼 덜 감김', 0, 0.9, 0.05)],

  // ---- interference events (user: otters / crocodiles / hippos only rarely and realistically)
  // thief (수달·범고래·악어): once per fight at most, comes for the hooked fish — reel fast to get away.
  // spooker (하마): surfaces near the float while you wait; the fish scatter and the wait starts over.
  // ---- M3 포인트 공략: signs of fish on the water; a cast landing near one does better
  'spot.count': [2, m('포인트 공략', '포인트 개수', 0, 3, 1, '개')],
  'spot.radiusM': [4, m('포인트 공략', '적중 반경 (그 두 배까지는 "근처")', 1, 10, 0.5, 'm')],
  'spot.waitCut': [0.6, m('포인트 공략', '적중 시 대기 시간 줄이기', 0, 0.9, 0.05)],
  'spot.rareMul': [2.5, m('포인트 공략', '적중 시 희귀·전설 확률 배수', 1, 6, 0.1, '배')],
  'spot.sizeBias': [0.6, m('포인트 공략', '적중 시 큰 개체 쪽으로', 0, 2, 0.05)],
  // ---- M3 펌핑: heavy fish slip drag; lifting the rod drags them in
  'pump.slip': [0.35, m('펌핑', '가장 무거운 물고기: 감기만 하면 이만큼 덜 감김', 0, 0.9, 0.05)],
  'pump.m': [0.9, m('펌핑', '한 번 들어 올리면 끌려오는 줄 (보통)', 0, 6, 0.1, 'm')],
  'pump.boost': [0.25, m('펌핑', '펌핑 직후 감기 효율 추가', 0, 1, 0.05)],
  'pump.boostS': [3, m('펌핑', '펌핑 효과 시간', 0.5, 8, 0.5, '초')],
  'pump.floorM': [3, m('펌핑', '이만큼 남으면 펌핑은 안 먹힘 (감아서 마무리)', 0, 10, 0.5, 'm')],
  'pump.calmS': [2, m('펌핑', '펌핑 뒤 차고 나가지 않는 시간', 0, 8, 0.5, '초')],
  'pump.rearmTurns': [0, m('펌핑', '다음 펌핑까지 감아야 하는 바퀴 (0 = 손만 내리면 됨)', 0, 5, 0.5, '회')],

  // ---- M3 로드워크 (G6): rod arm held out against a run (sideways, torso lengths from the shoulder)
  'sweep.min': [0.4, m('로드워크', '버티기로 볼 팔 옮김', 0.15, 1, 0.05, '몸통')],
  'sweep.takeCut': [0.6, m('로드워크', '버티면 풀리는 줄 줄이기', 0, 1, 0.05)],
  'sweep.tensionCut': [0.5, m('로드워크', '버티면 긴장 덜 오르기', 0, 1, 0.05)],
  'sweep.tire': [0.6, m('로드워크', '버티면 차고 나가기가 이만큼 빨리 끝남 (배)', 0, 2, 0.05)],

  'event.thief': [0.07, m('훼방 이벤트', '도둑이 나타날 확률 (한 판당)', 0, 1, 0.01)],
  'event.warnS': [2.8, m('훼방 이벤트', '도둑이 오기까지 시간', 0.5, 6, 0.1, '초')],
  'event.escapeTurns': [6, m('훼방 이벤트', '그 안에 감아야 하는 횟수', 1, 20, 0.5, '회')],
  'event.spooker': [0.08, m('훼방 이벤트', '하마가 나타날 확률 (한 번 던질 때)', 0, 1, 0.01)],

  // ---- reeling fight ("밀당")
  // A fish run ("차고 나감"): announced by a splash warnS before it starts, the fish takes line back
  // (distance grows) and reeling against it builds line tension — full tension snaps the line.
  'fight.warnS': [1.2, m('릴링 밀당', '차고 나가기 전 예고', 0, 2, 0.1, '초')],
  'fight.takeRate': [0.6, m('릴링 밀당', '차고 나갈 때 풀리는 줄 (가장 센 물고기)', 0, 5, 0.05, 'm/초')],
  'fight.openM': [15, m('릴링 밀당', '챔질 직후 큰 물고기가 끌고 가는 줄 (가장 클 때)', 0, 80, 1, 'm')],
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
