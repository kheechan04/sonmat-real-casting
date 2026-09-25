// M0 recording report: npm run analyze [-- files...] (default: every recordings/*.json).
// Reads the checklist note (src/core/protocol.ts) to know what each file should show, and prints
// the measurements that answer DESIGN.md §0's open questions (axes, left/right labels, fps) plus
// raw casting / hook-set / reeling numbers for M1.
//   --mirror      also analyze each file mirrored left↔right (other rod hand)
//   --rod=left    rod hand for files without meta.rodHand (e.g. Shadow Mitts recordings)

import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  findSwings,
  handActivity,
  reachDirection,
  imageTrack,
  oscillations,
  reelCircles,
  timing,
  worldImageAgreement,
  worldTrack,
  type V3,
} from '../src/core/analysis';
import { mirrorRecording } from '../src/core/mirror';
import { ARM, other, type Side } from '../src/core/pose';
import { matchNote } from '../src/core/protocol';
import { parseRecording, type Recording } from '../src/core/recording';

const args = process.argv.slice(2);
const withMirror = args.includes('--mirror');
const rodArg = args.find((a) => a.startsWith('--rod='))?.slice(6);
const defaultRod: Side = rodArg === 'left' ? 'left' : 'right';
let files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  const dir = 'recordings';
  files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => join(dir, f));
}
if (!files.length) {
  console.log('recordings/ 에 녹화 파일이 없어요.');
  process.exit(0);
}

const f2 = (v: number) => (Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(2) : '  -  ');
const vec = (v: V3) => `(${f2(v[0])}, ${f2(v[1])}, ${f2(v[2])})`;
const hand = (s: Side) => (s === 'left' ? '왼손' : '오른손');
const AXIS = ['x', 'y', 'z'];

/** The axis a unit vector mostly points along, e.g. "−x". */
function mainAxis(v: V3): string {
  let k = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(v[i]) > Math.abs(v[k])) k = i;
  return `${v[k] >= 0 ? '+' : '−'}${AXIS[k]} (${Math.abs(v[k]).toFixed(2)})`;
}

