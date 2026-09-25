// Raw fish models → game-ready files: assets-src/models/raw/<id>.glb → public/models/fish/<id>.glb
// (≈ 20k triangles, 1024 px WebP textures, meshopt-compressed; ~0.5 MB each).
//
//   node scripts/build-fish.mjs [id …]
//
// Raw files: Sketchfab scans (scripts/fetch-models.mjs) or TRELLIS.2 output (docs/ASSETS.md). Not in git.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const TARGET_TRIS = 20000;
const RAW = 'assets-src/models/raw';
const OUT = 'public/models/fish';
mkdirSync(OUT, { recursive: true });
const only = new Set(process.argv.slice(2));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

for (const f of readdirSync(RAW).filter((x) => x.endsWith('.glb'))) {
  const id = f.replace(/\.glb$/, '');
  if (only.size && !only.has(id)) continue;
  const doc = await io.read(`${RAW}/${f}`);
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) tris += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION').getCount()) / 3;
  const ratio = Math.min(1, TARGET_TRIS / tris);
  const out = `${OUT}/${id}.glb`;
  execFileSync(
    process.execPath,
    ['node_modules/@gltf-transform/cli/bin/cli.js', 'optimize', `${RAW}/${f}`, out, '--compress', 'meshopt', '--texture-compress', 'webp',
      '--texture-size', '1024', '--simplify-ratio', ratio.toFixed(4), '--simplify-error', '0.004'],
    { stdio: 'ignore' },
  );
  if (!existsSync(out)) throw new Error(`${id}: optimize failed`);
  console.log(`${id}: ${Math.round(tris / 1000)}k tris → ~${Math.round((tris * ratio) / 1000)}k, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}
