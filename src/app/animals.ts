// Interference animals (M2, user: "진짜 가끔, 그나마 현실성 있게"): only the parts that show above
// the water are modelled — the opaque water hides the rest. Built in code (no licensing).
// Each model faces +x; y = 0 is the water line when surfaced.

import * as THREE from 'three';
import type { EventKind } from '../core/species';

const mat = (color: number, rough = 0.6, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.5, clearcoatRoughness: 0.3, ...extra });

function eye(r: number, color = 0x111111): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, clearcoat: 1 }));
}

/** Eurasian otter: sleek brown head and a hump of back. ~1 m. */
function otter(): THREE.Group {
  const g = new THREE.Group();
  const fur = mat(0x4a3322, 0.7, { sheen: 1, sheenColor: new THREE.Color(0x8a6a4a) });
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), fur);
  head.scale.set(1.3, 0.9, 1);
  head.position.set(0.28, 0.08, 0);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), mat(0x6b5038));
  muzzle.position.set(0.39, 0.06, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), mat(0x111111, 0.3));
  nose.position.set(0.44, 0.08, 0);
  const back = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.45, 8, 16), fur);
  back.rotation.z = Math.PI / 2;
  back.position.set(-0.05, -0.02, 0);
  g.add(head, muzzle, nose, back);
  for (const z of [1, -1]) {
    const e = eye(0.014);
    e.position.set(0.35, 0.12, z * 0.055);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), fur);
    ear.position.set(0.24, 0.16, z * 0.075);
    g.add(e, ear);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.1, 4), mat(0xdddddd));
      w.rotation.set(Math.PI / 2, 0, 0.3 - i * 0.2);
      w.position.set(0.41, 0.06 - i * 0.008, z * 0.07);
      g.add(w);
    }
  }
  return g;
}

/** Orca: the back and the tall dorsal fin, white eye patch and grey saddle. ~7 m. */
function orca(): THREE.Group {
  const g = new THREE.Group();
  const black = mat(0x0d0f12, 0.35);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), black);
  body.scale.set(3.4, 0.9, 1);
  g.add(body);
  const finShape = new THREE.Shape();
  finShape.moveTo(0.5, 0);
  finShape.quadraticCurveTo(0.2, 0.9, -0.1, 1.8);
  finShape.quadraticCurveTo(-0.2, 0.8, -0.6, 0);
  const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.08, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 }), black);
  fin.position.set(0, 0.8, -0.04);
  g.add(fin);
  const white = mat(0xf2f4f5, 0.4);
  for (const z of [1, -1]) {
    const patch = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 10), white);
    patch.scale.set(1.3, 0.5, 0.2);
    patch.position.set(2.3, 0.35, z * 0.88);
    const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), mat(0x7d858c, 0.5));
    saddle.scale.set(1.4, 0.4, 0.3);
    saddle.position.set(-0.6, 0.62, z * 0.62);
    g.add(patch, saddle);
  }
  return g;
}

/** Nile crocodile: just the eyes, nostrils and the ridged back skim the surface. ~4 m. */
function crocodile(): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(0x3b4028, 0.75, { clearcoat: 0.8 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.32), skin);
  head.position.set(1.4, -0.02, 0);
  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.7, 12), skin);
  snout.rotation.z = Math.PI / 2;
  snout.scale.set(1, 1, 0.55);
  snout.position.set(2.0, -0.03, 0);
  const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), skin);
  nostril.position.set(2.3, 0.05, 0);
  g.add(head, snout, nostril);
  for (const z of [1, -1]) {
    const bump = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), skin);
    bump.position.set(1.2, 0.07, z * 0.09);
    const e = eye(0.028, 0xc8b040);
    e.position.set(1.23, 0.1, z * 0.1);
    g.add(bump, e);
  }
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), skin);
  back.scale.set(1.2, 0.12, 0.45);
  back.position.set(0, -0.05, 0);
  g.add(back);
  // bony scutes along the back
  for (let i = 0; i < 12; i++) {
    for (const z of [1, -1]) {
      const sc = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), skin);
      sc.position.set(0.9 - i * 0.18, 0.06, z * 0.12);
      g.add(sc);
    }
  }
  return g;
}

/** Hippo: a huge head surfaces, yawns wide, and sinks again. */
function hippo(): THREE.Group {
  const g = new THREE.Group();
  const skin = mat(0x6b5a5e, 0.55, { clearcoat: 0.9 });
  const pink = mat(0xc88a8a, 0.5);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), skin);
  head.scale.set(1.3, 0.7, 0.9);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 16), skin);
  muzzle.scale.set(0.9, 0.55, 1.05);
  muzzle.position.set(0.55, -0.05, 0);
  g.add(head, muzzle);
  // lower jaw that opens (userData.jaw rotates around z)
  const jaw = new THREE.Group();
  jaw.position.set(0.3, -0.12, 0);
  const lower = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), skin);
  lower.scale.set(1, 0.6, 1);
  lower.position.set(0.25, 0, 0);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), pink);
  tongue.scale.set(1, 0.25, 0.8);
  tongue.position.set(0.2, 0.02, 0);
  jaw.add(lower, tongue);
  for (const z of [1, -1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 8), mat(0xf2ead8, 0.3));
    tusk.position.set(0.5, 0.1, z * 0.22);
    jaw.add(tusk);
    const e = eye(0.045);
    e.position.set(0.05, 0.3, z * 0.25);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin);
    ear.scale.set(0.6, 1, 0.6);
    ear.position.set(-0.25, 0.35, z * 0.25);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat(0x3a2e30));
    nostril.position.set(0.8, 0.15, z * 0.12);
    g.add(e, ear, nostril);
  }
  g.add(jaw);
  g.userData.jaw = jaw;
  return g;
}

export function buildAnimal(kind: EventKind): THREE.Group {
  switch (kind) {
    case 'otter':
      return otter();
    case 'orca':
      return orca();
    case 'crocodile':
      return crocodile();
    case 'hippo':
      return hippo();
  }
}
