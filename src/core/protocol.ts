// M0 recording checklist. Shared by the observer UI (preset dropdown) and scripts/analyze.ts
// (which reads the note back to know what each file should contain). recordings/README.md
// explains each item for the person recording.

import type { Side } from './pose';

export type Check =
  | 'axis-side' | 'axis-up' | 'axis-forward' | 'label' | 'cast' | 'hookset' | 'reel' | 'idle' | 'cycle' | 'fidget'
  | 'aim' | 'pump' | 'tilt';

export interface ProtocolItem {
  id: string;
  check: Check;
  /** Note template: {rod} / {reel} → "오른손" / "왼손". */
  note: string;
  /** Auto-stop after this many seconds (0 = stop by hand). */
  seconds: number;
  /** One-line instruction shown under the dropdown. */
  how: string;
  /** Which hand the check is about. */
  hand: 'rod' | 'reel' | 'both';
}

export const PROTOCOL: readonly ProtocolItem[] = [
  { id: 'A1', check: 'axis-side', hand: 'rod', seconds: 12, note: '축 확인: {rod} 옆으로 뻗기 3회',
    how: '정면을 보고 서서, 팔을 내린 자세로 시작 → 팔을 몸 바깥쪽 옆으로 쭉 뻗었다 내리기 3번' },
  { id: 'A2', check: 'axis-up', hand: 'rod', seconds: 12, note: '축 확인: {rod} 위로 뻗기 3회',
    how: '팔을 내린 자세로 시작 → 팔을 머리 위로 쭉 뻗었다 내리기 3번' },
  { id: 'A3', check: 'axis-forward', hand: 'rod', seconds: 12, note: '축 확인: {rod} 카메라 쪽으로 뻗기 3회',
    how: '팔을 내린 자세로 시작 → 팔을 카메라를 향해 앞으로 쭉 뻗었다 내리기 3번 (천천히)' },
  { id: 'A4', check: 'label', hand: 'reel', seconds: 10, note: '라벨 확인: {reel}만 위로 3회',
    how: '반대 손(릴 손)만 머리 위로 3번. 화면의 L/R 글자가 실제 손과 맞는지 눈으로도 확인' },
  { id: 'B1', check: 'cast', hand: 'rod', seconds: 30, note: '{rod} 대, 오버헤드 캐스팅 10회 (정면)',
    how: '카메라를 보고 서서, 대를 머리 뒤로 젖혔다가 앞으로 휘두르기 10번 (한 번 던질 때마다 1~2초 쉬기)' },
  { id: 'B2', check: 'cast', hand: 'rod', seconds: 20, note: '{rod} 대, 오버헤드 캐스팅 5회 (옆으로 서기)',
    how: '카메라에 몸 옆면이 보이게 90° 돌아서서 같은 캐스팅 5번 — 앞뒤 움직임이 화면 좌우로 보이는지 비교용' },
  { id: 'B3', check: 'cast', hand: 'rod', seconds: 30, note: '{rod} 대, 사이드 캐스팅 10회 (정면)',
    how: '대를 옆으로 눕혀 허리 높이에서 앞쪽으로 휘두르기 10번 (오버헤드가 불편한 사람용 대안 동작)' },
  { id: 'C1', check: 'hookset', hand: 'rod', seconds: 30, note: '{rod} 대, 챔질 10회',
    how: '(큰 챔질) 대를 앞으로 낮게 든 자세에서 → 손목을 빠르게 머리 위까지 들어올리기 10번 (사이에 2초 쉬기)' },
  // C1 alone was all big lifts (its old instruction said "머리 높이까지"); real hook-sets are
  // usually a short upward snap, so the threshold must come from C2/C3.
  { id: 'C2', check: 'hookset', hand: 'rod', seconds: 30, note: '{rod} 대, 짧은 챔질 10회 (가슴 높이까지)',
    how: '대를 앞으로 낮게 든 자세에서 → 손목·팔뚝으로 짧고 빠르게 "툭" 채기 10번. 손은 가슴 높이 정도까지만 (사이에 2초 쉬기)' },
  { id: 'C3', check: 'hookset', hand: 'rod', seconds: 40, note: '{rod} 대, 챔질 크기 섞어서 10회',
    how: '실제 낚시하듯 자연스럽게 — 짧게, 중간, 크게를 섞어서 10번 (사이에 2~3초 쉬기)' },
  { id: 'D1', check: 'reel', hand: 'reel', seconds: 20, note: '{reel} 릴, 릴링 20초 (실제 방향: 앞뒤로 도는 원)',
    how: '대 손은 앞으로 들고, 릴 손으로 실제 스피닝 릴처럼 몸 옆에서 앞뒤로 도는 원을 계속 그리기' },
  { id: 'D2', check: 'reel', hand: 'reel', seconds: 20, note: '{reel} 릴, 릴링 20초 (화면에 원 그리기)',
    how: '릴 손으로 카메라를 향해 벽에 원을 그리듯(화면에 원이 보이게) 계속 돌리기' },
  { id: 'D3', check: 'reel', hand: 'reel', seconds: 20, note: '{reel} 릴, 빠르게 릴링 20초 (실제 방향)',
    how: 'D1과 같은 동작을 최대한 빠르게 — 빠를 때 인식이 따라오는지 확인' },
  { id: 'E1', check: 'idle', hand: 'both', seconds: 20, note: '대기 자세 20초 (가만히)',
    how: '대를 든 자세로 가만히 서 있기 — 가만히 있어도 좌표가 얼마나 흔들리는지(잡음) 기준' },
  { id: 'E2', check: 'cycle', hand: 'both', seconds: 60, note: '{rod} 대, 한 사이클 3회 (캐스팅→대기→챔질→릴링)',
    how: '캐스팅 → 5초 대기 → 챔질 → 5초 릴링을 3번 반복 (자유롭게)' },
  { id: 'E3', check: 'fidget', hand: 'both', seconds: 30, note: '입질 대기 중 자연스럽게 움직이기 30초 (챔질 안 함)',
    how: '대를 든 채 기다리는 척 — 자세 고쳐 잡기, 대 끝 살짝 흔들기, 몸 흔들기 등. 챔질은 하지 않기 (잘못 잡히는지 확인용)' },
  // Framed from the navel up (user: "허리까지 나오게 하려면 너무 뒤로 가야 돼"). Same moves as B1 / C2 / D1 / E3,
  // standing closer — compared against those to see whether hips out of frame hurt recognition.
  { id: 'F1', check: 'cast', hand: 'rod', seconds: 30, note: '가까이: {rod} 대, 오버헤드 캐스팅 10회',
    how: '배꼽 위까지만 보이게 가까이 서서 B1과 같은 캐스팅 — 젖혔을 때 손이 화면 위로 나가도 괜찮아요' },
  { id: 'F2', check: 'hookset', hand: 'rod', seconds: 30, note: '가까이: {rod} 대, 짧은 챔질 10회',
    how: '배꼽 위까지만 보이게 서서 C2와 같은 짧은 챔질 ("툭")' },
  { id: 'F3', check: 'reel', hand: 'reel', seconds: 20, note: '가까이: {reel} 릴, 릴링 20초 (보통→빠르게)',
    how: '배꼽 위까지만 보이게 서서 릴링 — 앞 10초는 보통, 뒤 10초는 최대한 빠르게' },
  { id: 'F4', check: 'fidget', hand: 'both', seconds: 30, note: '가까이: 입질 대기 중 자연스럽게 움직이기 30초',
    how: '배꼽 위까지만 보이게 서서 E3처럼 — 자세 고쳐 잡기, 몸 흔들기. 챔질은 하지 않기' },
  // M3 (user: "더 창의적인 게임 진행 방식" → ② 포인트 공략 캐스팅 + ① 펌핑/로드워크). New moves, so they are
  // recorded before any recognition code (rule 1). Close stance like F1–F4. "왼쪽/오른쪽" = the player's own.
  { id: 'G1', check: 'aim', hand: 'rod', seconds: 20, note: '가까이: {rod} 대, 내 왼쪽 겨냥 캐스팅 5회',
    how: '몸은 정면 그대로, 물의 왼쪽 먼 곳을 노린다고 생각하고 대를 왼쪽 앞으로 휘두르기 5번 (사이에 2초 쉬기)' },
  { id: 'G2', check: 'aim', hand: 'rod', seconds: 20, note: '가까이: {rod} 대, 내 오른쪽 겨냥 캐스팅 5회',
    how: '몸은 정면 그대로, 물의 오른쪽 먼 곳을 노린다고 생각하고 대를 오른쪽 앞으로 휘두르기 5번 (사이에 2초 쉬기)' },
  { id: 'G3', check: 'aim', hand: 'rod', seconds: 40, note: '가까이: {rod} 대, 왼쪽→가운데→오른쪽 캐스팅 2바퀴',
    how: '왼쪽, 가운데, 오른쪽 순서로 한 번씩 던지기를 2바퀴 (모두 6번, 사이에 2~3초 쉬기) — 한 파일 안에서 방향이 구분되는지 확인' },
  { id: 'G4', check: 'pump', hand: 'both', seconds: 30, note: '가까이: {rod} 대 펌핑 + {reel} 릴 감기 30초',
    how: '대 손을 가슴 높이에서 얼굴 높이까지 2초 동안 천천히 들어 올린 뒤, 빠르게 내리면서 반대 손으로 감기 — 이걸 계속 반복 (약 8번)' },
  { id: 'G5', check: 'tilt', hand: 'both', seconds: 30, note: '가까이: {rod} 대 좌우로 눕히기 30초 (감으면서)',
    how: '반대 손으로 계속 감으면서, 대 손을 내 왼쪽으로 크게 눕혀 3초 → 가운데 → 오른쪽으로 3초 → 가운데를 반복' },
  // G5 (wrist tilt) moved the wrist only ±0.15 torso — same as fidgeting (E3). User chose a whole-arm move instead.
  { id: 'G6', check: 'tilt', hand: 'both', seconds: 30, note: '가까이: {rod} 대 팔째로 옆으로 옮기기 30초 (감으면서)',
    how: '반대 손으로 계속 감으면서, 대 든 팔 전체를 내 왼쪽 옆으로 크게 옮겨 3초 버티기 → 가운데 → 오른쪽 옆으로 3초 → 가운데를 반복' },
];

export const handName = (s: Side) => (s === 'left' ? '왼손' : '오른손');

export function noteFor(item: ProtocolItem, rodHand: Side): string {
  const reel: Side = rodHand === 'left' ? 'right' : 'left';
  return item.note.replaceAll('{rod}', handName(rodHand)).replaceAll('{reel}', handName(reel));
}

/**
 * Reverse lookup for analysis: which checklist item a note came from. Hand names are ignored
 * (the rod hand is stored in meta.rodHand), so mirrored recordings match too.
 */
export function matchNote(note: string): ProtocolItem | null {
  const bare = (s: string) => s.replace(/ \(mirrored\)$/, '').replace(/왼손|오른손|\{rod\}|\{reel\}/g, '').trim();
  const n = bare(note);
  return PROTOCOL.find((it) => bare(it.note) === n) ?? null;
}
