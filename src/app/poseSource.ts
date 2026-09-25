// Webcam + pose landmarker, shared by the game and the M0 observer. Moved out of observer.ts
// (originally Shadow Mitts main.ts): worker inference, CPU default with GPU fallback, strictly
// increasing detectForVideo timestamps, newest-frame-first loop.

import type { RecordedFrame } from '../core/recording';
import { loadLandmarker, type Delegate, type ModelVariant, type PoseDetector } from './landmarker';

export interface PoseSourceOptions {
  deviceId: string;
  width: number;
  height: number;
  model: ModelVariant;
  useGpu: boolean;
}

export function cameraErrorHint(e: unknown): string {
  const name = e instanceof Error ? e.name : '';
  switch (name) {
    case 'NotAllowedError':
      return '카메라 권한이 거부됨 — 주소창 왼쪽 아이콘에서 카메라를 "허용"으로 바꾸고 새로고침하세요';
    case 'NotReadableError':
    case 'AbortError':
      return '카메라를 열지 못함 — 다른 프로그램(줌, 팀즈, 카메라 앱 등)을 끄거나 다른 카메라를 골라보세요';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return '카메라를 찾지 못함 — 연결 상태와 카메라 목록을 확인하세요';
    default:
      return window.isSecureContext ? '' : 'HTTPS 또는 localhost 주소로 접속해야 합니다';
  }
}

export async function listCameras(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  } catch {
    return [];
  }
}

export class PoseSource {
  readonly video: HTMLVideoElement;
  /** Called for every processed frame. */
  onFrame: ((f: RecordedFrame) => void) | null = null;
  /** Status / error text for a banner ('' = clear). */
  onStatus: ((text: string, ok: boolean) => void) | null = null;

  running = false;
  delegate: Delegate | null = null;
  where: 'worker' | 'main' | null = null;
  gpuError: string | undefined;
  model: ModelVariant = 'lite';
  cameraFps: number | undefined;
  aspect = 4 / 3;
  fps = NaN;
  inferMs = NaN;
  lastInferMs = NaN;

  private stream: MediaStream | null = null;
  private landmarker: PoseDetector | null = null;
  private requestedGpu = false;
  private gpuRetried = false;
  private lastTs = 0;
  private fpsCount = 0;
  private fpsWindowStart = performance.now();
  private frameReady = false;
  private wakeLoop: (() => void) | null = null;
  private loopGen = 0;
  private opts: PoseSourceOptions | null = null;

  constructor(video?: HTMLVideoElement) {
    this.video = video ?? Object.assign(document.createElement('video'), { playsInline: true, muted: true });
  }

  private status(text: string, ok = false): void {
    this.onStatus?.(text, ok);
  }

  private async ensureLandmarker(model: ModelVariant, useGpu: boolean): Promise<void> {
    if (this.landmarker && this.model === model && useGpu === this.requestedGpu) return;
    this.requestedGpu = useGpu;
    this.landmarker?.close();
    this.landmarker = null;
    this.status(`포즈 모델(${model}) 로딩 중…`, true);
    // ?mainthread runs inference on the main thread (the pre-worker behaviour), for comparison
    const loaded = await loadLandmarker(model, useGpu, !new URLSearchParams(location.search).has('mainthread'));
    this.landmarker = loaded.landmarker;
    this.delegate = loaded.delegate;
    this.where = loaded.landmarker.where;
    this.gpuError = loaded.gpuError;
    this.model = loaded.model;
    this.gpuRetried = false;
  }

