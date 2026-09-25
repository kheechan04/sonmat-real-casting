// Interference animals (M2, user: "진짜 가끔, 그나마 현실성 있게" → "동물들 품질 올리자").
// Built in code (no licensing): smooth bodies are profile-shaped tubes (like the fish), skins are
// canvas-drawn colour + bump textures. Only what shows above the water matters — the opaque
// water hides the rest. Each model faces +x; y = 0 is the water line when surfaced.
// userData: jaw (hippo, crocodile) opens; fluke (orca) for diving; wake = true → the scene draws a V wake.

import * as THREE from 'three';
import type { EventKind } from '../core/species';

// ---------------------------------------------------------------- textures

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function vnoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

type SkinKind = 'fur' | 'scutes' | 'hide' | 'smooth';
/** Colour + bump texture pair drawn in code. */
function skin(kind: SkinKind, base: string, dark: string, size = 256): { map: THREE.Texture; bump: THREE.Texture } {
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };
  const col = mk();
  const bmp = mk();
  const gc = col.getContext('2d')!;
  const gb = bmp.getContext('2d')!;
  gc.fillStyle = base;
  gc.fillRect(0, 0, size, size);
  gb.fillStyle = '#808080';
  gb.fillRect(0, 0, size, size);
  const img = gc.getImageData(0, 0, size, size);
  const bim = gb.getImageData(0, 0, size, size);
  const dk = new THREE.Color(dark);
  const bs = new THREE.Color(base);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      let t = 0;
      let h = 0.5;
      switch (kind) {
        case 'fur': {
          // fine strands running along the body
          const n = vnoise(x * 0.06, y * 0.6) * 0.6 + vnoise(x * 0.2, y * 2) * 0.4;
          t = n * 0.6;
          h = 0.35 + n * 0.5;
          break;
        }
        case 'scutes': {
          // crocodile: rectangular bony plates with dark seams, plus mottling
          const cx = (x % 32) / 32;
          const cy = (y % 24) / 24;
          const seam = Math.min(cx, 1 - cx, cy, 1 - cy);
          t = (seam < 0.08 ? 0.8 : 0) + vnoise(x * 0.05, y * 0.05) * 0.5;
          h = seam < 0.08 ? 0.2 : 0.55 + vnoise(x * 0.3, y * 0.3) * 0.3;
          break;
        }
        case 'hide': {
          // hippo: wrinkled, blotchy
          const n = vnoise(x * 0.04, y * 0.04);
          const w = Math.abs(Math.sin(x * 0.2 + vnoise(x * 0.05, y * 0.05) * 6));
          t = n * 0.5 + (w < 0.15 ? 0.3 : 0);
          h = 0.5 + (w < 0.15 ? -0.25 : 0) + n * 0.2;
          break;
        }
        default: {
          const n = vnoise(x * 0.03, y * 0.03);
          t = n * 0.25;
          h = 0.5 + n * 0.1;
        }
      }
      const c = bs.clone().lerp(dk, Math.min(1, t));
      img.data[i] = c.r * 255;
      img.data[i + 1] = c.g * 255;
      img.data[i + 2] = c.b * 255;
      bim.data[i] = bim.data[i + 1] = bim.data[i + 2] = Math.max(0, Math.min(255, h * 255));
    }
  }
  gc.putImageData(img, 0, 0);
  gb.putImageData(bim, 0, 0);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bmp);
  for (const t of [map, bump]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map, bump };
}

// ---------------------------------------------------------------- shapes

/**
 * A smooth body along +x: length `len`, cross-section half-height ry(u)·h(u), half-width rz(u)·h(u).
 * u = 0 at the back end, 1 at the front. `drop` lowers the underside (flat belly / jaw line).
 */
function tube(len: number, ry: number, rz: number, h: (u: number) => number, material: THREE.Material, drop = 0): THREE.Mesh {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 40, 60, false);
  g.rotateZ(-Math.PI / 2);
  g.rotateX(Math.PI / 2); // seam underneath
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const u = x + 0.5;
    const k = h(u);
    const vy = pos.getY(i) / 0.5;
    const vz = pos.getZ(i) / 0.5;
    pos.setXYZ(i, x * len, vy * ry * k * (vy < 0 ? 1 + drop : 1), vz * rz * k);
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, material);
}

