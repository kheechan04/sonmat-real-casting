// 3D view. Photographic backdrop: a real 360° photo of a lake pier (Poly Haven "Bell Park Pier",
// CC0 — docs/ASSETS.md) on a sky sphere, and the same place's HDR for image-based lighting, so the
// rod / float / fish are lit by the scene they sit in. The water in view IS the photo; only ripples,
// the float and the line are drawn on it (camera height EYE_M matches the photo's so distances line up).
//
// Fish: a procedural stand-in (body curve, fins, eye) until the user's photos are ready — its UVs are
// what the photo texture will use (M2).
//
// The scene reads the game's state every frame (phase, phase start, tension, …) rather than being
// told about events, so it cannot drift out of sync with the game.

import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { FLIGHT_S, type FishingGame } from '../core/game';
import type { Side } from '../core/pose';
import type { Species } from '../core/params';

const BASE = import.meta.env.BASE_URL;
const BACKDROP_URL = `${BASE}env/bell_park_pier.jpg`;
const HDR_URL = `${BASE}env/bell_park_pier_1k.hdr`;

/** Eye height above the water, m (tuned so a float at 20 m sits where the photo's water is). */
const EYE_M = 2.0;
/** Panorama yaw so that open water + hills are straight ahead (tuned by screenshot). */
const PANO_YAW = -0.45;
const FLIGHT_MS = FLIGHT_S * 1000;
const SWING_MS = 350;
const LINE_POINTS = 40;
/** The float's visible top (찌톱) is scaled up so it reads at 20 m on a webcam-game screen. */
const FLOAT_SCALE = 4;
/** Height of one coloured band of the 찌톱, m (before FLOAT_SCALE). */
const BAND_H = 0.03;

// ---------------------------------------------------------------- textures made in code

function ringTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.72, 'rgba(255,255,255,0.0)');
  grad.addColorStop(0.86, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Fish-scale relief for the body's bump map. */
function scaleTexture(): THREE.Texture {
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
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 2);
  return t;
}

// ---------------------------------------------------------------- fish stand-in

const PALETTE: Record<Species, { back: THREE.Color; side: THREE.Color; belly: THREE.Color; fin: number }> = {
  crucian: { back: new THREE.Color(0x2f3320), side: new THREE.Color(0xa88d45), belly: new THREE.Color(0xe8dcb2), fin: 0x5b4d2a },
  carp: { back: new THREE.Color(0x2b2216), side: new THREE.Color(0x8e6c3a), belly: new THREE.Color(0xe0cfa0), fin: 0x5a3f22 },
};

