// 3D view. Far away (above the horizon): a real 360° photo of a lake (Poly Haven "Bell Park Pier",
// CC0 — docs/ASSETS.md) on a sky sphere; its HDR lights the scene. Near and on the water: real 3D —
// a moving, reflecting water surface (three.js Water), the wooden deck the player stands on, props
// and shore grass (Poly Haven CC0 models), rod, line, float, ripples. User (M1.5 feedback): "3D였으면
// 좋겠어, 물도 실제로 흐르고" — distant hills barely move with parallax, so the photo stays for those.
//
// Fish: a procedural stand-in (body curve, fins, eye) until the user's photos are ready — its UVs are
// what the photo texture will use (M2).
//
// The scene reads the game's state every frame (phase, phase start, tension, …) rather than being
// told about events, so it cannot drift out of sync with the game.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { buildAnimal } from './animals';
import { buildSpecies } from './fishModels';
import { FLIGHT_S, type FishingGame } from '../core/game';
import type { Side } from '../core/pose';
import type { EventKind, LocationId } from '../core/species';

const BASE = import.meta.env.BASE_URL;
const WATER_NORMALS_URL = `${BASE}tex/waternormals.jpg`;
const PLANK_URL = (map: string) => `${BASE}tex/weathered_planks_${map}_1k.jpg`;
const ROCK_URL = (map: string) => `${BASE}tex/dry_riverbed_rock_${map}_1k.jpg`;
const MODEL_URL = (id: string) => `${BASE}models/${id}/${id}_1k.gltf`;
/** Deck surface height above the water, m. The eye is EYE_M above the water. */
const DECK_Y = 0.4;

/** Eye height above the water, m (tuned so a float at 20 m sits where the photo's water is). */
const EYE_M = 2.0;
/**
 * One fishing place (M2). Backdrop + lighting photos are Poly Haven CC0 (docs/ASSETS.md).
 * yaw: panorama turn so the open water is straight ahead; shoreRow: row (fraction of the photo's
 * height) where the far shore / horizon meets the water — scripts/make-backdrops.mjs keeps only the
 * rows above it, and mirroredBackdrop fills the rest with a mirror image. Both tuned by screenshot.
 */
interface PlaceConfig {
  photo: string;
  yaw: number;
  shoreRow: number;
  water: { color: number; distortion: number; size: number; sunColor: number; sunDir: [number, number, number] };
  exposure: number;
  ground: 'deck' | 'rock' | 'boat';
  grass: boolean;
}

const PLACES: Record<LocationId, PlaceConfig> = {
  reservoir: {
    photo: 'bell_park_pier', yaw: -0.45, shoreRow: 2036 / 4096, exposure: 1, ground: 'deck', grass: true,
    water: { color: 0x16302f, distortion: 0.5, size: 3.5, sunColor: 0x6b645a, sunDir: [-0.45, 0.5, 0.75] },
  },
  sea: {
    photo: 'simons_town_rocks', yaw: -1.57, shoreRow: 0.5, exposure: 1, ground: 'rock', grass: false,
    water: { color: 0x0c3a4c, distortion: 1.4, size: 1.4, sunColor: 0xfff0d0, sunDir: [0, 0.35, -1] },
  },
  deep: {
    photo: 'the_sky_is_on_fire', yaw: 0, shoreRow: 0.5, exposure: 0.9, ground: 'boat', grass: false,
    water: { color: 0x0b1726, distortion: 0.55, size: 1.2, sunColor: 0xff9a50, sunDir: [0, 0.12, -1] },
  },
  river: {
    photo: 'river_rocks', yaw: 0, shoreRow: 0.53, exposure: 1, ground: 'rock', grass: true,
    water: { color: 0x2e3320, distortion: 0.45, size: 3, sunColor: 0xfff0d0, sunDir: [0.3, 0.6, -0.7] },
  },
};
const FLIGHT_MS = FLIGHT_S * 1000;
const SWING_MS = 350;
const LINE_POINTS = 40;
/** The float's visible top (찌톱) is scaled up so it reads at 20 m on a webcam-game screen. */
const FLOAT_SCALE = 5.5;
export type AnimalAction = 'approach' | 'escape' | 'steal' | 'spook';
/** How far away each thief surfaces, m. */
const ANIMAL_START: Record<EventKind, number> = { otter: 4, crocodile: 7, orca: 12, hippo: 2 };
/** Shown larger than life (like the float) so they read at 20 m on a webcam-game screen. */
const ANIMAL_SCALE: Record<EventKind, number> = { otter: 2.6, orca: 1, crocodile: 1.5, hippo: 1.8 };
/** Splash droplet pool size. */
const MAX_DROPS = 700;
const BASE_FOV = 50;
/** Height of one coloured band of the 찌톱, m (before FLOAT_SCALE). */
const BAND_H = 0.03;

// ---------------------------------------------------------------- textures made in code