/** Superellipse profile: closed, rounded ends (n = 2 oval, bigger = blunter). No flat end caps. */
const rounded = (n: number) => (u: number) => Math.max(0, 1 - Math.abs(2 * u - 1) ** n) ** (1 / n);

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function glossyEye(r: number, iris: number, slit = false): THREE.Group {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshPhysicalMaterial({ color: iris, roughness: 0.05, clearcoat: 1 }));
  g.add(ball);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * (slit ? 1 : 0.55), 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1 }));
  if (slit) pupil.scale.set(0.2, 0.9, 0.35);
  pupil.position.x = r * 0.55;
  g.add(pupil);
  return g;
}

// ---------------------------------------------------------------- animals

/** Eurasian otter swimming: flat head, whiskers, a furry back and tail just breaking the surface. ~1.1 m. */
function otter(): THREE.Group {
  const g = new THREE.Group();
  const s = skin('fur', '#5a3d27', '#2a1a10');
  s.map.repeat.set(3, 1);
  const fur = new THREE.MeshPhysicalMaterial({ map: s.map, bumpMap: s.bump, bumpScale: 1.2, roughness: 0.55, sheen: 1, sheenColor: new THREE.Color(0xa07a55), clearcoat: 0.6, clearcoatRoughness: 0.4 });
  // body: tapers into a thick tail
  const body = tube(1.1, 0.13, 0.15, (u) => (u < 0.3 ? 0.06 + (u / 0.3) ** 0.8 * 0.94 : rounded(2.2)(0.5 + (u - 0.3) * 0.7)), fur, 0.3);
  body.position.set(-0.25, -0.06, 0);
  g.add(body);
  // head: wide and flat, blunt muzzle
  const head = tube(0.3, 0.085, 0.11, (u) => Math.sin(Math.PI * Math.min(1, u * 0.95 + 0.05)) ** 0.5 * (0.7 + 0.3 * smoothstep(0, 0.6, u)), fur, 0.2);
  head.position.set(0.38, 0.03, 0);
  g.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x7a5a40, roughness: 0.6 }));
  muzzle.scale.set(0.9, 0.7, 1.2);
  muzzle.position.set(0.5, 0.01, 0);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x151010, roughness: 0.2, clearcoat: 1 }));
  nose.scale.set(0.7, 0.8, 1.3);
  nose.position.set(0.545, 0.035, 0);
  g.add(muzzle, nose);
  for (const z of [1, -1]) {
    const e = glossyEye(0.013, 0x1a1008);
    e.position.set(0.45, 0.075, z * 0.055);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), fur);
    ear.scale.set(0.7, 1, 0.5);
    ear.position.set(0.33, 0.1, z * 0.085);
    g.add(e, ear);
    for (let i = 0; i < 4; i++) {
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(0.52, 0.01 - i * 0.008, z * 0.04),
        new THREE.Vector3(0.56, 0.0 - i * 0.012, z * 0.1),
        new THREE.Vector3(0.55, -0.02 - i * 0.02, z * (0.15 + i * 0.01)),
      );
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 6, 0.0012, 3), new THREE.MeshBasicMaterial({ color: 0xe8e2d8 })));
    }
  }
  g.userData.wake = true;
  return g;
}

