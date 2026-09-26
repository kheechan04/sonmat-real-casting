// Game page: camera → gestures → game → 3D scene + HUD + sound.
// Pose pipeline: poseSource.ts. Gesture rules: core/gestures.ts. Game rules: core/game.ts.
// Every number is a placeholder in core/params.ts, adjustable from the ⚙ panel.

import { FishingGame, FLIGHT_S, MISS_TEXT, type Fish, type GameEvent, type RunKind } from '../core/game';
import { GestureTracker, type GestureEvent } from '../core/gestures';
import { EVENT_NAME, FACE_FISH, LOCATIONS, SPECIES, speciesAt, TIER_NAME, type EventKind, type LocationId } from '../core/species';
import { cropFace, deleteFace, loadFace, saveFace } from './face';
import { setFaceImage } from './fishModels';
import { ARM, LM, other, type PoseFrame, type Side } from '../core/pose';
import { serializeRecording, type RecordedFrame, type Recording } from '../core/recording';
import './game.css';
import { drawOverlay } from './overlay';
import { listCameras, PoseSource } from './poseSource';
import { clockTime, FishingScene, type TimeOfDay } from './scene';
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

// ---------------------------------------------------------------- collection (도감) — this browser only

interface Records {
  /** best length (cm) per species id */
  best: Record<string, number>;
  /** catches per species id */
  count: Record<string, number>;
  /** interference animals seen */
  seen: Partial<Record<EventKind, number>>;
  today: { date: string; count: number };
}
function loadRecords(): Records {
  // the player's own calendar day (toISOString is UTC — in Korea "today" rolled over at 9 am)
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const empty: Records = { best: {}, count: {}, seen: {}, today: { date: today, count: 0 } };
  try {
    const r = { ...empty, ...(JSON.parse(store.get('records.v1') ?? '') as Partial<Records>) };
    if (r.today.date !== today) r.today = { date: today, count: 0 };
    return r;
  } catch {
    return empty;
  }
}
const records = loadRecords();
const saveRecords = () => store.set('records.v1', JSON.stringify(records));
function renderTally(): void {
  const kinds = SPECIES.filter((sp) => records.count[sp.id] || records.best[sp.id]).length;
  $('tally').innerHTML = `오늘 <b>${records.today.count}</b>마리 · 도감 <b>${kinds}</b>/${SPECIES.length}`;
}

/** Korean subject particle: 수달이 / 하마가 */
const iGa = (w: string) => {
  const c = w.charCodeAt(w.length - 1) - 0xac00;
  return w + (c >= 0 && c < 11172 && c % 28 !== 0 ? '이' : '가');
};
const EVENT_ICON: Record<EventKind, string> = { otter: '🦦', orca: '🐋', crocodile: '🐊', hippo: '🦛' };

// ---------------------------------------------------------------- banner / setup

function showBanner(text: string, ok = false): void {
  const b = $('banner');
  b.textContent = text;
  b.classList.toggle('ok', ok);
  b.classList.toggle('hidden', !text);
}
source.onStatus = showBanner;
scene.ready.catch((e) => showBanner(`배경을 불러오지 못했어요: ${e instanceof Error ? e.message : String(e)}`));

/** Build + compile the current place's fish and animals ahead of the first hook (no mid-fight stalls). */
function prepareScene(): void {
  const loc = game.location;
  const animals = [loc.thief, loc.spooker].filter((k): k is EventKind => !!k);
  const ids = game.speciesHere().map((s) => s.id);
  if (game.faceFish) ids.push(FACE_FISH.id);
  scene.prepare(ids, animals).catch((e) => console.warn('prepare failed', e));
}

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
  game.toPlaces(performance.now());
  // the how-to opens by itself once, the first time (after that: the ? button); then the 인면어 capture
  if (store.get('howto.v1') !== '1') {
    show('helpBox', true);
    store.set('howto.v1', '1');
    askFaceAfterHelp = true;
  } else void maybeAskFace();
}

$('start').addEventListener('click', () => void start(true));
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (b && !b.classList.contains('baitCard')) sfx.click();
});
// the backdrop, water and props take a few seconds to load — hold the start button until then
const startBtn = $<HTMLButtonElement>('start');
startBtn.disabled = true;
startBtn.textContent = '호수 불러오는 중…';
void scene.ready.finally(() => {
  // the 3D fades in over the still (body background) once the lake has loaded
  requestAnimationFrame(() => $('world').classList.add('ready'));
  startBtn.disabled = false;
  startBtn.textContent = '카메라 켜고 시작';
});
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
/** keyboard rod work: A = rod arm held to the player's left, D = right */
let keySide: number | null = null;
show('keysHelp', keysOn);
if (keysOn) {
  document.addEventListener('keydown', (e) => {
    if (!started || e.target instanceof HTMLInputElement) return;
    const now = performance.now();
    const k = e.key.toLowerCase();
    // C straight · Q left · E right (aim + = the player's left)
    const aim = { c: 0, q: 0.8, e: -0.8 }[k];
    if (aim !== undefined && !e.repeat) onGesture({ type: 'cast', t: now, strength: 0.6, peakSpeed: 9, aim }, now);
    else if (k === 'h' && !e.repeat) onGesture({ type: 'hookset', t: now, peakSpeed: 6, rise: 0.8 }, now);
    else if (k === 'r') keyReel = true;
    else if (k === 'a') keySide = 0.8;
    else if (k === 'd') keySide = -0.8;
  });
  document.addEventListener('keyup', (e) => {
    if (e.key.toLowerCase() === 'r') keyReel = false;
    if (e.key.toLowerCase() === 'a' || e.key.toLowerCase() === 'd') keySide = null;
  });
}

