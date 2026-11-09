import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from './config.js';
import { buildMarine, buildGoliath, buildTank, buildScv, buildBunker, buildBug, buildFalcon, buildSkyhunter } from './models.js';

/*
 * Every unit model comes from makeModel(). If a .glb for that unit was found in
 * assets/models/ it is used (scaled, turned to face +X, animated); otherwise the
 * built-in procedural model is. Either way the result exposes the same handles
 * the game animates: userData.torso, userData.weapon (+ muzzle), and, for files,
 * userData.anim(state, dt).
 */

const PROCEDURAL = {
  falcon: (tier) => buildFalcon(tier),
  skyhunter: () => buildSkyhunter(),
  marine: (tier) => buildMarine(tier),
  goliath: (tier) => buildGoliath(tier),
  tank: () => buildTank(),
  scv: () => buildScv(),
  bunker: () => buildBunker(),
  zergling: () => buildBug('zergling'),
  warrior: () => buildBug('warrior'),
  hopper: () => buildBug('hopper'),
  tanker: () => buildBug('tanker'),
  needler: () => buildBug('needler')
};

/* Team-colour rim light: blue edges on our side, violet on the swarm. Bunkers mutate their own paint, so they are left alone. */
const RIM = {
  falcon: [0x71e7e0, 0.35], skyhunter: [0xc06bff, 0.3],
  marine: [0x5ad7ff, 0.32], goliath: [0x5ad7ff, 0.32], tank: [0x5ad7ff, 0.3], scv: [0x5ad7ff, 0.28],
  zergling: [0xc06bff, 0.3], warrior: [0xc06bff, 0.3], hopper: [0xc06bff, 0.3], tanker: [0xc06bff, 0.3],
  needler: [0xc06bff, 0.3]
};

const loaded = {};
/* Clip names to look for, best match first. */
const clipRe = {
  idle: [/^idle/i, /idle/i, /stand/i, /breath/i],
  walk: [/^walk(ing)?$/i, /walk(?!.*jump)/i, /^run(ning)?$/i, /run/i, /move|drive|locomot/i],
  shoot: [/shoot/i, /fire/i, /aim/i, /attack/i],
  attack: [/attack/i, /bite/i, /slash/i, /hit/i, /shoot/i],
  death: [/^death$/i, /death/i, /die|dying|dead/i]
};

/** Which files loaded, by kind. */
export function loadedModels() { return Object.keys(loaded); }

/**
 * Probe assets/models/ for every file in MODEL_FILES and load the ones that exist.
 * Missing files are normal (the built-in model is used), so they are skipped quietly.
 */
export async function loadModels({ timeoutMs = 15000 } = {}) {
  const loader = new GLTFLoader();
  const jobs = Object.entries(MODEL_FILES).map(async ([kind, spec]) => {
    try {
      const head = await fetch(spec.file, { method: 'HEAD', cache: 'no-cache' });
      if (!head.ok) return;
      const gltf = await loader.loadAsync(spec.file);
      loaded[kind] = prepare(gltf, spec);
      console.info(`[models] ${kind}: using ${spec.file}${gltf.animations.length ? ` (${gltf.animations.map((a) => a.name).join(', ')})` : ''}`);
    } catch (err) {
      console.warn(`[models] ${kind}: could not load ${spec.file}, keeping the built-in model.`, err);
    }
  });
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeoutMs))]);
  return loadedModels();
}