/** Body 1 unit long along x (head at +x), laterally compressed, tapering to the tail. */
function buildFish(species: Species, scales: THREE.Texture): THREE.Group {
  const pal = PALETTE[species];
  const deep = species === 'crucian' ? 0.2 : 0.16; // crucians are deep-bodied, carp longer
  const geo = new THREE.SphereGeometry(0.5, 64, 32);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors: number[] = [];
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    let y = pos.getY(i);
    let z = pos.getZ(i);
    const u = x + 0.5; // 0 tail … 1 head
    // height profile: peak a bit ahead of the middle, pinched at the tail stalk, rounded head
    const prof = Math.sin(Math.PI * Math.min(1, Math.max(0, u * 0.92 + 0.04))) ** 0.8 * (0.35 + 0.65 * Math.min(1, u * 2.2));
    y = (y / 0.5) * deep * prof + (y > 0 ? 0.015 * prof : 0);
    z = (z / 0.5) * 0.075 * prof;
    pos.setXYZ(i, x, y, z);
    // colour: dark back → golden side → pale belly
    const k = THREE.MathUtils.clamp((y / (deep * prof + 1e-4) + 1) / 2, 0, 1);
    if (k > 0.55) tmp.copy(pal.side).lerp(pal.back, (k - 0.55) / 0.45);
    else tmp.copy(pal.belly).lerp(pal.side, k / 0.55);
    colors.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const skin = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: 0.32,
    metalness: 0.25,
    clearcoat: 0.8,
    clearcoatRoughness: 0.25,
    bumpMap: scales,
    bumpScale: 0.6,
    iridescence: 0.35,
  });
  const body = new THREE.Mesh(geo, skin);

  // fins: thin and translucent, lit from behind by the sky
  const finMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(pal.fin).lerp(pal.side, 0.35),
    roughness: 0.55,
    transmission: 0.5,
    thickness: 0.01,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
  });
  /** Fin outline from a start point and [control, end] quadratic segments. */
  const fin = (start: [number, number], segs: [number, number, number, number][]) => {
    const sh = new THREE.Shape();
    sh.moveTo(start[0], start[1]);
    for (const [cx, cy, x, y] of segs) sh.quadraticCurveTo(cx, cy, x, y);
    return new THREE.Mesh(new THREE.ShapeGeometry(sh, 16), finMat);
  };
  // forked tail with rounded lobes
  const tail = fin([0.02, 0.03], [
    [-0.08, 0.08, -0.2, 0.19], [-0.25, 0.2, -0.24, 0.13], [-0.19, 0.05, -0.15, 0],
    [-0.19, -0.05, -0.24, -0.13], [-0.25, -0.2, -0.2, -0.19], [-0.08, -0.08, 0.02, -0.03],
  ]);
  tail.position.x = -0.46;
  const dorsal = fin([0.14, -0.01], [[0.1, 0.12, 0.0, 0.11], [-0.14, 0.09, -0.2, -0.01]]);
  dorsal.position.set(0, deep * 0.92, 0);
  const anal = fin([0.0, 0.01], [[-0.02, -0.08, -0.08, -0.08], [-0.13, -0.05, -0.15, 0.01]]);
  anal.position.set(-0.2, -deep * 0.68, 0);
  const pect = fin([0, 0], [[-0.06, -0.01, -0.11, -0.04], [-0.07, -0.07, 0, 0]]);
  pect.position.set(0.24, -deep * 0.35, 0.07);
  pect.rotation.y = -0.4;

  const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.028, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd8c690, roughness: 0.3 }));
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.017, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1 }));
  eyeWhite.position.set(0.36, deep * 0.28, 0.055);
  pupil.position.set(0.37, deep * 0.28, 0.07);

  const g = new THREE.Group();
  g.add(body, tail, dorsal, anal, pect, eyeWhite, pupil);
  if (species === 'carp') {
    // barbels (잉어 수염)
    const barbel = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, 0.06, 6), new THREE.MeshStandardMaterial({ color: pal.fin }));
    barbel.rotation.z = 1.2;
    barbel.position.set(0.5, -0.03, 0.03);
    const b2 = barbel.clone();
    b2.position.z = -0.03;
    g.add(barbel, b2);
  }
  g.userData.tail = tail;
  return g;
}

// ---------------------------------------------------------------- rod

const ROD_LEN = 2.7;
const ROD_SEGS = 10;

interface Ripple {
  mesh: THREE.Mesh;
  born: number;
  life: number;
  size: number;
}

