import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { mapDimensions } from './config.js';

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
  // Feathered moss and meadow patches blend into the worn earth.
  for (let i = 0; i < 180; i++) {
    const px = rnd() * 1024, py = rnd() * 1024, r = 35 + rnd() * 130;
    const patch = x.createRadialGradient(px, py, 0, px, py, r);
    patch.addColorStop(0, 'rgba(66,99,43,0.48)');
    patch.addColorStop(0.6, 'rgba(77,105,48,0.22)');
    patch.addColorStop(1, 'rgba(77,105,48,0)');
    x.fillStyle = patch; x.fillRect(px - r, py - r, r * 2, r * 2);
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

function gridTexture(cols, rows) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(150,200,230,.5)';
  x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, 125, 125);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(cols, rows);
  return tex;
}

export class Stage {
  constructor(canvas) {
    const initialMap = mapDimensions(1);
    this.cols = initialMap.cols;
    this.rows = initialMap.rows;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.shadowMap.enabled = false;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0f16);
    this.scene.fog = new THREE.Fog(0x0a0f16, 30, 62);
    this.scene.environment = environment(this.renderer);
    this.scene.environmentIntensity = 0.65;

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 200);
    this.yaw = Math.PI / 2;
    this.pitch = 0.82;
    this.dist = 14;
    // Keep units readable and enough ground visible at either zoom limit.
    this.minDist = 10;
    this.maxDist = 22;
    this.focus = new THREE.Vector3(this.cols / 2, 0, this.rows / 2);
    this.homeFocus = this.focus.clone();
    this.shake = 0;
    this.updateCamera();

    this.buildLights();
    this.buildGround();

    // Eco renders directly. Allocate expensive post-processing only if High is selected.
    this.composer = null;
    this.gtao = null;
    this.bloom = null;
    this.quality = 'low';

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  buildPostProcessing() {
    // multisampled targets: the renderer's own antialias does not reach post-processing
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // ambient occlusion: dark contact shadows in creases and where things meet the ground
    this.gtao = new GTAOPass(this.scene, this.camera, 1, 1,
      undefined,
      { radius: 0.55, distanceExponent: 1.6, thickness: 1.2, scale: 1.15, samples: 16, distanceFallOff: 1, screenSpaceRadius: false },
      { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.gtao.blendIntensity = 0.85;
    // health bars, rings, decals and particles are see-through: keep them out of the occlusion buffers
    this.gtao.overrideVisibility = function () {
      const cache = this._visibilityCache;
      this.scene.traverse((o) => {
        cache.set(o, o.visible);
        const m = o.material;
        if (o.isPoints || o.isLine || o.isSprite || (o.isMesh && m && (m.transparent || m.depthWrite === false))) o.visible = false;
      });
    };
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.55, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  buildLights() {
    const CX = this.cols / 2, CZ = this.rows / 2;
    this.scene.add(new THREE.HemisphereLight(0xa5c7e8, 0x3a2a1c, 0.9));
    this.scene.add(new THREE.AmbientLight(0x2e3c4c, 0.42));

    const sun = new THREE.DirectionalLight(0xffe0b4, 2.2);
    sun.position.set(CX + 7, 20, CZ + 13);
    sun.target.position.set(CX, 0, CZ);
    sun.castShadow = true;
    // the shadow box follows the camera (see updateCamera): a big map can't be shadowed all at once
    sun.shadow.mapSize.set(1024, 1024);
    this.sunOffset = new THREE.Vector3(7, 20, 13);
    this.shadowSpan = 0;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 50;
    sun.shadow.bias = -0.0012;
    sun.shadow.normalBias = 0.022;
    this.scene.add(sun, sun.target);
    this.sun = sun;

    // cool rim light so the blue armour pops against the dirt
    const rim = new THREE.DirectionalLight(0x6ab6ff, 1.5);
    rim.position.set(CX - 13, 8, CZ - 11);
    this.scene.add(rim);
  }

  buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cols, this.rows),
      new THREE.MeshStandardMaterial({ map: groundTexture(), color: 0xaeb7c0, roughness: 0.97, metalness: 0 })
    );
    g.rotation.x = -Math.PI / 2;
    g.position.set(this.cols / 2, 0, this.rows / 2);
    g.receiveShadow = true;
    this.scene.add(g);
    this.ground = g;

    const grid = new THREE.Mesh(
      new THREE.PlaneGeometry(this.cols, this.rows),
      new THREE.MeshBasicMaterial({ map: gridTexture(this.cols, this.rows), transparent: true, opacity: 0.08, depthWrite: false })
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.set(this.cols / 2, 0.012, this.rows / 2);
    this.scene.add(grid);
    this.grid = grid;

    this.boundary = new THREE.LineLoop(new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x5f91a5, transparent: true, opacity: 0.55 }));
    this.scene.add(this.boundary);
    this.setMapSize(this.cols, this.rows);
  }

  setMapSize(cols, rows) {
    this.cols = cols; this.rows = rows;
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist));
    this.camera.far = Math.max(150, Math.max(cols, rows) * 3);
    this.camera.updateProjectionMatrix();
    for (const mesh of [this.ground, this.grid]) {
      mesh.geometry.dispose();
      mesh.geometry = new THREE.PlaneGeometry(cols, rows);
      mesh.position.x = cols / 2;
      mesh.position.z = rows / 2;
    }
    this.ground.material.map.repeat.set(cols / 9, rows / 9);
    this.grid.material.map.repeat.set(cols, rows);
    this.boundary.geometry.dispose();
    this.boundary.geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.03, 0), new THREE.Vector3(cols, 0.03, 0),
      new THREE.Vector3(cols, 0.03, rows), new THREE.Vector3(0, 0.03, rows)
    ]);
  }

  updateCamera() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.cos(this.yaw) * cp * this.dist,
      this.focus.y + sp * this.dist,
      this.focus.z + Math.sin(this.yaw) * cp * this.dist
    );
    this.camera.lookAt(this.focus);
    // Pointer events can arrive between renders; picking needs the current transform.
    this.camera.updateMatrixWorld();

    // keep sun shadows centred on what you are looking at, sized to the zoom
    if (this.sun && this.sunOffset) {
      this.sun.position.copy(this.focus).add(this.sunOffset);
      this.sun.target.position.copy(this.focus);
      const span = Math.round(Math.min(70, Math.max(16, this.dist * 1.15)));
      if (span !== this.shadowSpan) {
        this.shadowSpan = span;
        const cam = this.sun.shadow.camera;
        cam.left = -span; cam.right = span; cam.top = span; cam.bottom = -span;
        cam.far = 60 + span;
        cam.updateProjectionMatrix();
      }
    }
    // see further when zoomed out
    if (this.scene.fog) {
      this.scene.fog.near = 22 + this.dist * 1.1;
      this.scene.fog.far = 48 + this.dist * 2.2;
    }
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
    const needV = (this.rows * Math.sin(this.pitch) + 4) / 2;
    const needH = (this.cols + 3) / 2;
    return Math.max(needV / tanV, needH / tanH) * 1.06;
  }

  zoomBy(factor) {
    this.userZoomed = true;
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist * factor));
  }

  spin(delta) { this.yaw += delta; }

  /** Pan focus in screen space: +sx = right, +sy = down. */
  pan(sx, sy) {
    const fx = Math.cos(this.yaw), fz = Math.sin(this.yaw);
    this.focus.x += fx * sy + fz * sx;
    this.focus.z += fz * sy - fx * sx;
    this.focus.x = Math.max(0, Math.min(this.cols, this.focus.x));
    this.focus.z = Math.max(0, Math.min(this.rows, this.focus.z));
  }

  resetView() {
    this.yaw = Math.PI / 2;
    this.pitch = 0.82;
    this.dist = 14;
    this.focus.copy(this.homeFocus);
    this.userZoomed = true;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist));
  }

  /** Both modes use sharp native pixels (up to 2×); Eco keeps effects off and 30 fps. */
  setQuality(q) {
    this.quality = q === 'high' ? 'high' : 'low';
    const high = this.quality === 'high';
    this.renderer.shadowMap.enabled = high;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    if (high && !this.composer) this.buildPostProcessing();
    if (this.gtao) this.gtao.enabled = high;
    const size = this.renderer.getSize(new THREE.Vector2());
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(size.x, size.y);
    }
  }

  render() {
    if (this.quality === 'high') this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