/**
 * The backdrop with the photo's own water replaced by a mirror image of the shore above it. The 3D water
 * reflects the backdrop; reflecting the photo's (bright) water showed as a light band under the horizon.
 * A still-lake mirror of the hills is what real water there would reflect.
 */
/** Average colour of the backdrop just above the shore line — the haze the far water fades into. */
function horizonColor(c: HTMLCanvasElement, shoreRow: number): THREE.Color {
  const g = c.getContext('2d')!;
  const y = Math.max(0, Math.round(shoreRow * c.height) - 3);
  const d = g.getImageData(0, y, c.width, 1).data;
  let r = 0;
  let gr = 0;
  let b = 0;
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    gr += d[i + 1];
    b += d[i + 2];
  }
  return new THREE.Color().setRGB(r / n / 255, gr / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

/**
 * The full 2:1 panorama from its top part only: the shipped file (scripts/make-backdrops.mjs) holds just
 * the rows above the shore line, since everything below is replaced by the mirror image anyway —
 * 22 MB of 8K JPGs became 2.4 MB of WebP.
 */
function mirroredBackdrop(top: HTMLImageElement, maxWidth: number): HTMLCanvasElement {
  const w = Math.min(maxWidth, top.width);
  const h = w / 2;
  const sy = Math.round(top.height * (w / top.width));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.drawImage(top, 0, 0, w, sy);
  g.save();
  g.translate(0, 2 * sy);
  g.scale(1, -1);
  g.drawImage(c, 0, 0, w, sy, 0, 0, w, sy);
  g.restore();
  g.fillStyle = 'rgba(16, 32, 34, 0.35)'; // water is darker than what it mirrors
  g.fillRect(0, sy, w, h - sy);
  return c;
}

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
  private camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 7000);
  private water: Water | null = null;
  private skyMesh: THREE.Mesh | null = null;
  private placeCache = new Map<LocationId, Promise<{ sky: THREE.Texture; env: THREE.Texture; haze: THREE.Color }>>();
  private groups = { deck: new THREE.Group(), rock: new THREE.Group(), boat: new THREE.Group(), grass: new THREE.Group() };
  private place: LocationId | null = null;
  private rodBase = new THREE.Group();
  private rodSegs: THREE.Group[] = [];
  private rodTip = new THREE.Object3D();
  private float = new THREE.Group();
  private line: THREE.Line;
  private linePos: Float32Array;
  private lineMat: THREE.LineBasicMaterial;
  private ringTex = ringTexture();
  private ripples: Ripple[] = [];
  /** per-species models, built the first time that species is caught */
  private fishes = new Map<string, THREE.Group>();
  private shadow: THREE.Mesh;
  private lastPhase = '';
  private rodHand: Side = 'right';
  private floatPos = new THREE.Vector3();
  private catchSpecies: string | null = null;
  // ---- exaggerated effects (M1.5 feedback: "화면 이펙트 더 과장돼도 좋을 거 같아")
  /** camera shake energy 0–1 (squared for the offset) */
  private trauma = 0;
  /** field-of-view punch-in, degrees */
  private fovKick = 0;
  private lastRenderT = 0;
  private drops!: THREE.Points;
  private dropVel = new Float32Array(MAX_DROPS * 3);
  private dropLife = new Float32Array(MAX_DROPS);
  private dropNext = 0;
  // ---- interference animals (M2)
  private animals = new Map<EventKind, THREE.Group>();
  private animalAct: { kind: EventKind; action: AnimalAction; t0: number; dur: number; from: THREE.Vector3 } | null = null;
  private jumpStart = 0;
  private jumpSplashed = false;
  /** where the fish leapt out of the water (catch) */
  private leapFrom = new THREE.Vector3();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // pose inference shares the machine (Shadow Mitts: keep the render load small)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.scene.background = new THREE.Color(0x9fb6c4);

    this.camera.position.set(0, EYE_M, 0);
    this.camera.rotation.set(-0.11, 0, 0, 'YXZ');

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


    this.buildDrops();
    this.ready = this.loadEnvironment();
    this.resize();
  }

  private async loadEnvironment(): Promise<void> {
    for (const g of Object.values(this.groups)) this.scene.add(g);
    const sky = new THREE.SphereGeometry(800, 96, 48);
    sky.scale(-1, 1, 1);
    this.skyMesh = new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false, fog: false }));
    this.skyMesh.frustumCulled = false;
    this.skyMesh.position.y = EYE_M; // centred on the eye like the camera that took the photo
    this.skyMesh.renderOrder = -1;
    this.scene.add(this.skyMesh);
    this.scene.background = null;
    await this.buildWater();
    this.buildDeck();
    this.buildRock();
    this.buildBoat();
    // props are decoration: a failed download must not stop the game
    await this.loadProps().catch((e) => console.warn('props failed to load', e));
    await this.setPlace('reservoir');
  }

  /** Backdrop + lighting of one place (downloaded once, then cached). */
  private loadPlace(id: LocationId): Promise<{ sky: THREE.Texture; env: THREE.Texture; haze: THREE.Color }> {
    let p = this.placeCache.get(id);
    if (!p) {
      const cfg = PLACES[id];
      p = (async () => {
        const [hdr, photo] = await Promise.all([
          new HDRLoader().loadAsync(`${BASE}env/${cfg.photo}_1k.hdr`),
          new THREE.TextureLoader().loadAsync(`${BASE}env/${cfg.photo}_top.webp`),
        ]);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        hdr.mapping = THREE.EquirectangularReflectionMapping;
        const env = pmrem.fromEquirectangular(hdr).texture;
        hdr.dispose();
        pmrem.dispose();
        // (older GPUs: 8192 px can be over the texture limit — mirroredBackdrop downscales then)
        const img = photo.image as HTMLImageElement;
        const canvas = mirroredBackdrop(img, this.renderer.capabilities.maxTextureSize);
        const haze = horizonColor(canvas, (img.height / img.width) * 2);
        const sky = new THREE.CanvasTexture(canvas);
        sky.colorSpace = THREE.SRGBColorSpace;
        sky.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        photo.dispose();
        return { sky, env, haze };
      })();
      this.placeCache.set(id, p);
    }
    return p;
  }

  /** Switch the world to another fishing place (M2). Resolves when its photos are shown. */
  async setPlace(id: LocationId): Promise<void> {
    if (this.place === id) return;
    const cfg = PLACES[id];
    const { sky, env, haze } = await this.loadPlace(id);
    // far water fades into the photo's horizon colour — hides the reflection breaking up at grazing angles
    this.scene.fog = new THREE.Fog(haze, 500, 3500);
    this.place = id;
    (this.skyMesh!.material as THREE.MeshBasicMaterial).map = sky;
    (this.skyMesh!.material as THREE.MeshBasicMaterial).needsUpdate = true;
    this.scene.environment = env;
    this.setYaw(cfg.yaw);
    this.renderer.toneMappingExposure = cfg.exposure;
    if (this.water) {
      const u = this.water.material.uniforms;
      u.waterColor.value.setHex(cfg.water.color);
      u.distortionScale.value = cfg.water.distortion;
      u.size.value = cfg.water.size;
      u.sunColor.value.setHex(cfg.water.sunColor);
      u.sunDirection.value.set(...cfg.water.sunDir).normalize();
    }
    this.groups.deck.visible = cfg.ground === 'deck';
    this.groups.rock.visible = cfg.ground === 'rock';
    this.groups.boat.visible = cfg.ground === 'boat';
    this.groups.grass.visible = cfg.grass;
  }

  /** Turn the panorama (tuning aid; also used by setPlace). */
  setYaw(yaw: number): void {
    if (this.skyMesh) this.skyMesh.rotation.y = yaw;
    this.scene.environmentRotation.set(0, yaw, 0);
  }

  /** Reflecting water whose ripples keep moving (normal map scrolled over time). */
  private async buildWater(): Promise<void> {
    const normals = await new THREE.TextureLoader().loadAsync(WATER_NORMALS_URL);
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;
    // big enough that its edge sits on the horizon (a smaller plane left a dark line there)
    const water = new Water(new THREE.PlaneGeometry(9000, 9000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: normals,
      sunDirection: new THREE.Vector3(-0.45, 0.5, 0.75).normalize(),
      sunColor: 0x6b645a,
      waterColor: 0x16302f, // dark green reservoir water
      distortionScale: 0.5, // calm lake, not sea chop (compared 0.35 / 0.5 / 0.8 by screenshot)
      fog: true, // far edge fades into the horizon haze (setPlace)
    });
    water.rotation.x = -Math.PI / 2;
    water.material.uniforms.size.value = 3.5; // finer ripples than the ocean default
    this.scene.add(water);
    this.water = water;
  }

  /** The wooden deck (좌대) the player stands on, with posts into the water. */
  private buildDeck(): void {
    const loader = new THREE.TextureLoader();
    const tex = (name: string, srgb: boolean) => {
      const t = loader.load(PLANK_URL(name));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(1.2, 3.5);
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const wood = new THREE.MeshStandardMaterial({
      map: tex('diff', true),
      normalMap: tex('nor_gl', false),
      roughnessMap: tex('rough', false),
    });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 7.5), wood);
    deck.position.set(0, DECK_Y - 0.05, -0.5); // from behind the player to 4.25 m ahead
    this.groups.deck.add(deck);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2b, roughness: 0.9 });
    for (const x of [-1.2, 1.2]) {
      for (const z of [-4.1, -1.6, 0.9]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.4, 12), postMat);
        post.position.set(x, DECK_Y - 0.7, z);
        this.groups.deck.add(post);
      }
    }
  }

  /** A weathered rock ledge underfoot (sea shore, river bank) plus a few boulders. */
  private buildRock(): void {
    const loader = new THREE.TextureLoader();
    const tex = (name: string, srgb: boolean, rep: number) => {
      const t = loader.load(ROCK_URL(name));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep, rep);
      t.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const mat = new THREE.MeshStandardMaterial({
      map: tex('diff', true, 5),
      normalMap: tex('nor_gl', false, 5),
      normalScale: new THREE.Vector2(1.6, 1.6),
      color: 0xb8b4ae, // greyer than the texture's warm tone, like the granite in the photos
      roughness: 0.95,
    });
    // lumpy blob: an icosphere pushed around by a few sine waves, then squashed
    const blob = (r: number, seed: number, sx: number, sy: number, sz: number) => {
      const g = new THREE.IcosahedronGeometry(r, 5);
      const pos = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const n =
          1 +
          0.14 * Math.sin(x * 2.1 + seed) * Math.cos(z * 1.7 + seed * 2) +
          0.07 * Math.sin(y * 5 + x * 3 + seed) +
          0.035 * Math.sin(x * 11 + z * 9 + seed * 3) +
          0.02 * Math.sin(z * 23 - x * 17 + seed);
        pos.setXYZ(i, x * n * sx, y * n * sy, z * n * sz);
      }
      g.computeVertexNormals();
      return new THREE.Mesh(g, mat);
    };
    const ledge = blob(1, 1, 2.6, 0.35, 3.2);
    ledge.position.set(0, DECK_Y - 0.2, -0.6);
    this.groups.rock.add(ledge);
    for (const [x, z, r, sd] of [[-2.6, -3.6, 0.7, 2], [2.4, -4.4, 0.55, 3], [-3.8, -1.5, 0.9, 4], [3.6, -2, 0.8, 5]] as const) {
      const b = blob(r, sd, 1.2, 0.8, 1.1);
      b.position.set(x, 0.05, z);
      this.groups.rock.add(b);
    }
  }

  /** Boat bow for the deep drop: deck, gunwale rail, rod holder, and two fish-lamps (집어등). */
  private buildBoat(): void {
    const hull = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.4 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0x3d4549, roughness: 0.9 }));
    deck.position.set(0, DECK_Y + 0.1, -0.8);
    this.groups.boat.add(deck);
    // gunwale: a U-shaped rail around the bow
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.5, DECK_Y + 0.55, 1.5),
      new THREE.Vector3(-1.5, DECK_Y + 0.55, -2.2),
      new THREE.Vector3(-0.6, DECK_Y + 0.55, -3.4),
      new THREE.Vector3(0, DECK_Y + 0.55, -3.7),
      new THREE.Vector3(0.6, DECK_Y + 0.55, -3.4),
      new THREE.Vector3(1.5, DECK_Y + 0.55, -2.2),
      new THREE.Vector3(1.5, DECK_Y + 0.55, 1.5),
    ]);
    const rail = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.07, 10), hull);
    this.groups.boat.add(rail);
    // rail posts down to the deck
    for (let i = 0; i <= 8; i++) {
      const p = curve.getPoint(i / 8);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), hull);
      post.position.set(p.x, p.y - 0.225, p.z);
      this.groups.boat.add(post);
    }
    // fish-lamps on a pole: glowing bulbs that light the water at dusk
    const glowTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,250,220,1)');
      gr.addColorStop(0.3, 'rgba(255,230,160,0.5)');
      gr.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    for (const x of [-1.3, 1.3]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), new THREE.MeshStandardMaterial({ color: 0x555a60, metalness: 0.8, roughness: 0.4 }));
      pole.position.set(x, DECK_Y + 1.5, -2.4);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 3 }));
      bulb.position.set(x, DECK_Y + 2.55, -2.4);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      glow.scale.set(1.4, 1.4, 1);
      glow.position.copy(bulb.position);
      const light = new THREE.PointLight(0xffe6b0, 6, 14, 1.6);
      light.position.copy(bulb.position);
      this.groups.boat.add(pole, bulb, glow, light);
    }
  }

  private async loadProps(): Promise<void> {
    const loader = new GLTFLoader();
    const [stool, bucket, grass] = await Promise.all(
      ['folding_wooden_stool', 'wooden_bucket_01', 'grass_medium_02'].map((id) => loader.loadAsync(MODEL_URL(id))),
    );
    const place = (src: THREE.Object3D, x: number, y: number, z: number, rotY: number, scale = 1, group: THREE.Group = this.groups.grass) => {
      const o = src.clone();
      o.position.set(x, y, z);
      o.rotation.y = rotY;
      o.scale.setScalar(scale);
      group.add(o);
      return o;
    };
    place(stool.scene, -0.8, DECK_Y, -3.3, 0.5, 1, this.groups.deck);
    place(bucket.scene, 0.85, DECK_Y, -3.6, -0.3, 1, this.groups.deck);
    place(bucket.scene, -1.1, DECK_Y + 0.02, -2.6, 0.8, 1, this.groups.rock);
    place(bucket.scene, 1.0, DECK_Y + 0.16, -2.3, 0.2, 1, this.groups.boat);
    // grass in patches along both shores (shallow water), not scattered over open water
    const rng = (i: number) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    let k = 0;
    for (const side of [-1, 1]) {
      for (const pz of [-7, -12, -19, -28, -40]) {
        const cx = side * (5.5 + -pz * 0.3);
        for (let j = 0; j < 6; j++, k++) {
          place(grass.scene, cx + (rng(k) - 0.5) * 2.4, -0.05, pz + (rng(k + 50) - 0.5) * 2.4, rng(k + 99) * Math.PI * 2, 1.6 + rng(k + 7) * 1.2);
        }
      }
    }
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

  // ---------------------------------------------------------------- effects

  private buildDrops(): void {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(235,245,250,0.8)');
    grad.addColorStop(1, 'rgba(235,245,250,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAX_DROPS * 3).fill(-1000);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.drops = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.045, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: 0xf2f8fa }),
    );
    this.drops.frustumCulled = false;
    this.scene.add(this.drops);
  }

  /** Throw `count` droplets up from `at` with speed ~`speed` m/s. */
  private splashAt(at: THREE.Vector3, count: number, speed: number): void {
    const pos = this.drops.geometry.attributes.position as THREE.BufferAttribute;
    for (let n = 0; n < count; n++) {
      const i = this.dropNext;
      this.dropNext = (this.dropNext + 1) % MAX_DROPS;
      const a = Math.random() * Math.PI * 2;
      const h = speed * (0.3 + 0.7 * Math.random());
      pos.setXYZ(i, at.x + Math.cos(a) * 0.15, Math.max(0.02, at.y), at.z + Math.sin(a) * 0.15);
      this.dropVel.set([Math.cos(a) * h * 0.45, speed * (0.6 + Math.random() * 0.8), Math.sin(a) * h * 0.45], i * 3);
      this.dropLife[i] = 1.4;
    }
    pos.needsUpdate = true;
  }

  private updateDrops(dt: number): void {
    const pos = this.drops.geometry.attributes.position as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < MAX_DROPS; i++) {
      if (this.dropLife[i] <= 0) continue;
      any = true;
      this.dropLife[i] -= dt;
      this.dropVel[i * 3 + 1] -= 9.8 * dt;
      const y = pos.getY(i) + this.dropVel[i * 3 + 1] * dt;
      if (y < 0 || this.dropLife[i] <= 0) {
        this.dropLife[i] = 0;
        pos.setXYZ(i, 0, -1000, 0);
        continue;
      }
      pos.setXYZ(i, pos.getX(i) + this.dropVel[i * 3] * dt, y, pos.getZ(i) + this.dropVel[i * 3 + 2] * dt);
    }
    if (any) pos.needsUpdate = true;
  }

  /** Big-moment effects, called by the page on game events. */
  fx(kind: 'land' | 'nibble' | 'bite' | 'hook' | 'runWarn' | 'run' | 'catch' | 'snap' | 'miss'): void {
    const at = this.floatPos;
    switch (kind) {
      case 'land':
        this.splashAt(at, 40, 3);
        this.trauma = Math.max(this.trauma, 0.15);
        break;
      case 'nibble':
        this.splashAt(at, 6, 1.2);
        break;
      case 'bite':
        this.splashAt(at, 60, 3.5);
        this.trauma = Math.max(this.trauma, 0.3);
        this.fovKick = Math.max(this.fovKick, 3);
        break;
      case 'hook':
        this.splashAt(at, 90, 5);
        this.trauma = 0.75;
        this.fovKick = 8;
        break;
      case 'runWarn':
        this.splashAt(at, 120, 5.5);
        this.trauma = Math.max(this.trauma, 0.45);
        break;
      case 'run':
        this.splashAt(at, 60, 4);
        this.fovKick = Math.max(this.fovKick, 4);
        break;
      case 'catch':
        this.leapFrom.copy(at);
        this.splashAt(at, 200, 6.5);
        this.trauma = 0.6;
        this.fovKick = 7;
        break;
      case 'snap':
        this.trauma = 1;
        this.fovKick = 5;
        break;
      case 'miss':
        this.trauma = Math.max(this.trauma, 0.2);
        break;
    }
  }

  /**
   * An interference animal does something (called by the page on game events):
   * approach — surfaces some metres off and closes in on the hooked fish over `durS`
   * escape   — gives up and dives away · steal — lunges at the fish and takes it · spook — a hippo surfaces and yawns
   */
  animal(kind: EventKind, action: AnimalAction, durS = 1): void {
    let m = this.animals.get(kind);
    if (!m) {
      m = buildAnimal(kind);
      m.scale.setScalar(ANIMAL_SCALE[kind]);
      m.visible = false;
      this.scene.add(m);
      this.animals.set(kind, m);
    }
    for (const [k, other] of this.animals) if (k !== kind) other.visible = false;
    const now = performance.now();
    const from = m.visible ? m.position.clone() : this.floatPos.clone();
    if (action === 'approach' || action === 'spook') {
      const side = Math.random() < 0.5 ? -1 : 1;
      const d = ANIMAL_START[kind];
      from.set(this.floatPos.x + side * d * 0.8, 0, this.floatPos.z - d * 0.6);
    }
    this.animalAct = { kind, action, t0: now, dur: action === 'approach' ? durS : action === 'spook' ? 3.6 : action === 'steal' ? 1.4 : 1.4, from };
    m.visible = true;
    if (action === 'spook') {
      this.splashAt(from.clone().setY(0), 120, 4);
      this.trauma = Math.max(this.trauma, 0.45);
    }
    if (action === 'steal') {
      this.trauma = 0.8;
      this.fovKick = 6;
    }
  }

  /** Hide every animal (new cast, new place). */
  clearAnimals(): void {
    for (const m of this.animals.values()) m.visible = false;
    this.animalAct = null;
  }

  private updateAnimal(now: number): void {
    const act = this.animalAct;
    if (!act) return;
    const m = this.animals.get(act.kind)!;
    const u = Math.min(1, (now - act.t0) / 1000 / act.dur);
    const target = this.floatPos;
    const face = (dx: number, dz: number) => {
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) m.rotation.y = Math.atan2(-dz, dx);
    };
    const surface = (t: number) => Math.min(1, t / 0.15); // rise out of the water at the start
    const bob = act.kind === 'orca' ? Math.sin(now / 420) * 0.35 : Math.sin(now / 300) * 0.03;
    const low = act.kind === 'orca' ? -0.55 : act.kind === 'crocodile' ? 0.04 : act.kind === 'hippo' ? -0.1 : 0.05;
    switch (act.action) {
      case 'approach': {
        const e = u * u * (3 - 2 * u);
        m.position.lerpVectors(act.from, new THREE.Vector3(target.x, 0, target.z), e * 0.85);
        m.position.y = -1.5 + (1.5 + low + bob) * surface(u);
        face(target.x - act.from.x, target.z - act.from.z);
        if (act.kind === 'orca') m.rotation.z = Math.sin(now / 420) * 0.08;
        // wake: ripples trailing behind
        if (m.userData.wake && Math.random() < 0.3) {
          const back = new THREE.Vector3(-1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y).multiplyScalar(ANIMAL_SCALE[act.kind] * (act.kind === 'orca' ? 2.5 : 0.8));
          this.ripple(m.position.clone().add(back), now, act.kind === 'orca' ? 2.5 : 1, 1.4);
        }
        // the orca's blow: a burst of spray from the blowhole now and then
        if (m.userData.blow && Math.random() < 0.012) {
          const head = new THREE.Vector3(2, 0.9, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), m.rotation.y).add(m.position);
          this.splashAt(head, 70, 6);
        }
        break;
      }
      case 'escape': {
        const away = new THREE.Vector3().subVectors(act.from, target).setY(0).normalize();
        m.position.copy(act.from).addScaledVector(away, u * 4);
        m.position.y = low - u * 2.5;
        face(away.x, away.z);
        // diving: nose down, so the orca's flukes lift clear of the water
        if (act.kind === 'orca') {
          m.rotation.z = -Math.min(0.9, u * 1.6);
          m.position.y = low - u * 1.2;
        }
        break;
      }
      case 'steal': {
        if (u < 0.3) {
          // lunge onto the fish
          m.position.lerpVectors(act.from, new THREE.Vector3(target.x, 0, target.z), u / 0.3);
          m.position.y = low + Math.sin((u / 0.3) * Math.PI) * (act.kind === 'orca' ? 1.6 : 0.5);
          if (u > 0.25 && !m.userData.splashed) {
            this.splashAt(new THREE.Vector3(target.x, 0, target.z), 220, 6.5);
            this.ripple(target, now, 3, 1.6);
            m.userData.splashed = true;
          }
        } else {
          m.position.y = low - ((u - 0.3) / 0.7) * 2.5;
        }
        break;
      }
      case 'spook': {
        // a hippo: up, yawn, down
        m.position.set(act.from.x, 0, act.from.z);
        face(target.x - act.from.x, target.z - act.from.z);
        const up = Math.min(1, u / 0.2);
        const down = Math.max(0, (u - 0.75) / 0.25);
        m.position.y = -1.4 + 1.4 * up - 1.6 * down + Math.sin(now / 300) * 0.03;
        const jaw = m.userData.jaw as THREE.Group | undefined;
        if (jaw) jaw.rotation.z = -Math.max(0, Math.sin(Math.min(1, Math.max(0, (u - 0.22) / 0.45)) * Math.PI)) * 0.9;
        if (Math.random() < 0.1) this.ripple(m.position, now, 1.6, 1.4);
        break;
      }
    }
    if (u >= 1 && act.action !== 'approach') {
      m.visible = false;
      m.userData.splashed = false;
      this.animalAct = null;
    }
  }

  /** Camera shake + FOV punch, applied every frame. `floor` keeps a tremble going (fish running). */
  private applyCamera(now: number, dt: number, floor: number): void {
    this.trauma = Math.max(floor, this.trauma - 1.4 * dt);
    const s = this.trauma * this.trauma;
    const n = (f: number, p: number) => Math.sin(now / f + p) * 0.6 + Math.sin(now / (f * 0.43) + p * 2) * 0.4;
    this.camera.position.set(s * 0.09 * n(37, 1), EYE_M + s * 0.07 * n(29, 2), 0);
    this.camera.rotation.set(-0.11 + s * 0.03 * n(41, 3), s * 0.03 * n(47, 4), s * 0.05 * n(53, 5), 'YXZ');
    this.fovKick *= Math.exp(-5 * dt);
    const fov = BASE_FOV - this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Draw one frame for the game's current state. `now` in ms (same clock as the game). */
  render(g: FishingGame, now: number): void {
    if (this.water) this.water.material.uniforms.time.value = now / 1000 * 0.35;
    const dt = this.lastRenderT ? Math.min(0.1, (now - this.lastRenderT) / 1000) : 0;
    this.lastRenderT = now;
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
      case 'nibble':
        if (g.nibbling) bend = 0.3 + Math.abs(Math.sin(now / 55)) * (g.location.noFloat ? 0.7 : 0.25);
        break;
      case 'bite':
        elev = 0.45;
        bend = (g.location.noFloat ? 1.6 : 0.9) + Math.sin(now / 50) * 0.1;
        break;
      case 'reeling':
        // held lower so the whole bent arc stays in view
        elev = 0.6 - g.tension * 0.12;
        bend = g.running ? 1.9 + Math.sin(now / 70) * 0.12 : 0.7 + g.tension * 0.8;
        if (g.running && g.runKind === 'dive') bend = 2.5 + Math.sin(now / 90) * 0.1; // hauled down
        if (g.running && g.runKind === 'dig') bend = 1.7 + Math.sin(now / 400) * 0.03; // heavy and still
        if (g.running && g.runKind !== 'dig') yaw = Math.sin(now / 160) * 0.05;
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
    // deep drop: no float — the line goes straight down just off the bow, the bite shows on the rod tip
    const deepRig = !!g.location.noFloat;
    const landing = deepRig ? new THREE.Vector3(0.6 * side, 0, -4.2) : new THREE.Vector3(0.9 * side, 0, -g.distanceM);
    const fp = this.floatPos.copy(landing);
    // rise, in bands of the 찌톱: 0 = normal (3 of 4 bands showing), +1.5 = 찌올림, −4 = under
    let rise = 0;
    let tilt = 0;
    const showFloat = !['bait', 'ready', 'missed', 'caught'].includes(g.phase);
    this.float.visible = showFloat && !deepRig;
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
      switch (g.fish.def.bite) {
        case 'rise': // 찌올림: the classic crucian bite — the float rises slowly, band by band
          rise = Math.min(1.8, since / 500);
          break;
        case 'drag': // taken sideways and pulled under by a running predator
          rise = -Math.min(3, since / 150);
          fp.x += Math.min(1.6, since / 400) * side;
          fp.z += Math.min(1, since / 700);
          break;
        case 'slam': // gone in one go
          rise = -4.5;
          break;
        default: // sink: sucked under, drifting a little
          rise = -Math.min(4.5, since / 60);
          fp.x += Math.min(1, since / 800) * 0.6 * side;
      }
    } else if (g.phase === 'reeling' && g.fish && deepRig) {
      // the fish comes up from the deep under the bow
    } else if (g.phase === 'reeling' && g.fish) {
      const out = g.lineOutM();
      fp.z = -Math.max(1.5, out);
      fp.x = 0.9 * side * (out / Math.max(1, g.distanceM)) + (g.running ? Math.sin(now / 130) * 0.8 : Math.sin(now / 700) * 0.25);
      rise = g.running && g.runKind === 'dive' ? -4 : -2;
      tilt = g.running ? 0.9 : 0.5;
      if (g.running && g.runKind === 'dig') fp.x = 0.9 * side * (out / Math.max(1, g.distanceM)); // stuck
    }
    if (g.phase !== 'flight') fp.y = deepRig ? 0 : -BAND_H * FLOAT_SCALE * (1 - rise);
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
      if (g.running && g.runKind === 'thrash' && r < 0.5) {
        this.ripple(fp, now, 2, 1);
        if (r < 0.2) this.splashAt(fp, 25, 3.5);
      } else if ((g.running || g.runSoon) && g.runKind !== 'dig' && r < 0.2) this.ripple(fp, now, g.running ? 1.6 : 1.2, 1.1);
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
        if (g.running) p.x += Math.sin(u * Math.PI) * Math.sin(now / 25) * (g.runKind === 'shock' ? 0.04 : 0.01); // vibrating line
        if (p.y < 0.003 && u > 0.5) p.y = 0.003;
        this.linePos.set([p.x, p.y, p.z], i * 3);
      }
      this.line.geometry.attributes.position.needsUpdate = true;
      const t = g.phase === 'reeling' ? g.tension : 0;
      this.lineMat.color.setRGB(0.95, 0.95 - 0.55 * t, 0.95 - 0.7 * t);
      if (g.running && g.runKind === 'shock' && Math.sin(now / 30) > 0) this.lineMat.color.setRGB(0.5, 0.85, 1); // crackling blue
      this.lineMat.opacity = 0.6 + 0.35 * t;
    }

    // ---- hooked fish's shadow
    this.shadow.visible = g.phase === 'reeling' && !!g.fish;
    if (this.shadow.visible && g.fish) {
      const len = (g.fish.lengthCm / 100) * 2.2;
      this.shadow.position.set(fp.x, 0.001, fp.z - len * 0.4);
      this.shadow.scale.set(len, len * 0.35, 1);
    }

    // ---- a jump: the hooked fish leaps clear of the water, twisting (바늘털이)
    const jumping = g.phase === 'reeling' && g.running && g.runKind === 'jump' && !!g.fish;
    if (jumping && !this.jumpStart) {
      this.jumpStart = now;
      this.splashAt(fp, 90, 5);
    }
    if (!jumping) this.jumpStart = 0;
    if (jumping && g.fish) {
      const id = g.fish.def.id;
      let jf = this.fishes.get(id);
      if (!jf) {
        jf = buildSpecies(id);
        this.fishes.set(id, jf);
        this.scene.add(jf);
      }
      const lenM = g.fish.lengthCm / 100;
      // the leap spans the whole jump run (a fixed 0.9 s could fall between two frames on a slow PC)
      const u = g.runFrac(now);
      jf.visible = u < 1;
      jf.scale.setScalar(Math.max(0.6, lenM) * 1.4);
      jf.position.set(fp.x + (u - 0.5) * lenM, Math.sin(u * Math.PI) * (1.2 + lenM * 0.6) - 0.2, fp.z);
      jf.rotation.set(0, side * 0.6, Math.cos(u * Math.PI) * 1.1 + Math.sin(now / 60) * 0.25);
      if (u > 0.92 && !this.jumpSplashed) {
        this.splashAt(fp, 120, 5);
        this.ripple(fp, now, 2.5, 1.4);
        this.jumpSplashed = true;
      }
    } else this.jumpSplashed = false;
    // a jump that ended early must not leave the fish hanging in the air
    if (!jumping && g.phase !== 'caught') for (const f of this.fishes.values()) f.visible = false;

    // ---- catch close-up: the fish held up in front of the camera
    const showFish = g.phase === 'caught' && g.fish ? g.fish.def.id : null;
    if (showFish !== this.catchSpecies && !jumping) {
      if (showFish && !this.fishes.has(showFish)) {
        const m = buildSpecies(showFish);
        this.fishes.set(showFish, m);
        this.scene.add(m);
      }
      for (const [sp, f] of this.fishes) f.visible = sp === showFish;
      this.catchSpecies = showFish;
    }
    if (showFish && g.fish) {
      const f = this.fishes.get(showFish)!;
      const lenM = g.fish.lengthCm / 100;
      // small fish are held up close (≈1.25× life size); big ones (sharks, oarfish) hang in the air
      // farther out, at a distance where they fill most of the view
      const big = lenM > 1.2;
      const shown = big ? Math.min(lenM, 3.2 + Math.log(lenM)) : lenM * 1.25;
      f.scale.setScalar(shown);
      const dist = big ? 1.2 + shown * 0.85 : 0.75 + lenM * 0.7;
      const held = new THREE.Vector3(0.05, EYE_M + 0.02 + (big ? shown * 0.12 : 0) + Math.sin(now / 500) * 0.01, -dist);
      const LEAP_MS = 750;
      if (since < LEAP_MS) {
        // leaps out of the water where the float was and arcs up to the camera, thrashing
        const u = since / LEAP_MS;
        const e = 1 - (1 - u) ** 2;
        f.position.lerpVectors(this.leapFrom, held, e);
        f.position.y += Math.sin(u * Math.PI) * 1.6;
        f.rotation.set(0.2, 0.25 + (1 - u) * 1.5, Math.sin(now / 45) * 0.5 * (1 - u) + (1 - u) * 1.2);
      } else {
        // held up above the result card
        f.position.copy(held);
        f.rotation.set(0.05, 0.25 + Math.sin(now / 1400) * 0.25, Math.sin(now / 180) * 0.06);
      }
      (f.userData.tail as THREE.Mesh).rotation.y = Math.sin(now / 120) * 0.35;
      const glow = f.userData.glow as THREE.Mesh | undefined;
      if (glow) glow.scale.setScalar(1 + Math.sin(now / 200) * 0.25); // anglerfish lure pulses
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

    this.updateDrops(dt);
    this.updateAnimal(now);
    const floor = g.phase === 'reeling' ? (g.running ? 0.32 : g.tension >= 0.75 ? 0.3 : 0) : 0;
    this.applyCamera(now, dt, floor);
    this.renderer.render(this.scene, this.camera);
  }
}
