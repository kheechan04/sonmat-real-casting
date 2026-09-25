// M1 game page: camera → gestures → game → 3D scene + HUD.
// Pose pipeline: poseSource.ts. Gesture rules: core/gestures.ts. Game rules: core/game.ts.
// Every number is a placeholder in core/params.ts, adjustable from the ⚙ panel.

import { FishingGame, MISS_TEXT, type GameEvent } from '../core/game';
import { GestureTracker, type GestureEvent } from '../core/gestures';
import { BAIT_NAME, BAITS, baitKey, SPECIES_NAME, type Bait } from '../core/params';
import { ARM, LM, other, type PoseFrame, type Side } from '../core/pose';
import { serializeRecording, type RecordedFrame, type Recording } from '../core/recording';
import './game.css';
import { drawOverlay } from './overlay';
import { listCameras, PoseSource } from './poseSource';
import { FishingScene } from './scene';
import { store } from './store';
import { buildTuningPanel, loadParams } from './tuning';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on);

const params = loadParams();
const tracker = new GestureTracker(() => params);
const game = new FishingGame(() => params);
const scene = new FishingScene($<HTMLCanvasElement>('world'));
const source = new PoseSource();
const pip = $<HTMLCanvasElement>('pipCanvas');
const pipCtx = pip.getContext('2d')!;

let rodHand: Side = store.get('rodHand') === 'left' ? 'left' : 'right';
let started = false;
let lastFrame: PoseFrame | null = null;
const trail: PoseFrame[] = [];
scene.setRodHand(rodHand);

// ---------------------------------------------------------------- banner / setup

function showBanner(text: string, ok = false): void {
  const b = $('banner');
  b.textContent = text;
  b.classList.toggle('ok', ok);
  b.classList.toggle('hidden', !text);
}
source.onStatus = showBanner;

const rodSel = $<HTMLSelectElement>('rodHand');
rodSel.value = rodHand;
rodSel.addEventListener('change', () => {
  rodHand = rodSel.value as Side;
  store.set('rodHand', rodHand);
  scene.setRodHand(rodHand);
  tracker.reset();
});

