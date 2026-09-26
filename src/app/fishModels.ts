// Procedural 3D models for every species (M2, user decision: "코드로 어종별 모델" — no licensing,
// available now; UVs kept so photo textures can replace the vertex colours later).
//
// Every model is 1 unit long along +x (head at +x, tail at −x), centred on the origin, laterally
// compressed like a fish (z = thickness). group.userData.tail is the tail fin, for wiggling.
// A handful of species have their own shapes (isopod, blobfish); the rest are one parametric
// body + fins + "extras" (hammer head, glowing lure, bill, trunk snout …).

import * as THREE from 'three';

type RGB = number;
type Pattern = 'none' | 'bars' | 'spots' | 'leopard' | 'stripe' | 'stripes' | 'mottled' | 'chevrons' | 'blueSpots';
type Tail = 'fork' | 'lunate' | 'round' | 'truncate' | 'shark' | 'clavus' | 'point';
type Dorsal = 'normal' | 'spiny' | 'long' | 'shark' | 'sail' | 'crest' | 'two' | 'tall' | 'none';
type Extra =
  | 'barbels2' | 'barbels4' | 'barbels8' | 'hammer' | 'lure' | 'goblinSnout' | 'bill' | 'trunk'
  | 'teeth' | 'fangs' | 'dome' | 'finlets' | 'bigMouth' | 'eyesUp';

export interface FishSpec {
  /** body height / length, thickness / length */
  depth: number;
  width: number;
  /** where the body is deepest (0 tail … 1 head); sharp = how quickly the body narrows toward the tail */
  peak: number;
  sharp: number;
  /** head shape: 2 = round (most fish), < 2 pointed (sharks, billfish), > 2 blunt (catfish, mola) */
  nose?: number;
  /** tail stalk (caudal peduncle) height as a fraction of the deepest point */
  stalk?: number;
  back: RGB;
  side: RGB;
  belly: RGB;
  pattern: Pattern;
  patternColor?: RGB;
  fin: RGB;
  tail: Tail;
  dorsal: Dorsal;
  extras?: Extra[];
  eye?: number;
  eyeColor?: RGB;
  /** smooth skin (sharks, catfish): no scale relief, more matte */
  smooth?: boolean;
  metal?: number;
  glow?: number;
}

