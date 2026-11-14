import * as THREE from 'three';

/*
 * Sky, horizon and time of day.
 *
 * The map used to sit in a flat dark void. This adds a gradient sky, two rows of far ridges and
 * a haze colour that the scene fog shares, so the canyon fades into distance instead of black,
 * and it turns the clock every three rounds: afternoon, dusk, night, dawn, then round again.
 * Light strength barely changes between phases (units must stay readable); the colour does.
 *
 * Everything here is a backdrop: it is drawn first, never writes depth, follows the camera and
 * takes no part in picking, shadows or the map's own bounds.
 */
export const PHASES = [
  { id: 'afternoon', name: 'Afternoon',
    zenith: 0x16283f, horizon: 0x9a7d62, haze: 0x0a0f16,
    sun: 0xffe0b4, sunPower: 2.2, sky: 0xa5c7e8, ground: 0x3a2a1c, skyPower: 0.9, ambient: 0x2e3c4c, rim: 0x6ab6ff },
  { id: 'dusk', name: 'Dusk',
    zenith: 0x1b1838, horizon: 0xa8563a, haze: 0x120d12,
    sun: 0xffbc8c, sunPower: 2.15, sky: 0xc2b0a8, ground: 0x3a2a20, skyPower: 0.9, ambient: 0x342f3a, rim: 0x7a8cff },
  { id: 'night', name: 'Night',
    zenith: 0x03060d, horizon: 0x1b315a, haze: 0x05080f,
    sun: 0xa9c6ff, sunPower: 1.85, sky: 0x6f8fc4, ground: 0x181c2a, skyPower: 1.0, ambient: 0x2a3650, rim: 0x54d0ff },
  { id: 'dawn', name: 'Dawn',
    zenith: 0x27304f, horizon: 0xe08a6a, haze: 0x10101a,
    sun: 0xffd2bf, sunPower: 2.05, sky: 0xd2bac8, ground: 0x30262a, skyPower: 0.92, ambient: 0x34343f, rim: 0x7fc0ff }
];
const ROUNDS_PER_PHASE = 3;
const DOME = 140;            // inside the camera's 200-unit far plane wherever it stands

export function phaseFor(level) {
  return PHASES[Math.floor((Math.max(1, level) - 1) / ROUNDS_PER_PHASE) % PHASES.length];
}

const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/** A ragged silhouette all the way round the camera: far mountains, cheap. */
function ridgeGeometry(radius, low, high, seed) {
  const steps = 72, points = [];
  let n = seed;
  const rand = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
  const heights = Array.from({ length: steps }, () => low + (high - low) * rand() ** 1.6);
  // soften single spikes into ranges
  const smooth = heights.map((h, i) => (heights[(i + steps - 1) % steps] + h * 2 + heights[(i + 1) % steps]) / 4);
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2, a1 = ((i + 1) / steps) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius, z0 = Math.sin(a0) * radius, x1 = Math.cos(a1) * radius, z1 = Math.sin(a1) * radius;
    const h0 = smooth[i], h1 = smooth[(i + 1) % steps];
    points.push(x0, -40, z0, x1, -40, z1, x1, h1, z1, x0, -40, z0, x1, h1, z1, x0, h0, z0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geo;
}

export function installAtmosphere(game, stage) {
  const backdrop = new THREE.Group();
  backdrop.name = 'atmosphere';
  const paint = { fog: false, depthWrite: false, depthTest: false, toneMapped: false };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(DOME, 24, 12),
    new THREE.MeshBasicMaterial({ ...paint, vertexColors: true, side: THREE.BackSide }));
  dome.geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(dome.geometry.attributes.position.count * 3), 3));
  const far = new THREE.Mesh(ridgeGeometry(128, 5, 26, 7), new THREE.MeshBasicMaterial({ ...paint, side: THREE.DoubleSide }));
  const near = new THREE.Mesh(ridgeGeometry(116, 3, 15, 31), new THREE.MeshBasicMaterial({ ...paint, side: THREE.DoubleSide }));
  [dome, far, near].forEach((m, i) => { m.renderOrder = -100 + i; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false; });
  backdrop.add(dome, far, near);
  // Drawn first each frame, so this is where the whole backdrop is slid under the camera.
  dome.onBeforeRender = (renderer, scene, camera) => {
    backdrop.position.set(camera.position.x, 0, camera.position.z);
    dome.position.y = camera.position.y;
    backdrop.updateMatrixWorld(true);
  };
  stage.scene.add(backdrop);

  const lights = {
    sky: stage.scene.children.find((o) => o.isHemisphereLight),
    ambient: stage.scene.children.find((o) => o.isAmbientLight),
    sun: stage.sun,
    rim: stage.scene.children.find((o) => o.isDirectionalLight && o !== stage.sun)
  };

  const state = { phase: null, level: 0, backdrop, lights };
  function apply(level = game.level) {
    const p = phaseFor(level);
    state.level = level;
    if (state.phase === p) return p;
    state.phase = p;
    // sky: zenith down to the horizon band, then straight into the haze the fog uses
    const pos = dome.geometry.attributes.position, col = dome.geometry.attributes.color;
    const low = mix(p.horizon, p.haze, 0.55);
    for (let i = 0; i < pos.count; i++) {
      const h = pos.getY(i) / DOME;
      const c = h >= 0 ? mix(p.horizon, p.zenith, Math.sqrt(Math.min(1, h / 0.55)))
        : low.clone().lerp(new THREE.Color(p.haze), Math.min(1, -h / 0.1));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    far.material.color.copy(mix(p.haze, p.horizon, 0.42));
    near.material.color.copy(mix(p.haze, p.horizon, 0.2));
    if (stage.scene.background?.isColor) stage.scene.background.set(p.haze);
    stage.scene.fog?.color.set(p.haze);
    if (lights.sky) { lights.sky.color.set(p.sky); lights.sky.groundColor.set(p.ground); lights.sky.intensity = p.skyPower; }
    lights.ambient?.color.set(p.ambient);
    if (lights.sun) { lights.sun.color.set(p.sun); lights.sun.intensity = p.sunPower; }
    lights.rim?.color.set(p.rim);
    return p;
  }
  state.apply = apply;
  apply();
  game.on('change', () => { if (game.level !== state.level) apply(); });
  return state;
}
