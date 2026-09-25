// M0 observer: live webcam landmarks, recording to JSON, and frame-by-frame replay.
// Camera / inference loop copied from Shadow Mitts src/app/main.ts (worker, CPU default, GPU
// fallback, strictly increasing detectForVideo timestamps).

import { reelCircles } from '../core/analysis';
import { LM, LM_NAMES, other, type PoseFrame, type Side } from '../core/pose';
import { noteFor, PROTOCOL } from '../core/protocol';
import { parseRecording, serializeRecording, type RecordedFrame, type Recording } from '../core/recording';
import { loadLandmarker, type Delegate, type ModelVariant, type PoseDetector } from './landmarker';
import { drawOverlay } from './overlay';
import { drawTimeSeries, drawView, SPACE_LABEL, type Space } from './plots';
import './style.css';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const video = $<HTMLVideoElement>('video');
const view = $<HTMLCanvasElement>('view');
const ctx = view.getContext('2d')!;
const banner = $('banner');
const MIN_VIS = 0.5;
/** Camera frames kept for the plots. */
const BUFFER_MS = 10_000;

type Mode = 'idle' | 'loading' | 'camera' | 'replay';
let mode: Mode = 'idle';
let aspect = 4 / 3;

// ---------------------------------------------------------------- small persistence

const store = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(`sonmat.${key}`);
    } catch {
      return null;
    }
  },
  set(key: string, v: string): void {
    try {
      localStorage.setItem(`sonmat.${key}`, v);
    } catch {
      // storage unavailable — settings just won't be remembered
    }
  },
};

let rodHand: Side = store.get('rodHand') === 'left' ? 'left' : 'right';
for (const r of document.querySelectorAll<HTMLInputElement>('input[name=rodHand]')) {
  r.checked = r.value === rodHand;
  r.addEventListener('change', () => {
    if (!r.checked) return;
    rodHand = r.value as Side;
    store.set('rodHand', rodHand);
    fillLandmarkSelect();
    applyPreset();
    render();
  });
}

function showBanner(text: string, ok = false): void {
  banner.textContent = text;
  banner.classList.toggle('ok', ok);
  banner.classList.toggle('hidden', !text);
}

function setMode(m: Mode): void {
  mode = m;
  $('sMode').textContent = { idle: '대기', loading: '로딩 중…', camera: '카메라', replay: '녹화 재생' }[m];
}

// ---------------------------------------------------------------- camera (from Shadow Mitts)

let stream: MediaStream | null = null;
let landmarker: PoseDetector | null = null;
let delegate: Delegate | null = null;
let model: ModelVariant = 'lite';
let requestedGpu = false;
let gpuRetried = false;
let lastTs = 0;
let inferMs = NaN;
let lastInferMs = NaN;
let fps = NaN;
let fpsCount = 0;
let fpsWindowStart = performance.now();
let cameraFps: number | undefined;
let liveFrames: RecordedFrame[] = [];

async function ensureLandmarker(): Promise<void> {
  const wantModel = $<HTMLSelectElement>('model').value as ModelVariant;
  const useGpu = $<HTMLInputElement>('useGpu').checked;
  if (landmarker && model === wantModel && useGpu === requestedGpu) return;
  requestedGpu = useGpu;
  landmarker?.close();
  landmarker = null;
  showBanner(`포즈 모델(${wantModel}) 로딩 중…`, true);
  const loaded = await loadLandmarker(wantModel, useGpu, !new URLSearchParams(location.search).has('mainthread'));
  landmarker = loaded.landmarker;
  delegate = loaded.delegate;
  model = loaded.model;
  gpuRetried = false;
  const where = loaded.landmarker.where === 'worker' ? '별도 스레드' : '메인 스레드';
  $('sDelegate').textContent = loaded.gpuError ? `${delegate} · ${where} (GPU 실패: ${loaded.gpuError})` : `${delegate} · ${where}`;
}

async function refreshCameraList(): Promise<void> {
  const sel = $<HTMLSelectElement>('camera');
  const current = sel.value || store.get('camera') || '';
  let devices: MediaDeviceInfo[] = [];
  try {
    devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return;
  }
  sel.textContent = '';
  sel.append(new Option('기본 카메라', ''));
  devices.forEach((d, i) => sel.append(new Option(d.label || `카메라 ${i + 1}`, d.deviceId)));
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
}