const SPECS: Record<string, FishSpec> = {
  // 저수지
  crucian: { nose: 2.1, depth: 0.4, width: 0.15, peak: 0.55, sharp: 0.99, back: 0x2f3320, side: 0xa88d45, belly: 0xe8dcb2, pattern: 'none', fin: 0x5b4d2a, tail: 'fork', dorsal: 'long' },
  // M4 인면어: a golden koi-like carp with a broad, blunt front for the face (user: "몸통은 그냥 코드로 … 퀄리티
  // 그렇게 높은 필요 없을 거 같아") — the face goes on the front, looking forward (addFace)
  face_fish: { nose: 3.2, depth: 0.36, width: 0.3, peak: 0.62, sharp: 0.95, back: 0xa0521f, side: 0xe9a13b, belly: 0xf8e6c2, pattern: 'none', fin: 0xd98b3a, tail: 'fork', dorsal: 'long', metal: 0.3, eye: 0 }, // eye 0: the face has the eyes
  carp: { nose: 2.1, depth: 0.3, width: 0.15, peak: 0.6, sharp: 0.99, back: 0x2b2216, side: 0x8e6c3a, belly: 0xe0cfa0, pattern: 'none', fin: 0x5a3f22, tail: 'fork', dorsal: 'long', extras: ['barbels4'] },
  bass: { nose: 1.8, depth: 0.3, width: 0.14, peak: 0.55, sharp: 1.08, back: 0x2e3d22, side: 0x7c8a4e, belly: 0xe6e2c4, pattern: 'stripe', patternColor: 0x1e2615, fin: 0x4e5a30, tail: 'truncate', dorsal: 'spiny', extras: ['bigMouth'] },
  catfish: { nose: 2.6, stalk: 0.3, depth: 0.18, width: 0.16, peak: 0.75, sharp: 0.81, back: 0x2a2a22, side: 0x4d4a3a, belly: 0xd8d2b8, pattern: 'mottled', patternColor: 0x1a1a14, fin: 0x333026, tail: 'round', dorsal: 'none', extras: ['barbels2', 'bigMouth'], eye: 0.5, smooth: true },
  snakehead: { nose: 2.3, stalk: 0.35, depth: 0.19, width: 0.14, peak: 0.6, sharp: 0.81, back: 0x2e2a1c, side: 0x6b5d3c, belly: 0xcfc5a4, pattern: 'chevrons', patternColor: 0x1b170e, fin: 0x3b3324, tail: 'round', dorsal: 'long', extras: ['bigMouth', 'teeth'] },
  mandarin: { nose: 1.7, depth: 0.3, width: 0.14, peak: 0.55, sharp: 1.17, back: 0x3a3320, side: 0xb89c5a, belly: 0xece0bd, pattern: 'leopard', patternColor: 0x2a2012, fin: 0x6a5a34, tail: 'round', dorsal: 'spiny', extras: ['bigMouth'] },
  golden_mandarin: { nose: 1.7, depth: 0.3, width: 0.14, peak: 0.55, sharp: 1.17, back: 0xd8a52a, side: 0xf6d25a, belly: 0xfff0b8, pattern: 'leopard', patternColor: 0xb8641a, fin: 0xf0b83a, tail: 'round', dorsal: 'spiny', extras: ['bigMouth'], metal: 0.6, glow: 0.12 },
  // 바다
  rockfish: { nose: 1.9, depth: 0.34, width: 0.17, peak: 0.6, sharp: 0.99, back: 0x2b2a28, side: 0x5c5650, belly: 0xb9b2a6, pattern: 'mottled', patternColor: 0x1c1b1a, fin: 0x3a3634, tail: 'truncate', dorsal: 'spiny', extras: ['bigMouth'], eye: 1.4 },
  red_seabream: { nose: 1.7, stalk: 0.16, depth: 0.42, width: 0.14, peak: 0.58, sharp: 1.17, back: 0xb84a56, side: 0xe87f84, belly: 0xf6d4d0, pattern: 'blueSpots', patternColor: 0x6fc4f0, fin: 0xd7707a, tail: 'fork', dorsal: 'spiny' },
  flounder: { nose: 2.2, stalk: 0.2, depth: 0.46, width: 0.07, peak: 0.55, sharp: 0.99, back: 0x5a4a34, side: 0x7a6547, belly: 0x6e5b40, pattern: 'mottled', patternColor: 0x2d2418, fin: 0x5f4d36, tail: 'round', dorsal: 'long', extras: ['eyesUp', 'bigMouth', 'teeth'] },
  seabass: { nose: 1.6, stalk: 0.18, depth: 0.24, width: 0.13, peak: 0.55, sharp: 1.26, back: 0x3c4650, side: 0xaab4bc, belly: 0xeef1f3, pattern: 'spots', patternColor: 0x222a30, fin: 0x6d7880, tail: 'fork', dorsal: 'two', extras: ['bigMouth'], metal: 0.5 },
  yellowtail: { nose: 1.6, stalk: 0.12, depth: 0.26, width: 0.15, peak: 0.52, sharp: 1.44, back: 0x2c5a6a, side: 0xb9c8cf, belly: 0xf1f4f5, pattern: 'stripe', patternColor: 0xf1c93a, fin: 0xd8b43c, tail: 'fork', dorsal: 'two', metal: 0.5 },
  tuna: { nose: 1.6, stalk: 0.1, depth: 0.3, width: 0.2, peak: 0.5, sharp: 1.60, back: 0x16264a, side: 0x9aa7b8, belly: 0xe8edf2, pattern: 'none', fin: 0x2a3a5a, tail: 'lunate', dorsal: 'two', extras: ['finlets'], metal: 0.6 },
  sunfish: { nose: 2.4, stalk: 0.92, depth: 0.95, width: 0.2, peak: 0.45, sharp: 0.60, back: 0x5d6770, side: 0x9aa4ab, belly: 0xd4dadd, pattern: 'mottled', patternColor: 0x7d878e, fin: 0x6e7880, tail: 'clavus', dorsal: 'tall', eye: 0.9, smooth: true },
  hammerhead: { nose: 1.5, stalk: 0.14, depth: 0.18, width: 0.15, peak: 0.6, sharp: 1.17, back: 0x6d7880, side: 0x8f9aa2, belly: 0xe9ecee, pattern: 'none', fin: 0x6d7880, tail: 'shark', dorsal: 'shark', extras: ['hammer'], eye: 0.6, smooth: true },
  marlin: { nose: 1.3, stalk: 0.1, depth: 0.2, width: 0.12, peak: 0.55, sharp: 1.44, back: 0x14264e, side: 0x6c83a6, belly: 0xe4ebf2, pattern: 'bars', patternColor: 0x9fd0f2, fin: 0x1d3264, tail: 'lunate', dorsal: 'sail', extras: ['bill'], metal: 0.5 },
  great_white: { nose: 1.4, stalk: 0.14, depth: 0.22, width: 0.19, peak: 0.58, sharp: 1.26, back: 0x5a6570, side: 0x7d8892, belly: 0xf0f2f3, pattern: 'none', fin: 0x55606a, tail: 'shark', dorsal: 'shark', extras: ['teeth', 'bigMouth'], eye: 0.6, eyeColor: 0x050505, smooth: true },
  // 심해
  alfonsino: { nose: 2.2, stalk: 0.16, depth: 0.36, width: 0.13, peak: 0.55, sharp: 1.17, back: 0xb3121a, side: 0xe0343a, belly: 0xf28a80, pattern: 'none', fin: 0xd82a30, tail: 'fork', dorsal: 'spiny', eye: 2.2, eyeColor: 0xf2c43a, metal: 0.3 },
  oarfish: { nose: 2.2, stalk: 0.4, depth: 0.045, width: 0.012, peak: 0.85, sharp: 0.60, back: 0xb6bec6, side: 0xdfe5ea, belly: 0xf4f6f8, pattern: 'spots', patternColor: 0x6d7a88, fin: 0xe23a3a, tail: 'point', dorsal: 'crest', eye: 0.7, metal: 0.8 },
  anglerfish: { nose: 2.8, stalk: 0.25, depth: 0.62, width: 0.5, peak: 0.6, sharp: 0.63, back: 0x1b1714, side: 0x2d2520, belly: 0x3a302a, pattern: 'mottled', patternColor: 0x0d0b0a, fin: 0x2a221e, tail: 'round', dorsal: 'none', extras: ['lure', 'fangs', 'bigMouth'], eye: 0.6, smooth: true },
  goblin_shark: { nose: 1.6, stalk: 0.16, depth: 0.16, width: 0.14, peak: 0.55, sharp: 1.08, back: 0xc98f96, side: 0xdcaab0, belly: 0xefd2d4, pattern: 'none', fin: 0xc07f88, tail: 'shark', dorsal: 'shark', extras: ['goblinSnout', 'fangs'], eye: 0.5, smooth: true },
  barreleye: { nose: 2, depth: 0.3, width: 0.15, peak: 0.55, sharp: 0.99, back: 0x2a2a30, side: 0x55505a, belly: 0x8a8490, pattern: 'none', fin: 0x3a3840, tail: 'fork', dorsal: 'normal', extras: ['dome'], eye: 0.01 },
  // 아프리카 강
  tilapia: { nose: 2, depth: 0.4, width: 0.14, peak: 0.55, sharp: 0.99, back: 0x3c4436, side: 0x7b8570, belly: 0xd9dccb, pattern: 'bars', patternColor: 0x4a5244, fin: 0x55604a, tail: 'truncate', dorsal: 'spiny' },
  elephantfish: { stalk: 0.14, depth: 0.26, width: 0.1, peak: 0.45, sharp: 1.08, back: 0x2b2420, side: 0x5a4c42, belly: 0x9a8a7a, pattern: 'none', fin: 0x3d332c, tail: 'fork', dorsal: 'normal', extras: ['trunk'], eye: 0.5, smooth: true },
  vundu: { nose: 2.6, stalk: 0.3, depth: 0.18, width: 0.17, peak: 0.7, sharp: 0.81, back: 0x3a3e30, side: 0x6a6e56, belly: 0xd6d4bc, pattern: 'mottled', patternColor: 0x262a1e, fin: 0x444834, tail: 'fork', dorsal: 'normal', extras: ['barbels8', 'bigMouth'], eye: 0.5, smooth: true },
  electric_catfish: { nose: 2.6, stalk: 0.4, depth: 0.3, width: 0.28, peak: 0.6, sharp: 0.63, back: 0x5a4a3a, side: 0x8a7458, belly: 0xd8c8aa, pattern: 'spots', patternColor: 0x2e241a, fin: 0x6a5840, tail: 'round', dorsal: 'none', extras: ['barbels4'], eye: 0.45, smooth: true },
  tigerfish: { nose: 1.6, stalk: 0.16, depth: 0.28, width: 0.13, peak: 0.55, sharp: 1.26, back: 0x3a4550, side: 0xc6ccd0, belly: 0xf0f2f2, pattern: 'stripes', patternColor: 0x1a2028, fin: 0xd8452a, tail: 'fork', dorsal: 'normal', extras: ['fangs', 'bigMouth'], metal: 0.6 },
  nile_perch: { nose: 1.8, depth: 0.3, width: 0.15, peak: 0.6, sharp: 1.08, back: 0x4c5458, side: 0xb0b8ba, belly: 0xe8ecec, pattern: 'none', fin: 0x5a6266, tail: 'round', dorsal: 'two', extras: ['bigMouth'], eye: 1.4, eyeColor: 0xd8c050, metal: 0.55 },
};