/** Orca: streamlined black body, tall curved dorsal fin, white eye patch and belly, grey saddle, flukes. ~7 m. */
function orca(): THREE.Group {
  const g = new THREE.Group();
  const s = skin('smooth', '#101317', '#050607');
  const black = new THREE.MeshPhysicalMaterial({ map: s.map, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.15 });
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f4f5, roughness: 0.3, clearcoat: 1 });
  const grey = new THREE.MeshPhysicalMaterial({ color: 0x8a939a, roughness: 0.35, clearcoat: 0.8, transparent: true, opacity: 0.85 });
  const profile = (u: number) => (u < 0.55 ? 0.12 + 0.88 * Math.sin((u / 0.55) * (Math.PI / 2)) ** 0.9 : Math.cos(((u - 0.55) / 0.45) * (Math.PI / 2)) ** 0.55);
  const body = tube(7, 0.95, 0.9, profile, black, 0.15);
  g.add(body);
  // white patches sit just outside the body surface
  for (const z of [1, -1]) {
    const eyePatch = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), white);
    eyePatch.scale.set(1.3, 0.38, 0.12);
    eyePatch.position.set(2.2, 0.32, z * 0.66);
    eyePatch.rotation.z = -0.1;
    const flank = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 12), white);
    flank.scale.set(1.8, 0.5, 0.15);
    flank.position.set(-0.9, -0.35, z * 0.78);
    flank.rotation.z = 0.35;
    const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), grey);
    saddle.scale.set(1.5, 0.3, 0.3);
    saddle.position.set(-0.8, 0.72, z * 0.35);
    g.add(eyePatch, flank, saddle);
  }
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.9, 24, 12), white);
  belly.scale.set(2.2, 0.35, 0.7);
  belly.position.set(1.4, -0.72, 0);
  g.add(belly);
  // tall, slightly back-curved dorsal fin (a male's)
  const fin = new THREE.Shape();
  fin.moveTo(0.7, 0);
  fin.bezierCurveTo(0.45, 0.8, 0.15, 1.5, -0.2, 1.9);
  fin.bezierCurveTo(-0.1, 1.2, -0.3, 0.5, -0.8, 0);
  const finMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(fin, { depth: 0.06, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 3, curveSegments: 24 }), black);
  finMesh.position.set(0.1, 0.82, -0.03);
  g.add(finMesh);
  // flukes (seen when it dives)
  const fl = new THREE.Shape();
  fl.moveTo(0, 0);
  fl.bezierCurveTo(-0.3, 0.3, -0.8, 0.8, -1.0, 0.9);
  fl.bezierCurveTo(-0.7, 0.4, -0.6, 0.1, -0.55, 0);
  fl.bezierCurveTo(-0.6, -0.1, -0.7, -0.4, -1.0, -0.9);
  fl.bezierCurveTo(-0.8, -0.8, -0.3, -0.3, 0, 0);
  const fluke = new THREE.Mesh(new THREE.ExtrudeGeometry(fl, { depth: 0.05, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03 }), black);
  fluke.rotation.x = Math.PI / 2;
  fluke.position.set(-3.4, 0, 0);
  g.add(fluke);
  g.userData.fluke = fluke;
  g.userData.blow = true;
  g.userData.wake = true;
  return g;
}

/** Nile crocodile: a long tapered snout with teeth, slit-pupil eyes on turrets, ridged plated back and tail. ~4.5 m. */
function crocodile(): THREE.Group {
  const g = new THREE.Group();
  const s = skin('scutes', '#6f7446', '#2e3219');
  s.map.repeat.set(6, 2);
  s.bump.repeat.set(6, 2);
  const hide = new THREE.MeshPhysicalMaterial({ map: s.map, bumpMap: s.bump, bumpScale: 3, roughness: 0.55, clearcoat: 0.7, clearcoatRoughness: 0.35 });
  const belly = new THREE.MeshPhysicalMaterial({ color: 0xb8b08a, roughness: 0.6 });
  // body + tail as one long flattened tube
  const body = tube(4.2, 0.28, 0.5, (u) => (u < 0.55 ? 0.08 + 0.92 * smoothstep(0, 0.55, u) ** 0.8 : 1 - 0.35 * smoothstep(0.55, 1, u)), hide, -0.2);
  body.position.set(-1.1, -0.12, 0);
  g.add(body);
  // head: wide at the back, long tapering snout, flat
  const head = tube(1.2, 0.13, 0.26, (u) => (u < 0.35 ? 0.9 + 0.1 * (u / 0.35) : 1 - 0.62 * smoothstep(0.35, 1, u)) * (u > 0.97 ? 0.8 : 1), hide, 0.35);
  head.position.set(1.55, -0.02, 0);
  g.add(head);
  const jawLine = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.02, 0.36), belly);
  jawLine.position.set(1.65, -0.08, 0);
  g.add(jawLine);
  // teeth along the jaw edges
  const toothMat = new THREE.MeshStandardMaterial({ color: 0xf0e8d2, roughness: 0.4 });
  for (const z of [1, -1]) {
    for (let i = 0; i < 12; i++) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.05, 6), toothMat);
      const x = 1.2 + i * 0.075;
      const w = 0.24 * (1 - 0.6 * smoothstep(1.25, 2.1, x));
      t.position.set(x, -0.07, z * w);
      t.rotation.x = Math.PI;
      g.add(t);
    }
    // eye turrets with slit pupils, nostril bumps
    const turret = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), hide);
    turret.scale.set(1.2, 0.8, 0.9);
    turret.position.set(1.18, 0.07, z * 0.11);
    const e = glossyEye(0.035, 0xc8b43a, true);
    e.position.set(1.22, 0.11, z * 0.12);
    g.add(turret, e);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), hide);
  nose.scale.set(1.2, 0.7, 1.3);
  nose.position.set(2.1, 0.03, 0);
  g.add(nose);
  // two rows of raised scutes along back and tail
  const scuteMat = new THREE.MeshPhysicalMaterial({ color: 0x4a4f2e, roughness: 0.6, clearcoat: 0.6 });
  for (let i = 0; i < 26; i++) {
    const x = 0.9 - i * 0.16;
    const rows = x > -1.2 ? [0.14, -0.14] : [0];
    for (const z of rows) {
      const sc = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09 - Math.max(0, -x - 1.2) * 0.01, 4), scuteMat);
      sc.position.set(x, 0.1 - Math.max(0, -x - 0.5) * 0.02, z * (x > -1.2 ? 1 - Math.max(0, -x) * 0.2 : 1));
      g.add(sc);
    }
  }
  g.userData.wake = true;
  return g;
}

