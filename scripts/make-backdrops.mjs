// Web-ready backdrops: keep only the part of each 8K panorama above the shore line (the game
// replaces everything below it with a mirror image anyway — scene.ts backdropFromTop) and save it
// as WebP. Uses headless Chrome's canvas encoder, so no image library is needed.
//
//   node scripts/make-backdrops.mjs        (needs: npm i --no-save puppeteer-core, Chrome installed)
//
// Source: assets-src/env/<photo>.jpg (Poly Haven tonemapped JPG, CC0, not deployed) → public/env/<photo>_top.webp

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer-core');

/** shore row as a fraction of the photo height — must match PLACES in src/app/scene.ts */
const PHOTOS = {
  bell_park_pier: 2036 / 4096,
  simons_town_rocks: 0.5,
  the_sky_is_on_fire: 0.5,
  river_rocks: 0.53,
};
const QUALITY = 0.82;

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new' });
const page = await browser.newPage();
for (const [name, shore] of Object.entries(PHOTOS)) {
  const jpg = readFileSync(`assets-src/env/${name}.jpg`).toString('base64');
  const b64 = await page.evaluate(
    async (data, shore, q) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${data}`;
      await img.decode();
      const h = Math.ceil(shore * img.height);
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/webp', q));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    },
    jpg,
    shore,
    QUALITY,
  );
  const out = Buffer.from(b64, 'base64');
  writeFileSync(`public/env/${name}_top.webp`, out);
  console.log(`${name}: ${(jpg.length * 0.75 / 1e6).toFixed(1)} MB jpg → ${(out.length / 1e6).toFixed(1)} MB webp (top ${Math.round(shore * 100)}%)`);
}
await browser.close();