function cameraErrorHint(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
      return '카메라 권한이 거부됨 — 주소창 왼쪽 아이콘에서 카메라를 "허용"으로 바꾸고 새로고침하세요';
    case 'NotReadableError':
    case 'AbortError':
      return '카메라를 열지 못함 — 다른 프로그램(줌, 팀즈, 카메라 앱 등)을 끄거나, "장치" 목록에서 다른 카메라를 골라보세요';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '카메라를 찾지 못함 — 연결 상태와 "장치" 목록을 확인하세요';
    default:
      return window.isSecureContext ? '' : 'HTTPS 또는 localhost 주소로 접속해야 합니다';
  }
}

async function openCamera(): Promise<MediaStream> {
  const deviceId = $<HTMLSelectElement>('camera').value;
  const [w, h] = $<HTMLSelectElement>('resolution').value.split('x').map(Number);
  const device = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'user' };
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { ...device, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 60 } },
      audio: false,
    });
  } catch (e) {
    // Some Windows drivers time out on resolution/frame-rate hints. Retry with nothing but the device.
    if (e instanceof Error && e.name === 'NotAllowedError') throw e;
    console.warn('getUserMedia with constraints failed, retrying plain:', e);
    return navigator.mediaDevices.getUserMedia({ video: deviceId ? device : true, audio: false });
  }
}

function stopCamera(): void {
  if (recording) stopRecording();
  cancelCountdown();
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  if (mode === 'camera') setMode('idle');
}

async function startCamera(): Promise<void> {
  stopReplay();
  stopCamera();
  setMode('loading');
  try {
    await ensureLandmarker();
    showBanner('카메라 여는 중…', true);
    stream = await openCamera();
    video.srcObject = stream;
    await video.play();
  } catch (e) {
    setMode('idle');
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const hint = cameraErrorHint(e);
    showBanner(`시작 실패 — ${msg}${hint ? `  → ${hint}` : ''}`);
    void refreshCameraList();
    return;
  }
  void refreshCameraList();
  store.set('camera', $<HTMLSelectElement>('camera').value);
  cameraFps = stream.getVideoTracks()[0].getSettings().frameRate;
  $('sCam').textContent = `${video.videoWidth}×${video.videoHeight} · ${cameraFps ?? '?'}fps 요청됨`;
  view.width = video.videoWidth;
  view.height = video.videoHeight;
  aspect = video.videoWidth / video.videoHeight;
  liveFrames = [];
  showBanner('');
  setMode('camera');
  startFrameLoop();
}

// Inference runs on the newest camera frame as soon as the previous one returns (Shadow Mitts M3).
let frameReady = false;
let wakeLoop: (() => void) | null = null;
let loopGen = 0;

function onNewVideoFrame(): void {
  frameReady = true;
  wakeLoop?.();
  wakeLoop = null;
}