// ---------------------------------------------------------------- bait choice

const ICON = {
  worm: `<svg viewBox="0 0 40 40"><path d="M6 26c4-8 8 4 12-4s8 4 12-4 5 2 5 2" fill="none" stroke="#e58f8f" stroke-width="5" stroke-linecap="round"/></svg>`,
  paste: `<svg viewBox="0 0 40 40"><circle cx="20" cy="21" r="11" fill="#d8c08c"/><circle cx="16" cy="18" r="2" fill="#b89d62"/><circle cx="23" cy="24" r="1.6" fill="#b89d62"/><circle cx="24" cy="16" r="1.3" fill="#b89d62"/></svg>`,
  corn: `<svg viewBox="0 0 40 40"><path d="M20 7c7 0 10 7 9 14s-5 12-9 12-8-5-9-12 2-14 9-14z" fill="#f2c94c"/><path d="M20 10v20M14 14c3 2 9 2 12 0M13 20c4 2 10 2 14 0M14 26c3 2 9 2 12 0" stroke="#d9a927" stroke-width="1.4" fill="none"/></svg>`,
  lure: `<svg viewBox="0 0 40 40"><path d="M6 20c6-8 18-8 26 0-8 8-20 8-26 0z" fill="#7fc8f8"/><circle cx="12" cy="19" r="2" fill="#123"/><path d="M32 20l5-4v8z" fill="#f4d58d"/></svg>`,
  krill: `<svg viewBox="0 0 40 40"><path d="M8 24c4-10 20-12 26-4-6 2-10 8-22 6z" fill="#f28b82"/><path d="M8 24l-3 5M12 26l-2 5M16 27l-1 5" stroke="#f28b82" stroke-width="1.5"/></svg>`,
  squid: `<svg viewBox="0 0 40 40"><path d="M20 5l7 12H13z" fill="#f5e6da"/><rect x="13" y="16" width="14" height="10" rx="3" fill="#f5e6da"/><path d="M14 26v9M18 26v10M22 26v10M26 26v9" stroke="#e8cbb8" stroke-width="2"/></svg>`,
  jig: `<svg viewBox="0 0 40 40"><path d="M10 12l20 8-20 8 4-8z" fill="#c9d3dc"/><path d="M30 20l6 0" stroke="#999" stroke-width="2"/></svg>`,
  chunk: `<svg viewBox="0 0 40 40"><path d="M8 14h24l-4 14H12z" fill="#e8a0a0"/><path d="M12 18h16M13 23h14" stroke="#fff" stroke-width="1.2" opacity=".6"/></svg>`,
  live: `<svg viewBox="0 0 40 40"><path d="M8 20c6-6 16-6 22 0-6 6-16 6-22 0z" fill="#c8d6a0"/><path d="M30 20l6-5v10z" fill="#c8d6a0"/><circle cx="13" cy="19" r="1.6" fill="#223"/></svg>`,
  dough: `<svg viewBox="0 0 40 40"><circle cx="20" cy="21" r="11" fill="#b58b5a"/><circle cx="16" cy="18" r="2" fill="#8d6a40"/></svg>`,
};
const BAIT_ICON: Record<string, string> = {
  worm: ICON.worm, river_worm: ICON.worm, paste: ICON.paste, corn: ICON.corn, lure_fw: ICON.lure,
  krill: ICON.krill, squid: ICON.squid, jig: ICON.jig, deep_squid: ICON.squid, fish_chunk: ICON.chunk,
  live_bait: ICON.live, dough: ICON.dough,
};

function fillBaits(): void {
  const box = $('baits');
  box.textContent = '';
  $('baitPlace').textContent = game.location.name;
  const here = game.speciesHere();
  for (const b of game.baitsHere()) {
    const wait = ((b.waitMin + b.waitMax) / 2) * params['scale.wait'];
    const speed = Math.max(0.05, Math.min(1, 1 - (wait - 4) / 30));
    const big = Math.max(0.05, Math.min(1, (b.sizeBias + 0.9) / 2.2));
    const likes = here.filter((sp) => (b.speciesMul?.[sp.id] ?? 1) >= 2).map((sp) => sp.name);
    const rareUp = (b.tierMul?.rare ?? 1) > 1 || (b.tierMul?.legend ?? 1) > 1;
    const btn = document.createElement('button');
    btn.className = 'baitCard';
    btn.innerHTML = `
      <div class="baitTop">${BAIT_ICON[b.id] ?? ICON.lure}<div><b>${b.name}</b><span>${b.feel}</span></div></div>
      <div class="statRow">입질 속도<div class="track"><div style="width:${speed * 100}%"></div></div></div>
      <div class="statRow">큰 물고기<div class="track"><div style="width:${big * 100}%"></div></div></div>
      <div class="baitNote">${likes.length ? `${likes.slice(0, 3).join('·')} 잘 물어요` : rareUp ? '희귀한 물고기가 더 잘 물어요' : '어느 물고기나 고루'}</div>`;
    btn.addEventListener('click', () => {
      sfx.pick();
      round = { frames: [], events: [], note: '' };
      game.chooseBait(b.id, performance.now());
    });
    box.append(btn);
  }
}

// ---------------------------------------------------------------- place choice

const PLACE_ART: Record<LocationId, string> = {
  reservoir: 'linear-gradient(160deg, #6f8f7a, #2f4a44)',
  sea: 'linear-gradient(160deg, #4a8fc0, #123d63)',
  deep: 'linear-gradient(160deg, #1b2a4a, #04060f)',
  river: 'linear-gradient(160deg, #b58d4a, #4d5b2a)',
};

