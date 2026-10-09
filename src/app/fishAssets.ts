// Real 3D fish models (user, M2 playtest: "진짜 실제 물고기처럼 생겼으면 좋겠어").
// public/models/fish/<id>.glb — scans (ffish.asia, CC0) or models generated from a licensed photo with
// TRELLIS.2 (MIT); sources in docs/ASSETS.md, built by scripts/build-fish.mjs. Species without a file
// keep the procedural model from fishModels.ts, which is also the fallback while a file loads.
//
// Every model is turned into the house convention at load time (fishModels.ts): 1 unit long along +x,
// head at +x, back up, centred. The body swims by a vertex-shader wave that grows toward the tail.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildSpecies } from './fishModels';

const BASE = import.meta.env.BASE_URL;

interface ModelDef {
  /** file name in public/models/fish (default: <id>.glb) */
  file?: string;
  /** turn the file into the convention: Euler degrees (XYZ), applied before normalising */
  rot?: [number, number, number];
  /** multiply the texture with this colour, after turning it grey (황쏘가리 = 쏘가리 in gold) */
  tint?: number;
  /** mirror top ↔ bottom after turning (a flatfish shown eyed-side-on with its head right has its
   *  dorsal edge down — anatomically right, but reads as upside down; user: "대광어 … 뒤집혀서") */
  flipY?: boolean;
  /** colour for an untextured model's light-coloured parts (a grey sculpt → a living animal) */
  color?: number;
  /** add a glowing lure on the forehead (the goosefish scan stands in for a deep-sea anglerfish) */
  lure?: boolean;
}

/** Species that have a real model, and how to orient it. */
export const MODELS: Record<string, ModelDef> = {
  // ffish.asia scans: head at −x, back up
  crucian: { rot: [0, 180, 0] },
  carp: { rot: [0, 180, 0] },
  bass: { rot: [0, 180, 0] },
  catfish: { rot: [0, 180, 0] },
  snakehead: { rot: [0, 180, 0] },
  mandarin: { rot: [0, 180, 0] },
  golden_mandarin: { file: 'mandarin.glb', rot: [0, 180, 0], tint: 0xffc23a }, // 황쏘가리 = 금빛 쏘가리
  rockfish: { rot: [0, 180, 0] },
  red_seabream: { rot: [0, 180, 0] },
  flounder: { rot: [90, 180, 0], flipY: true }, // scanned lying flat: stood up, eyed side to the camera
  seabass: { rot: [0, 180, 0] },
  yellowtail: { rot: [0, 180, 0] },
  tuna: { rot: [0, 180, 0] },
  hammerhead: { rot: [0, 180, 0] },
  isopod: { rot: [0, 180, 0] },
  anglerfish: { rot: [0, 180, 0], lure: true },
  // added 2026-09-26 (more species) — ffish.asia scans. Flat animals are shown from above (back to the
  // camera, head right), like the flounder: a turtle, octopus, squid or ray side-on is just a thin line
  softshell: { rot: [90, 180, 0] },
  eel: { rot: [0, 180, 0] },
  octopus: { rot: [90, 180, 0] },
  puffer: { rot: [0, 180, 0] },
  lionfish: { rot: [0, 180, 0] },
  moray: { rot: [0, 180, 0] },
  bigfin_squid: { rot: [90, 180, 0] },
  stingray: { rot: [90, 180, 0] },
  // others
  great_white: { rot: [90, 0, -90] }, // modelled head-up along +y ([-90, 0, -90] showed it belly-up)
  nile_perch: {}, // barramundi (same genus) — already head +x
  tilapia: { rot: [0, -90, 0] }, // TRELLIS.2: head −z
  // TRELLIS.2 from licensed photos (2026-09-27, docs/ASSETS.md)
  alfonsino: { rot: [0, 90, 0] }, // head +z
  bichir: { rot: [0, 180, 0], tint: 0x8a8a5a }, // the only full-body free photo was an albino → olive, keeping the pattern
  elephantfish: { rot: [0, 90, 0] }, // head +z
  vundu: { rot: [0, 90, 0] }, // head +z
  blobfish: { rot: [0, 90, 0] }, // head +z
  electric_catfish: { rot: [0, 90, 0] }, // head +z
  tigerfish: { rot: [0, 90, 0] }, // head +z
  sunfish: { rot: [0, 180, 0] }, // head −x
  dumbo: { rot: [0, 90, 0] }, // mantle +z → mantle ahead, arms trailing
  vampire_squid: {}, // mantle +x already
  marlin: { rot: [0, 180, 0] }, // head −x
  goblin_shark: { rot: [0, 90, 0] }, // head +z
  porcupinefish: {},
  giant_squid: { rot: [0, 0, -90], color: 0xa8402f }, // sculpted mantle-up, untextured → mantle ahead, deep red
  coelacanth: { rot: [0, 90, 0] }, // head +z
  gulper: { rot: [0, 90, 0] }, // head +z
  lungfish: { rot: [0, -46, 0] }, // scanned lying diagonally (body axis −46° in x–z, head at the thicker end)
};

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<THREE.Group | null>>();

/** Shared clock for every swimming fish (seconds). */
const swimTime = { value: 0 };

export function setSwimTime(s: number): void {
  swimTime.value = s;
}

/**
 * The species' model: the real one when it has a file (loaded once, then cloned), else the procedural
 * one. Never rejects — a missing / broken file falls back to the procedural model.
 */