function startFrameLoop(): void {
  const gen = ++loopGen;
  const alive = () => gen === loopGen && stream !== null;
  if (typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function') {
    const watch = () => {
      if (!alive()) return;
      video.requestVideoFrameCallback(() => {
        onNewVideoFrame();
        watch();
      });
    };
    watch();
  } else {
    let lastTime = -1;
    const poll = () => {
      if (!alive()) return;
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        onNewVideoFrame();
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  }
  void (async () => {
    while (alive()) {
      if (!frameReady) {
        await new Promise<void>((r) => (wakeLoop = r));
        continue;
      }
      frameReady = false;
      if (mode === 'camera') await onVideoFrame();
    }
  })();
}

async function onVideoFrame(): Promise<void> {
  if (mode !== 'camera' || !landmarker) return;
  // detectForVideo(videoFrame, timestamp) — timestamp in ms, must strictly increase (vision.d.ts 1.0.1).
  const ts = Math.max(lastTs + 1, performance.now());
  lastTs = ts;
  let frame: RecordedFrame;
  try {
    const res = await landmarker.detect(video, ts);
    if (mode !== 'camera') return;
    lastInferMs = res.inferMs;
    inferMs = Number.isNaN(inferMs) ? res.inferMs : inferMs * 0.9 + res.inferMs * 0.1;
    frame = { t: ts, lm: res.lm, wl: res.wl, ms: res.inferMs };
  } catch (e) {
    // the detector was replaced (model/GPU switch) while this frame was in flight
    if (e instanceof Error && e.message === 'closed') return;
    console.error('detectForVideo failed', e);
    if (delegate === 'GPU' && !gpuRetried) {
      gpuRetried = true;
      showBanner('GPU 추론 실패 → CPU로 재시도합니다');
      $<HTMLInputElement>('useGpu').checked = false;
      mode = 'loading';
      try {
        await ensureLandmarker();
      } catch (e2) {
        setMode('idle');
        showBanner(`CPU 로딩도 실패: ${e2 instanceof Error ? e2.message : String(e2)}`);
        return;
      }
      setMode('camera');
      showBanner('');
    } else {
      showBanner(`추론 오류: ${e instanceof Error ? e.message : String(e)}`);
    }
    return;
  }
  countFps();
  liveFrames.push(frame);
  while (liveFrames.length && liveFrames[0].t < ts - BUFFER_MS) liveFrames.shift();
  if (recording) recording.frames.push(frame);
  render();
}

function countFps(): void {
  fpsCount++;
  const now = performance.now();
  if (now - fpsWindowStart >= 1000) {
    fps = (fpsCount * 1000) / (now - fpsWindowStart);
    fpsCount = 0;
    fpsWindowStart = now;
  }
}

// ---------------------------------------------------------------- recording

const presetSel = $<HTMLSelectElement>('preset');
const noteInput = $<HTMLInputElement>('note');
const secondsInput = $<HTMLInputElement>('seconds');
const recBtn = $<HTMLButtonElement>('rec');

function fillPresets(): void {
  presetSel.textContent = '';
  presetSel.append(new Option('(직접 입력)', ''));
  for (const p of PROTOCOL) presetSel.append(new Option(`${p.id} · ${noteFor(p, rodHand)}`, p.id));
  presetSel.value = store.get('preset') ?? 'A1';
}

function applyPreset(): void {
  const item = PROTOCOL.find((p) => p.id === presetSel.value);
  const i = presetSel.selectedIndex;
  fillPresets();
  presetSel.selectedIndex = i;
  $('presetHow').textContent = item ? item.how : '메모에 동작을 적어 주세요 (분석할 때 참고해요).';
  if (item) {
    noteInput.value = noteFor(item, rodHand);
    secondsInput.value = String(item.seconds);
  }
}

presetSel.addEventListener('change', () => {
  store.set('preset', presetSel.value);
  applyPreset();
});

let recording: Recording | null = null;
let recStartedAt = 0;
let lastRecording: Recording | null = null;
let countdownTimer: number | undefined;
let countdownText = '';

function cancelCountdown(): void {
  if (countdownTimer !== undefined) clearInterval(countdownTimer);
  countdownTimer = undefined;
  countdownText = '';
  recBtn.textContent = '● 녹화 시작';
}

function toggleRecording(): void {
  if (recording) return stopRecording();
  if (countdownTimer !== undefined) return cancelCountdown();
  if (mode !== 'camera') {
    showBanner('카메라를 먼저 시작하세요');
    return;
  }
  if (!$<HTMLInputElement>('countdown').checked) return beginRecording();
  let n = 3;
  countdownText = String(n);
  recBtn.textContent = '취소';
  countdownTimer = window.setInterval(() => {
    n--;
    if (n > 0) {
      countdownText = String(n);
      return;
    }
    cancelCountdown();
    beginRecording();
  }, 1000);
}

function beginRecording(): void {
  recording = {
    meta: {
      version: 1,
      createdAt: new Date().toISOString(),
      note: noteInput.value.trim(),
      aspect,
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      model,
      delegate: delegate ?? '',
      rodHand,
      mirrorView: $<HTMLInputElement>('mirror').checked,
      ...(cameraFps !== undefined ? { cameraFps } : {}),
    },
    frames: [],
  };
  recStartedAt = performance.now();
  recBtn.classList.add('recording');
  recBtn.textContent = '■ 녹화 정지';
}

function stopRecording(): void {
  const rec = recording;
  if (!rec) return;
  recording = null;
  recBtn.classList.remove('recording');
  recBtn.textContent = '● 녹화 시작';
  if (!rec.frames.length) {
    showBanner('녹화된 프레임이 없어요');
    return;
  }
  const text = serializeRecording(rec);
  lastRecording = parseRecording(text); // identical to what a reload of the file would give
  $<HTMLButtonElement>('replayLast').disabled = false;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = `rec-${stamp}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showBanner(`저장됨: ${a.download} (${rec.frames.length}프레임) — recordings/ 폴더로 옮겨 주세요`, true);
  setTimeout(() => showBanner(''), 5000);
  // advance the checklist
  const i = PROTOCOL.findIndex((x) => x.id === presetSel.value);
  if (i >= 0 && i + 1 < PROTOCOL.length) {
    presetSel.value = PROTOCOL[i + 1].id;
    store.set('preset', presetSel.value);
    applyPreset();
  }
}

function recordingTick(): void {
  if (!recording) return;
  const secs = Number(secondsInput.value);
  const elapsed = (performance.now() - recStartedAt) / 1000;
  recBtn.textContent = `■ 녹화 정지 (${elapsed.toFixed(0)}${secs > 0 ? ` / ${secs}` : ''}초)`;
  if (secs > 0 && elapsed >= secs) stopRecording();
}

// ---------------------------------------------------------------- replay

let replay: Recording | null = null;
let rpIndex = 0;
let rpPlaying = false;
let rpClock = 0;
let rpLastNow = 0;
const seek = $<HTMLInputElement>('rpSeek');

function startReplay(rec: Recording): void {
  stopCamera();
  replay = rec;
  aspect = rec.meta.aspect;
  view.width = rec.meta.videoWidth || 640;
  view.height = rec.meta.videoHeight || Math.round(view.width / aspect);
  if (rec.meta.rodHand && rec.meta.rodHand !== rodHand) {
    document.querySelector<HTMLInputElement>(`input[name=rodHand][value=${rec.meta.rodHand}]`)!.click();
  }
  seek.max = String(Math.max(0, rec.frames.length - 1));
  $('replayBar').hidden = false;
  const m = rec.meta;
  const note = $('rpNote');
  note.hidden = false;
  note.textContent = `“${m.note || '(메모 없음)'}” · ${m.createdAt.slice(0, 19).replace('T', ' ')} · ${m.videoWidth}×${m.videoHeight} · ${m.model}/${m.delegate} · 대: ${m.rodHand === 'left' ? '왼손' : m.rodHand === 'right' ? '오른손' : '?'} · ${rec.frames.length}프레임`;
  $('sCam').textContent = '-';
  $('sDelegate').textContent = `${m.delegate || '?'} (녹화 당시)`;
  setMode('replay');
  seekTo(0);
  rpPlaying = true;
  rpLastNow = performance.now();
}

function stopReplay(): void {
  replay = null;
  rpPlaying = false;
  $('replayBar').hidden = true;
  $('rpNote').hidden = true;
  if (mode === 'replay') setMode('idle');
}

function seekTo(i: number): void {
  if (!replay) return;
  rpIndex = Math.max(0, Math.min(replay.frames.length - 1, i));
  rpClock = replay.frames[rpIndex]?.t ?? 0;
  seek.value = String(rpIndex);
  render();
}

function replayTick(now: number): void {
  if (mode !== 'replay' || !replay || !rpPlaying) return;
  rpClock += (now - rpLastNow) * Number($<HTMLSelectElement>('rpSpeed').value);
  const f = replay.frames;
  let i = rpIndex;
  while (i + 1 < f.length && f[i + 1].t <= rpClock) i++;
  if (i !== rpIndex) {
    rpIndex = i;
    seek.value = String(i);
    render();
  }
  if (rpIndex >= f.length - 1) rpPlaying = false;
}

function togglePlay(): void {
  if (!replay) return;
  if (rpIndex >= replay.frames.length - 1) seekTo(0);
  rpPlaying = !rpPlaying;
  rpClock = replay.frames[rpIndex].t;
}

// ---------------------------------------------------------------- drawing

const tsLandmark = $<HTMLSelectElement>('tsLandmark');
const tsSpace = $<HTMLSelectElement>('tsSpace');

function fillLandmarkSelect(): void {
  const wrist = (s: Side) => (s === 'left' ? LM.WRIST_L : LM.WRIST_R);
  const elbow = (s: Side) => (s === 'left' ? LM.ELBOW_L : LM.ELBOW_R);
  const index = (s: Side) => (s === 'left' ? LM.INDEX_L : LM.INDEX_R);
  const reel = other(rodHand);
  const opts: [string, number][] = [
    [`대 손목 (${LM_NAMES[wrist(rodHand)]})`, wrist(rodHand)],
    [`릴 손목 (${LM_NAMES[wrist(reel)]})`, wrist(reel)],
    [`대 팔꿈치 (${LM_NAMES[elbow(rodHand)]})`, elbow(rodHand)],
    [`릴 팔꿈치 (${LM_NAMES[elbow(reel)]})`, elbow(reel)],
    [`대 검지 (${LM_NAMES[index(rodHand)]})`, index(rodHand)],
    [`릴 검지 (${LM_NAMES[index(reel)]})`, index(reel)],
  ];
  tsLandmark.textContent = '';
  for (const [label, i] of opts) tsLandmark.append(new Option(label, String(i)));
  // keep the same ROLE selected (index in list), not the same landmark
  const role = store.get('tsRole');
  tsLandmark.selectedIndex = role !== null ? Number(role) : 0;
  if (tsLandmark.selectedIndex < 0) tsLandmark.selectedIndex = 0;
}
tsLandmark.addEventListener('change', () => {
  store.set('tsRole', String(tsLandmark.selectedIndex));
  render();
});
for (const [k, label] of Object.entries(SPACE_LABEL)) tsSpace.append(new Option(label, k));
tsSpace.value = store.get('tsSpace') ?? 'world-rel';
tsSpace.addEventListener('change', () => {
  store.set('tsSpace', tsSpace.value);
  render();
});

/** Frames to show: the live buffer, or the replay up to the current frame. */
function visibleFrames(): PoseFrame[] {
  if (mode === 'replay' && replay) {
    const end = replay.frames[rpIndex]?.t ?? 0;
    let lo = rpIndex;
    while (lo > 0 && replay.frames[lo - 1].t >= end - BUFFER_MS) lo--;
    return replay.frames.slice(lo, rpIndex + 1);
  }
  return liveFrames;
}

let lastTableAt = 0;

function render(): void {
  const frames = visibleFrames();
  const cur = frames.length ? frames[frames.length - 1] : null;
  const tEnd = cur?.t ?? 0;
  drawOverlay(ctx, cur, {
    mirror: $<HTMLInputElement>('mirror').checked,
    video: mode === 'camera' ? video : null,
    minVisibility: MIN_VIS,
    rodHand,
    trail: frames.filter((f) => f.t >= tEnd - 1500),
    banner: countdownText,
  });
  drawTimeSeries($<HTMLCanvasElement>('ts'), frames, Number(tsLandmark.value), tsSpace.value as Space, aspect, MIN_VIS);
  drawView($<HTMLCanvasElement>('vFront'), frames, 'front', MIN_VIS);
  drawView($<HTMLCanvasElement>('vSide'), frames, 'side', MIN_VIS);
  drawView($<HTMLCanvasElement>('vTop'), frames, 'top', MIN_VIS);

  // text tables at ~8 Hz so the numbers stay readable
  const now = performance.now();
  if (now - lastTableAt < 120 && mode === 'camera') return;
  lastTableAt = now;
  updateStatus();
  updateCoordTable(cur);
  updateReelTable(frames.filter((f) => f.t >= tEnd - 3000));
  if (mode === 'replay' && replay) {
    const total = (replay.frames[replay.frames.length - 1]?.t ?? 0) / 1000;
    $('rpTime').textContent = `${(tEnd / 1000).toFixed(2)} / ${total.toFixed(2)} s · #${rpIndex}`;
  }
}

