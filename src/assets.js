import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FILES } from './config.js';
import { buildMarine, buildGoliath, buildTank, buildScv, buildBunker, buildBug, buildFalcon, buildSkyhunter, buildScorcher, buildDeadeye, buildMender } from './models.js';

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
  scorcher: (tier) => buildScorcher(tier),
  deadeye: (tier) => buildDeadeye(tier),
  mender: (tier) => buildMender(tier),
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
  scorcher: [0xffb070, 0.3], deadeye: [0xc9a8ff, 0.34], mender: [0x7dffb0, 0.3],
  marine: [0x5ad7ff, 0.32], goliath: [0x5ad7ff, 0.32], tank: [0x5ad7ff, 0.3], scv: [0x5ad7ff, 0.28],
  zergling: [0xc06bff, 0.3], warrior: [0xc06bff, 0.3], hopper: [0xc06bff, 0.3], tanker: [0xc06bff, 0.3],
  needler: [0xc06bff, 0.3]
};

const loaded = {};
/* Clip names to look for, best match first. */
const clipRe = {
  idle: [/^idle/i, /idle/i, /stand/i, /breath/i],
  walk: [/^walk(ing)?$/i, /walk(?!.*jump)/i, /^run(ning)?$/i, /run/i, /move|drive|locomot|forward/i],
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
  const files = new Map();     // several kinds can share one file (the infantry do)
  const fetchFile = (file) => {
    if (!files.has(file)) {
      files.set(file, fetch(file, { method: 'HEAD', cache: 'no-cache' })
        .then((head) => (head.ok ? loader.loadAsync(file) : null)));
    }
    return files.get(file);
  };
  const jobs = Object.entries(MODEL_FILES).map(async ([kind, spec]) => {
    try {
      const gltf = await fetchFile(spec.file);
      if (!gltf) return;
      loaded[kind] = prepare(gltf, spec);
      console.info(`[models] ${kind}: using ${spec.file}${gltf.animations.length ? ` (${gltf.animations.map((a) => a.name).join(', ')})` : ''}`);
    } catch (err) {
      console.warn(`[models] ${kind}: could not load ${spec.file}, keeping the built-in model.`, err);
    }
  });
  await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, timeoutMs))]);
  return loadedModels();
}

const re = (pattern) => (pattern ? new RegExp(pattern) : null);

/** This kind's own copy of the file: unwanted parts removed, materials repainted in its colours. */
function dress(scene, spec) {
  const src = cloneSkinned(scene);
  const hide = re(spec.hide);
  if (hide) {
    const gone = [];
    src.traverse((o) => { if (hide.test(o.name)) gone.push(o); });
    for (const o of gone) o.removeFromParent();
  }
  if (spec.tint) {
    const painted = new Map();
    const paint = (m) => {
      if (!(m.name in spec.tint)) return m;
      if (!painted.has(m)) { const c = m.clone(); c.color.set(spec.tint[m.name]); painted.set(m, c); }
      return painted.get(m);
    };
    src.traverse((o) => {
      if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(paint) : paint(o.material);
    });
  }
  return src;
}