/** Hippo: an enormous head surfaces, yawns to show its pink mouth and tusks, and sinks again. */
function hippo(): THREE.Group {
  const g = new THREE.Group();
  const s = skin('hide', '#9a8487', '#5e4b4f');
  s.map.repeat.set(2, 1);
  const hide = new THREE.MeshPhysicalMaterial({ map: s.map, bumpMap: s.bump, bumpScale: 1.4, roughness: 0.45, clearcoat: 0.7, clearcoatRoughness: 0.3 });
  const pinkHide = new THREE.MeshPhysicalMaterial({ color: 0xb98482, roughness: 0.4, clearcoat: 1 });
  const mouthPink = new THREE.MeshPhysicalMaterial({ color: 0xd07a84, roughness: 0.5, clearcoat: 0.6 });
  // head: skull behind, huge boxy muzzle in front
  const skull = tube(0.95, 0.36, 0.42, rounded(2.4), hide);
  skull.position.set(-0.1, 0.05, 0);
  const muzzle = tube(0.75, 0.3, 0.46, rounded(3), hide);
  muzzle.position.set(0.52, 0.0, 0);
  g.add(skull, muzzle);
  // pinkish rims around the eyes and ears
  for (const z of [1, -1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), pinkHide);
    socket.scale.set(1, 0.8, 1);
    socket.position.set(0.12, 0.33, z * 0.24);
    const e = glossyEye(0.05, 0x3a2a1a);
    e.position.set(0.17, 0.36, z * 0.26);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), hide);
    ear.scale.set(0.5, 1, 0.45);
    ear.position.set(-0.28, 0.4, z * 0.25);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), hide);
    nostril.scale.set(1.2, 0.8, 1);
    nostril.position.set(0.8, 0.22, z * 0.13);
    const hole = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1a1012 }));
    hole.position.set(0.82, 0.26, z * 0.13);
    g.add(socket, e, ear, nostril, hole);
  }
  // lower jaw that swings open (rotates around z at the hinge)
  const jaw = new THREE.Group();
  jaw.position.set(0.1, -0.16, 0);
  const lower = tube(0.8, 0.14, 0.42, rounded(3), hide, -0.3);
  lower.position.set(0.4, -0.02, 0);
  const tongue = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 10), mouthPink);
  tongue.scale.set(1.2, 0.2, 0.8);
  tongue.position.set(0.38, 0.06, 0);
  jaw.add(lower, tongue);
  const tuskMat = new THREE.MeshPhysicalMaterial({ color: 0xf2ead8, roughness: 0.25, clearcoat: 1 });
  for (const z of [1, -1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.3, 10), tuskMat);
    tusk.position.set(0.72, 0.15, z * 0.3);
    tusk.rotation.z = -0.25;
    jaw.add(tusk);
    const small = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 8), tuskMat);
    small.position.set(0.85, 0.1, z * 0.12);
    jaw.add(small);
  }
  // pink roof of the mouth, seen when it yawns
  const palate = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 10), mouthPink);
  palate.scale.set(1.3, 0.15, 0.95);
  palate.position.set(0.5, -0.13, 0);
  g.add(palate, jaw);
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