// ---------------------------------------------------------------- shared textures

let scaleTex: THREE.Texture | null = null;
function scales(): THREE.Texture {
  if (scaleTex) return scaleTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 256, 256);
  const r = 16;
  for (let row = -1; row < 256 / (r * 0.75) + 1; row++) {
    for (let col = -1; col < 256 / r + 1; col++) {
      const x = col * r + (row % 2) * (r / 2);
      const y = row * r * 0.75;
      const grad = g.createRadialGradient(x, y + r * 0.3, 1, x, y, r * 0.75);
      grad.addColorStop(0, '#9a9a9a');
      grad.addColorStop(0.8, '#7a7a7a');
      grad.addColorStop(1, '#4a4a4a');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r * 0.75, 0, Math.PI);
      g.fill();
    }
  }
  scaleTex = new THREE.CanvasTexture(c);
  scaleTex.wrapS = scaleTex.wrapT = THREE.RepeatWrapping;
  scaleTex.repeat.set(6, 2);
  return scaleTex;
}

// ---------------------------------------------------------------- pattern + profile

const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** smooth value noise 0–1 */
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

/** Pattern strength 0–1 at body position u (0 tail…1 head), v (−1 belly…1 back). */
function patternAt(p: Pattern, u: number, v: number): number {
  switch (p) {
    case 'bars':
      return v > -0.3 ? Math.max(0, Math.sin(u * 40) * 1.4 - 0.5) : 0;
    case 'stripe':
      return Math.max(0, 1 - Math.abs(v - 0.05) * 7) * (0.7 + 0.3 * vnoise(u * 20, 1));
    case 'stripes':
      return Math.max(0, Math.sin(v * 18) * 1.6 - 1) * (u < 0.92 ? 1 : 0);
    case 'spots':
      return vnoise(u * 38, v * 14) > 0.78 && v > -0.2 ? 1 : 0;
    case 'leopard': {
      const n = vnoise(u * 22, v * 9);
      return n > 0.72 ? 1 : n > 0.66 ? 0.5 : 0;
    }
    case 'blueSpots':
      return vnoise(u * 45, v * 18) > 0.82 && v > 0 ? 1 : 0;
    case 'mottled':
      return Math.max(0, vnoise(u * 14, v * 6) * 1.6 - 0.7);
    case 'chevrons':
      return Math.max(0, Math.sin(u * 30 + Math.abs(v) * 6) * 1.5 - 0.6) * (v > -0.5 ? 1 : 0);
    default:
      return 0;
  }
}

