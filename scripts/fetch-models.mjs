// Download the fish models listed in assets-src/models/sources.json from Sketchfab (CC0 / CC-BY,
// picked by hand — see docs/ASSETS.md) into assets-src/models/raw/<id>.glb (not in git).
//
//   node scripts/fetch-models.mjs [id …]
//
// Sketchfab only lets logged-in users download. Put your API token (sketchfab.com → Settings →
// Password & API → API Token) in a file OUTSIDE the project: %USERPROFILE%\.sketchfab-token
// (or set SKETCHFAB_TOKEN_FILE). The token is read from there and never printed or saved.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const tokenFile = process.env.SKETCHFAB_TOKEN_FILE ?? join(homedir(), '.sketchfab-token');
if (!existsSync(tokenFile)) {
  console.error(`No token file at ${tokenFile} — see the comment at the top of this script.`);
  process.exit(1);
}
const token = readFileSync(tokenFile, 'utf8').trim();
const only = new Set(process.argv.slice(2));
const sources = JSON.parse(readFileSync('assets-src/models/sources.json', 'utf8'));
mkdirSync('assets-src/models/raw', { recursive: true });

for (const s of sources) {
  if (only.size && !only.has(s.id)) continue;
  const out = `assets-src/models/raw/${s.id}.glb`;
  if (existsSync(out)) {
    console.log(`${s.id}: already downloaded`);
    continue;
  }
  const res = await fetch(`https://api.sketchfab.com/v3/models/${s.uid}/download`, { headers: { Authorization: `Token ${token}` } });
  if (!res.ok) {
    console.error(`${s.id}: download link failed (${res.status}${res.status === 401 ? ' — token wrong or expired' : ''})`);
    continue;
  }
  const links = await res.json();
  const link = links.glb?.url;
  if (!link) {
    console.error(`${s.id}: no GLB offered (formats: ${Object.keys(links).join(', ')})`);
    continue;
  }
  const file = await fetch(link);
  const buf = Buffer.from(await file.arrayBuffer());
  writeFileSync(out, buf);
  console.log(`${s.id}: ${(buf.length / 1e6).toFixed(1)} MB (${s.lic}, ${s.user})`);
}
