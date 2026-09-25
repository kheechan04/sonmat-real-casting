// M2: where you fish, what bites there, and with which bait. User (2026-09-25): "일반 물고기로 하지
// 않을 거야 — 백상아리, 범고래, 심해아귀, 귀상어, 귀신고기 같은 이목 끌 수 있는 물고기, 낚시용 물고기도" +
// otters / crocodiles / hippos only rarely and realistically → four places where each creature
// really lives, and the animals as rare interference events (not catches).
//
// Every number here is a placeholder (bite windows, lengths, reel turns …). Global multipliers
// for play-testing are in params.ts ('tier.*', 'scale.*', 'event.*').

export type LocationId = 'reservoir' | 'sea' | 'deep' | 'river';
export type Tier = 'common' | 'uncommon' | 'rare' | 'legend';

/** How the bite shows on the float (or, in the deep, on the rod tip). */
export type BiteStyle =
  | 'rise' // 찌올림 — the float rises (crucian)
  | 'sink' // 빨림 — sucked under (carp, most fish)
  | 'drag' // dragged sideways and under (predators that run with the bait)
  | 'slam' // one violent plunge (big predators)
  | 'tap'; // rod-tip knocks, then a pull (deep drop — no float)

/**
 * What the fish does when it fights (user, M2: "어종별 특정 행동"). Replaces about half of its runs.
 *  jump   — leaps clear of the water (바늘털이): reeling now builds tension 2.5× → stop
 *  dive   — sounds deep: takes a lot of line, lasts longer → wait
 *  thrash — splashes wildly at the surface → stop
 *  dig    — hugs the bottom: the opposite — keep reeling hard, it only half works
 *  shock  — an electric jolt: reeling does nothing for a moment
 */
export type Behavior = 'jump' | 'dive' | 'thrash' | 'dig' | 'shock';

export interface SpeciesDef {
  id: string;
  name: string;
  loc: LocationId;
  tier: Tier;
  lenMin: number;
  lenMax: number;
  /** weight g = k · length(cm)³ */
  weightK: number;
  /** hook-set window after the real bite, s (species difference #1, user decision) */
  biteWindowS: number;
  /** fake nibbles before the real bite, max (species difference #2) */
  fakeMax: number;
  bite: BiteStyle;
  /** base reel turns at the middle size — bigger / rarer = longer (user suggestion) */
  reelTurns: number;
  /** seconds between runs, and how long a run lasts */
  runEveryS: number;
  runS: number;
  /** length from which the result card calls it a trophy, and what it says */
  trophyCm: number;
  trophyLabel: string;
  /** one line for the 도감 (collection) */
  blurb: string;
  behavior?: Behavior;
}

const W = { slim: 0.008, fish: 0.013, deep: 0.02, shark: 0.009, flat: 0.018, ribbon: 0.0015 };

