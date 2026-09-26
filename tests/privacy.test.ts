// M4 인면어 privacy checklist (DESIGN.md §6, reviewed with the user 2026-09-26; docs/PRIVACY.md), checked
// on the source itself so a later change can't quietly break it:
//  1. nothing in the app sends data anywhere — no network API in any source file (assets are loaded by
//     three.js / MediaPipe with plain GETs of fixed URLs; the game page's CSP blocks every other host);
//  2. the face lives only in IndexedDB (face.ts) — never in localStorage, a URL or a download;
//  3. it can be deleted (the whole database);
//  4. the capture asks for consent and says the photo stays on this device.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|js|mjs)$/.test(f) ? [p] : [];
  });
}
const src = files('src').map((p) => ({ p, code: readFileSync(p, 'utf8') }));
const html = readFileSync('index.html', 'utf8');
const face = readFileSync('src/app/face.ts', 'utf8');
/** code without comments, so a comment that names an API doesn't count */
const strip = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('privacy: the camera and the saved face never leave the browser', () => {
  it('no source file uses a network API', () => {
    const NET = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|new\s+WebSocket|EventSource|RTCPeerConnection|navigator\.share\b|\.submit\s*\(/;
    const hits = src.filter((f) => NET.test(strip(f.code))).map((f) => f.p);
    expect(hits).toEqual([]);
  });

  it('the face module only uses IndexedDB — no localStorage, URLs, downloads or other modules that could send it', () => {
    const code = strip(face);
    expect(code).toMatch(/indexedDB\.open/);
    expect(code).toMatch(/indexedDB\.deleteDatabase/); // deleting removes everything
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie|toDataURL|createObjectURL|https?:\/\/|\.download\b/);
    const imports = [...code.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    expect(imports).toEqual(['../core/pose']); // types only
  });

  it('nothing else puts the face in browser storage or a URL', () => {
    for (const f of src) {
      const code = strip(f.code);
      // the only storage keys the app writes (store.set) are settings and records — never the face
      for (const m of code.matchAll(/store\.set\(\s*'([^']+)'/g)) expect(['records.v1', 'rodHand', 'camera', 'howto.v1', 'pipSize', 'muted', 'preset', 'tsRole', 'tsSpace']).toContain(m[1]);
      if (f.p.endsWith('face.ts')) continue;
      expect(code, f.p).not.toMatch(/faceShot[^;\n]*(toDataURL|toBlob|createObjectURL)/);
    }
  });

  it('the game page only lets the browser connect to itself and the pose model hosts', () => {
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
    const connect = csp.match(/connect-src ([^;]+)/)?.[1].trim().split(/\s+/) ?? [];
    // blob: / data: are in-page memory (textures inside the 3D models), not the network
    expect(connect.sort()).toEqual(["'self'", 'blob:', 'data:', 'https://cdn.jsdelivr.net', 'https://storage.googleapis.com'].sort());
    expect(csp).toMatch(/img-src 'self' data: blob:/);
    expect(csp).toMatch(/form-action 'none'/);
  });

  it('the capture asks for consent first and says where the photo is kept', () => {
    expect(html).toMatch(/id="faceAgree"/);
    expect(html).toMatch(/이 기기\(브라우저\)에만 저장/);
    expect(html).toMatch(/전송되지 않아요/);
    expect(html).toMatch(/나만<\/b> 보이게/);
    expect(html).toMatch(/지울 수 있어요/);
  });
});