const fmt = (v: number, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '-');

function updateStatus(): void {
  if (mode === 'camera') {
    $('sFps').textContent = fmt(fps);
    $('sInfer').textContent = `${fmt(inferMs)} ms (마지막 ${fmt(lastInferMs)})`;
  } else if (mode === 'replay' && replay) {
    const f = replay.frames;
    const dts = f.slice(1).map((x, i) => x.t - f[i].t).sort((a, b) => a - b);
    const med = dts[dts.length >> 1];
    $('sFps').textContent = med ? `${fmt(1000 / med)} (녹화)` : '-';
    const ms = f.map((x) => x.ms).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
    $('sInfer').textContent = ms.length ? `${fmt(ms[ms.length >> 1])} ms (녹화 중앙값)` : '-';
  } else {
    $('sFps').textContent = '-';
    $('sInfer').textContent = '-';
  }
}

const TABLE_POINTS = [LM.NOSE, LM.SHOULDER_L, LM.SHOULDER_R, LM.ELBOW_L, LM.ELBOW_R, LM.WRIST_L, LM.WRIST_R, LM.INDEX_L, LM.INDEX_R, LM.HIP_L, LM.HIP_R];

function updateCoordTable(f: PoseFrame | null): void {
  const rows = ['<tr><th>관절</th><th>월드 x</th><th>y</th><th>z</th><th>이미지 x</th><th>y</th><th>z</th><th>vis</th></tr>'];
  for (const i of TABLE_POINTS) {
    const w = f?.wl?.[i];
    const l = f?.lm?.[i];
    const weak = !l || l[3] < MIN_VIS;
    const c = (v: number | undefined, d: number) => (v === undefined ? '-' : (v >= 0 ? '+' : '') + v.toFixed(d));
    rows.push(
      `<tr class="${weak ? 'weak' : ''}"><td>${LM_NAMES[i]}</td><td>${c(w?.[0], 2)}</td><td>${c(w?.[1], 2)}</td><td>${c(w?.[2], 2)}</td>` +
        `<td>${c(l?.[0], 2)}</td><td>${c(l?.[1], 2)}</td><td>${c(l?.[2], 2)}</td><td>${l ? l[3].toFixed(2) : '-'}</td></tr>`,
    );
  }
  $('coordTable').innerHTML = rows.join('');
}