// ---------------------------------------------------------------- M5 time of day

const TOD_NAME: Record<TimeOfDay, string> = { day: '낮', dusk: '노을', night: '밤' };
type TodPick = TimeOfDay | 'auto';
let todPick: TodPick = ((): TodPick => {
  const v = store.get('timeOfDay');
  return v === 'day' || v === 'dusk' || v === 'night' ? v : 'auto';
})();
const todWanted = (): TimeOfDay => (todPick === 'auto' ? clockTime() : todPick);

function applyTime(): void {
  const t = todWanted();
  void scene.setTimeOfDay(t).then(() => sfx.setTime(scene.timeShown));
  $('todNow').textContent = `(지금 ${TOD_NAME[clockTime()]})`;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#todPick button')) b.classList.toggle('on', b.dataset.tod === todPick);
}
for (const b of document.querySelectorAll<HTMLButtonElement>('#todPick button')) {
  b.addEventListener('click', () => {
    sfx.pick();
    todPick = b.dataset.tod as TodPick;
    store.set('timeOfDay', todPick);
    applyTime();
  });
}
applyTime();
// 자동: follow the clock while playing (checked once a minute)
let lastClock = clockTime();
setInterval(() => {
  if (clockTime() === lastClock) return;
  lastClock = clockTime();
  if (todPick === 'auto') applyTime();
  else $('todNow').textContent = `(지금 ${TOD_NAME[lastClock]})`;
}, 60_000);

function fillPlaces(): void {
  const box = $('places');
  box.textContent = '';
  for (const loc of LOCATIONS) {
    const sp = speciesAt(loc.id);
    const got = sp.filter((x) => records.count[x.id] || records.best[x.id]).length;
    const legends = sp.filter((x) => x.tier === 'legend').map((x) => x.name);
    const btn = document.createElement('button');
    btn.className = 'placeCard';
    btn.style.background = PLACE_ART[loc.id];
    btn.innerHTML = `<b>${loc.name}</b><span>${loc.sub}</span>
      <div class="placeMeta"><span>도감 ${got}/${sp.length}</span><span>전설: ${legends.join(', ')}</span></div>`;
    btn.addEventListener('click', () => {
      sfx.pick();
      game.chooseLocation(loc.id, performance.now());
    });
    box.append(btn);
  }
}

// ---------------------------------------------------------------- collection (도감)

function fillDex(): void {
  const box = $('dexBody');
  box.textContent = '';
  for (const loc of LOCATIONS) {
    const sec = document.createElement('section');
    sec.innerHTML = `<h3>${loc.name}</h3>`;
    const grid = document.createElement('div');
    grid.className = 'dexGrid';
    for (const sp of speciesAt(loc.id)) {
      const n = records.count[sp.id] ?? 0;
      const best = records.best[sp.id];
      const card = document.createElement('div');
      card.className = `dexCard tier-${sp.tier}${n || best ? '' : ' unknown'}`;
      card.innerHTML = n || best
        ? `<b>${sp.name}</b><em>${TIER_NAME[sp.tier]}</em><span>최고 ${best ?? '-'}cm · ${n}마리</span><p>${sp.blurb}</p>`
        : `<b>???</b><em>${TIER_NAME[sp.tier]}</em><span>아직 못 만났어요</span>`;
      grid.append(card);
    }
    const ev = [loc.thief, loc.spooker].filter((k): k is EventKind => !!k);
    for (const k of ev) {
      const seen = records.seen[k] ?? 0;
      const card = document.createElement('div');
      card.className = `dexCard animal${seen ? '' : ' unknown'}`;
      card.innerHTML = seen
        ? `<b>${EVENT_ICON[k]} ${EVENT_NAME[k]}</b><em>목격</em><span>${seen}번 만났어요</span>`
        : `<b>???</b><em>목격</em><span>아주 가끔 나타나요</span>`;
      grid.append(card);
    }
    sec.append(grid);
    box.append(sec);
  }
  box.append(faceDexSection());
}

// ---------------------------------------------------------------- M4 인면어 (my face)
// Privacy: docs/PRIVACY.md. The face is only ever in this page (canvas / GPU texture) and IndexedDB.

/** the saved face, for the 도감 thumbnail (null = none) */
let faceImage: ImageBitmap | HTMLCanvasElement | null = null;

function applyFace(img: ImageBitmap | HTMLCanvasElement | null): void {
  faceImage = img;
  setFaceImage(img);
  game.faceFish = !!img;
  game.faceFishCaught = !!records.count[FACE_FISH.id];
}
/** the saved face has been looked up (so "no face" is known for sure before offering the capture) */
const faceLoaded = loadFace().then((img) => img && applyFace(img));

function faceDexSection(): HTMLElement {
  const sec = document.createElement('section');
  sec.innerHTML = '<h3>이벤트</h3>';
  const grid = document.createElement('div');
  grid.className = 'dexGrid';
  const card = document.createElement('div');
  const n = records.count[FACE_FISH.id] ?? 0;
  card.className = `dexCard event${n ? '' : ' unknown'}`;
  if (faceImage) {
    const c = document.createElement('canvas');
    c.className = 'faceThumb';
    c.width = c.height = 128;
    c.getContext('2d')!.drawImage(faceImage, 0, 0, 128, 128);
    card.innerHTML = `<b>${n ? FACE_FISH.name : '???'}</b><em>이벤트</em>`;
    card.append(c);
    card.insertAdjacentHTML('beforeend', `<span>${n ? `${n}마리 · 최고 ${records.best[FACE_FISH.id]}cm` : '입질 5%로 나와요'}</span>`);
  } else {
    card.innerHTML = `<b>인면어</b><em>이벤트</em><span>내 얼굴을 등록하면 가끔 낚여요</span>`;
  }
  const acts = document.createElement('div');
  acts.className = 'faceActs';
  const make = document.createElement('button');
  make.className = 'ghost';
  make.textContent = faceImage ? '다시 찍기' : '내 얼굴로 만들기';
  make.addEventListener('click', openFaceBox);
  acts.append(make);
  if (faceImage) {
    const del = document.createElement('button');
    del.className = 'ghost';
    del.textContent = '내 얼굴 삭제';
    del.addEventListener('click', async () => {
      await deleteFace();
      applyFace(null);
      fillDex();
    });
    acts.append(del);
  }
  card.append(acts);
  grid.append(card);
  sec.append(grid);
  return sec;
}

