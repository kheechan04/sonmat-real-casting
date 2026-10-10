// Raw fish models → game-ready files: assets-src/models/raw/<id>.glb → public/models/fish/<id>.glb
// (1024 px WebP textures, meshopt-compressed; ~0.5 MB generated models, ~1.3 MB scans).
//
//   node scripts/build-fish.mjs [id …]
//
// Raw files: Sketchfab scans (scripts/fetch-models.mjs) or TRELLIS.2 output (docs/ASSETS.md). Not in git.
// The ffish.asia scans carry a small colour-checker card next to the fish: for those, meshes under 2%
// of the biggest one's vertices are dropped.
// Photogrammetry textures are cut into thousands of tiny pieces: simplified below ~100k triangles,
// triangles start to span the gaps between pieces (dark / white speckles — locked borders, protected
// seams and UV weights all gave the same). So scans stop at 100k; generated models (few, large pieces) at 20k.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, metalRough, normals, prune, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp'; // comes with @gltf-transform/cli

const TARGET_TRIS = { scan: 100000, other: 20000 };
const RAW = 'assets-src/models/raw';
const OUT = 'public/models/fish';
mkdirSync(OUT, { recursive: true });
const only = new Set(process.argv.slice(2));
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

/** Simplify every primitive to ~ratio of its triangles (meshoptimizer keeps UV seams by default). */
function simplifyUV(doc, ratio) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const posA = prim.getAttribute('POSITION');
      const uvA = prim.getAttribute('TEXCOORD_0');
      const idxA = prim.getIndices();
      if (!idxA) continue;
      const n = posA.getCount();
      const pos = new Float32Array(n * 3);
      const uv = new Float32Array(n * 2);
      const e3 = [0, 0, 0];
      const e2 = [0, 0];
      for (let i = 0; i < n; i++) {
        pos.set(posA.getElement(i, e3), i * 3);
        if (uvA) uv.set(uvA.getElement(i, e2), i * 2);
      }
      const idx = Uint32Array.from(idxA.getArray());
      const target = Math.max(3, Math.floor((idx.length * ratio) / 3) * 3);
      let [out] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, uv, 2, [1, 1], null, target, 0.05);
      // a texture cut into countless tiny pieces locks nearly every vertex (the porcupinefish scan kept
      // 99%): fall back to the sloppy simplifier, which ignores seams — vertices keep their UVs
      if (out.length > target * 1.5) [out] = MeshoptSimplifier.simplifySloppy(idx, pos, 3, null, target, 0.02);
      idxA.setArray(out);
      compactPrimitive(prim);
    }
  }
}

/**
 * Texture → vertex colours, for a generated model whose texture is cut into so many small pieces that
 * simplifying tears it (the vampire squid: even the seam-keeping simplifier stalled at 208k triangles,
 * and the fallbacks joined vertices from far-apart pieces — chrome and black speckles all over). Each
 * position gets the average colour of its copies, the UVs and textures go, and the mesh can then be
 * simplified freely with the colour as an attribute. Fine for an animal of one or two colours.
 */
async function bakeVertexColors(doc) {
  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const tex = mat?.getBaseColorTexture();
      const uvA = prim.getAttribute('TEXCOORD_0');
      if (!tex || !uvA) continue;
      const { data, info } = await sharp(Buffer.from(tex.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const { width: W, height: H } = info;
      const posA = prim.getAttribute('POSITION');
      const n = posA.getCount();
      // one vertex per position, colour = mean of the texels under its copies
      const key = new Map();
      const remap = new Uint32Array(n);
      const pos = [];
      const sum = [];
      const p = [0, 0, 0];
      const uv = [0, 0];
      for (let i = 0; i < n; i++) {
        posA.getElement(i, p);
        const k = p.join();
        let v = key.get(k);
        if (v === undefined) {
          v = pos.length / 3;
          key.set(k, v);
          pos.push(...p);
          sum.push(0, 0, 0, 0);
        }
        remap[i] = v;
        uvA.getElement(i, uv);
        const x = Math.min(W - 1, Math.max(0, Math.floor(uv[0] * W)));
        const y = Math.min(H - 1, Math.max(0, Math.floor(uv[1] * H)));
        for (let c = 0; c < 3; c++) sum[v * 4 + c] += toLinear(data[(y * W + x) * 3 + c] / 255);
        sum[v * 4 + 3]++;
      }
      const m = pos.length / 3;
      const col = new Float32Array(m * 3);
      for (let v = 0; v < m; v++) for (let c = 0; c < 3; c++) col[v * 3 + c] = sum[v * 4 + c] / sum[v * 4 + 3];
      const idx = Uint32Array.from(prim.getIndices().getArray(), (i) => remap[i]);
      const buf = posA.getBuffer();
      for (const s of prim.listSemantics()) prim.setAttribute(s, null);
      prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(pos)).setBuffer(buf));
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(buf));
      prim.getIndices().setArray(idx);
      mat.setBaseColorTexture(null).setMetallicRoughnessTexture(null).setNormalTexture(null).setMetallicFactor(0).setRoughnessFactor(0.5);
    }
  await doc.transform(prune());
}