const PLANE_LABEL = { 'world-xy': '월드 정면 x–y', 'world-yz': '월드 옆 z–y', 'world-xz': '월드 위 x–z', 'image-xy': '화면 x–y' } as const;

function updateReelTable(frames: PoseFrame[]): void {
  const rows = ['<tr><th>면</th><td>둥글기</td><td>회전</td><td>반지름</td></tr>'];
  if (frames.length >= 10) {
    const rec: Recording = {
      meta: { version: 1, createdAt: '', note: '', aspect, videoWidth: 0, videoHeight: 0, model: '', delegate: '' },
      frames,
    };
    for (const c of reelCircles(rec, other(rodHand))) {
      rows.push(`<tr><th>${PLANE_LABEL[c.plane]}</th><td>${fmt(c.roundness, 2)}</td><td>${fmt(c.turns, 1)}</td><td>${fmt(c.radius, 2)}</td></tr>`);
    }
  }
  $('reelTable').innerHTML = rows.join('');
}

function frameLoop(now: number): void {
  replayTick(now);
  rpLastNow = now;
  recordingTick();
  // keep the countdown / status alive when no new camera frames arrive
  if (countdownText || mode === 'idle') render();
  requestAnimationFrame(frameLoop);
}

// ---------------------------------------------------------------- wiring

