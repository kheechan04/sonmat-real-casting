// M1 3D view with PLACEHOLDER geometry (user: real-photo low-poly models come later, M2).
// Water plane + fog + simple shore, a rod, fishing line, a bobber, and a capsule "fish" for the
// catch close-up. The realistic Water shader / sky / bloom are M5 polish (DESIGN.md §7).
//
// The scene reads the game's state every frame (phase, phase start time, tension, …) instead of
// being told about events, so it can never drift out of sync with the game.

import * as THREE from 'three';
import type { FishingGame } from '../core/game';
import type { Side } from '../core/pose';
import type { Species } from '../core/params';

const FLIGHT_MS = 1200;
const SWING_MS = 350;
const LINE_POINTS = 32;

const FISH_COLOR: Record<Species, number> = { crucian: 0xb8a15a, carp: 0x8c6a3c };

interface Ripple {
  mesh: THREE.Mesh;
  born: number;
}

export class FishingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.05, 500);
  private rodPivot = new THREE.Group();
  private rodTip = new THREE.Object3D();
  private bobber = new THREE.Group();
  private line: THREE.Line;
  private linePos: Float32Array;
  private lineMat: THREE.LineBasicMaterial;
  private fishShadow: THREE.Mesh;
  private fish = new THREE.Group();
  private fishBody: THREE.Mesh;
  private fishTail: THREE.Mesh;
  private ripples: Ripple[] = [];
  private lastPhase = '';
  private rodHand: Side = 'right';

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    // pose inference shares the GPU (Shadow Mitts: keep the render load small)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const sky = new THREE.Color(0xaec6d4);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 40, 220);
    this.scene.add(new THREE.HemisphereLight(0xdfeef7, 0x3b4a3a, 1.4));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.6);
    sun.position.set(-15, 25, 20); // from behind the viewer, so the catch close-up is lit
    this.scene.add(sun);

    // water + shore + far hills (placeholders)
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x2f5f6c, roughness: 0.25, metalness: 0.2 }),
    );
    water.rotation.x = -Math.PI / 2;
    this.scene.add(water);
    const shore = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.6, 3),
      new THREE.MeshStandardMaterial({ color: 0x6b5a45, roughness: 1 }),
    );
    shore.position.set(0, 0.1, 1.2);
    this.scene.add(shore);
    const hillMat = new THREE.MeshStandardMaterial({ color: 0x40573f, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(18 + (i % 3) * 8, 10 + (i % 4) * 5, 6), hillMat);
      h.position.set(-120 + i * 30, 3, -120 - (i % 2) * 20);
      this.scene.add(h);
    }

    // rod: tapered cylinder pivoting at the handle
    const rodLen = 2.6;
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.022, rodLen, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.5 }),
    );
    rod.position.y = rodLen / 2;
    this.rodPivot.add(rod);
    this.rodTip.position.y = rodLen;
    this.rodPivot.add(this.rodTip);
    this.scene.add(this.rodPivot);

    // bobber: red top, white bottom, antenna
    const top = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xe0452b, roughness: 0.4 }),
    );
    const bottom = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.4 }),
    );
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6),
      new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x553c00 }),
    );
    antenna.position.y = 0.14;
    this.bobber.add(top, bottom, antenna);
    this.bobber.scale.setScalar(2.2); // readable at 20 m
    this.scene.add(this.bobber);

    // line
    this.linePos = new Float32Array(LINE_POINTS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
    this.lineMat = new THREE.LineBasicMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.85 });
    this.line = new THREE.Line(geo, this.lineMat);
    this.line.frustumCulled = false;
    this.scene.add(this.line);

    // fish shadow under the water while reeling
    this.fishShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.5, 20),
      new THREE.MeshBasicMaterial({ color: 0x0b1d24, transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.fishShadow.rotation.x = -Math.PI / 2;
    this.fishShadow.scale.set(1, 0.4, 1);
    this.scene.add(this.fishShadow);

    // placeholder fish: capsule body + cone tail
    this.fishBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.5, 1.4, 6, 16),
      new THREE.MeshStandardMaterial({ color: FISH_COLOR.crucian, roughness: 0.35, metalness: 0.3 }),
    );
    this.fishBody.rotation.z = Math.PI / 2;
    this.fishBody.scale.set(1, 1, 0.45);
    this.fishTail = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 0.7, 4),
      new THREE.MeshStandardMaterial({ color: FISH_COLOR.crucian, roughness: 0.4 }),
    );
    this.fishTail.rotation.z = -Math.PI / 2;
    this.fishTail.position.x = -1.3;
    this.fishTail.scale.set(1, 1, 0.2);
    this.fish.add(this.fishBody, this.fishTail);
    this.fish.visible = false;
    this.scene.add(this.fish);

    this.camera.position.set(0, 2.1, 2.2);
    this.camera.lookAt(0, 0.6, -14);
    this.resize();
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

  private ripple(at: THREE.Vector3, now: number): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, 0.01, at.z);
    this.scene.add(mesh);
    this.ripples.push({ mesh, born: now });
  }

  /** Draw one frame for the game's current state. `now` in ms (same clock as the game). */
  render(g: FishingGame, now: number): void {
    const since = now - g.phaseT;
    const side = this.rodHand === 'right' ? 1 : -1;
    const handle = new THREE.Vector3(0.45 * side, 1.15, 0.9);
    const landing = new THREE.Vector3(0.6 * side, 0, -g.distanceM);

    // ---- rod: `elev` = angle above horizontal toward the water (> π/2 = tipped back over the head)
    let elev = 0.55;
    let yaw = -0.08 * side; // tip slightly toward the middle of the view
    if (g.phase === 'ready' || g.phase === 'bait') elev = 0.7;
    if (g.phase === 'flight' && since < SWING_MS) elev = 1.9 - 1.5 * (since / SWING_MS); // swing forward
    if (g.phase === 'bite') elev = 0.45 + Math.sin(now / 60) * 0.03; // tip pulled down
    if (g.phase === 'reeling') {
      elev = 0.9 - g.tension * 0.35; // held up, dragged down by tension
      if (g.pulling) yaw += Math.sin(now / 90) * 0.06;
    }
    this.rodPivot.position.copy(handle);
    // geometry points along +y; rotating about x by −(π/2 − elev) aims it forward (−z) and up
    this.rodPivot.rotation.set(-(Math.PI / 2 - elev), yaw, 0, 'YXZ');
    this.rodPivot.updateMatrixWorld(true);
    const tip = this.rodTip.getWorldPosition(new THREE.Vector3());

    // ---- bobber position
    const showBobber = !['bait', 'ready', 'caught', 'missed'].includes(g.phase);
    this.bobber.visible = showBobber;
    const pos = landing.clone();
    if (g.phase === 'flight') {
      const u = Math.min(1, since / FLIGHT_MS);
      pos.lerpVectors(tip, landing, u);
      pos.y = tip.y * (1 - u) + Math.sin(u * Math.PI) * (2 + g.distanceM * 0.25);
    } else if (g.phase === 'waiting') {
      pos.y = 0.04 + Math.sin(now / 700) * 0.03;
    } else if (g.phase === 'nibble') {
      pos.y = g.nibbling ? 0.02 - Math.abs(Math.sin(now / 45)) * 0.1 : 0.04 + Math.sin(now / 700) * 0.03;
    } else if (g.phase === 'bite') {
      pos.y = -0.28 + Math.sin(now / 50) * 0.03; // pulled under
      pos.x += Math.sin(now / 120) * 0.08;
    } else if (g.phase === 'reeling' && g.fish) {
      const u = g.progress / g.fish.turnsNeeded;
      pos.z = -(g.distanceM * (1 - u)) - 1.2 * u - 1;
      pos.x = 0.6 * side * (1 - u) + (g.pulling ? Math.sin(now / 110) * 0.6 : Math.sin(now / 600) * 0.2);
      pos.y = -0.12;
    }
    this.bobber.position.copy(pos);

    // splash rings on landing and on the bite
    if (g.phase !== this.lastPhase) {
      if (g.phase === 'waiting' || g.phase === 'bite' || g.phase === 'reeling') this.ripple(pos, now);
      this.lastPhase = g.phase;
    }
    if (g.phase === 'nibble' && g.nibbling && Math.random() < 0.05) this.ripple(pos, now);
    if (g.phase === 'reeling' && g.pulling && Math.random() < 0.08) this.ripple(pos, now);

    // ---- line: sagging curve tip → bobber; tight and red-tinted with tension
    this.line.visible = showBobber;
    if (showBobber) {
      const sag = g.phase === 'reeling' ? 0.2 * (1 - g.tension) : g.phase === 'flight' ? 0 : 0.9;
      for (let i = 0; i < LINE_POINTS; i++) {
        const u = i / (LINE_POINTS - 1);
        const p = new THREE.Vector3().lerpVectors(tip, pos, u);
        p.y -= Math.sin(u * Math.PI) * sag;
        if (p.y < 0.005 && u > 0.5) p.y = 0.005;
        this.linePos.set([p.x, p.y, p.z], i * 3);
      }
      this.line.geometry.attributes.position.needsUpdate = true;
      const t = g.phase === 'reeling' ? g.tension : 0;
      this.lineMat.color.setRGB(0.96, 0.96 - 0.6 * t, 0.96 - 0.7 * t);
    }

    // ---- fish shadow while reeling
    this.fishShadow.visible = g.phase === 'reeling';
    if (g.phase === 'reeling' && g.fish) {
      const len = 0.4 + g.fish.lengthCm / 60;
      this.fishShadow.position.set(pos.x, 0.005, pos.z - 0.4);
      this.fishShadow.scale.set(len, len * 0.35, 1);
    }

    // ---- catch close-up
    this.fish.visible = g.phase === 'caught' && !!g.fish;
    if (this.fish.visible && g.fish) {
      const color = FISH_COLOR[g.fish.species];
      (this.fishBody.material as THREE.MeshStandardMaterial).color.setHex(color);
      (this.fishTail.material as THREE.MeshStandardMaterial).color.setHex(color);
      // capsule + tail ≈ 3 units long; show at about twice life size, 1.6 m from the camera
      const k = ((g.fish.lengthCm / 100) * 2) / 3;
      this.fish.scale.setScalar(Math.max(0.12, Math.min(0.5, k)));
      const rise = Math.min(1, since / 600);
      this.fish.position.set(0, 1.4 + rise * 0.55 + Math.sin(now / 400) * 0.02, 0.6);
      this.fish.rotation.set(0, Math.sin(now / 900) * 0.5, Math.sin(now / 150) * 0.12 * (1 - rise * 0.7));
    }

    // ripples fade out
    this.ripples = this.ripples.filter((r) => {
      const age = (now - r.born) / 1000;
      if (age > 1.6) {
        this.scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        (r.mesh.material as THREE.Material).dispose();
        return false;
      }
      r.mesh.scale.setScalar(1 + age * 4);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - age / 1.6);
      return true;
    });

    this.renderer.render(this.scene, this.camera);
  }
}