/** the first-run how-to is open: offer the 인면어 once it's closed */
let askFaceAfterHelp = false;

/**
 * Every start with the camera on and no face saved: the capture window opens by itself (user: "사진
 * 등록이 안 돼있으면 사진 등록 창 뜨게 … 가끔 … 창이 안 뜨더라" — it used to ask once per browser, and
 * could ask before the saved face had been looked up). Consent is still needed before any preview.
 */
async function maybeAskFace(): Promise<void> {
  await faceLoaded;
  if (!source.running || faceImage) return;
  openFaceBox();
}

/** capture flow state: live preview until "찍기", then the shot until "저장" / "다시 찍기" */
let faceLive = false;
let faceShot: HTMLCanvasElement | null = null;

function openFaceBox(): void {
  show('dexBox', false);
  show('faceBox', true);
  ($('faceAgree') as HTMLInputElement).checked = false;
  faceShot = null;
  faceLive = false;
  setFaceButtons();
  const c = $('faceLive') as HTMLCanvasElement;
  c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
  $('faceMsg').textContent = source.running ? '위 내용을 확인하면 미리보기가 켜져요' : '카메라를 켜고 시작해야 찍을 수 있어요';
}

function setFaceButtons(): void {
  const agreed = ($('faceAgree') as HTMLInputElement).checked;
  show('faceShoot', !faceShot);
  show('faceRetake', !!faceShot);
  show('faceSave', !!faceShot);
  ($('faceShoot') as HTMLButtonElement).disabled = !agreed || !source.running;
}

function closeFaceBox(): void {
  faceLive = false;
  faceShot = null;
  const c = $('faceLive') as HTMLCanvasElement;
  c.getContext('2d')!.clearRect(0, 0, c.width, c.height); // nothing left on screen
  show('faceBox', false);
}

$('faceAgree').addEventListener('change', () => {
  faceLive = ($('faceAgree') as HTMLInputElement).checked && source.running && !faceShot;
  setFaceButtons();
});
$('faceCancel').addEventListener('click', closeFaceBox);
$('faceShoot').addEventListener('click', () => {
  const shot = cropFace(source.video, lastFrame?.lm ?? null);
  if (!shot) {
    $('faceMsg').textContent = '얼굴이 잘 안 보여요 — 카메라를 정면으로 봐 주세요';
    return;
  }
  faceShot = shot;
  faceLive = false;
  const c = $('faceLive') as HTMLCanvasElement;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(shot, 0, 0, c.width, c.height);
  $('faceMsg').textContent = '';
  setFaceButtons();
});
$('faceRetake').addEventListener('click', () => {
  faceShot = null;
  faceLive = ($('faceAgree') as HTMLInputElement).checked && source.running;
  setFaceButtons();
});
$('faceSave').addEventListener('click', async () => {
  if (!faceShot) return;
  try {
    await saveFace(faceShot);
    applyFace(faceShot);
    closeFaceBox();
    popText('인면어가 생겼어요!', 'gold', true);
    if (game.phase !== 'place') prepareScene();
  } catch {
    $('faceMsg').textContent = '이 브라우저에는 저장할 수 없어요 (사생활 보호 창일 수 있어요)';
  }
});

/** the live face preview, drawn each frame while the capture window is open and agreed to */
function updateFacePreview(): void {
  if (!faceLive) return;
  const c = $('faceLive') as HTMLCanvasElement;
  const face = cropFace(source.video, lastFrame?.lm ?? null, c);
  $('faceMsg').textContent = face ? '' : '얼굴이 잘 안 보여요 — 카메라를 정면으로 봐 주세요';
  if (!face) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
}

// ---------------------------------------------------------------- results

/** Shows the result card; returns whether it was a trophy for the fanfare. */
function showCatch(f: Fish): boolean {
  const id = f.def.id;
  records.today.count++;
  records.count[id] = (records.count[id] ?? 0) + 1;
  const prevBest = records.best[id] ?? 0;
  const isRecord = f.lengthCm > prevBest;
  const isNew = !prevBest;
  if (isRecord) records.best[id] = f.lengthCm;
  lastCatch = f;
  saveRecords();
  renderTally();

  const trophy = f.lengthCm >= f.def.trophyCm;
  const badge = trophy ? f.def.trophyLabel : isNew ? '도감 등록!' : isRecord ? '개인 기록!' : '';
  $('resBadge').textContent = badge;
  show('resBadge', !!badge);
  $('resKicker').innerHTML = f.def.event
    ? '<span class="tierTag tier-event">이벤트</span> 낚았어요'
    : `<span class="tierTag tier-${f.def.tier}">${TIER_NAME[f.def.tier]}</span> 낚았어요`;
  $('resTitle').className = '';
  $('resTitle').textContent = f.def.name;
  const w = f.weightG >= 1000 ? `${(f.weightG / 1000).toFixed(f.weightG >= 100000 ? 0 : 1)}<small>kg</small>` : `${f.weightG}<small>g</small>`;
  const len = f.lengthCm >= 100 ? `${(f.lengthCm / 100).toFixed(2)}<small>m</small>` : `${f.lengthCm}<small>cm</small>`;
  $('resStats').innerHTML = `<div><b>${len}</b><span>길이</span></div><div><b>${w}</b><span>무게</span></div>`;
  show('resStats', true);
  // M5: how this one compares with the best so far
  const note = isNew ? '' : isRecord ? `이전 최고 ${prevBest}cm → <b>+${f.lengthCm - prevBest}cm</b> 새 기록` : `내 최고 기록 ${prevBest}cm`;
  $('resNote').innerHTML = note;
  show('resNote', !!note);
  // not for the 인면어: the face photo is never written to a file (docs/PRIVACY.md)
  show('keepsake', !f.def.event);
  $('resBody').textContent = f.def.blurb;
  return trophy;
}