$('start').addEventListener('click', () => void startCamera());
$('stop').addEventListener('click', () => {
  stopCamera();
  stopReplay();
  render();
});
recBtn.addEventListener('click', toggleRecording);
$('replayLast').addEventListener('click', () => lastRecording && startReplay(lastRecording));
$<HTMLInputElement>('openFile').addEventListener('change', async (ev) => {
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    startReplay(parseRecording(await file.text()));
    showBanner('');
  } catch (e) {
    showBanner(`파일을 읽지 못함: ${e instanceof Error ? e.message : String(e)}`);
  }
  (ev.target as HTMLInputElement).value = '';
});
$('rpPlay').addEventListener('click', togglePlay);
$('rpPrev').addEventListener('click', () => {
  rpPlaying = false;
  seekTo(rpIndex - 1);
});
$('rpNext').addEventListener('click', () => {
  rpPlaying = false;
  seekTo(rpIndex + 1);
});
$('rpClose').addEventListener('click', () => {
  stopReplay();
  render();
});
seek.addEventListener('input', () => {
  rpPlaying = false;
  seekTo(Number(seek.value));
});
$('mirror').addEventListener('change', render);
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
  if (mode !== 'replay') return;
  if (e.key === 'k' || e.key === 'K') togglePlay();
  else if (e.key === ',') {
    rpPlaying = false;
    seekTo(rpIndex - 1);
  } else if (e.key === '.') {
    rpPlaying = false;
    seekTo(rpIndex + 1);
  }
});

fillLandmarkSelect();
fillPresets();
applyPreset();
void refreshCameraList();
render();
requestAnimationFrame(frameLoop);

// dev-only handle for headless checks
if (import.meta.env.DEV) {
  (window as unknown as { __obs: unknown }).__obs = {
    loadRecording: (text: string) => startReplay(parseRecording(text)),
    seekTo,
    state: () => ({ mode, rpIndex, rodHand, delegate, fps, inferMs, frames: liveFrames.length }),
  };
}
