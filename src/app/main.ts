// Game page: camera → gestures → game → 3D scene + HUD + sound.
// Pose pipeline: poseSource.ts. Gesture rules: core/gestures.ts. Game rules: core/game.ts.
// Every number is a placeholder in core/params.ts, adjustable from the ⚙ panel.

import { FishingGame, MISS_TEXT, type Fish, type GameEvent } from '../core/game';
import { GestureTracker, type GestureEvent } from '../core/gestures';
import { BAIT_NAME, BAITS, baitKey, baitSpeciesKey, fishKey, SPECIES, SPECIES_NAME, type Bait, type Species } from '../core/params';
import { ARM, LM, other, type PoseFrame, type Side } from '../core/pose';
import { serializeRecording, type RecordedFrame, type Recording } from '../core/recording';
import './game.css';
import { drawOverlay } from './overlay';
import { listCameras, PoseSource } from './poseSource';
import { FishingScene } from './scene';
import { Sfx } from './sfx';
import { store } from './store';
import { buildTuningPanel, loadParams } from './tuning';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const show = (id: string, on: boolean) => $(id).classList.toggle('hidden', !on);

const params = loadParams();
const tracker = new GestureTracker(() => params);
const game = new FishingGame(() => params);
const scene = new FishingScene($<HTMLCanvasElement>('world'));
const source = new PoseSource();
const sfx = new Sfx();
const pip = $<HTMLCanvasElement>('pipCanvas');
const pipCtx = pip.getContext('2d')!;

let rodHand: Side = store.get('rodHand') === 'left' ? 'left' : 'right';
let started = false;
let lastFrame: PoseFrame | null = null;
const trail: PoseFrame[] = [];
scene.setRodHand(rodHand);

// ---------------------------------------------------------------- records (this browser only)

interface Records {
  best: Partial<Record<Species, number>>;
  today: { date: string; count: number };
}
function loadRecords(): Records {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const r = JSON.parse(store.get('records.v1') ?? '') as Records;
    if (r.today.date !== today) r.today = { date: today, count: 0 };
    return r;
  } catch {
    return { best: {}, today: { date: today, count: 0 } };
  }
}
const records = loadRecords();
function renderTally(): void {
  const bests = SPECIES.filter((s) => records.best[s]).map((s) => `${SPECIES_NAME[s]} <b>${records.best[s]}cm</b>`);
  $('tally').innerHTML = `오늘 <b>${records.today.count}</b>마리${bests.length ? ` · 최고 ${bests.join(' · ')}` : ''}`;
}

// ---------------------------------------------------------------- banner / setup

function showBanner(text: string, ok = false): void {
  const b = $('banner');
  b.textContent = text;
  b.classList.toggle('ok', ok);
  b.classList.toggle('hidden', !text);
}
source.onStatus = showBanner;
scene.ready.catch((e) => showBanner(`배경을 불러오지 못했어요: ${e instanceof Error ? e.message : String(e)}`));

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
  sfx.start();
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
  show('hud', true);
  show('tally', true);
  renderTally();
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
  while (gestLog.length > 3) gestLog.shift();
}

function onGesture(ev: GestureEvent, now: number): void {
  if (ev.type === 'cast') logGesture(`던지기 ${Math.round(ev.strength * 100)}%`, now);
  else logGesture('챔질', now);
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
let keyReel = false;
show('keysHelp', keysOn);
if (keysOn) {
  document.addEventListener('keydown', (e) => {
    if (!started || e.target instanceof HTMLInputElement) return;
    const now = performance.now();
    const k = e.key.toLowerCase();
    if (k === 'c' && !e.repeat) onGesture({ type: 'cast', t: now, strength: 0.6, peakSpeed: 9 }, now);
    else if (k === 'h' && !e.repeat) onGesture({ type: 'hookset', t: now, peakSpeed: 6, rise: 0.8 }, now);
    else if (k === 'r') keyReel = true;
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'r') keyReel = false;
  });
}

// ---------------------------------------------------------------- bait choice

