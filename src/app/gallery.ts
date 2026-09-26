// Dev gallery: every species model side by side under the reservoir lighting (models.html).
// Each model is normalised to the same length so shapes and patterns can be compared.

import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { EVENT_NAME, SPECIES, TIER_NAME, type EventKind } from '../core/species';
import { buildAnimal } from './animals';
import { loadSpecies, setSwimTime, swim } from './fishAssets';
import { buildSpecies } from './fishModels';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a2226);
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(2, 3, 4);
scene.add(sun);

const COLS = 6;
/** `?only=id,id` shows just those species (checking new models) */
const only = new URLSearchParams(location.search).get('only')?.split(',');
const LIST = only ? SPECIES.filter((sp) => only.includes(sp.id)) : SPECIES;
const items = LIST.map((sp, i) => {
  const m = buildSpecies(sp.id);
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  m.position.set((col - (COLS - 1) / 2) * 1.25, -row * 0.95, 0);
  m.rotation.y = 0.35;
  scene.add(m);
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `${sp.name} <small>${TIER_NAME[sp.tier]}</small>`;
  document.body.append(el);
  const item = { m: m as THREE.Object3D, el };
  // swap in the real model once it has loaded (procedural until then, or for good if there is none)
  void loadSpecies(sp.id).then((real) => {
    if (!real.userData.real) return;
    real.position.copy(m.position);
    scene.remove(m);
    scene.add(real);
    item.m = real;
    el.innerHTML += ' <small>실사</small>';
  });
  return item;
});
// interference animals on the last row, shrunk to fit the grid
const ANIMALS: [EventKind, number][] = [['otter', 0.9], ['orca', 0.15], ['crocodile', 0.24], ['hippo', 0.55]];
const animalRow = Math.ceil(LIST.length / COLS);
if (!only) ANIMALS.forEach(([k, sc], i) => {
  const m = buildAnimal(k);
  m.scale.setScalar(sc);
  m.position.set((i - 1.5) * 1.5, -animalRow * 0.95, 0);
  m.rotation.y = 0.35;
  scene.add(m);
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = `${EVENT_NAME[k]} <small>동물</small>`;
  document.body.append(el);
  items.push({ m, el });
});
const rows = animalRow + 1;
// far enough back that every row fits (46 species = 8 rows + animals)
camera.position.set(0, -((rows - 1) * 0.95) / 2, Math.max(9.2, rows * 1.25));

new HDRLoader().load(`${import.meta.env.BASE_URL}env/bell_park_pier_1k.hdr`, (hdr) => {
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(hdr).texture;
  (window as unknown as { __galleryReady: boolean }).__galleryReady = true;
});

function resize(): void {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const v = new THREE.Vector3();
function loop(t: number): void {
  setSwimTime(t / 1000);
  for (const { m, el } of items) {
    m.rotation.y = 0.35 + Math.sin(t / 2000) * 0.25;
    swim(m, t);
    v.copy(m.position).add(new THREE.Vector3(0, -0.42, 0)).project(camera);
    el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