/** Work out once how to scale and seat a loaded model so it matches the game's footprint. */
function prepare(gltf, spec) {
  const src = gltf.scene;
  const probe = new THREE.Group();
  probe.rotation.y = spec.yaw ?? Math.PI / 2; // glTF faces +Z, the game faces +X
  probe.add(src);
  probe.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(probe, true);
  const size = box.getSize(new THREE.Vector3());
  const fitDim = spec.fit === 'length' ? Math.max(size.x, size.z) : size.y;
  const k = fitDim > 0 ? spec.size / fitDim : 1;
  probe.remove(src);

  // offset (in model units, after the yaw) that puts the feet on y=0 and the footprint centred
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
  const scaled = size.clone().multiplyScalar(k);
  const muzzle = spec.muzzle
    ? new THREE.Vector3(...spec.muzzle)
    : new THREE.Vector3(scaled.x * 0.48, scaled.y * 0.6, 0);

  const clips = {};
  for (const [state, patterns] of Object.entries(clipRe)) {
    const named = spec.clips?.[state];
    if (named) { clips[state] = gltf.animations.find((c) => c.name === named) || null; continue; }
    clips[state] = null;
    for (const re of patterns) {
      clips[state] = gltf.animations.find((c) => re.test(c.name)) || null;
      if (clips[state]) break;
    }
  }
  return { src, yaw: spec.yaw ?? Math.PI / 2, k, offset, muzzle, clips, height: scaled.y };
}

function rimmed(mat, color, strength) {
  if (!mat || !(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial)) return mat;
  const key = mat.uuid + ':' + color;
  let m = rimmed.cache.get(key);
  if (m) return m;
  m = mat.clone();
  const tint = new THREE.Color(color).multiplyScalar(strength);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.rimColor = { value: tint };
    shader.fragmentShader = 'uniform vec3 rimColor;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float rimK = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
      totalEmissiveRadiance += rimColor * pow( rimK, 3.0 );`
    );
  };
  m.customProgramCacheKey = () => 'team-rim';
  rimmed.cache.set(key, m);
  return m;
}
rimmed.cache = new Map();

function applyRim(root, kind) {
  const rim = RIM[kind];
  if (!rim) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o.material.transparent) return;
    o.material = Array.isArray(o.material)
      ? o.material.map((mm) => rimmed(mm, rim[0], rim[1]))
      : rimmed(o.material, rim[0], rim[1]);
  });
}

/** A loaded file wrapped in the same rig shape the procedural builders return. */
function instance(kind, L) {
  const model = cloneSkinned(L.src);
  model.position.copy(L.offset);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = !o.isSkinnedMesh; // skinned bounds are often wrong once animated
    }
  });

  const turn = new THREE.Group();
  turn.rotation.y = L.yaw;
  turn.add(model);
  const fit = new THREE.Group();
  fit.scale.setScalar(L.k);
  fit.add(turn);

  const root = new THREE.Group();
  const torso = new THREE.Group();
  const weapon = new THREE.Group();
  weapon.userData.muzzle = L.muzzle.clone();
  weapon.userData.muzzles = [weapon.userData.muzzle];
  torso.add(fit, weapon);
  root.add(torso);

  root.userData.torso = torso;
  root.userData.weapon = weapon;
  root.userData.solid = true;        // one piece: the whole model turns to aim
  root.userData.fromFile = true;

  const clips = Object.values(L.clips).filter(Boolean);
  if (clips.length) {
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const [state, clip] of Object.entries(L.clips)) {
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      if (state === 'death') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      actions[state] = a;
    }
    let current = null;
    root.userData.anim = (state, dt) => {
      const want = actions[state] || (state === 'attack' ? actions.shoot : null) || actions.idle || actions.walk;
      if (want && want !== current) {
        want.reset().fadeIn(0.18).play();
        if (current) current.fadeOut(0.18);
        current = want;
      }
      mixer.update(dt);
    };
  }
  return root;
}

/** The model for a unit kind (and tier, for procedural Marines/Goliaths). */
export function makeModel(kind, tier = 0, { rim = true } = {}) {
  const L = loaded[kind] || (MODEL_FILES[kind]?.fallback && loaded[MODEL_FILES[kind].fallback]);
  const root = L ? instance(kind, L) : PROCEDURAL[kind](tier);
  if (rim) applyRim(root, kind);
  return root;
}
