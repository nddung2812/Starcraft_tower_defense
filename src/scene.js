import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COLS, ROWS } from './config.js';

const CX = COLS / 2, CZ = ROWS / 2;

function groundTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const x = c.getContext('2d');
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

  x.fillStyle = '#584636';
  x.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 2600; i++) {
    const r = 6 + rnd() * 70;
    x.fillStyle = `rgba(${120 + rnd() * 70 | 0},${95 + rnd() * 55 | 0},${70 + rnd() * 45 | 0},${0.04 + rnd() * 0.09})`;
    x.beginPath();
    x.ellipse(rnd() * 1024, rnd() * 1024, r, r * (0.4 + rnd() * 0.6), rnd() * 6.28, 0, 6.28);
    x.fill();
  }
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${30 + rnd() * 30 | 0},${24 + rnd() * 24 | 0},${20 + rnd() * 20 | 0},${0.1 + rnd() * 0.3})`;
    x.beginPath();
    x.arc(rnd() * 1024, rnd() * 1024, 1 + rnd() * 4, 0, 6.28);
    x.fill();
  }
  // dry cracks
  x.strokeStyle = 'rgba(40,30,24,.25)';
  for (let i = 0; i < 60; i++) {
    x.lineWidth = 0.6 + rnd() * 1.6;
    x.beginPath();
    let px = rnd() * 1024, py = rnd() * 1024;
    x.moveTo(px, py);
    for (let k = 0; k < 7; k++) {
      px += (rnd() - 0.5) * 120; py += (rnd() - 0.5) * 120;
      x.lineTo(px, py);
    }
    x.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* Metals need something to reflect, so bake a Mar Sara sky into a PMREM. */
function environment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#8fb6dc');
  g.addColorStop(0.4, '#c3d2e2');
  g.addColorStop(0.5, '#e6c79c');
  g.addColorStop(0.58, '#8a6a4a');
  g.addColorStop(1, '#241b14');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 256);

  const sun = x.createRadialGradient(350, 72, 2, 350, 72, 95);
  sun.addColorStop(0, 'rgba(255,252,238,1)');
  sun.addColorStop(1, 'rgba(255,214,160,0)');
  x.fillStyle = sun;
  x.fillRect(0, 0, 512, 256);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

function gridTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(150,200,230,.5)';
  x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, 125, 125);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(COLS, ROWS);
  return tex;
}

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f16);
    this.scene.fog = new THREE.Fog(0x0a0f16, 30, 62);
    this.scene.environment = environment(this.renderer);
    this.scene.environmentIntensity = 0.85;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.yaw = Math.PI / 2;
    this.pitch = 0.62;
    this.dist = 15;
    this.minDist = 3.2;
    this.maxDist = 46;
    this.focus = new THREE.Vector3(CX, 0, CZ);
    this.shake = 0;
    this.updateCamera();

    this.buildLights();
    this.buildGround();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x7ea6cc, 0x3a2a1c, 0.42));
    this.scene.add(new THREE.AmbientLight(0x2e3c4c, 0.42));

    const sun = new THREE.DirectionalLight(0xffe0b4, 2.9);
    sun.position.set(CX + 7, 20, CZ + 13);
    sun.target.position.set(CX, 0, CZ);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -19;
    sun.shadow.camera.right = 19;
    sun.shadow.camera.top = 15;
    sun.shadow.camera.bottom = -15;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.022;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    // cool rim light so the blue armour pops against the dirt
    const rim = new THREE.DirectionalLight(0x6ab6ff, 1.1);
    rim.position.set(CX - 13, 8, CZ - 11);
    this.scene.add(rim);
  }

  buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 110),
      new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.97, metalness: 0 })
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(CX, 0, CZ);
    g.receiveShadow = true;
    this.scene.add(g);
    this.ground = g;

    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS, ROWS),
      new THREE.MeshBasicMaterial({ map: gridTexture(), transparent: true, opacity: 0.1, depthWrite: false })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(CX, 0.012, CZ);
    this.scene.add(grid);
    this.grid = grid;

    // playfield boundary
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.1, 4),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    this.scene.add(edge);
  }

  updateCamera() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.cos(this.yaw) * cp * this.dist,
      this.focus.y + sp * this.dist,
      this.focus.z + Math.sin(this.yaw) * cp * this.dist
    );
    this.camera.lookAt(this.focus);
  }

  applyShake(dt) {
    if (this.shake > 0.02) {
      this.shake *= Math.pow(0.0015, dt);
      const s = this.shake * 0.05;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    } else this.shake = 0;
  }

  kick(a) { this.shake = Math.min(9, this.shake + a); }

  /** Screen point (NDC) -> world position on the ground plane. */
  pick(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit) ? hit : null;
  }

  /** Distance at which the whole playfield fits the current viewport. */
  fitDistance() {
    const tanV = Math.tan((this.camera.fov * Math.PI / 180) / 2);
    const tanH = tanV * this.camera.aspect;
    const needV = (ROWS * Math.sin(this.pitch) + 4) / 2;
    const needH = (COLS + 3) / 2;
    return Math.max(needV / tanV, needH / tanH) * 1.06;
  }

  zoomBy(factor) {
    this.userZoomed = true;
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * factor));
  }

  spin(delta) { this.yaw += delta; }

  resetView() {
    this.yaw = Math.PI / 2;
    this.pitch = 0.62;
    this.dist = 15;
    this.focus.set(CX, 0, CZ);
    this.userZoomed = true;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist));
  }

  render() { this.composer.render(); }
}