/** Work out once how to scale and seat a loaded model so it matches the game's footprint. */
function prepare(gltf, spec) {
  const src = dress(gltf.scene, spec);
  const probe = new THREE.Group();
  probe.rotation.y = spec.yaw ?? Math.PI / 2; // glTF faces +Z, the game faces +X
  probe.add(src);
  probe.updateMatrixWorld(true);
  // seat on the body alone when asked, so a long gun does not pull the unit off its tile
  const seat = re(spec.seat);
  const box = new THREE.Box3();
  if (seat) src.traverse((o) => { if (o.isMesh && seat.test(o.name)) box.expandByObject(o, true); });
  if (box.isEmpty()) box.setFromObject(probe, true);
  const size = box.getSize(new THREE.Vector3());
  const fitDim = spec.fit === 'length' ? Math.max(size.x, size.z) : size.y;
  const k = fitDim > 0 ? spec.size / fitDim : 1;
  probe.remove(src);

  // offset (in model units, after the yaw) that puts the feet on y=0 and the footprint centred
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
  const scaled = size.clone().multiplyScalar(k);
  const muzzles = (spec.muzzles || (spec.muzzle ? [spec.muzzle] : [[scaled.x * 0.48, scaled.y * 0.6, 0]]))
    .map((m) => new THREE.Vector3(...m));

  const clips = {};
  for (const [state, patterns] of Object.entries(clipRe)) {
    const named = spec.clips?.[state];
    if (named) { clips[state] = gltf.animations.find((c) => c.name === named || c.name.endsWith('|' + named)) || null; continue; }
    clips[state] = null;
    for (const pattern of patterns) {
      clips[state] = gltf.animations.find((c) => pattern.test(c.name)) || null;
      if (clips[state]) break;
    }
  }
  const turret = spec.turret === 'all' ? 'all'
    : spec.turret ? { parts: re(spec.turret.parts), pivot: re(spec.turret.pivot || spec.turret.parts) } : null;
  const tiers = spec.tierTint ? { nodes: re(spec.tierTint.nodes), colors: spec.tierTint.colors, mats: new Map() } : null;
  return { src, yaw: spec.yaw ?? Math.PI / 2, k, offset, muzzles, clips, height: scaled.y, turret, tiers };
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

/** Promotion marker: repaint the chosen parts (shoulder pads, say) in the tier's colour. */
function paintTier(model, tiers, tier) {
  const color = tiers.colors[Math.min(tier, tiers.colors.length - 1)];
  if (color == null) return;
  model.traverse((o) => {
    if (!o.isMesh || !tiers.nodes.test(o.name) || Array.isArray(o.material)) return;
    const key = o.material.uuid + ':' + color;
    if (!tiers.mats.has(key)) { const m = o.material.clone(); m.color.set(color); tiers.mats.set(key, m); }
    o.material = tiers.mats.get(key);
  });
}

/** A loaded file wrapped in the same rig shape the procedural builders return. */
function instance(kind, L, tier = 0) {
  const model = cloneSkinned(L.src);
  model.position.copy(L.offset);
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = !o.isSkinnedMesh; // skinned bounds are often wrong once animated
    }
  });
  if (L.tiers) paintTier(model, L.tiers, tier);

  const turn = new THREE.Group();
  turn.rotation.y = L.yaw;
  turn.add(model);
  const fit = new THREE.Group();
  fit.scale.setScalar(L.k);
  fit.add(turn);

  const root = new THREE.Group();
  const torso = new THREE.Group();
  const weapon = new THREE.Group();
  torso.add(weapon);
  root.add(torso);
  if (L.turret && L.turret !== 'all') {
    // hull stays with the unit; the named parts move into the torso, which the game turns to aim
    root.add(fit);
    root.updateMatrixWorld(true);
    const parts = [], pivot = new THREE.Box3();
    model.traverse((o) => { if (L.turret.parts.test(o.name)) parts.push(o); });
    for (const o of parts) if (L.turret.pivot.test(o.name)) pivot.expandByObject(o);
    if (!pivot.isEmpty()) { const c = pivot.getCenter(new THREE.Vector3()); torso.position.set(c.x, 0, c.z); }
    root.updateMatrixWorld(true);
    for (const o of parts) torso.attach(o);
  } else {
    torso.add(fit);
  }
  weapon.userData.muzzles = L.muzzles.map((m) => m.clone().sub(torso.position));
  weapon.userData.muzzle = weapon.userData.muzzles[0];

  root.userData.torso = torso;
  root.userData.weapon = weapon;
  root.userData.solid = !L.turret;   // no turret: the whole model turns to aim
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
    let current = null, fallen = 0;
    root.userData.anim = (state, dt) => {
      if (state === 'death' && !actions.death) {
        // no death clip in the file: tip over, as the built-in models do
        fallen = Math.min(1, fallen + dt * 2.2);
        fit.rotation.z = fallen * 1.2;
        if (current) current.paused = true;
        return;
      }
      if (fallen) { fallen = 0; fit.rotation.z = 0; }
      const want = actions[state] || (state === 'attack' ? actions.shoot : null) || actions.idle
        || (actions.shoot && state !== 'walk' ? null : actions.walk);
      if (want && want !== current) {
        want.reset().fadeIn(0.18).play();
        if (current) current.fadeOut(0.18);
        current = want;
      }
      // a file with only a movement clip (tank tracks) holds still when the unit does
      if (current) current.paused = !actions.idle && current === actions.walk && state !== 'walk';
      mixer.update(dt);
    };
  }
  return root;
}

/** The model for a unit kind (and tier, for procedural Marines/Goliaths). */
export function makeModel(kind, tier = 0, { rim = true } = {}) {
  const L = loaded[kind] || (MODEL_FILES[kind]?.fallback && loaded[MODEL_FILES[kind].fallback]);
  const root = L ? instance(kind, L, tier) : PROCEDURAL[kind](tier);
  if (rim) applyRim(root, kind);
  return root;
}