/**
 * Body height (0–1) at u (0 tail … 1 head). The head is a superellipse quarter — round for most fish,
 * pointed for sharks and billfish — and the back narrows to a tail stalk the tail fin grows from
 * (the first version was pointed at both ends and looked like a lemon).
 */
function profile(u: number, spec: FishSpec): number {
  const p = spec.peak;
  const uu = Math.min(1, Math.max(0, u));
  if (uu >= p) {
    const t = (uu - p) / (1 - p);
    const n = spec.nose ?? 2;
    return Math.max(0, 1 - t ** n) ** (1 / n);
  }
  const stalk = spec.stalk ?? 0.22;
  const t = uu / p;
  return stalk + (1 - stalk) * Math.sin((t * Math.PI) / 2) ** spec.sharp;
}

// ---------------------------------------------------------------- build

export function buildSpecies(id: string): THREE.Group {
  if (id === 'isopod') return buildIsopod();
  if (id === 'blobfish') return buildBlobfish();
  const spec = SPECS[id] ?? SPECS.crucian;
  const g = new THREE.Group();

  // ---- body: a sphere reshaped by the profile, coloured per vertex
  // A tube along x, each ring scaled to the profile (a sphere tapers to a point at both ends by
  // itself, which made every fish look like a lemon). Cylinder UVs run along the body and around it
  // — what a photo texture needs later.
  const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 48, 90, false);
  geo.rotateZ(-Math.PI / 2); // axis +y → +x, so the top cap becomes the head
  geo.rotateX(Math.PI / 2); // the UV seam (hard normal edge) goes under the belly, out of sight
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const back = new THREE.Color(spec.back);
  const side = new THREE.Color(spec.side);
  const belly = new THREE.Color(spec.belly);
  const pat = new THREE.Color(spec.patternColor ?? spec.back);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const u = x + 0.5;
    const h = profile(u, spec);
    const vy = pos.getY(i) / 0.5;
    const vz = pos.getZ(i) / 0.5;
    const y = vy * (spec.depth / 2) * h + (vy > 0 ? 0.01 * h : 0);
    const z = vz * (spec.width / 2) * h;
    pos.setXYZ(i, x, y, z);
    // countershading: dark back → side → pale belly
    const v = vy;
    if (v > 0.25) c.copy(side).lerp(back, Math.min(1, (v - 0.25) / 0.6));
    else c.copy(belly).lerp(side, Math.max(0, (v + 0.6) / 0.85));
    c.lerp(pat, patternAt(spec.pattern, u, v) * 0.85);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const skin = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: spec.smooth ? 0.55 : 0.32,
    metalness: spec.metal ?? 0.2,
    clearcoat: spec.smooth ? 0.4 : 0.8,
    clearcoatRoughness: 0.25,
    ...(spec.smooth ? {} : { bumpMap: scales(), bumpScale: 0.6 }),
    ...(spec.glow ? { emissive: new THREE.Color(spec.side), emissiveIntensity: spec.glow } : {}),
    iridescence: spec.smooth ? 0 : 0.3,
  });
  g.add(new THREE.Mesh(geo, skin));

  const H = (u: number) => (spec.depth / 2) * profile(u, spec);
  const finMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(spec.fin).lerp(side, 0.2),
    roughness: 0.55,
    transmission: 0.45,
    thickness: 0.01,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
  });
  const fin = (start: [number, number], segs: [number, number, number, number][], mat: THREE.Material = finMat) => {
    const sh = new THREE.Shape();
    sh.moveTo(start[0], start[1]);
    for (const [cx, cy, x, y] of segs) sh.quadraticCurveTo(cx, cy, x, y);
    return new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), mat);
  };
  const D = spec.depth;

  // ---- tail
  let tail: THREE.Mesh;
  switch (spec.tail) {
    case 'lunate':
      tail = fin([0.02, 0.02], [[-0.12, 0.1, -0.2, 0.28], [-0.1, 0.1, -0.06, 0], [-0.1, -0.1, -0.2, -0.28], [-0.12, -0.1, 0.02, -0.02]]);
      break;
    case 'round':
      tail = fin([0.02, 0.03], [[-0.06, 0.16, -0.16, 0.12], [-0.24, 0, -0.16, -0.12], [-0.06, -0.16, 0.02, -0.03]]);
      break;
    case 'truncate':
      tail = fin([0.02, 0.03], [[-0.08, 0.1, -0.18, 0.13], [-0.19, 0, -0.18, -0.13], [-0.08, -0.1, 0.02, -0.03]]);
      break;
    case 'shark':
      tail = fin([0.03, 0.02], [[-0.1, 0.12, -0.22, 0.3], [-0.16, 0.08, -0.12, 0], [-0.14, -0.08, -0.12, -0.13], [-0.04, -0.06, 0.03, -0.02]]);
      break;
    case 'clavus':
      tail = fin([0.03, 0.26], [[-0.1, 0.2, -0.1, 0], [-0.1, -0.2, 0.03, -0.26]]);
      break;
    case 'point':
      tail = fin([0.02, 0.01], [[-0.05, 0.005, -0.1, 0], [-0.05, -0.005, 0.02, -0.01]]);
      break;
    default: // fork
      tail = fin([0.02, 0.03], [[-0.08, 0.08, -0.2, 0.19], [-0.25, 0.2, -0.24, 0.13], [-0.19, 0.05, -0.15, 0], [-0.19, -0.05, -0.24, -0.13], [-0.25, -0.2, -0.2, -0.19], [-0.08, -0.08, 0.02, -0.03]]);
  }
  const tailScale = Math.max(0.4, Math.min(1.8, D / 0.28));
  tail.scale.set(1, tailScale, 1);
  tail.position.x = spec.tail === 'clavus' ? -0.47 : -0.49;
  g.add(tail);
  g.userData.tail = tail;

  // ---- dorsal
  const top = (u: number) => H(u) + 0.004;
  const addDorsal = (m: THREE.Mesh, u: number) => {
    m.position.set(u - 0.5, top(u), 0);
    g.add(m);
  };
  switch (spec.dorsal) {
    case 'spiny': {
      const m = fin([0.14, -0.01], [[0.12, 0.09, 0.06, 0.1], [0.0, 0.05, -0.04, 0.08], [-0.12, 0.08, -0.16, 0.06], [-0.2, 0.02, -0.2, -0.01]]);
      m.scale.y = Math.max(0.6, D / 0.3);
      addDorsal(m, 0.55);
      break;
    }
    case 'long':
      addDorsal(fin([0.14, -0.01], [[0.1, 0.07, 0.0, 0.07], [-0.2, 0.06, -0.26, -0.01]]), 0.52);
      break;
    case 'shark':
      addDorsal(fin([0.06, -0.01], [[0.0, 0.08, -0.05, 0.16], [-0.04, 0.05, -0.12, -0.01]]), 0.6);
      break;
    case 'sail':
      addDorsal(fin([0.12, -0.01], [[0.1, 0.24, 0.04, 0.22], [-0.08, 0.08, -0.25, 0.03], [-0.3, 0.0, -0.3, -0.01]]), 0.68);
      break;
    case 'tall':
      addDorsal(fin([0.06, -0.02], [[0.04, 0.3, -0.04, 0.34], [-0.06, 0.1, -0.08, -0.02]]), 0.3);
      break;
    case 'two':
      addDorsal(fin([0.08, -0.01], [[0.05, 0.1, -0.02, 0.1], [-0.06, 0.02, -0.08, -0.01]]), 0.62);
      addDorsal(fin([0.06, -0.01], [[0.03, 0.07, -0.02, 0.07], [-0.05, 0.01, -0.06, -0.01]]), 0.38);
      break;
    case 'crest': {
      // oarfish: a red ribbon crest along the whole back, taller rays at the head
      const crestMat = finMat.clone();
      crestMat.color = new THREE.Color(spec.fin);
      crestMat.opacity = 0.9;
      const m = fin([0.46, 0], [[0.44, 0.09, 0.4, 0.05], [0, 0.03, -0.46, 0.012], [-0.47, 0, -0.47, 0], [0, 0, 0.46, 0]], crestMat);
      m.position.set(0, spec.depth * 0.45, 0);
      g.add(m);
      break;
    }
    case 'normal':
      addDorsal(fin([0.08, -0.01], [[0.06, 0.1, -0.02, 0.1], [-0.07, 0.03, -0.1, -0.01]]), 0.55);
      break;
    default:
      break;
  }

  // ---- anal + pectoral + pelvic
  if (spec.tail !== 'clavus' && spec.dorsal !== 'crest') {
    const anal = fin([0.0, 0.01], [[-0.02, -0.07, -0.08, -0.07], [-0.13, -0.04, -0.15, 0.01]]);
    anal.scale.y = Math.max(0.6, D / 0.3);
    anal.position.set(-0.2, -H(0.3), 0);
    g.add(anal);
  } else if (spec.tail === 'clavus') {
    const anal = fin([0.06, 0.02], [[0.04, -0.3, -0.04, -0.34], [-0.06, -0.1, -0.08, 0.02]]);
    anal.position.set(-0.2, -H(0.3), 0);
    g.add(anal);
  }
  const pect = fin([0, 0], [[-0.06, -0.01, -0.12, -0.05], [-0.07, -0.08, 0, 0]]);
  pect.position.set(0.24, -H(0.74) * 0.3, spec.width * 0.35 * profile(0.74, spec) + 0.004);
  pect.rotation.y = -0.4;
  g.add(pect);
  if (spec.tail === 'shark') {
    // big shark pectorals
    const sp = fin([0, 0], [[-0.05, -0.05, -0.16, -0.14], [-0.04, -0.06, 0, 0]]);
    sp.position.set(0.18, -H(0.7) * 0.6, spec.width * 0.35);
    sp.rotation.set(0.6, -0.3, 0);
    g.add(sp);
  }

  // ---- eyes
  const eyeR = 0.022 * (spec.eye ?? 1);
  const headU = 0.86;
  const eyeX = headU - 0.5;
  const eyeY = H(headU) * (spec.extras?.includes('eyesUp') ? 0.7 : 0.35);
  const eyeZ = (spec.width / 2) * profile(headU, spec) * 0.85;
  const iris = new THREE.MeshStandardMaterial({ color: spec.eyeColor ?? 0xd8c690, roughness: 0.3, ...(spec.eyeColor === 0xf2c43a ? { emissive: 0x6a4a00 } : {}) });
  const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1 });
  const eyeSides = spec.extras?.includes('eyesUp') ? [1, 1] : [1, -1];
  if (eyeR > 0.001 && !spec.extras?.includes('hammer')) {
    eyeSides.forEach((sz, k) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(eyeR, 16, 12), iris);
      const p = new THREE.Mesh(new THREE.SphereGeometry(eyeR * 0.6, 16, 12), pupilMat);
      const dx = spec.extras?.includes('eyesUp') ? k * -0.05 : 0;
      e.position.set(eyeX + dx, eyeY + (spec.extras?.includes('eyesUp') ? k * 0.02 : 0), sz * eyeZ);
      p.position.set(eyeX + dx + eyeR * 0.3, e.position.y, sz * (eyeZ + eyeR * 0.5));
      g.add(e, p);
    });
  }

  // ---- extras
  const bone = new THREE.MeshStandardMaterial({ color: 0xf2efe4, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.back), roughness: 0.6 });
  const nose = new THREE.Vector3(0.5, 0, 0);
  for (const ex of spec.extras ?? []) {
    switch (ex) {
      case 'barbels2':
      case 'barbels4':
      case 'barbels8': {
        const n = ex === 'barbels2' ? 2 : ex === 'barbels4' ? 4 : 8;
        const len = ex === 'barbels2' ? 0.28 : 0.1;
        for (let i = 0; i < n; i++) {
          const zz = (i % 2 ? 1 : -1) * (0.02 + 0.01 * Math.floor(i / 2));
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(0.48, -0.01 - 0.01 * Math.floor(i / 2), zz),
            new THREE.Vector3(0.48 + len * 0.3, -len * 0.3, zz * 2),
            new THREE.Vector3(0.48 - len * 0.2, -len * 0.8, zz * 4),
          );
          g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.004, 5), dark));
        }
        break;
      }
      case 'hammer': {
        const hammer = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.26, 6, 12), new THREE.MeshPhysicalMaterial({ color: spec.back, roughness: 0.55 }));
        hammer.rotation.x = Math.PI / 2;
        hammer.scale.set(1.2, 1, 0.45);
        hammer.position.set(0.47, H(0.95) * 0.2, 0);
        g.add(hammer);
        for (const sz of [1, -1]) {
          const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), pupilMat);
          e.position.set(0.47, H(0.95) * 0.2, sz * 0.16);
          g.add(e);
        }
        break;
      }
      case 'lure': {
        // anglerfish: a rod on the forehead with a glowing bulb
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.3, H(0.8), 0), new THREE.Vector3(0.45, H(0.8) + 0.25, 0), new THREE.Vector3(0.62, H(0.8) + 0.12, 0));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.006, 6), dark));
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0xbffcff, emissive: 0x5ff2ff, emissiveIntensity: 4 }));
        bulb.position.set(0.62, H(0.8) + 0.12, 0);
        // glow only, no PointLight: adding a light when the fish appears recompiles every shader (a stall)
        g.add(bulb);
        g.userData.glow = bulb;
        break;
      }
      case 'goblinSnout': {
        const snout = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 12), new THREE.MeshPhysicalMaterial({ color: spec.side, roughness: 0.5, transmission: 0.1 }));
        snout.rotation.z = -Math.PI / 2;
        snout.scale.set(1, 1, 0.4);
        snout.position.set(0.58, H(0.9) * 0.3, 0);
        g.add(snout);
        // protruding jaw
        const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb8606a, roughness: 0.5 }));
        jaw.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
        jaw.position.set(0.5, -H(0.9) * 0.6, 0);
        g.add(jaw);
        break;
      }
      case 'bill': {
        const bill = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.4, 8), dark);
        bill.rotation.z = -Math.PI / 2;
        bill.position.set(0.68, H(0.95) * 0.3, 0);
        g.add(bill);
        break;
      }
      case 'trunk': {
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.47, -0.01, 0), new THREE.Vector3(0.6, -0.02, 0), new THREE.Vector3(0.62, -0.12, 0));
        g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.014, 8), dark));
        break;
      }
      case 'teeth':
      case 'fangs': {
        const n = ex === 'fangs' ? 7 : 12;
        const size = ex === 'fangs' ? 0.022 : 0.01;
        for (const jaw of [1, -1]) {
          for (let i = 0; i < n; i++) {
            const t = new THREE.Mesh(new THREE.ConeGeometry(size * 0.35, size * 2, 6), bone);
            const ang = (i / (n - 1) - 0.5) * 1.6;
            t.position.set(nose.x - 0.02 - Math.abs(ang) * 0.03, jaw * 0.004 - 0.01, Math.sin(ang) * spec.width * 0.35);
            t.rotation.z = jaw > 0 ? Math.PI : 0;
            g.add(t);
          }
        }
        break;
      }
      case 'dome': {
        // barreleye: transparent head with two green tube eyes looking up
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(0.11, 24, 16),
          new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.95, roughness: 0.05, thickness: 0.05, ior: 1.2, transparent: true, opacity: 0.6 }),
        );
        dome.scale.set(1.4, 1, 1);
        dome.position.set(0.3, H(0.75) + 0.02, 0);
        g.add(dome);
        for (const sz of [1, -1]) {
          const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.07, 12), new THREE.MeshStandardMaterial({ color: 0x5dff7a, emissive: 0x1a8a2a, emissiveIntensity: 1.5 }));
          eye.position.set(0.3, H(0.75) + 0.02, sz * 0.025);
          g.add(eye);
        }
        break;
      }
      case 'finlets':
        for (let i = 0; i < 6; i++) {
          const u = 0.08 + i * 0.04;
          for (const sgn of [1, -1]) {
            const m = fin([0, 0], [[0.005, 0.02, -0.01, 0.025], [-0.01, 0.005, -0.015, 0]], new THREE.MeshStandardMaterial({ color: 0xf2d13a, side: THREE.DoubleSide }));
            m.position.set(u - 0.5, sgn * H(u), 0);
            m.scale.y = sgn;
            g.add(m);
          }
        }
        break;
      case 'bigMouth':
      case 'eyesUp':
        break;
    }
  }
  if (id === 'face_fish') addFace(g, spec);
  return g;
}