async function fillCameras(): Promise<void> {
  const sel = $<HTMLSelectElement>('camera');
  const current = sel.value || store.get('camera') || '';
  const devices = await listCameras();
  sel.textContent = '';
  sel.append(new Option('기본 카메라', ''));
  devices.forEach((d, i) => sel.append(new Option(d.label || `카메라 ${i + 1}`, d.deviceId)));
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

async function start(withCamera: boolean): Promise<void> {
  if (withCamera) {
    try {
      await source.start({ deviceId: $<HTMLSelectElement>('camera').value, width: 640, height: 480, model: 'lite', useGpu: false });
    } catch (e) {
      showBanner(e instanceof Error ? e.message : String(e));
      void fillCameras();
      return;
    }
    store.set('camera', $<HTMLSelectElement>('camera').value);
    void fillCameras();
    pip.width = source.video.videoWidth;
    pip.height = source.video.videoHeight;
    show('pip', true);
  }
  started = true;
  show('startBox', false);
  game.again(performance.now());
}

$('start').addEventListener('click', () => void start(true));
$('noCam').addEventListener('click', () => void start(false));

// ---------------------------------------------------------------- frames → gestures → game

/** One round, bait choice → result, kept so a bad round can be saved and analyzed. */
interface Round {
  frames: RecordedFrame[];
  events: { t: number; e: string }[];
  note: string;
}
let round: Round | null = null;
let lastRound: Round | null = null;

const gestLog: { t: number; text: string }[] = [];
function logGesture(text: string, now: number): void {
  gestLog.push({ t: now, text });
  while (gestLog.length > 4) gestLog.shift();
}

function onGesture(ev: GestureEvent, now: number): void {
  if (ev.type === 'cast') logGesture(`던지기 인식 (세기 ${Math.round(ev.strength * 100)}%)`, now);
  else if (ev.type === 'hookset') logGesture('챔질 인식', now);
  else if (game.phase === 'reeling') logGesture(`감기 ${ev.rate.toFixed(1)}회/초`, now);
  round?.events.push({ t: now, e: `gesture:${ev.type}` });
  game.onGesture(ev, now);
}

source.onFrame = (f) => {
  lastFrame = f;
  trail.push(f);
  while (trail.length && trail[0].t < f.t - 1200) trail.shift();
  if (round) round.frames.push(f);
  for (const ev of tracker.update(f, rodHand, source.aspect)) onGesture(ev, f.t);
};

// keyboard stand-ins for testing without moving (dev server, or ?keys)
const keysOn = import.meta.env.DEV || new URLSearchParams(location.search).has('keys');
show('keysHelp', keysOn);
if (keysOn) {
  document.addEventListener('keydown', (e) => {
    if (!started || e.target instanceof HTMLInputElement) return;
    const now = performance.now();
    const k = e.key.toLowerCase();
    if (k === 'c') onGesture({ type: 'cast', t: now, strength: 0.6, peakSpeed: 9 }, now);
    else if (k === 'h') onGesture({ type: 'hookset', t: now, peakSpeed: 6, rise: 0.8 }, now);
    else if (k === 'r') onGesture({ type: 'reel', t: now, rate: 3 }, now);
  });
}

// ---------------------------------------------------------------- UI

function fillBaits(): void {
  const box = $('baits');
  box.textContent = '';
  const feel: Record<Bait, string> = { rubber: '여유롭게 오래', normal: '보통', worm: '잘 잡혀요' };
  for (const b of BAITS) {
    const btn = document.createElement('button');
    btn.className = 'baitCard';
    const wait = `${params[baitKey(b, 'waitMin')]}~${params[baitKey(b, 'waitMax')]}초`;
    btn.innerHTML = `<b>${BAIT_NAME[b]}</b><span>${feel[b]}</span><span>대기 ${wait} · 입질 ${Math.round(params[baitKey(b, 'biteChance')] * 100)}%</span>`;
    btn.addEventListener('click', () => {
      round = { frames: [], events: [], note: '' };
      game.chooseBait(b, performance.now());
    });
    box.append(btn);
  }
}

$('again').addEventListener('click', () => game.again(performance.now()));

function onGameEvent(e: GameEvent, now: number): void {
  round?.events.push({ t: now, e: e.type === 'phase' ? `phase:${e.phase}` : e.type });
  if (e.type === 'phase') {
    show('baitBox', e.phase === 'bait');
    show('resultBox', e.phase === 'caught' || e.phase === 'missed');
    show('reelBox', e.phase === 'reeling');
    if (e.phase === 'bait') fillBaits();
    if ((e.phase === 'caught' || e.phase === 'missed') && round) {
      const fish = game.fish ? SPECIES_NAME[game.fish.species] : '';
      round.note = `게임: ${BAIT_NAME[game.bait]}, ${fish} ${e.phase === 'caught' ? '잡음' : `놓침(${game.missReason})`}`.trim();
      lastRound = round;
      round = null;
    }
  } else if (e.type === 'caught') {
    const f = e.fish;
    $('resTitle').className = 'good';
    $('resTitle').textContent = `${SPECIES_NAME[f.species]}를 낚았어요!`;
    const kg = f.weightG >= 1000 ? `${(f.weightG / 1000).toFixed(2)}kg` : `${f.weightG}g`;
    $('resBody').textContent = `길이 ${f.lengthCm}cm · 무게 ${kg} · 릴링 ${f.turnsNeeded}회`;
  } else if (e.type === 'missed') {
    $('resTitle').className = 'bad';
    $('resTitle').textContent = '놓쳤어요';
    $('resBody').textContent = `${MISS_TEXT[e.reason]} · 미끼만 사라졌어요`;
  } else if (e.type === 'ignored') {
    logGesture(e.why, now);
  }
}

function instruction(): { msg: string; sub: string; alert?: boolean } {
  switch (game.phase) {
    case 'bait':
      return { msg: '', sub: '' };
    case 'ready':
      return { msg: '던지세요!', sub: '대 든 손을 머리 뒤로 젖혔다가 앞으로 휘둘러요' };
    case 'flight':
      return { msg: '휙—', sub: `${Math.round(game.distanceM)}m` };
    case 'waiting':
      return { msg: '기다리는 중…', sub: `${BAIT_NAME[game.bait]} · 찌를 지켜보세요` };
    case 'nibble':
      return game.nibbling
        ? { msg: '톡톡…', sub: '아직! 찌가 쑥 들어갈 때 채요' }
        : { msg: '뭔가 건드려요…', sub: '찌를 지켜보세요' };
    case 'bite':
      return { msg: '지금! 채요!', sub: '손을 빠르게 위로 "툭"', alert: true };
    case 'reeling':
      return game.pulling
        ? { msg: '버텨요!', sub: '당길 땐 감지 말고 잠깐 멈춰요', alert: true }
        : { msg: '감아요!', sub: '릴 손으로 작은 원을 계속 돌려요' };
    default:
      return { msg: '', sub: '' };
  }
}

function postureWarning(): string {
  if (!source.running) return '';
  const f = lastFrame;
  if (!f?.lm || performance.now() - f.t > 1000) return '사람이 안 보여요 — 카메라 앞에 서 주세요';
  const lm = f.lm;
  const hipVis = (lm[LM.HIP_L][3] + lm[LM.HIP_R][3]) / 2;
  if (hipVis < params.minVis) return '허리까지 화면에 들어오게 조금 뒤로 서 주세요';
  if (game.phase === 'reeling' && lm[ARM[other(rodHand)].wrist][3] < params.minVis) return '릴 손이 안 보여요';
  if ((game.phase === 'ready' || game.phase === 'bite') && lm[ARM[rodHand].wrist][3] < params.minVis) return '대 든 손이 안 보여요';
  return '';
}

function updateHud(now: number): void {
  const ins = instruction();
  $('msg').textContent = ins.msg;
  $('msg').classList.toggle('alert', !!ins.alert);
  $('sub').textContent = ins.sub;
  const biteOn = game.phase === 'bite' && game.fish;
  show('biteBar', !!biteOn);
  if (biteOn) {
    const total = params[`fish.${game.fish!.species}.biteWindowS` as const];
    ($('biteBar').firstElementChild as HTMLElement).style.width = `${(100 * game.biteLeftS(now)) / total}%`;
  }
  if (game.phase === 'reeling' && game.fish) {
    const need = game.fish.turnsNeeded;
    ($('progBar').firstElementChild as HTMLElement).style.width = `${(100 * game.progress) / need}%`;
    $('progText').textContent = `${game.progress} / ${need}`;
    ($('tenBar').firstElementChild as HTMLElement).style.width = `${Math.min(100, game.tension * 100)}%`;
    $('rateText').textContent = `${tracker.state(now).reelRate.toFixed(1)}회/초`;
    show('pullWarn', game.pulling);
  }
  const warn = postureWarning();
  $('pipWarn').textContent = warn;
  show('pipWarn', !!warn);
  $('gestLog').innerHTML = gestLog
    .filter((g) => now - g.t < 4000)
    .map((g) => `<div>${g.text}</div>`)
    .join('');
  if (!$('tunePanel').classList.contains('hidden')) {
    $('stat').textContent = source.running ? `${source.fps.toFixed(0)}fps · ${source.inferMs.toFixed(0)}ms · ${source.describe()}` : '카메라 꺼짐';
  }
}

function drawPip(): void {
  if (!source.running) return;
  drawOverlay(pipCtx, lastFrame, {
    mirror: $<HTMLInputElement>('mirror').checked,
    video: source.video,
    minVisibility: params.minVis,
    rodHand,
    trail,
  });
}

// ---------------------------------------------------------------- dev panel

$('tuneBtn').addEventListener('click', () => $('tunePanel').classList.toggle('hidden'));
buildTuningPanel($('tuneBody'), params, () => {
  if (game.phase === 'bait') fillBaits();
});

/** The last round (bait → result) as a normal recording plus the game/gesture event list. */
$('saveRound').addEventListener('click', () => {
  if (!lastRound || !lastRound.frames.length) {
    showBanner('저장할 판이 없어요 (카메라로 한 판을 끝까지 해야 해요)', true);
    setTimeout(() => showBanner(''), 3000);
    return;
  }
  const rec: Recording = {
    meta: {
      version: 1,
      createdAt: new Date().toISOString(),
      note: lastRound.note,
      aspect: source.aspect,
      videoWidth: source.video.videoWidth,
      videoHeight: source.video.videoHeight,
      model: source.model,
      delegate: source.delegate ?? '',
      rodHand,
      mirrorView: $<HTMLInputElement>('mirror').checked,
      ...(source.cameraFps !== undefined ? { cameraFps: source.cameraFps } : {}),
    },
    frames: lastRound.frames,
  };
  const out = JSON.parse(serializeRecording(rec)) as Record<string, unknown>;
  const t0 = lastRound.frames[0].t;
  out.game = { events: lastRound.events.map((x) => ({ t: Math.round(x.t - t0), e: x.e })), params };
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: 'application/json' }));
  a.download = `rec-game-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

// ---------------------------------------------------------------- loop

function loop(): void {
  const now = performance.now();
  if (started) {
    game.update(now);
    for (const e of game.drain()) onGameEvent(e, now);
  }
  scene.render(game, now);
  updateHud(now);
  drawPip();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => scene.resize());
void fillCameras();
show('baitBox', false);
requestAnimationFrame(loop);

if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { game, params, tracker, start, source };
}