export class FishingScene {
  /** Resolves when the backdrop and lighting have loaded. */
  readonly ready: Promise<void>;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 1200);
  private rodBase = new THREE.Group();
  private rodSegs: THREE.Group[] = [];
  private rodTip = new THREE.Object3D();
  private float = new THREE.Group();
  private line: THREE.Line;
  private linePos: Float32Array;
  private lineMat: THREE.LineBasicMaterial;
  private ringTex = ringTexture();
  private ripples: Ripple[] = [];
  private fishes: Record<Species, THREE.Group>;
  private shadow: THREE.Mesh;
  private lastPhase = '';
  private rodHand: Side = 'right';
  private floatPos = new THREE.Vector3();
  private catchSpecies: Species | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // pose inference shares the machine (Shadow Mitts: keep the render load small)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color(0x9fb6c4);

    this.camera.position.set(0, EYE_M, 0);
    this.camera.rotation.set(-0.07, 0, 0, 'YXZ');

    const sun = new THREE.DirectionalLight(0xfff2e0, 0.8);
    sun.position.set(-5, 8, 6);
    this.scene.add(sun);

    this.buildRod();
    this.buildFloat();

    this.linePos = new Float32Array(LINE_POINTS * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.75 });
    this.line = new THREE.Line(lg, this.lineMat);
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    // dark patch under the water where the hooked fish is
    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({ color: 0x0a1a1c, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);

    const scales = scaleTexture();
    this.fishes = { crucian: buildFish('crucian', scales), carp: buildFish('carp', scales) };
    for (const f of Object.values(this.fishes)) {
      f.visible = false;
      this.scene.add(f);
    }

    this.ready = this.loadEnvironment();
    this.resize();
  }

  private async loadEnvironment(): Promise<void> {
    const [hdr, photo] = await Promise.all([
      new HDRLoader().loadAsync(HDR_URL),
      new THREE.TextureLoader().loadAsync(BACKDROP_URL),
    ]);
    // image-based lighting from the same place
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.environment = pmrem.fromEquirectangular(hdr).texture;
    this.scene.environmentRotation.set(0, PANO_YAW, 0);
    hdr.dispose();
    pmrem.dispose();

    // backdrop: the photo on an inside-out sphere, shown as-is (it is already tone-mapped)
    photo.colorSpace = THREE.SRGBColorSpace;
    photo.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    let map: THREE.Texture = photo;
    const maxTex = this.renderer.capabilities.maxTextureSize;
    const img = photo.image as HTMLImageElement;
    if (img.width > maxTex) {
      // older GPUs: 8192 px is over the limit — downscale once
      const c = document.createElement('canvas');
      c.width = maxTex;
      c.height = maxTex / 2;
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      map = new THREE.CanvasTexture(c);
      map.colorSpace = THREE.SRGBColorSpace;
    }
    const sky = new THREE.SphereGeometry(800, 96, 48);
    sky.scale(-1, 1, 1);
    const skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ map, toneMapped: false, depthWrite: false, fog: false }));
    skyMesh.rotation.y = PANO_YAW;
    skyMesh.position.y = EYE_M; // centred on the eye like the camera that took the photo
    skyMesh.renderOrder = -1;
    this.scene.add(skyMesh);
    this.scene.background = null;
  }

  private buildRod(): void {
    const blank = new THREE.MeshPhysicalMaterial({ color: 0x1a1d22, roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.15 });
    const cork = new THREE.MeshStandardMaterial({ color: 0xb58a58, roughness: 0.95 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.25, metalness: 1 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 1 });

    // handle + reel seat + spinning reel under the rod
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.015, 0.34, 20), cork);
    handle.position.y = -0.12;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.1, 20), metal);
    seat.position.y = 0.08;
    const reel = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.06, 0.02), blank);
    stem.position.set(0, 0, -0.035);
    const bodyR = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 24), blank);
    bodyR.rotation.x = Math.PI / 2;
    bodyR.position.set(0, 0, -0.08);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.035, 24), gold);
    spool.position.set(0, 0.04, -0.08);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.07, 10), metal);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.045, 0, -0.08);
    reel.add(stem, bodyR, spool, knob);
    reel.position.y = 0.08;
    reel.userData.knob = knob;
    this.rodBase.add(handle, seat, reel);

    // blank as a chain of segments so it can bend
    const segLen = ROD_LEN / ROD_SEGS;
    let parent: THREE.Object3D = this.rodBase;
    for (let i = 0; i < ROD_SEGS; i++) {
      const r0 = 0.012 * (1 - i / ROD_SEGS) + 0.0025;
      const r1 = 0.012 * (1 - (i + 1) / ROD_SEGS) + 0.0025;
      const seg = new THREE.Group();
      seg.position.y = i === 0 ? 0.13 : segLen;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segLen, 12), blank);
      m.position.y = segLen / 2;
      seg.add(m);
      if (i % 2 === 1) {
        const guide = new THREE.Mesh(new THREE.TorusGeometry(0.012 * (1 - i / ROD_SEGS) + 0.004, 0.0015, 6, 16), metal);
        guide.position.set(0, segLen * 0.5, -(r0 + 0.012));
        guide.rotation.x = Math.PI / 2;
        seg.add(guide);
      }
      parent.add(seg);
      this.rodSegs.push(seg);
      parent = seg;
    }
    this.rodTip.position.y = segLen;
    parent.add(this.rodTip);
    this.scene.add(this.rodBase);
  }

  private buildFloat(): void {
    // 찌톱: fluorescent bands above the water, then the body (mostly hidden under the surface)
    const bands = [0xff3b1f, 0xffd000, 0xff3b1f, 0x21c25a];
    const bandH = BAND_H;
    bands.forEach((c, i) => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.004, 0.004, bandH, 10),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, roughness: 0.4 }),
      );
      m.position.y = bandH * (bands.length - i - 0.5);
      this.float.add(m);
    });
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.012, 0.12, 6, 12),
      new THREE.MeshPhysicalMaterial({ color: 0x2a2a2a, roughness: 0.3, clearcoat: 1 }),
    );
    body.position.y = -0.08;
    this.float.add(body);
    this.float.scale.setScalar(FLOAT_SCALE);
    this.scene.add(this.float);
  }

  setRodHand(side: Side): void {
    this.rodHand = side;
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private ripple(at: THREE.Vector3, now: number, size = 1, life = 1.8): void {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: this.ringTex, transparent: true, depthWrite: false, opacity: 0.8 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.002, at.z);
    this.scene.add(mesh);
    this.ripples.push({ mesh, born: now, life, size });
  }

  private poseRod(elev: number, yaw: number, bend: number): void {
    const side = this.rodHand === 'right' ? 1 : -1;
    this.rodBase.position.set(0.4 * side, EYE_M - 0.8, -0.75);
    // geometry points along +y; rotating about x by −(π/2 − elev) aims it forward (−z) and up
    this.rodBase.rotation.set(-(Math.PI / 2 - elev), yaw - 0.1 * side, 0, 'YXZ');
    // bend grows toward the tip
    this.rodSegs.forEach((s, i) => {
      s.rotation.x = -bend * (0.02 + 0.13 * (i / ROD_SEGS) ** 1.6);
    });
    this.rodBase.updateMatrixWorld(true);
  }

  /** Draw one frame for the game's current state. `now` in ms (same clock as the game). */
  render(g: FishingGame, now: number): void {
    const since = now - g.phaseT;
    const side = this.rodHand === 'right' ? 1 : -1;

    // ---- rod
    let elev = 0.5;
    let yaw = 0;
    let bend = 0.15;
    switch (g.phase) {
      case 'bait':
      case 'ready':
        elev = 0.72;
        bend = 0.05;
        break;
      case 'flight':
        if (since < SWING_MS) {
          elev = 1.95 - 1.45 * (since / SWING_MS);
          bend = 1.2 * Math.sin((since / SWING_MS) * Math.PI);
        } else elev = 0.5;
        break;
      case 'bite':
        elev = 0.45;
        bend = 0.9 + Math.sin(now / 50) * 0.08;
        break;
      case 'reeling':
        // held lower so the whole bent arc stays in view
        elev = 0.6 - g.tension * 0.12;
        bend = g.running ? 1.9 + Math.sin(now / 70) * 0.12 : 0.7 + g.tension * 0.8;
        if (g.running) yaw = Math.sin(now / 160) * 0.05;
        break;
      case 'caught':
        // rod swung aside so it doesn't cross the fish held up in front
        elev = 0.75;
        yaw = -0.5 * side; // +yaw turns a forward-pointing rod to the left
        bend = 0.3;
        break;
      default:
        break;
    }
    this.poseRod(elev, yaw, bend);
    const tip = this.rodTip.getWorldPosition(new THREE.Vector3());

    // ---- float
    const landing = new THREE.Vector3(0.9 * side, 0, -g.distanceM);
    const fp = this.floatPos.copy(landing);
    // rise, in bands of the 찌톱: 0 = normal (3 of 4 bands showing), +1.5 = 찌올림, −4 = under
    let rise = 0;
    let tilt = 0;
    const showFloat = !['bait', 'ready', 'missed', 'caught'].includes(g.phase);
    this.float.visible = showFloat;
    if (g.phase === 'flight') {
      const u = Math.min(1, since / FLIGHT_MS);
      fp.lerpVectors(tip, landing, u);
      fp.y = tip.y * (1 - u) + Math.sin(u * Math.PI) * (2 + g.distanceM * 0.2);
      tilt = u * 6;
    } else if (g.phase === 'waiting') {
      rise = Math.sin(now / 900) * 0.15;
    } else if (g.phase === 'nibble') {
      rise = g.nibbling ? -1.2 * Math.abs(Math.sin(now / 70)) : Math.sin(now / 900) * 0.15;
    } else if (g.phase === 'bite' && g.fish) {
      if (g.fish.species === 'crucian') {
        // 찌올림: the classic crucian bite — the float rises slowly, band by band
        rise = Math.min(1.8, since / 500);
      } else {
        // 잉어: sucked under and dragged
        rise = -Math.min(4.5, since / 60);
        fp.x += Math.min(1, since / 800) * 0.6 * side;
      }
    } else if (g.phase === 'reeling' && g.fish) {
      const out = g.lineOutM();
      fp.z = -Math.max(1.5, out);
      fp.x = 0.9 * side * (out / Math.max(1, g.distanceM)) + (g.running ? Math.sin(now / 130) * 0.8 : Math.sin(now / 700) * 0.25);
      rise = -2;
      tilt = g.running ? 0.9 : 0.5;
    }
    if (g.phase !== 'flight') fp.y = -BAND_H * FLOAT_SCALE * (1 - rise);
    this.float.position.copy(fp);
    this.float.rotation.set(g.phase === 'flight' ? tilt : 0, 0, g.phase === 'flight' ? 0 : tilt * -side * 0.5);

    // ripples: landing, bite, nibbles, fish runs, reeling wake
    if (g.phase !== this.lastPhase) {
      if (g.phase === 'waiting') this.ripple(fp, now, 1.4, 2.2);
      if (g.phase === 'bite') this.ripple(fp, now, 1, 1.4);
      if (g.phase === 'reeling') this.ripple(fp, now, 2, 1.6);
      this.lastPhase = g.phase;
    }
    const r = Math.random();
    if (g.phase === 'waiting' && r < 0.004) this.ripple(fp, now, 0.6, 2.5);
    if (g.phase === 'nibble' && g.nibbling && r < 0.08) this.ripple(fp, now, 0.5, 1);
    if (g.phase === 'reeling') {
      if ((g.running || g.runSoon) && r < 0.2) this.ripple(fp, now, g.running ? 1.6 : 1.2, 1.1);
      else if (r < 0.05) this.ripple(fp, now, 0.8, 1.4);
    }

    // ---- line: sag from the tip to the float, straight and tinted under tension
    this.line.visible = showFloat;
    if (showFloat) {
      const sag = g.phase === 'reeling' ? (g.running ? 0.02 : 0.25 * (1 - g.tension)) : g.phase === 'flight' ? 0 : 0.8;
      const top = fp.clone();
      top.y += g.phase === 'flight' ? 0 : 0.05;
      for (let i = 0; i < LINE_POINTS; i++) {
        const u = i / (LINE_POINTS - 1);
        const p = new THREE.Vector3().lerpVectors(tip, top, u);
        p.y -= Math.sin(u * Math.PI) * sag;
        if (g.running) p.x += Math.sin(u * Math.PI) * Math.sin(now / 25) * 0.01; // vibrating line
        if (p.y < 0.003 && u > 0.5) p.y = 0.003;
        this.linePos.set([p.x, p.y, p.z], i * 3);
      }
      this.line.geometry.attributes.position.needsUpdate = true;
      const t = g.phase === 'reeling' ? g.tension : 0;
      this.lineMat.color.setRGB(0.95, 0.95 - 0.55 * t, 0.95 - 0.7 * t);
      this.lineMat.opacity = 0.6 + 0.35 * t;
    }

    // ---- hooked fish's shadow
    this.shadow.visible = g.phase === 'reeling' && !!g.fish;
    if (this.shadow.visible && g.fish) {
      const len = (g.fish.lengthCm / 100) * 2.2;
      this.shadow.position.set(fp.x, 0.001, fp.z - len * 0.4);
      this.shadow.scale.set(len, len * 0.35, 1);
    }

    // ---- catch close-up: the fish held up in front of the camera
    const showFish = g.phase === 'caught' && g.fish ? g.fish.species : null;
    if (showFish !== this.catchSpecies) {
      for (const [sp, f] of Object.entries(this.fishes)) f.visible = sp === showFish;
      this.catchSpecies = showFish;
    }
    if (showFish && g.fish) {
      const f = this.fishes[showFish];
      const lenM = g.fish.lengthCm / 100;
      f.scale.setScalar(lenM * 1.25);
      const up = Math.min(1, since / 700);
      const ease = 1 - (1 - up) ** 3;
      // held up above the result card
      f.position.set(0.05, EYE_M - 0.4 + ease * 0.42 + Math.sin(now / 500) * 0.01, -0.75 - lenM * 0.7);
      f.rotation.set(0.05, 0.25 + Math.sin(now / 1400) * 0.25, Math.sin(now / 180) * 0.06 * (1 - ease * 0.6));
      (f.userData.tail as THREE.Mesh).rotation.y = Math.sin(now / 120) * 0.35;
    }

    // ripples expand and fade
    this.ripples = this.ripples.filter((rp) => {
      const age = (now - rp.born) / 1000;
      if (age > rp.life) {
        this.scene.remove(rp.mesh);
        rp.mesh.geometry.dispose();
        (rp.mesh.material as THREE.Material).dispose();
        return false;
      }
      const k = age / rp.life;
      rp.mesh.scale.setScalar(rp.size * (0.3 + k * 2.2));
      (rp.mesh.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      return true;
    });

    this.renderer.render(this.scene, this.camera);
  }
}