/** Giant isopod: a segmented grey-lilac shell with legs and antennae. */
function buildIsopod(): THREE.Group {
  const g = new THREE.Group();
  const shell = new THREE.MeshPhysicalMaterial({ color: 0xb8aeb4, roughness: 0.45, clearcoat: 0.6 });
  const n = 9;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const w = 0.18 * Math.sin(Math.PI * (0.15 + u * 0.7)) + 0.06;
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell);
    seg.scale.set(0.17, w * 0.6, w);
    seg.position.set(-0.45 + u * 0.9, 0, 0);
    g.add(seg);
  }
  const legMat = new THREE.MeshStandardMaterial({ color: 0xd6c9cc });
  for (let i = 0; i < 7; i++) {
    for (const sz of [1, -1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.12, 6), legMat);
      leg.position.set(-0.3 + i * 0.09, -0.03, sz * 0.14);
      leg.rotation.x = sz * 0.9;
      g.add(leg);
    }
  }
  for (const sz of [1, -1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0.45, 0, sz * 0.03), new THREE.Vector3(0.6, 0.02, sz * 0.1), new THREE.Vector3(0.62, -0.02, sz * 0.25));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.005, 5), legMat));
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x1a1a1a, roughness: 0.1, clearcoat: 1 }));
    eye.scale.set(0.5, 0.7, 1);
    eye.position.set(0.44, 0.03, sz * 0.09);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8), shell);
  tail.scale.set(0.5, 0.2, 1.2);
  tail.position.set(-0.5, 0, 0);
  g.add(tail);
  // shown the way people photograph them: back toward the viewer (+z)
  const outer = new THREE.Group();
  g.rotation.x = Math.PI / 2;
  outer.add(g);
  outer.userData.tail = tail;
  return outer;
}