export async function loadSpecies(id: string): Promise<THREE.Group> {
  const def = MODELS[id];
  if (!def) return buildSpecies(id);
  let p = cache.get(id);
  if (!p) {
    p = loadModel(def.file ?? `${id}.glb`, def).catch((e) => {
      console.warn(`fish model ${id} failed, using the procedural one`, e);
      return null;
    });
    cache.set(id, p);
  }
  const m = await p;
  return m ? cloneModel(m) : buildSpecies(id);
}

async function loadModel(file: string, def: ModelDef): Promise<THREE.Group> {
  const gltf = await loader.loadAsync(`${BASE}models/fish/${file}`);
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const turn = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(...((def.rot ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [number, number, number])),
  );
  // bake every mesh's world transform + the turn into its geometry, so the model is one flat group
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const box = new THREE.Box3();
  for (const m of meshes) {
    m.geometry = dequantize(m.geometry);
    m.geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(turn, m.matrixWorld));
    m.geometry.computeBoundingBox();
    box.union(m.geometry.boundingBox!);
  }
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const norm = new THREE.Matrix4().makeScale(1 / size.x, 1 / size.x, 1 / size.x).multiply(new THREE.Matrix4().makeTranslation(-centre.x, -centre.y, -centre.z));
  const g = new THREE.Group();
  for (const m of meshes) {
    m.geometry.applyMatrix4(norm);
    if (def.flipY) mirrorY(m.geometry);
    m.geometry.computeBoundingSphere();
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    m.material = swimMaterial(m.material as THREE.MeshStandardMaterial, def.tint);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (def.color !== undefined && !mat.map && mat.color.getHSL({ h: 0, s: 0, l: 0 }).l > 0.4) mat.color.setHex(def.color);
    g.add(m);
  }
  if (def.lure) addLure(g, size.y / size.x / 2);
  g.userData.real = true;
  return g;
}

/** Illicium + glowing esca on the forehead; the bulb pulses via userData.glow (scene.ts). */
function addLure(g: THREE.Group, top: number): void {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.3, top * 0.7, 0), new THREE.Vector3(0.36, top + 0.2, 0), new THREE.Vector3(0.52, top + 0.1, 0));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.005, 6), new THREE.MeshStandardMaterial({ color: 0x3a2a22, roughness: 0.6 })));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshStandardMaterial({ color: 0xbffcff, emissive: 0x5ff2ff, emissiveIntensity: 4 }));
  bulb.name = 'lureBulb';
  bulb.position.copy(curve.getPoint(1));
  g.add(bulb);
}

/**
 * A float copy of the geometry. meshopt-compressed files store positions / normals / UVs as 16-bit
 * integers (KHR_mesh_quantization); baking a rotation + scale into those overflowed them (scans turned
 * into stretched boxes).
 */
function dequantize(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.clone();
  for (const [name, attr] of Object.entries(g.attributes)) {
    if (!(attr instanceof THREE.InterleavedBufferAttribute) && attr.array instanceof Float32Array) continue;
    const out = new Float32Array(attr.count * attr.itemSize);
    for (let i = 0; i < attr.count; i++) for (let k = 0; k < attr.itemSize; k++) out[i * attr.itemSize + k] = attr.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(out, attr.itemSize));
  }
  return g;
}

/** Mirror a geometry top ↔ bottom, keeping its faces facing out (a mirror flips the triangle winding). */
function mirrorY(g: THREE.BufferGeometry): void {
  g.applyMatrix4(new THREE.Matrix4().makeScale(1, -1, 1));
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const b = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, b);
    }
    idx.needsUpdate = true;
  }
  g.computeBoundingSphere();
}

function cloneModel(src: THREE.Group): THREE.Group {
  const g = src.clone(true); // geometry + materials are shared; only the object tree is copied
  g.userData = { ...src.userData, glow: g.getObjectByName('lureBulb') };
  return g;
}

/**
 * The glTF material, plus the swim: a sideways (z) wave travelling head → tail, zero at the head and
 * strongest at the tail. Amplitude per model via userData.swim (0 = still), set on the material.
 */
function swimMaterial(src: THREE.MeshStandardMaterial, tint?: number): THREE.MeshStandardMaterial {
  const mat = src.clone();
  mat.roughness = Math.min(mat.roughness, 0.55); // wet skin: the scans come in fully matte
  const amp = { value: 0.035 };
  mat.userData.swimAmp = amp;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSwimT = swimTime;
    shader.uniforms.uSwimAmp = amp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uSwimT;\nuniform float uSwimAmp;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float swimW = smoothstep(0.15, -0.5, transformed.x); // 0 at the head … 1 at the tail
        transformed.z += sin(uSwimT * 9.0 + transformed.x * 7.0) * uSwimAmp * swimW * swimW;`,
      );
    if (tint !== undefined) {
      shader.uniforms.uTint = { value: new THREE.Color(tint) };
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          diffuseColor.rgb = mix(diffuseColor.rgb, uTint * lum * 2.6, 0.85); // gold, keeping the pattern`,
        );
    }
  };
  mat.customProgramCacheKey = () => (tint !== undefined ? 'swim-tint' : 'swim');
  return mat;
}

/** Tail motion for any fish model: the shader wave for real ones, the tail fin for procedural ones. */
export function swim(model: THREE.Object3D, now: number, amount = 1): void {
  if (model.userData.real) {
    model.traverse((o) => {
      const amp = ((o as THREE.Mesh).material as THREE.Material | undefined)?.userData?.swimAmp as { value: number } | undefined;
      if (amp) amp.value = 0.035 * amount;
    });
  } else {
    (model.userData.tail as THREE.Object3D | undefined)?.rotation.set(0, Math.sin(now / 120) * 0.35 * amount, 0);
  }
}
