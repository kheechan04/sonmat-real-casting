// M4 인면어: the player's face, cut from the webcam and kept ONLY in this browser (IndexedDB).
//
// Privacy (DESIGN.md §6 checklist, reviewed with the user before this code — docs/PRIVACY.md):
//  - nothing here talks to the network — no fetch / XHR / beacon / socket (tests/privacy.test.ts scans
//    every source file for those; the game page's CSP also blocks any other host, index.html);
//  - the photo is stored in IndexedDB under this site only, never in localStorage or a URL;
//  - deleteFace() removes it for good; the 인면어 stops appearing at once;
//  - the capture needs an explicit "확인했어요" first, and shows the crop so the player can retake it.

import type { P4 } from '../core/pose';

const DB = 'sonmat-face';
const STORE = 'face';
const KEY = 'face';
/** Saved face size, px (square). Small on purpose: it is a fish's face, not a photo archive. */
export const FACE_PX = 256;
/**
 * The face is cut as an oval this much taller than wide and stored squeezed into the square — the
 * fish (fishModels faceSkin) and the previews (an oval frame, game.css) stretch it back.
 */
export const FACE_ASPECT = 1.3;

/** Pose landmarks used to find the face (MediaPipe pose: nose, eyes, ears, mouth). */
const NOSE = 0;
const EYE_L = 2;
const EYE_R = 5;
const EAR_L = 7;
const EAR_R = 8;
const MOUTH_L = 9;
const MOUTH_R = 10;

/**
 * Just the face — forehead to chin, cheek to cheek, no hair or background (user: "여백 없이 얼굴로만 꽉
 * 채워지게"): an oval as wide as the ears are apart and FACE_ASPECT times as tall, around the eyes and
 * nose, with a thin soft edge so it blends into the fish. null when the face isn't clearly seen.
 */
export function cropFace(video: HTMLVideoElement, lm: P4[] | null, out?: HTMLCanvasElement): HTMLCanvasElement | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!lm || !w || !h) return null;
  const vis = (i: number) => lm[i][3] >= 0.5;
  if (!vis(NOSE) || !vis(EYE_L) || !vis(EYE_R)) return null;
  const px = (i: number) => ({ x: lm[i][0] * w, y: lm[i][1] * h });
  const nose = px(NOSE);
  const eyes = { x: (px(EYE_L).x + px(EYE_R).x) / 2, y: (px(EYE_L).y + px(EYE_R).y) / 2 };
  const eyeD = Math.hypot(px(EYE_L).x - px(EYE_R).x, px(EYE_L).y - px(EYE_R).y);
  const earD = vis(EAR_L) && vis(EAR_R) ? Math.hypot(px(EAR_L).x - px(EAR_R).x, px(EAR_L).y - px(EAR_R).y) : 0;
  let fw = earD ? earD * 0.95 : eyeD * 2.3;
  let fh = fw * FACE_ASPECT;
  // the eyes sit a little above the middle of a face (≈ 42% down from the hairline)
  const cx = (eyes.x + nose.x) / 2;
  let cy = eyes.y + fh * 0.08;
  if (vis(MOUTH_L) && vis(MOUTH_R)) {
    // with the mouth seen, size the height from it so the mouth and chin are always in (user: "눈코입 다
    // 들어가게 … 입쪽이 좀 잘려"): hairline ≈ 1 eye→mouth above the eyes, chin ≈ 0.8 below the mouth
    const mouthY = (px(MOUTH_L).y + px(MOUTH_R).y) / 2;
    const em = mouthY - eyes.y;
    if (em > 0) {
      const top = eyes.y - em * 1.0;
      const bottom = mouthY + em * 0.8;
      fh = Math.max(bottom - top, fh);
      fw = fh / FACE_ASPECT;
      cy = (top + bottom) / 2;
    }
  }
  if (fw < 30) return null; // too far away to be a face worth keeping
  const c = out ?? document.createElement('canvas');
  c.width = c.height = FACE_PX;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, FACE_PX, FACE_PX);
  g.drawImage(video, cx - fw / 2, cy - fh / 2, fw, fh, 0, 0, FACE_PX, FACE_PX);
  // the oval fills the square (it is squeezed); only the outer 12% fades
  g.globalCompositeOperation = 'destination-in';
  const grad = g.createRadialGradient(FACE_PX / 2, FACE_PX / 2, FACE_PX * 0.38, FACE_PX / 2, FACE_PX / 2, FACE_PX * 0.5);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, FACE_PX, FACE_PX);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Save the face (PNG blob) in this browser. */
export async function saveFace(face: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob | null>((r) => face.toBlob(r, 'image/png'));
  if (!blob) throw new Error('could not encode the face');
  await withStore('readwrite', (s) => s.put(blob, KEY));
}

/** The saved face as an image, or null (none saved, or storage unavailable — e.g. a private window). */
export async function loadFace(): Promise<ImageBitmap | null> {
  try {
    const blob = await withStore<Blob | undefined>('readonly', (s) => s.get(KEY) as IDBRequest<Blob | undefined>);
    return blob ? await createImageBitmap(blob) : null;
  } catch {
    return null;
  }
}

/** Remove the saved face for good (the whole database, so nothing is left behind). */
export function deleteFace(): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(); // closed connections finish the delete right after
  });
}