/** Blobfish (out of the water): a sagging pink jelly with a droopy nose. */
function buildBlobfish(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.5, 48, 32);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const u = x + 0.5;
    const taper = 0.25 + 0.75 * Math.min(1, u * 1.6);
    y = y * 0.55 * taper - (y < 0 ? 0.08 * u : 0) - 0.09 * Math.max(0, u - 0.55) * 4 * (1 - Math.abs(z) * 2);
    z = z * 0.8 * taper;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const jelly = new THREE.MeshPhysicalMaterial({ color: 0xe7a3ad, roughness: 0.25, clearcoat: 1, transmission: 0.15, thickness: 0.2 });
  g.add(new THREE.Mesh(geo, jelly));
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), jelly);
  nose.scale.set(1, 0.8, 0.9);
  nose.position.set(0.47, -0.02, 0);
  g.add(nose);
  for (const sz of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), new THREE.MeshPhysicalMaterial({ color: 0x111, clearcoat: 1 }));
    eye.position.set(0.36, 0.1, sz * 0.12);
    g.add(eye);
  }
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), jelly);
  tail.scale.set(1, 1.4, 0.3);
  tail.position.set(-0.5, 0, 0);
  g.add(tail);
  g.userData.tail = tail;
  return g;
}

// ---------------------------------------------------------------- M4 인면어: the player's face