export const SPECIES: readonly SpeciesDef[] = [
  // ---------------------------------------------------------------- 저수지 (reservoir)
  { id: 'crucian', name: '붕어', loc: 'reservoir', tier: 'common', lenMin: 12, lenMax: 36, weightK: 0.02, biteWindowS: 1.2, fakeMax: 1, bite: 'rise', reelTurns: 18, runEveryS: 5, runS: 1, trophyCm: 30.3, trophyLabel: '월척!', blurb: '저수지 낚시의 기본. 찌가 스르륵 올라오는 찌올림이 매력' },
  { id: 'carp', behavior: 'dig', name: '잉어', loc: 'reservoir', tier: 'uncommon', lenMin: 30, lenMax: 90, weightK: 0.016, biteWindowS: 2, fakeMax: 2, bite: 'sink', reelTurns: 40, runEveryS: 3.5, runS: 1.8, trophyCm: 70, trophyLabel: '대물!', blurb: '힘이 좋아 몇 번이고 차고 나간다' },
  { id: 'bass', behavior: 'jump', name: '배스', loc: 'reservoir', tier: 'common', lenMin: 20, lenMax: 60, weightK: 0.014, biteWindowS: 1, fakeMax: 0, bite: 'drag', reelTurns: 24, runEveryS: 3, runS: 1, trophyCm: 50, trophyLabel: '런커!', blurb: '미끼를 물고 옆으로 내달리는 포식자' },
  { id: 'catfish', behavior: 'dig', name: '메기', loc: 'reservoir', tier: 'uncommon', lenMin: 30, lenMax: 100, weightK: W.slim, biteWindowS: 2.5, fakeMax: 1, bite: 'sink', reelTurns: 42, runEveryS: 4, runS: 2, trophyCm: 80, trophyLabel: '대물!', blurb: '수염으로 더듬어 바닥에서 천천히 삼킨다' },
  { id: 'snakehead', behavior: 'thrash', name: '가물치', loc: 'reservoir', tier: 'rare', lenMin: 40, lenMax: 100, weightK: 0.009, biteWindowS: 0.8, fakeMax: 0, bite: 'slam', reelTurns: 45, runEveryS: 3, runS: 1.6, trophyCm: 80, trophyLabel: '괴물 가물치!', blurb: '물을 가르며 한 번에 덮치는 민물의 폭군' },
  { id: 'mandarin', behavior: 'thrash', name: '쏘가리', loc: 'reservoir', tier: 'rare', lenMin: 20, lenMax: 55, weightK: 0.016, biteWindowS: 1, fakeMax: 1, bite: 'drag', reelTurns: 30, runEveryS: 3, runS: 1.2, trophyCm: 45, trophyLabel: '대물!', blurb: '표범 무늬의 민물 황제' },
  { id: 'golden_mandarin', name: '황쏘가리', loc: 'reservoir', tier: 'legend', lenMin: 25, lenMax: 55, weightK: 0.016, biteWindowS: 1, fakeMax: 1, bite: 'drag', reelTurns: 45, runEveryS: 3, runS: 1.4, trophyCm: 0, trophyLabel: '천연기념물!', blurb: '온몸이 금빛인 쏘가리. 천연기념물이라 사진만 찍고 놓아준다' },

  // ---------------------------------------------------------------- 바다 (sea, rocky shore / boat)
  { id: 'rockfish', behavior: 'dig', name: '우럭', loc: 'sea', tier: 'common', lenMin: 20, lenMax: 50, weightK: 0.018, biteWindowS: 1.4, fakeMax: 2, bite: 'sink', reelTurns: 22, runEveryS: 5, runS: 1, trophyCm: 45, trophyLabel: '대물!', blurb: '바위틈에 사는 뚱한 표정의 단골손님' },
  { id: 'red_seabream', behavior: 'dive', name: '참돔', loc: 'sea', tier: 'common', lenMin: 25, lenMax: 90, weightK: 0.02, biteWindowS: 1.2, fakeMax: 1, bite: 'sink', reelTurns: 26, runEveryS: 3.5, runS: 1.4, trophyCm: 70, trophyLabel: '대물!', blurb: '분홍빛 바다의 여왕' },
  { id: 'flounder', behavior: 'dig', name: '광어', loc: 'sea', tier: 'common', lenMin: 30, lenMax: 90, weightK: W.flat, biteWindowS: 2, fakeMax: 2, bite: 'sink', reelTurns: 28, runEveryS: 4.5, runS: 1.2, trophyCm: 70, trophyLabel: '대광어!', blurb: '바닥에 납작 붙어 있다가 덮친다. 눈이 한쪽에 몰려 있다' },
  { id: 'seabass', behavior: 'jump', name: '농어', loc: 'sea', tier: 'uncommon', lenMin: 40, lenMax: 110, weightK: 0.01, biteWindowS: 1, fakeMax: 0, bite: 'drag', reelTurns: 40, runEveryS: 3, runS: 1.6, trophyCm: 90, trophyLabel: '대물!', blurb: '물 위로 머리를 흔들며 바늘을 털어낸다' },
  { id: 'yellowtail', behavior: 'dive', name: '방어', loc: 'sea', tier: 'uncommon', lenMin: 50, lenMax: 120, weightK: 0.011, biteWindowS: 1, fakeMax: 0, bite: 'slam', reelTurns: 32, runEveryS: 3, runS: 2, trophyCm: 100, trophyLabel: '대방어!', blurb: '겨울 바다의 폭주 기관차' },
  { id: 'tuna', behavior: 'dive', name: '참다랑어', loc: 'sea', tier: 'rare', lenMin: 100, lenMax: 280, weightK: 0.017, biteWindowS: 0.9, fakeMax: 0, bite: 'slam', reelTurns: 45, runEveryS: 3, runS: 2.2, trophyCm: 230, trophyLabel: '초대형 참치!', blurb: '시속 70km로 헤엄치는 바다의 로켓' },
  { id: 'sunfish', name: '개복치', loc: 'sea', tier: 'rare', lenMin: 100, lenMax: 250, weightK: 0.03, biteWindowS: 3, fakeMax: 2, bite: 'sink', reelTurns: 60, runEveryS: 6, runS: 1, trophyCm: 200, trophyLabel: '초대형!', blurb: '몸 뒤쪽이 잘린 듯한 거대한 원반. 의외로 온순하다' },
  { id: 'hammerhead', behavior: 'dive', name: '귀상어', loc: 'sea', tier: 'rare', lenMin: 150, lenMax: 400, weightK: W.shark, biteWindowS: 1.2, fakeMax: 1, bite: 'drag', reelTurns: 46, runEveryS: 3, runS: 2.2, trophyCm: 350, trophyLabel: '괴물 귀상어!', blurb: '망치 같은 머리 양 끝에 눈이 달린 상어' },
  { id: 'marlin', behavior: 'jump', name: '청새치', loc: 'sea', tier: 'legend', lenMin: 200, lenMax: 420, weightK: 0.0075, biteWindowS: 0.8, fakeMax: 1, bite: 'slam', reelTurns: 62, runEveryS: 3, runS: 2.2, trophyCm: 380, trophyLabel: '전설의 청새치!', blurb: '창 같은 주둥이로 수면 위를 날아오르는 노인과 바다의 그 물고기' },
  { id: 'great_white', behavior: 'dive', name: '백상아리', loc: 'sea', tier: 'legend', lenMin: 300, lenMax: 600, weightK: W.shark, biteWindowS: 1, fakeMax: 1, bite: 'slam', reelTurns: 58, runEveryS: 3, runS: 2.2, trophyCm: 500, trophyLabel: '죠스!!', blurb: '바다 최강의 포식자. 이빨이 300개가 넘는다' },

  // ---------------------------------------------------------------- 심해 (deep drop from a boat)
  { id: 'alfonsino', name: '금눈돔', loc: 'deep', tier: 'common', lenMin: 25, lenMax: 55, weightK: 0.017, biteWindowS: 1.5, fakeMax: 2, bite: 'tap', reelTurns: 28, runEveryS: 5, runS: 1, trophyCm: 50, trophyLabel: '대물!', blurb: '수심 300m의 새빨간 물고기. 황금빛 큰 눈' },
  { id: 'isopod', name: '대왕구족', loc: 'deep', tier: 'uncommon', lenMin: 20, lenMax: 45, weightK: 0.03, biteWindowS: 2.5, fakeMax: 3, bite: 'tap', reelTurns: 40, runEveryS: 8, runS: 0.8, trophyCm: 40, trophyLabel: '초대형!', blurb: '쥐며느리의 심해 사촌. 몇 년을 굶어도 산다' },
  { id: 'blobfish', name: '블롭피시', loc: 'deep', tier: 'uncommon', lenMin: 20, lenMax: 32, weightK: 0.03, biteWindowS: 2.5, fakeMax: 1, bite: 'tap', reelTurns: 35, runEveryS: 9, runS: 0.6, trophyCm: 30, trophyLabel: '세상에서 제일 못생긴!', blurb: '물 밖에 나오면 녹아내린 듯한 얼굴이 된다' },
  { id: 'oarfish', behavior: 'dive', name: '산갈치', loc: 'deep', tier: 'rare', lenMin: 300, lenMax: 800, weightK: W.ribbon, biteWindowS: 2, fakeMax: 1, bite: 'tap', reelTurns: 55, runEveryS: 4, runS: 2.2, trophyCm: 700, trophyLabel: '용이다!', blurb: '빨간 볏이 달린 은빛 리본. 용 전설의 주인공' },
  { id: 'anglerfish', name: '심해아귀', loc: 'deep', tier: 'rare', lenMin: 20, lenMax: 70, weightK: 0.035, biteWindowS: 1.8, fakeMax: 2, bite: 'tap', reelTurns: 60, runEveryS: 5, runS: 1.5, trophyCm: 60, trophyLabel: '괴물 아귀!', blurb: '이마의 발광 미끼로 먹이를 꾀는 어둠 속 사냥꾼' },
  { id: 'goblin_shark', behavior: 'dive', name: '귀신고기', loc: 'deep', tier: 'legend', lenMin: 250, lenMax: 400, weightK: W.shark, biteWindowS: 1.2, fakeMax: 1, bite: 'tap', reelTurns: 55, runEveryS: 3, runS: 2.2, trophyCm: 350, trophyLabel: '살아 있는 화석!', blurb: '턱이 튀어나오는 분홍빛 심해 상어' },
  { id: 'barreleye', name: '투명머리 물고기', loc: 'deep', tier: 'legend', lenMin: 10, lenMax: 16, weightK: 0.015, biteWindowS: 1.5, fakeMax: 2, bite: 'tap', reelTurns: 45, runEveryS: 6, runS: 1, trophyCm: 15, trophyLabel: '투명한 머리!', blurb: '투명한 머리 안으로 초록 눈이 위를 올려다본다' },

  // ---------------------------------------------------------------- 아프리카 강 (African river)
  { id: 'tilapia', name: '틸라피아', loc: 'river', tier: 'common', lenMin: 15, lenMax: 45, weightK: 0.022, biteWindowS: 1.2, fakeMax: 2, bite: 'sink', reelTurns: 20, runEveryS: 5, runS: 1, trophyCm: 40, trophyLabel: '대물!', blurb: '나일 강의 흔한 손님' },
  { id: 'elephantfish', name: '코끼리주둥이고기', loc: 'river', tier: 'uncommon', lenMin: 15, lenMax: 40, weightK: 0.01, biteWindowS: 1.5, fakeMax: 2, bite: 'rise', reelTurns: 22, runEveryS: 6, runS: 0.8, trophyCm: 35, trophyLabel: '대물!', blurb: '코끼리 코 같은 주둥이로 약한 전기를 쏜다' },
  { id: 'vundu', behavior: 'dig', name: '분두 메기', loc: 'river', tier: 'uncommon', lenMin: 50, lenMax: 150, weightK: W.slim, biteWindowS: 2.5, fakeMax: 1, bite: 'sink', reelTurns: 40, runEveryS: 3.5, runS: 2.2, trophyCm: 120, trophyLabel: '대물!', blurb: '아프리카 최대의 메기 중 하나' },
  { id: 'electric_catfish', behavior: 'shock', name: '전기메기', loc: 'river', tier: 'rare', lenMin: 30, lenMax: 100, weightK: 0.015, biteWindowS: 2, fakeMax: 1, bite: 'sink', reelTurns: 45, runEveryS: 4, runS: 1.5, trophyCm: 80, trophyLabel: '찌릿!', blurb: '350볼트 전기를 내뿜는 통통한 메기' },
  { id: 'tigerfish', behavior: 'jump', name: '골리앗 타이거피시', loc: 'river', tier: 'rare', lenMin: 50, lenMax: 150, weightK: 0.012, biteWindowS: 0.8, fakeMax: 0, bite: 'slam', reelTurns: 50, runEveryS: 3, runS: 2.2, trophyCm: 120, trophyLabel: '괴물 이빨!', blurb: '상어 같은 이빨 32개. 아프리카 최강의 민물 포식자' },
  { id: 'nile_perch', behavior: 'jump', name: '나일퍼치', loc: 'river', tier: 'legend', lenMin: 100, lenMax: 200, weightK: 0.013, biteWindowS: 1.2, fakeMax: 1, bite: 'drag', reelTurns: 62, runEveryS: 3, runS: 2.2, trophyCm: 180, trophyLabel: '전설의 대물!', blurb: '사람보다 큰 나일 강의 왕' },
];