/** the fish on the result card, for the keepsake photo */
let lastCatch: Fish | null = null;

/**
 * M5 keepsake: the 3D view of the catch with its name, size, place and date, saved as a PNG on this
 * device (a download — nothing is sent anywhere; for a 인면어 it is the player's own face, their choice).
 */
function saveKeepsake(): void {
  const f = lastCatch;
  if (!f) return;
  const shot = scene.snapshot();
  const c = document.createElement('canvas');
  c.width = shot.width;
  c.height = shot.height;
  const g = c.getContext('2d')!;
  g.drawImage(shot, 0, 0);
  const s = c.height / 720;
  const pad = 28 * s;
  const w = 430 * s;
  const h = 150 * s;
  g.fillStyle = 'rgba(12, 16, 20, 0.62)';
  g.beginPath();
  g.roundRect(pad, c.height - pad - h, w, h, 18 * s);
  g.fill();
  const x = pad + 24 * s;
  let y = c.height - pad - h + 44 * s;
  g.fillStyle = '#f4d58d';
  g.font = `700 ${15 * s}px "Pretendard", "Malgun Gothic", sans-serif`;
  g.fillText(f.def.event ? '이벤트' : TIER_NAME[f.def.tier], x, y);
  y += 40 * s;
  g.fillStyle = '#ffffff';
  g.font = `800 ${34 * s}px "Pretendard", "Malgun Gothic", sans-serif`;
  const len = f.lengthCm >= 100 ? `${(f.lengthCm / 100).toFixed(2)}m` : `${f.lengthCm}cm`;
  const wt = f.weightG >= 1000 ? `${(f.weightG / 1000).toFixed(1)}kg` : `${f.weightG}g`;
  g.fillText(`${f.def.name}  ${len} · ${wt}`, x, y);
  y += 36 * s;
  g.fillStyle = 'rgba(255,255,255,0.72)';
  g.font = `500 ${15 * s}px "Pretendard", "Malgun Gothic", sans-serif`;
  const d = new Date();
  g.fillText(`${game.location.name} · ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} · 손맛: 리얼 캐스팅`, x, y);
  c.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `손맛-${f.def.name}-${f.lengthCm}cm.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }, 'image/png');
}
$('keepsake').addEventListener('click', saveKeepsake);

// M5 PWA: offline copies of the game's files (public/sw.js; privacy: docs/PRIVACY.md). Built site only —
// in development it would serve stale files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => undefined));
}

function showMiss(reason: keyof typeof MISS_TEXT): void {
  show('resBadge', false);
  show('resNote', false);
  show('keepsake', false);
  $('resKicker').textContent = '놓쳤어요';
  $('resTitle').className = 'bad';
  const thief = game.stolenBy ? EVENT_NAME[game.stolenBy] : '';
  $('resTitle').textContent = { early: '너무 일찍 챘어요', late: '입질을 놓쳤어요', snap: '줄이 끊어졌어요', escape: '빠져나갔어요', stolen: `${iGa(thief)} 채 갔어요` }[reason];
  show('resStats', false);
  $('resBody').textContent = `${MISS_TEXT[reason].split(' — ')[1] ?? ''} · 미끼만 사라졌어요`;
}

// "다시 던지기" = the same bait, straight to casting; "미끼 바꾸기" = choose the bait again (user: "미끼만 바꾸는 것도")
$('again').addEventListener('click', () => game.recast(performance.now()));
$('rebait').addEventListener('click', () => game.again(performance.now()));
$('toPlaces').addEventListener('click', () => game.toPlaces(performance.now()));
$('baitBack').addEventListener('click', () => game.toPlaces(performance.now()));
$('dexBtn').addEventListener('click', () => {
  fillDex();
  show('dexBox', true);
});
$('dexClose').addEventListener('click', () => show('dexBox', false));

// ---------------------------------------------------------------- big-moment effects (exaggerated on purpose)

function flash(color: 'white' | 'gold' | 'red' | 'blue'): void {
  const el = $('flash');
  el.className = `flash ${color}`;
  void el.offsetWidth; // restart the animation
  el.classList.add('go');
}

function popText(text: string, style: '' | 'gold' | 'red' = '', small = false): void {
  const el = $('pop');
  el.textContent = text;
  el.className = `pop${style ? ` ${style}` : ''}${small ? ' small' : ''}`;
  void el.offsetWidth;
  el.classList.add('go');
}

function confetti(n: number): void {
  const box = $('confetti');
  const colors = ['#f4d58d', '#e9c46a', '#ffffff', '#8fd694', '#7fc8f8', '#ff9f87'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}%`;
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 300}px`);
    p.style.setProperty('--rot', `${(Math.random() - 0.5) * 1440}deg`);
    p.style.setProperty('--dur', `${1.8 + Math.random() * 1.6}s`);
    p.style.setProperty('--delay', `${Math.random() * 0.5}s`);
    box.append(p);
    setTimeout(() => p.remove(), 4200);
  }
}

/** The fish is almost in: drum roll + one "거의 다 왔어요!" per fight. */
let almostShown = false;

function onGameEvent(e: GameEvent, now: number): void {
  round?.events.push({ t: now, e: e.type === 'phase' ? `phase:${e.phase}` : e.type });
  switch (e.type) {
    case 'phase':
      show('placeBox', e.phase === 'place');
      if (e.phase === 'place' || e.phase === 'bait' || e.phase === 'ready') scene.clearAnimals();
      show('baitBox', e.phase === 'bait');
      if (e.phase === 'place') fillPlaces();
      // caught: shown after the leap (see 'caught' below)
      show('resultBox', e.phase === 'missed');
      show('reelBox', e.phase === 'reeling');
      if (e.phase !== 'reeling') {
        sfx.setDrag(false);
        sfx.setRoll(false);
        $('runFlash').classList.remove('on');
      }
      if (e.phase !== 'caught') show('rays', false); // caught: set by the 'caught' event just before
      if (e.phase === 'reeling') almostShown = false;
      if (e.phase === 'bait') {
        fillBaits();
        // photos load and this place's fish / animals get built and compiled while the bait is chosen
        void scene.setPlace(game.location.id).then(() => prepareScene());
      }
      if (e.phase === 'waiting') {
        sfx.plop();
        scene.fx('land');
      }
      if ((e.phase === 'caught' || e.phase === 'missed') && round) {
        const fish = game.fish ? game.fish.def.name : '';
        round.note = `게임: ${game.location.name}, ${game.bait.name}, ${fish} ${e.phase === 'caught' ? '잡음' : `놓침(${game.missReason})`}`.trim();
        lastRound = round;
        round = null;
      }
      break;
    case 'cast':
      sfx.cast(FLIGHT_S, e.strength);
      if (e.strength >= 0.75) popText(`나이스 캐스팅! ${Math.round(e.distanceM)}m`, 'gold', true);
      else popText(`${Math.round(e.distanceM)}m`, '', true);
      break;
    case 'nibble':
      sfx.nibble();
      scene.fx('nibble');
      break;
    case 'spot':
      if (e.result === 'hit') {
        sfx.milestone();
        popText('포인트 적중!', 'gold', true);
      } else if (e.result === 'near') popText('포인트 근처', '', true);
      break;
    case 'counter':
      if (e.on) sfx.strain(); // the tug bar turns green — no extra popup
      break;
    case 'bite':
      sfx.bite();
      scene.fx('bite');
      flash('gold');
      popText('입질!', 'gold', true);
      break;
    case 'hooked':
      sfx.hook();
      scene.fx('hook');
      flash('white');
      popText('HIT!', 'gold');
      break;
    case 'runWarn':
      sfx.splash();
      scene.fx('runWarn');
      popText('첨벙!', '', true);
      break;
    case 'run': {
      const stop = e.kind !== 'shock';
      sfx.setDrag(e.on && stop, e.kind === 'dive' ? 0.6 : 1);
      $('runFlash').classList.toggle('on', e.on && stop);
      if (!e.on) break;
      scene.fx('run');
      if (e.kind === 'jump') {
        sfx.jump();
        popText('점프!!', 'gold');
      } else if (e.kind === 'dive') popText('파고든다!', 'red', true);
      else if (e.kind === 'thrash') popText('몸부림!', 'red', true);
      else if (e.kind === 'shock') {
        sfx.zap();
        flash('blue');
        popText('찌릿!!', 'gold');
      }
      break;
    }
    case 'caught': {
      const trophy = showCatch(e.fish);
      const big = trophy || e.fish.def.tier === 'legend' || !!e.fish.def.event;
      sfx.caught(big);
      scene.fx('catch');
      flash('gold');
      popText(e.fish.def.event ? '인면어?!' : trophy ? e.fish.def.trophyLabel : e.fish.def.tier === 'legend' ? '전설!!' : '낚았다!', 'gold');
      show('rays', big);
      confetti(big ? 160 : 70);
      // let the leap out of the water play before the card slides up
      show('resultBox', false);
      setTimeout(() => {
        if (game.phase === 'caught') show('resultBox', true);
      }, 1100);
      break;
    }
    case 'missed':
      if (e.thief) {
        scene.animal(e.thief, 'steal');
        sfx.animal(e.thief);
      }
      if (e.reason === 'snap') {
        sfx.snap();
        scene.fx('snap');
        flash('red');
        popText('툭… 끊어졌다', 'red', true);
      } else {
        sfx.miss();
        scene.fx('miss');
        popText('놓쳤다…', 'red', true);
      }
      showMiss(e.reason);
      break;
    case 'thief':
      sfx.splash();
      sfx.animal(e.kind);
      sfx.setRoll(true);
      scene.animal(e.kind, 'approach', params['event.warnS']);
      scene.fx('runWarn');
      flash('red');
      popText(`${EVENT_NAME[e.kind]}다!`, 'red');
      records.seen[e.kind] = (records.seen[e.kind] ?? 0) + 1;
      saveRecords();
      break;
    case 'thiefEscaped':
      sfx.setRoll(false);
      scene.animal(e.kind, 'escape');
      sfx.milestone();
      popText('따돌렸다!', 'gold', true);
      break;
    case 'spook':
      sfx.splash();
      sfx.animal(e.kind);
      scene.animal(e.kind, 'spook');
      scene.fx('runWarn');
      popText(`${EVENT_NAME[e.kind]}다!!`, '', false);
      logGesture('물고기가 흩어졌어요 — 다시 기다려요', now);
      records.seen[e.kind] = (records.seen[e.kind] ?? 0) + 1;
      saveRecords();
      break;
    case 'ignored':
      logGesture(e.why, now);
      break;
  }
}

// ---------------------------------------------------------------- HUD

/** What each kind of run says: [warning, while it lasts, sub line] */
/**
 * What each kind of run says. Whenever reeling is wrong the top line is the same red "✋ 감지 마요!"
 * and `what` (the small line) says what the fish is doing (user: "감지 말아야할 땐 … 빨간색으로 문구 같이").
 * There is no "reel hard" exception any more — the bottom hug was removed.
 */
const RUN_TEXT: Record<RunKind, { soon: string; what: string }> = {
  run: { soon: '첨벙! 곧 차고 나가요', what: '옆으로 차고 나가요 — 막대의 "여기로!"로 팔 옮기기' },
  jump: { soon: '수면이 부풀어요 — 점프 온다!', what: '점프 중 — 잠깐 기다려요' },
  dive: { soon: '줄이 무거워져요 — 깊이 파고들 거예요', what: '깊이 파고드는 중 — 잠깐 기다려요' },
  thrash: { soon: '첨벙첨벙! 몸부림 온다', what: '몸부림 — 막대의 "여기로!"로 팔 옮기기' },
  shock: { soon: '', what: '손이 저려서 잠깐 안 감겨요' },
};
const STOP_MSG = '✋ 감지 마요!';

const BITE_MSG: Record<string, string> = {
  rise: '찌가 올라와요! 지금!',
  sink: '쭉 빨려 들어가요! 지금!',
  drag: '찌가 끌려가요! 지금!',
  slam: '쾅! 들어갔어요! 지금!',
  tap: '초릿대가 휘었어요! 지금!',
};

/** Fish landed so far on this device — the long how-to lines are shown only while this is small. */
const LEARNING_CATCHES = 5;
const learning = () => Object.values(records.count).reduce((a, b) => a + (b ?? 0), 0) < LEARNING_CATCHES;

/**
 * The one line at the top: what to do right now. A short second line explains it, but only for the
 * first few fish (user: "기능이 추가될수록 화면이 좀 복잡해진 거 같은데 … 최대한 덜 복잡해 보이게").
 */
function instruction(now: number): { msg: string; sub: string; tone?: 'alert' | 'danger' } {
  const r = instructionFull(now);
  // the thief countdown and what a running fish is doing are information, not a how-to
  const keep = game.thief !== null || game.running;
  return learning() || keep ? r : { ...r, sub: '' };
}

function instructionFull(now: number): { msg: string; sub: string; tone?: 'alert' | 'danger' } {
  switch (game.phase) {
    case 'ready':
      return { msg: '던지세요', sub: game.spots.length ? '표시된 곳 쪽으로 손을 휘둘러요 — 세게 휘두를수록 멀리' : '대 든 손을 머리 뒤로 젖혔다가 앞으로 휘둘러요' };
    case 'flight':
      return { msg: '', sub: '' };
    case 'waiting':
      return { msg: '', sub: `${game.bait.name} · ${game.location.noFloat ? '대 끝(초릿대)을 지켜보세요' : '찌를 지켜보세요'}` };
    case 'nibble':
      return game.nibbling ? { msg: '톡톡…', sub: '아직이에요 — 간만 보는 중' } : { msg: '', sub: '뭔가 건드려요… 찌를 지켜보세요' };
    case 'bite':
      return { msg: BITE_MSG[game.fish?.def.bite ?? 'sink'], sub: '손을 빠르게 위로 "툭"', tone: 'alert' };
    case 'reeling':
      if (game.thief)
        return {
          msg: `${EVENT_ICON[game.thief.kind]} ${iGa(EVENT_NAME[game.thief.kind])} 다가와요!`,
          sub: `빨리 감아서 따돌려요 — ${game.thiefLeftS(now).toFixed(1)}초`,
          tone: 'danger',
        };
      if (game.running) {
        const what = RUN_TEXT[game.runKind].what;
        if (game.openingRun) return { msg: STOP_MSG, sub: '걸리자마자 줄을 끌고 가요 — 잠깐 기다려요', tone: 'danger' };
        if (game.countering) return { msg: STOP_MSG, sub: '버티는 중 — 그대로! 물고기가 지쳐 가요', tone: 'danger' };
        if (game.mustStop) return { msg: STOP_MSG, sub: what, tone: 'danger' };
        return { msg: '⚡ 찌릿! 잠깐 멈춤', sub: what, tone: 'alert' };
      }
      if (game.runSoon) return { msg: RUN_TEXT[game.runKind].soon, sub: '', tone: 'alert' };
      return { msg: '감아요', sub: now - game.phaseT < 4000 ? '릴 손으로 작은 원을 계속 돌려요' : '' };
    default:
      return { msg: '', sub: '' };
  }
}

/** M3: "🐦 새 떼 18m" tags above the spots while the player aims (ready) and the cast flies. */
function updateSpotTags(): void {
  const box = $('spotTags');
  const on = game.phase === 'ready' || game.phase === 'flight';
  const pos = on ? scene.spotTags() : [];
  while (box.children.length < pos.length) box.append(document.createElement('div'));
  [...box.children].forEach((el, i) => {
    const p = pos[i];
    const sp = game.spots[i];
    const e = el as HTMLElement;
    e.className = 'spotTag';
    e.style.display = p && sp ? '' : 'none';
    if (!p || !sp) return;
    e.style.left = `${p.x}px`;
    e.style.top = `${p.y}px`;
    e.textContent = `${sp.kind === 'birds' ? '🐦 새 떼' : '💦 물 끓음'} ${Math.round(sp.distM)}m`;
  });
}

/**
 * M3 rod work: the tug-of-war bar. Shown from the warning through a run you must stop for: the fish at
 * the end it pulls toward, the player's rod arm as a dot, the zone to hold it in on the other side.
 * Screen left = the player's left (first-person view), ±1 torso length = the bar's ends.
 */
function updateTug(): void {
  const on = game.phase === 'reeling' && !game.thief && game.sideways && !game.openingRun && (game.mustStop || game.runSoon);
  const tug = $('tug');
  tug.classList.toggle('hidden', !on);
  if (!on) return;
  const toX = (side: number) => 50 - Math.max(-1.1, Math.min(1.1, side)) * 42; // % from the left
  const fishSide = game.runDir; // 1 = the player's left
  const min = params['sweep.min'];
  const zoneFrom = toX(-fishSide * min);
  const zoneTo = toX(-fishSide * 1.1);
  const zone = $('tugZone') as HTMLElement;
  zone.style.left = `${Math.min(zoneFrom, zoneTo)}%`;
  zone.style.width = `${Math.abs(zoneTo - zoneFrom)}%`;
  ($('tugFish') as HTMLElement).style.left = `${toX(fishSide * 1.08)}%`;
  const arm = game.rodSide;
  ($('tugMark') as HTMLElement).style.left = `${toX(arm ?? 0)}%`;
  tug.classList.toggle('noArm', arm === null);
  tug.classList.toggle('ok', game.countering);
}

function postureWarning(): string {
  if (!source.running) return '';
  const f = lastFrame;
  if (!f?.lm || performance.now() - f.t > 1000) return '사람이 안 보여요 — 카메라 앞으로 와 주세요';
  const lm = f.lm;
  // hips may be out of frame (framed from the navel up) — the shoulders carry the scale then
  if (lm[LM.SHOULDER_L][3] < params.minVis || lm[LM.SHOULDER_R][3] < params.minVis) return '양쪽 어깨가 화면에 들어오게 해 주세요';
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
    const total = game.fish!.biteWindowS;
    biteArc.style.strokeDasharray = `${(100 * game.biteLeftS(now)) / total} 100`;
  }

  if (game.phase === 'reeling' && game.fish) {
    $('lineOut').textContent = game.lineOutM().toFixed(1);
    ($('progFill') as HTMLElement).style.width = `${100 * game.reelFrac()}%`;
    $('rateText').textContent = game.reelRate.toFixed(1);
    const lit = Math.round((game.reelRate / params['reel.maxRate']) * 8);
    $('rateDots').querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < lit));
    $('rateDots').classList.toggle('blocked', game.mustStop);
    const t = game.tension;
    gFill.style.strokeDasharray = `${t * 100} 100`;
    gFill.classList.toggle('hot', t >= 0.75);
    $('tensionText').textContent = t >= 0.75 ? '위험!' : t >= 0.3 ? '팽팽' : '여유';
    updateTug(); // (the red pill above the console repeated the top line — removed)
  }
  updateSpotTags();
  updateFacePreview();

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
$('helpClose').addEventListener('click', () => {
  show('helpBox', false);
  if (askFaceAfterHelp) {
    askFaceAfterHelp = false;
    void maybeAskFace();
  }
});

sfx.setMuted(store.get('muted') === '1');
$('muteBtn').classList.toggle('off', sfx.muted);
$('muteBtn').addEventListener('click', () => {
  sfx.start();
  sfx.setMuted(!sfx.muted);
  store.set('muted', sfx.muted ? '1' : '0');
  $('muteBtn').classList.toggle('off', sfx.muted);
});

// the ⚙ play-test panel is a development tool: on the published site only with ?dev
const devTools = import.meta.env.DEV || new URLSearchParams(location.search).has('dev');
show('tuneBtn', devTools);
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
let hurryTick = -1;
function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastLoop) / 1000);
  lastLoop = now;
  if (started) {
    const rate = keyReel ? 3 : source.running ? tracker.state(now).reelRate : 0;
    const rodSide = keySide ?? (source.running ? tracker.state(now).rodSide : null);
    scene.setRodInput(rodSide);
    game.update(now, rate, rodSide);
    for (const e of game.drain()) onGameEvent(e, now);
    if (game.phase === 'reeling') {
      sfx.reel(rate, dt);
      sfx.tension(game.tension, dt);
      // the fish splashes more as it comes close; the last stretch gets a drum roll
      const frac = game.reelFrac();
      if (frac > 0.75 && Math.random() < dt * 0.8) sfx.nearSplash();
      if (frac >= 0.85 && !almostShown) {
        almostShown = true;
        sfx.milestone();
        popText('거의 다 왔어요!', 'gold', true);
      }
      sfx.setRoll(frac >= 0.85 && !game.mustStop);
    }
    if (game.phase === 'bite') {
      const left = game.biteLeftS(now);
      if (left < 1 && Math.floor(left * 4) !== hurryTick) {
        hurryTick = Math.floor(left * 4);
        sfx.hurry();
      }
    } else hurryTick = -1;
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
  (window as unknown as { __game: unknown }).__game = { game, params, tracker, start, source, scene, applyFace }; // applyFace: headless checks with a test image, dev only
}