/**
 * The player's face (null = none saved). Only ever in this page's memory and the GPU — see
 * src/app/face.ts and docs/PRIVACY.md. Every 인면어 face uses the same texture, swapped here.
 */
let faceTex: THREE.Texture | null = null;
const faceMats = new Set<THREE.MeshStandardMaterial>();

export function setFaceImage(img: ImageBitmap | HTMLCanvasElement | null): void {
  faceTex?.dispose();
  faceTex = null;
  if (img) {
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')!.drawImage(img, 0, 0);
    faceTex = new THREE.CanvasTexture(c);
    faceTex.colorSpace = THREE.SRGBColorSpace;
  }
  for (const m of faceMats) {
    m.map = faceTex;
    m.visible = !!faceTex;
    m.needsUpdate = true;
  }
}

/**
 * The face on the front of the head, looking forward (+x): a slightly domed disc, like a mask on the
 * fish's blunt nose. A photo taken face-on reads naturally this way (user: "사진을 정면으로 찍다보니까
 * 이상한데 … 정면을 보게"); the catch close-up turns the 인면어 to face the camera.
 */
function addFace(g: THREE.Group, spec: FishSpec): void {
  const r = spec.depth * 0.56;
  // a shallow spherical cap facing +z, turned to face +x
  const geo = new THREE.SphereGeometry(r * 1.6, 40, 20, 0, Math.PI * 2, 0, 0.62);
  geo.rotateX(Math.PI / 2);
  // flat UVs: the photo seen straight on
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const span = r * 1.6 * Math.sin(0.62);
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / (2 * span), 0.5 + pos.getY(i) / (2 * span));
  geo.translate(0, 0, -r * 1.6 * Math.cos(0.62));
  geo.rotateY(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, alphaTest: 0.04, roughness: 0.55, visible: !!faceTex });
  faceMats.add(mat);
  const face = new THREE.Mesh(geo, mat);
  face.position.set(0.47, spec.depth * 0.03, 0);
  g.add(face);
}