export const SPECIES_BY_ID: Record<string, SpeciesDef> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

// ---------------------------------------------------------------- places

/** Rare interference events (user: animals only rarely and realistically, not catchable). */
export type EventKind = 'otter' | 'orca' | 'crocodile' | 'hippo';
export const EVENT_NAME: Record<EventKind, string> = { otter: '수달', orca: '범고래', crocodile: '나일악어', hippo: '하마' };

export interface LocationDef {
  id: LocationId;
  name: string;
  sub: string;
  /** thieves try to take the hooked fish during reeling; spookers surface while you wait */
  thief?: EventKind;
  spooker?: EventKind;
  /** no float here — the bite shows on the rod tip */
  noFloat?: boolean;
}

export const LOCATIONS: readonly LocationDef[] = [
  { id: 'reservoir', name: '저수지', sub: '잔잔한 좌대에서 붕어·잉어부터 황쏘가리까지', thief: 'otter' },
  { id: 'sea', name: '바다', sub: '갯바위에서 참돔·방어, 운이 좋으면 귀상어와 백상아리', thief: 'orca' },
  { id: 'deep', name: '심해', sub: '배 위에서 300m 아래로 — 아귀·산갈치·귀신고기', noFloat: true },
  { id: 'river', name: '아프리카 강', sub: '타이거피시와 나일퍼치, 그리고 악어와 하마가 사는 곳', thief: 'crocodile', spooker: 'hippo' },
];

