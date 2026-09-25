// Dev gallery: every species model side by side under the reservoir lighting (models.html).
// Each model is normalised to the same length so shapes and patterns can be compared.

import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { SPECIES, TIER_NAME } from '../core/species';
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
const items = SPECIES.map((sp, i) => {
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
  return { m, el };
});
const rows = Math.ceil(SPECIES.length / COLS);
camera.position.set(0, -((rows - 1) * 0.95) / 2, 9.2);

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
  for (const { m, el } of items) {
    m.rotation.y = 0.35 + Math.sin(t / 2000) * 0.25;
    (m.userData.tail as THREE.Object3D | undefined)?.rotation.set(0, Math.sin(t / 150) * 0.3, 0);
    v.copy(m.position).add(new THREE.Vector3(0, -0.42, 0)).project(camera);
    el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