const BAIT_ICON: Record<Bait, string> = {
  worm: `<svg viewBox="0 0 40 40"><path d="M6 26c4-8 8 4 12-4s8 4 12-4 5 2 5 2" fill="none" stroke="#e58f8f" stroke-width="5" stroke-linecap="round"/></svg>`,
  paste: `<svg viewBox="0 0 40 40"><circle cx="20" cy="21" r="11" fill="#d8c08c"/><circle cx="16" cy="18" r="2" fill="#b89d62"/><circle cx="23" cy="24" r="1.6" fill="#b89d62"/><circle cx="24" cy="16" r="1.3" fill="#b89d62"/></svg>`,
  corn: `<svg viewBox="0 0 40 40"><path d="M20 7c7 0 10 7 9 14s-5 12-9 12-8-5-9-12 2-14 9-14z" fill="#f2c94c"/><path d="M20 10v20M14 14c3 2 9 2 12 0M13 20c4 2 10 2 14 0M14 26c3 2 9 2 12 0" stroke="#d9a927" stroke-width="1.4" fill="none"/></svg>`,
};

function fillBaits(): void {
  const box = $('baits');
  box.textContent = '';
  for (const b of BAITS) {
    const wait = (params[baitKey(b, 'waitMin')] + params[baitKey(b, 'waitMax')]) / 2;
    const speed = Math.max(0.05, Math.min(1, 1 - (wait - 4) / 30));
    const big = Math.max(0.05, Math.min(1, (params[baitKey(b, 'sizeBias')] + 0.9) / 2.2));
    const likes = SPECIES.map((s) => [s, params[baitSpeciesKey(b, s)]] as const)
      .filter(([, v]) => v >= 1.2)
      .map(([s]) => SPECIES_NAME[s]);
    const btn = document.createElement('button');
    btn.className = 'baitCard';
    btn.innerHTML = `
      <div class="baitTop">${BAIT_ICON[b]}<div><b>${BAIT_NAME[b]}</b><span>대기 ${params[baitKey(b, 'waitMin')]}~${params[baitKey(b, 'waitMax')]}초</span></div></div>
      <div class="statRow">입질 속도<div class="track"><div style="width:${speed * 100}%"></div></div></div>
      <div class="statRow">큰 물고기<div class="track"><div style="width:${big * 100}%"></div></div></div>
      <div class="baitNote">${likes.length ? `${likes.join('·')}가 좋아해요` : '어느 물고기나 고루'}</div>`;
    btn.addEventListener('click', () => {
      round = { frames: [], events: [], note: '' };
      game.chooseBait(b, performance.now());
    });
    box.append(btn);
  }
}

// ---------------------------------------------------------------- results

function showCatch(f: Fish): void {
  records.today.count++;
  const prevBest = records.best[f.species] ?? 0;
  const isRecord = f.lengthCm > prevBest;
  if (isRecord) records.best[f.species] = f.lengthCm;
  store.set('records.v1', JSON.stringify(records));
  renderTally();

  // 월척: a crucian of one 척 (30.3 cm) or more — the Korean angler's milestone
  const trophy = f.species === 'crucian' ? f.lengthCm >= 30.3 : f.lengthCm >= 60;
  const badge = trophy ? (f.species === 'crucian' ? '월척!' : '대물!') : isRecord && prevBest > 0 ? '개인 기록!' : '';
  $('resBadge').textContent = badge;
  show('resBadge', !!badge);
  $('resKicker').textContent = '낚았어요';
  $('resTitle').className = '';
  $('resTitle').textContent = SPECIES_NAME[f.species];
  const kg = f.weightG >= 1000 ? `${(f.weightG / 1000).toFixed(2)}<small>kg</small>` : `${f.weightG}<small>g</small>`;
  $('resStats').innerHTML = `<div><b>${f.lengthCm}<small>cm</small></b><span>길이</span></div><div><b>${kg}</b><span>무게</span></div>`;
  show('resStats', true);
  $('resBody').textContent = `${BAIT_NAME[game.bait]}로 ${Math.round(game.distanceM)}m 던져서 잡았어요`;
}