export const LOCATION_BY_ID: Record<LocationId, LocationDef> = Object.fromEntries(LOCATIONS.map((l) => [l.id, l])) as Record<LocationId, LocationDef>;

// ---------------------------------------------------------------- baits

export interface BaitDef {
  id: string;
  name: string;
  loc: LocationId;
  feel: string;
  waitMin: number;
  waitMax: number;
  biteChance: number;
  /** multipliers on the tier weight, and on single species */
  tierMul?: Partial<Record<Tier, number>>;
  speciesMul?: Record<string, number>;
  /** > 0 skews toward big fish, < 0 toward small */
  sizeBias: number;
}

export const BAITS: readonly BaitDef[] = [
  // reservoir (the three from M1.5)
  { id: 'worm', name: '지렁이', loc: 'reservoir', feel: '입질이 빨라요', waitMin: 5, waitMax: 10, biteChance: 0.6, speciesMul: { crucian: 1.5, carp: 0.5 }, sizeBias: -0.3 },
  { id: 'paste', name: '떡밥', loc: 'reservoir', feel: '어느 물고기나 고루', waitMin: 10, waitMax: 18, biteChance: 0.4, sizeBias: 0 },
  { id: 'corn', name: '옥수수', loc: 'reservoir', feel: '느리지만 큰 잉어', waitMin: 20, waitMax: 32, biteChance: 0.25, speciesMul: { carp: 3, crucian: 0.4, bass: 0.3 }, tierMul: { rare: 1.3 }, sizeBias: 1 },
  { id: 'lure_fw', name: '루어', loc: 'reservoir', feel: '포식자 전용 — 배스·가물치·쏘가리', waitMin: 8, waitMax: 16, biteChance: 0.4, speciesMul: { bass: 3, snakehead: 2.5, mandarin: 2.5, golden_mandarin: 2, crucian: 0, carp: 0 }, sizeBias: 0.3 },
  // sea
  { id: 'krill', name: '크릴', loc: 'sea', feel: '입질이 빨라요 — 우럭·참돔', waitMin: 5, waitMax: 11, biteChance: 0.6, tierMul: { rare: 0.4, legend: 0.3 }, sizeBias: -0.3 },
  { id: 'squid', name: '오징어 통채', loc: 'sea', feel: '큰 물고기가 좋아해요', waitMin: 14, waitMax: 26, biteChance: 0.35, tierMul: { uncommon: 1.5, rare: 2, legend: 2 }, sizeBias: 0.8 },
  { id: 'jig', name: '메탈지그', loc: 'sea', feel: '빠른 회유어 — 방어·참치·청새치', waitMin: 10, waitMax: 20, biteChance: 0.4, speciesMul: { yellowtail: 3, tuna: 3, marlin: 2.5, seabass: 2, rockfish: 0.3, flounder: 0.3 }, sizeBias: 0.4 },
  // deep
  { id: 'deep_squid', name: '오징어 + 집어등', loc: 'deep', feel: '불빛에 모여들어요', waitMin: 12, waitMax: 22, biteChance: 0.45, sizeBias: 0 },
  { id: 'fish_chunk', name: '생선 토막', loc: 'deep', feel: '냄새로 큰 놈을 불러요', waitMin: 18, waitMax: 32, biteChance: 0.35, tierMul: { rare: 1.8, legend: 1.8 }, sizeBias: 0.8 },
  // river
  { id: 'river_worm', name: '지렁이', loc: 'river', feel: '입질이 빨라요', waitMin: 5, waitMax: 10, biteChance: 0.6, tierMul: { rare: 0.5, legend: 0.3 }, sizeBias: -0.3 },
  { id: 'live_bait', name: '살아 있는 작은 물고기', loc: 'river', feel: '포식자 — 타이거피시·나일퍼치', waitMin: 14, waitMax: 26, biteChance: 0.35, speciesMul: { tigerfish: 3, nile_perch: 3, tilapia: 0.2, elephantfish: 0.2 }, sizeBias: 0.6 },
  { id: 'dough', name: '반죽 미끼', loc: 'river', feel: '메기류가 좋아해요', waitMin: 10, waitMax: 18, biteChance: 0.45, speciesMul: { vundu: 3, electric_catfish: 3 }, sizeBias: 0.2 },
];

export const BAIT_BY_ID: Record<string, BaitDef> = Object.fromEntries(BAITS.map((b) => [b.id, b]));
export const baitsAt = (loc: LocationId) => BAITS.filter((b) => b.loc === loc);
export const speciesAt = (loc: LocationId) => SPECIES.filter((s) => s.loc === loc);

export const TIER_NAME: Record<Tier, string> = { common: '흔함', uncommon: '보통', rare: '희귀', legend: '전설' };