function report(rec: Recording, name: string): void {
  const item = matchNote(rec.meta.note);
  const rod: Side = rec.meta.rodHand ?? defaultRod;
  const reel = other(rod);
  const tm = timing(rec);
  console.log(`\n━━ ${name}`);
  console.log(`   메모: "${rec.meta.note}"  →  ${item ? `체크리스트 ${item.id}` : '체크리스트 밖 (일반 요약만)'}`);
  console.log(
    `   ${rec.meta.videoWidth}×${rec.meta.videoHeight} · ${rec.meta.model}/${rec.meta.delegate} · 대: ${hand(rod)} · ` +
      `${tm.durationS.toFixed(1)}초 ${tm.frames}프레임 · 인식 ${(tm.detected * 100).toFixed(0)}% · ` +
      `${tm.fps.toFixed(1)}fps (간격 중앙값 ${tm.intervalMedianMs.toFixed(0)}ms, 90% ${tm.intervalP90Ms.toFixed(0)}ms)` +
      (Number.isFinite(tm.inferMedianMs) ? ` · 추론 ${tm.inferMedianMs.toFixed(0)}ms` : ''),
  );
  const act = handActivity(rec);
  console.log(
    `   움직인 손(월드 이동거리): 왼손 ${act.path.left.toFixed(2)}m / 오른손 ${act.path.right.toFixed(2)}m → ${hand(act.dominant)}이 ${act.ratio.toFixed(1)}배`,
  );

  const check = item?.check;
  if (check === 'axis-side' || check === 'axis-up' || check === 'axis-forward' || check === 'label') {
    const side = check === 'label' ? reel : rod;
    const expect = { 'axis-side': '몸 바깥 옆', 'axis-up': '위', 'axis-forward': '카메라 쪽', label: '위' }[check];
    const ok = act.dominant === side;
    console.log(`   [라벨] 메모상 움직인 손 = ${hand(side)}, 데이터상 = ${hand(act.dominant)} → ${ok ? '일치' : '불일치!'}`);
    // hips at the frame edge make a hanging wrist read ~0.35 visibility (A1) — retry lower
    let d = reachDirection(rec, side);
    const lowVis = !d;
    if (!d) d = reachDirection(rec, side, 0.2);
    if (d) {
      console.log(
        `   [축] "${expect}"으로 뻗었을 때 손목(어깨 기준) 이동 방향, 평균 ${d.reachM.toFixed(2)}m${lowVis ? ' (손목 신뢰도 낮은 프레임 포함)' : ''}`,
      );
      console.log(`        월드  ${vec(d.world)}  → 주축 ${mainAxis(d.world)}`);
      console.log(`        이미지 ${vec(d.image)}  → 주축 ${mainAxis(d.image)}`);
    }
    const ag = worldImageAgreement(rec, ARM[side].wrist, ARM[side].shoulder);
    console.log(`   [월드↔이미지 상관] x ${f2(ag[0])}  y ${f2(ag[1])}  z ${f2(ag[2])}  (+1 = 같은 방향)`);
  }

  if (check === 'cast' || check === 'hookset' || check === 'cycle' || check === 'fidget' || !item) {
    // Small snaps must not hide under big ones (C3) or under the default floor 4: hook-set and
    // fidget recordings use floor 2 (still hands peaked at 0.6 in E1) and 20% of the top speed.
    const lenient = check === 'hookset' || check === 'fidget';
    const sw = lenient ? findSwings(rec, rod, 0.2, 700, 2) : findSwings(rec, rod);
    const down = sw.filter((x) => x.dImage[1] > 0).length;
    console.log(`   [빠른 동작 · ${hand(rod)}] ${sw.length}개 — 아래로 ${down} · 위로 ${sw.length - down} (메모 기대값과 비교)`);
    if (sw.length) {
      console.log('        시각(s)  최고속도   Δ월드 (x, y, z) m          Δ이미지 (x, y, z) 몸통길이   팔꿈치 각도');
      for (const s of sw) {
        console.log(
          `     ${s.dImage[1] > 0 ? '↓' : '↑'}  ${(s.t / 1000).toFixed(2).padStart(6)}${s.peakSpeed.toFixed(1).padStart(6)}   ${vec(s.dWorld)}   ${vec(s.dImage)}   ${s.elbowFrom.toFixed(0)}°→${s.elbowTo.toFixed(0)}°`,
        );
      }
      // sign consistency per axis
      const cons = [0, 1, 2].map((k) => {
        const pos = sw.filter((s) => s.dWorld[k] > 0).length;
        return `${AXIS[k]} ${Math.max(pos, sw.length - pos)}/${sw.length}${pos >= sw.length - pos ? '+' : '−'}`;
      });
      const consI = [0, 1, 2].map((k) => {
        const pos = sw.filter((s) => s.dImage[k] > 0).length;
        return `${AXIS[k]} ${Math.max(pos, sw.length - pos)}/${sw.length}${pos >= sw.length - pos ? '+' : '−'}`;
      });
      console.log(`        방향 일관성  월드: ${cons.join('  ')}   이미지: ${consI.join('  ')}`);
    }
  }

  if (check === 'reel' || check === 'cycle' || check === 'idle' || !item) {
    const label = { 'world-xy': '월드 정면 x–y', 'world-yz': '월드 옆 z–y', 'world-xz': '월드 위 x–z', 'image-xy': '화면 x–y' };
    console.log(`   [원 그리기 · ${hand(reel)}] 둥글기(1=원) / 누적 회전 / 반지름`);
    for (const c of reelCircles(rec, reel)) {
      console.log(`        ${label[c.plane].padEnd(10)}  ${c.roundness.toFixed(2)}  ${f2(c.turns)}바퀴  ${c.radius.toFixed(3)}`);
    }
    // amplitudes: still hands wobble ~0.005 m / 0.011 torso (RMS, E1); reeling 0.04 m / 0.086 (D1)
    const w = worldTrack(rec, ARM[reel].wrist, ARM[reel].shoulder);
    const im = imageTrack(rec, ARM[reel].wrist, ARM[reel].shoulder);
    const oy = oscillations(w, 1, 0.015);
    const oi = oscillations(im, 1, 0.03);
    const perSec = tm.durationS > 0 ? (oy / tm.durationS).toFixed(1) : '-';
    console.log(`   [위아래 흔들림 횟수 · ${hand(reel)}] 월드 y ${oy}회 · 화면 y ${oi}회 (${perSec}회/초)`);
  }
}

for (const file of files) {
  let rec: Recording;
  try {
    rec = parseRecording(readFileSync(file, 'utf8'));
  } catch (e) {
    console.log(`\n━━ ${basename(file)}: 읽기 실패 — ${e instanceof Error ? e.message : String(e)}`);
    continue;
  }
  report(rec, basename(file));
  if (withMirror) report(mirrorRecording(rec), `${basename(file)} (좌우 반전)`);
}