  private async openCamera(o: PoseSourceOptions): Promise<MediaStream> {
    const device = o.deviceId ? { deviceId: { exact: o.deviceId } } : { facingMode: 'user' };
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { ...device, width: { ideal: o.width }, height: { ideal: o.height }, frameRate: { ideal: 60 } },
        audio: false,
      });
    } catch (e) {
      // Some Windows drivers time out on resolution/frame-rate hints. Retry with nothing but the device.
      if (e instanceof Error && e.name === 'NotAllowedError') throw e;
      console.warn('getUserMedia with constraints failed, retrying plain:', e);
      return navigator.mediaDevices.getUserMedia({ video: o.deviceId ? device : true, audio: false });
    }
  }

  /** Starts (or restarts) camera + inference. Throws with a readable message on failure. */
  async start(o: PoseSourceOptions): Promise<void> {
    this.stop();
    this.opts = o;
    try {
      await this.ensureLandmarker(o.model, o.useGpu);
      this.status('카메라 여는 중…', true);
      this.stream = await this.openCamera(o);
      this.video.srcObject = this.stream;
      await this.video.play();
    } catch (e) {
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      const hint = cameraErrorHint(e);
      throw new Error(`시작 실패 — ${msg}${hint ? `  → ${hint}` : ''}`);
    }
    this.cameraFps = this.stream.getVideoTracks()[0].getSettings().frameRate;
    this.aspect = this.video.videoWidth / this.video.videoHeight;
    this.running = true;
    this.status('');
    this.startFrameLoop();
  }

  stop(): void {
    this.running = false;
    this.loopGen++;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  // Inference runs on the newest camera frame as soon as the previous one returns (Shadow Mitts M3).
  private onNewVideoFrame(): void {
    this.frameReady = true;
    this.wakeLoop?.();
    this.wakeLoop = null;
  }

  private startFrameLoop(): void {
    const gen = ++this.loopGen;
    const alive = () => gen === this.loopGen && this.stream !== null;
    const video = this.video;
    if (typeof (video as { requestVideoFrameCallback?: unknown }).requestVideoFrameCallback === 'function') {
      const watch = () => {
        if (!alive()) return;
        video.requestVideoFrameCallback(() => {
          this.onNewVideoFrame();
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
          this.onNewVideoFrame();
        }
        requestAnimationFrame(poll);
      };
      requestAnimationFrame(poll);
    }
    void (async () => {
      while (alive()) {
        if (!this.frameReady) {
          await new Promise<void>((r) => (this.wakeLoop = r));
          continue;
        }
        this.frameReady = false;
        if (alive()) await this.processFrame();
      }
    })();
  }

  private async processFrame(): Promise<void> {
    if (!this.landmarker || !this.running) return;
    // detectForVideo(videoFrame, timestamp) — ms, must strictly increase (vision.d.ts 1.0.1)
    const ts = Math.max(this.lastTs + 1, performance.now());
    this.lastTs = ts;
    let frame: RecordedFrame;
    try {
      const res = await this.landmarker.detect(this.video, ts);
      if (!this.running) return;
      this.lastInferMs = res.inferMs;
      this.inferMs = Number.isNaN(this.inferMs) ? res.inferMs : this.inferMs * 0.9 + res.inferMs * 0.1;
      frame = { t: ts, lm: res.lm, wl: res.wl, ms: res.inferMs };
    } catch (e) {
      // the detector was replaced (model/GPU switch) while this frame was in flight
      if (e instanceof Error && e.message === 'closed') return;
      console.error('detectForVideo failed', e);
      if (this.delegate === 'GPU' && !this.gpuRetried && this.opts) {
        this.gpuRetried = true;
        this.status('GPU 추론 실패 → CPU로 재시도합니다');
        this.running = false;
        try {
          await this.ensureLandmarker(this.opts.model, false);
          this.opts = { ...this.opts, useGpu: false };
          this.running = true;
          this.status('');
        } catch (e2) {
          this.status(`CPU 로딩도 실패: ${e2 instanceof Error ? e2.message : String(e2)}`);
        }
      } else {
        this.status(`추론 오류: ${e instanceof Error ? e.message : String(e)}`);
      }
      return;
    }
    this.countFps();
    this.onFrame?.(frame);
  }

  private countFps(): void {
    this.fpsCount++;
    const now = performance.now();
    if (now - this.fpsWindowStart >= 1000) {
      this.fps = (this.fpsCount * 1000) / (now - this.fpsWindowStart);
      this.fpsCount = 0;
      this.fpsWindowStart = now;
    }
  }

  /** "CPU · 별도 스레드" etc. */
  describe(): string {
    if (!this.delegate) return '-';
    const where = this.where === 'worker' ? '별도 스레드' : '메인 스레드';
    return this.gpuError ? `${this.delegate} · ${where} (GPU 실패: ${this.gpuError})` : `${this.delegate} · ${where}`;
  }
}