function showMiss(reason: keyof typeof MISS_TEXT): void {
  show('resBadge', false);
  $('resKicker').textContent = '놓쳤어요';
  $('resTitle').className = 'bad';
  $('resTitle').textContent = { early: '너무 일찍 챘어요', late: '입질을 놓쳤어요', snap: '줄이 끊어졌어요', escape: '빠져나갔어요' }[reason];
  show('resStats', false);
  $('resBody').textContent = `${MISS_TEXT[reason].split(' — ')[1] ?? ''} · 미끼만 사라졌어요`;
}

$('again').addEventListener('click', () => game.again(performance.now()));

function onGameEvent(e: GameEvent, now: number): void {
  round?.events.push({ t: now, e: e.type === 'phase' ? `phase:${e.phase}` : e.type });
  switch (e.type) {
    case 'phase':
      show('baitBox', e.phase === 'bait');
      show('resultBox', e.phase === 'caught' || e.phase === 'missed');
      show('reelBox', e.phase === 'reeling');
      if (e.phase !== 'reeling') {
        sfx.setDrag(false);
        $('runFlash').classList.remove('on');
      }
      if (e.phase === 'bait') fillBaits();
      if (e.phase === 'waiting') sfx.plop();
      if ((e.phase === 'caught' || e.phase === 'missed') && round) {
        const fish = game.fish ? SPECIES_NAME[game.fish.species] : '';
        round.note = `게임: ${BAIT_NAME[game.bait]}, ${fish} ${e.phase === 'caught' ? '잡음' : `놓침(${game.missReason})`}`.trim();
        lastRound = round;
        round = null;
      }
      break;
    case 'cast':
      sfx.whoosh();
      break;
    case 'nibble':
      sfx.tick();
      break;
    case 'bite':
      sfx.bite();
      break;
    case 'hooked':
      sfx.hook();
      break;
    case 'runWarn':
      sfx.splash();
      break;
    case 'run':
      sfx.setDrag(e.on);
      $('runFlash').classList.toggle('on', e.on);
      break;
    case 'caught':
      sfx.caught();
      showCatch(e.fish);
      break;
    case 'missed':
      if (e.reason === 'snap') sfx.snap();
      else sfx.miss();
      showMiss(e.reason);
      break;
    case 'ignored':
      logGesture(e.why, now);
      break;
  }
}

// ---------------------------------------------------------------- HUD

