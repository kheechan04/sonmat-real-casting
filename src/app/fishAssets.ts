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
}

/** Species that have a real model, and how to orient it. */
export const MODELS: Record<string, ModelDef> = {
  tilapia: { rot: [0, -90, 0] },
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
    m.geometry = m.geometry.clone();
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
    m.geometry.computeBoundingSphere();
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    m.scale.set(1, 1, 1);
    m.material = swimMaterial(m.material as THREE.MeshStandardMaterial, def.tint);
    g.add(m);
  }
  g.userData.real = true;
  return g;
}

function cloneModel(src: THREE.Group): THREE.Group {
  const g = src.clone(true); // geometry + materials are shared; only the object tree is copied
  g.userData = { ...src.userData };
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
          diffuseColor.rgb = uTint * (0.35 + 1.4 * lum);`,
        );
    }
  };
  mat.customProgramCacheKey = () => (tint !== undefined ? `swim-tint` : 'swim');
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