const SOURCES = JSON.parse(readFileSync('assets-src/models/sources.json', 'utf8'));
const SCANS = new Set(SOURCES.filter((s) => s.user.startsWith('ffishAsia')).map((s) => s.id));
/** other photogrammetry scans (hundreds of thousands of faces, texture in tiny pieces): the scan budget too */
const DENSE = new Set(SOURCES.filter((s) => s.faces > 300000).map((s) => s.id));
/** generated models whose texture came out in many small pieces: simplifying tears it (bakeVertexColors) */
const TORN = new Set(['vampire_squid', 'dumbo', 'barreleye']);
const verts = (mesh) => mesh.listPrimitives().reduce((n, p) => n + p.getAttribute('POSITION').getCount(), 0);
const tris = (mesh) => mesh.listPrimitives().reduce((n, p) => n + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0);

for (const f of readdirSync(RAW).filter((x) => x.endsWith('.glb'))) {
  const id = f.replace(/\.glb$/, '');
  if (only.size && !only.has(id)) continue;
  const scan = SCANS.has(id);
  const doc = await io.read(`${RAW}/${f}`);
  const meshes = doc.getRoot().listMeshes();
  const biggest = Math.max(...meshes.map(verts));
  let dropped = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (mesh && scan && verts(mesh) < biggest * 0.02) {
      node.setMesh(null);
      dropped++;
    }
  }
  // rigged models (the great white): keep the bind pose, drop the skeleton and its animations — the game
  // swims every fish with the same vertex-shader wave (fishAssets.ts)
  for (const node of doc.getRoot().listNodes()) node.setSkin(null);
  for (const skin of doc.getRoot().listSkins()) skin.dispose();
  for (const anim of doc.getRoot().listAnimations()) anim.dispose();
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) for (const a of ['JOINTS_0', 'WEIGHTS_0']) prim.setAttribute(a, null);
  doc.setLogger({ debug() {}, info() {}, warn: console.warn, error: console.error });
  // old spec/gloss materials (the lungfish scan) → metal/rough, or three.js shows them untextured white
  const specGloss = doc.getRoot().listExtensionsUsed().some((e) => e.extensionName === 'KHR_materials_pbrSpecularGlossiness');
  await doc.transform(...(specGloss ? [metalRough()] : []), prune());
  const total = doc.getRoot().listMeshes().reduce((n, m) => n + tris(m), 0);
  const ratio = Math.min(1, TARGET_TRIS[scan || DENSE.has(id) ? 'scan' : 'other'] / total);
  await doc.transform(weld());
  if (TORN.has(id)) await bakeVertexColors(doc);
  simplifyUV(doc, ratio);
  if (TORN.has(id)) await doc.transform(normals({ overwrite: true })); // the bake dropped them
  const tmp = join(tmpdir(), `fish-${id}.glb`);
  await io.write(tmp, doc);
  const out = `${OUT}/${id}.glb`;
  execFileSync(
    process.execPath,
    ['node_modules/@gltf-transform/cli/bin/cli.js', 'optimize', tmp, out, '--compress', 'meshopt', '--texture-compress', 'webp',
      '--texture-size', '1024', '--simplify', 'false'],
    { stdio: 'ignore' },
  );
  rmSync(tmp);
  if (!existsSync(out)) throw new Error(`${id}: optimize failed`);
  const after = (await io.read(out)).getRoot().listMeshes().reduce((n, m) => n + tris(m), 0);
  console.log(`${id}: ${Math.round(total / 1000)}k → ${Math.round(after / 1000)}k tris${dropped ? `, ${dropped} extra mesh(es) dropped` : ''}, ${(statSync(out).size / 1e6).toFixed(2)} MB`);
}