function instruction(now: number): { msg: string; sub: string; tone?: 'alert' | 'danger' } {
  switch (game.phase) {
    case 'ready':
      return { msg: '던지세요', sub: '대 든 손을 머리 뒤로 젖혔다가 앞으로 휘둘러요' };
    case 'flight':
      return { msg: '', sub: '' };
    case 'waiting':
      return { msg: '', sub: `${BAIT_NAME[game.bait]} · 찌를 지켜보세요` };
    case 'nibble':
      return game.nibbling ? { msg: '톡톡…', sub: '아직이에요 — 간만 보는 중' } : { msg: '', sub: '뭔가 건드려요… 찌를 지켜보세요' };
    case 'bite':
      return game.fish?.species === 'crucian'
        ? { msg: '찌가 올라와요! 지금!', sub: '손을 빠르게 위로 "툭"', tone: 'alert' }
        : { msg: '쭉 빨려 들어가요! 지금!', sub: '손을 빠르게 위로 "툭"', tone: 'alert' };
    case 'reeling':
      if (game.running) return { msg: '손 멈춰요!', sub: '물고기가 줄을 차고 나가는 중 — 지금 감으면 끊어져요', tone: 'danger' };
      if (game.runSoon) return { msg: '첨벙!', sub: '곧 차고 나가요', tone: 'alert' };
      return { msg: '감아요', sub: now - game.phaseT < 4000 ? '릴 손으로 작은 원을 계속 돌려요' : '' };
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

const gFill = document.getElementById('gFill') as unknown as SVGPathElement;
gFill.setAttribute('pathLength', '100');
const biteArc = document.getElementById('biteArc') as unknown as SVGCircleElement;
biteArc.setAttribute('pathLength', '100');

function updateHud(now: number): void {
  const ins = instruction(now);
  $('msg').textContent = ins.msg;
  $('msg').className = `msg${ins.tone ? ` ${ins.tone}` : ''}`;
  $('sub').textContent = ins.sub;

  const biteOn = game.phase === 'bite' && !!game.fish;
  show('biteRing', biteOn);
  if (biteOn) {
    const total = params[fishKey(game.fish!.species, 'biteWindowS')];
    biteArc.style.strokeDasharray = `${(100 * game.biteLeftS(now)) / total} 100`;
  }

  if (game.phase === 'reeling' && game.fish) {
    $('lineOut').textContent = game.lineOutM().toFixed(1);
    ($('progFill') as HTMLElement).style.width = `${(100 * game.progress) / game.fish.turnsNeeded}%`;
    $('rateText').textContent = game.reelRate.toFixed(1);
    const lit = Math.round((game.reelRate / params['reel.maxRate']) * 8);
    $('rateDots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < lit));
    $('rateDots').classList.toggle('blocked', game.running);
    const t = game.tension;
    gFill.style.strokeDasharray = `${t * 100} 100`;
    gFill.classList.toggle('hot', t >= 0.75);
    $('tensionText').textContent = t >= 0.75 ? '위험!' : t >= 0.3 ? '팽팽' : '여유';
    const alert = $('runAlert');
    alert.className = `runAlert${game.running ? ' run' : game.runSoon ? ' soon' : ''}`;
    alert.textContent = game.running ? '차고 나가요 — 손 멈춰요!' : game.runSoon ? '첨벙! 곧 차고 나가요' : '';
  }

  const warn = postureWarning();
  $('pipWarn').textContent = warn;
  show('pipWarn', !!warn);
  $('gestLog').innerHTML = gestLog
    .filter((g) => now - g.t < 3000)
    .map((g) => `<span>${g.text}</span>`)
    .join('');
  if (!$('tunePanel').classList.contains('hidden')) {
    $('stat').textContent = source.running ? `${source.fps.toFixed(0)}fps · ${source.inferMs.toFixed(0)}ms` : '카메라 꺼짐';
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

// ---------------------------------------------------------------- panels & buttons

const pipBox = $('pip');
function setPipSize(s: string): void {
  pipBox.classList.remove('size-s', 'size-m', 'size-l');
  pipBox.classList.add(`size-${s}`);
  pipBox.querySelectorAll<HTMLButtonElement>('.pipSizes button').forEach((b) => b.classList.toggle('on', b.dataset.size === s));
  store.set('pipSize', s);
}
setPipSize(store.get('pipSize') ?? 'm');
pipBox.querySelectorAll<HTMLButtonElement>('.pipSizes button').forEach((b) => b.addEventListener('click', () => setPipSize(b.dataset.size!)));

const openHelp = () => show('helpBox', true);
$('helpBtn').addEventListener('click', openHelp);
$('tensionHelp').addEventListener('click', openHelp);
$('helpClose').addEventListener('click', () => show('helpBox', false));

sfx.setMuted(store.get('muted') === '1');
$('muteBtn').classList.toggle('off', sfx.muted);
$('muteBtn').addEventListener('click', () => {
  sfx.start();
  sfx.setMuted(!sfx.muted);
  store.set('muted', sfx.muted ? '1' : '0');
  $('muteBtn').classList.toggle('off', sfx.muted);
});

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

let lastLoop = performance.now();
function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastLoop) / 1000);
  lastLoop = now;
  if (started) {
    const rate = keyReel ? 3 : source.running ? tracker.state(now).reelRate : 0;
    game.update(now, rate);
    for (const e of game.drain()) onGameEvent(e, now);
    if (game.phase === 'reeling') sfx.reel(rate, dt);
  }
  scene.render(game, now);
  updateHud(now);
  drawPip();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', () => scene.resize());
void fillCameras();
requestAnimationFrame(loop);

if (import.meta.env.DEV) {
  (window as unknown as { __game: unknown }).__game = { game, params, tracker, start, source, scene };
}
