// Optional layer. What a hive becomes as it upgrades: thorns that burst out of the ground under
// your troops once it has been awake for a minute, and a body that grows more monstrous with every
// upgrade. The core reaches this only through `game.thorns?.…`, so a missing file costs the thorns
// and the new looks, and the hive still gains its health. Tuning is `HIVE_THORNS` in config.
import * as THREE from 'three';
import { HIVE_THORNS as SPEC, thornDamage } from './config.js';

const TAU = Math.PI * 2;
const SLOTS = 16;              // strikes on the field at once; more than seven hives can ever have out
const RISE = 0.12, HOLD = 0.42, SINK = 0.3;
const CROWNED_BAR = 3.9;
const BONE = new THREE.Color(0xe8dcc0), ROOT = new THREE.Color(0x3a0d24);
const CHARRED = new THREE.Color(0x1c0a12), BLOOD = new THREE.Color(0x7a1414), EMBER = new THREE.Color(0xff2410);

/** Several cones in one geometry, dark at the root and bone at the tip. */
function spikes(list, sides = 5) {
  const positions = [], normals = [], colours = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), tip = new THREE.Vector3();
  const c = new THREE.Color();
  for (const s of list) {
    const cone = new THREE.ConeGeometry(s.r, s.h, sides, 3).translate(0, s.h / 2, 0).toNonIndexed();
    q.setFromUnitVectors(up, tip.set(s.lean?.[0] || 0, 1, s.lean?.[1] || 0).normalize());
    m.compose(new THREE.Vector3(s.x, s.y || 0, s.z), q, new THREE.Vector3(1, 1, 1));
    cone.applyMatrix4(m);
    const p = cone.attributes.position, n = cone.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i), p.getY(i), p.getZ(i));
      normals.push(n.getX(i), n.getY(i), n.getZ(i));
      c.copy(ROOT).lerp(BONE, Math.min(1, Math.max(0, (p.getY(i) - (s.y || 0)) / s.h)) ** 1.4);
      colours.push(c.r, c.g, c.b);
    }
    cone.dispose();
  }
  return new THREE.BufferGeometry()
    .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    .setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
    .setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
}

/** One curved claw or tusk as a tapering tube, from `a` out through `b` to the point `c`. */
function claw(a, b, c, width, skin) {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(...c));
  const shape = new THREE.TubeGeometry(curve, 10, width, 6, false);
  const p = shape.attributes.position, centre = new THREE.Vector3(), v = new THREE.Vector3();
  const rings = 11, around = 7;
  for (let i = 0; i < p.count; i++) {
    const ring = Math.floor(i / around), t = ring / (rings - 1);
    curve.getPoint(t, centre);
    v.fromBufferAttribute(p, i).sub(centre).multiplyScalar(Math.max(0.03, 1 - t)).add(centre);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  shape.computeVertexNormals();
  return new THREE.Mesh(shape, skin);
}

/* The eruption: a tight crown of thorns, the tallest in the middle. */
const eruption = spikes([
  { x: 0, z: 0, r: 0.2, h: 1.55 },
  { x: 0.34, z: 0.1, r: 0.14, h: 1.0, lean: [0.45, 0.12] },
  { x: -0.3, z: 0.22, r: 0.15, h: 1.12, lean: [-0.4, 0.28] },
  { x: 0.08, z: -0.36, r: 0.13, h: 0.92, lean: [0.1, -0.5] },
  { x: -0.2, z: -0.26, r: 0.11, h: 0.74, lean: [-0.34, -0.4] },
  { x: 0.28, z: 0.36, r: 0.1, h: 0.66, lean: [0.36, 0.5] },
  { x: -0.42, z: -0.05, r: 0.09, h: 0.56, lean: [-0.6, 0] }
]);
const ringShape = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2);

/* Shared by every hive, so a grown hive costs a few draw calls and no new materials per upgrade. */
const bone = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, flatShading: true });
const horn = new THREE.MeshStandardMaterial({ color: 0xd9cba8, roughness: 0.38 });
const hide = new THREE.MeshStandardMaterial({ color: 0x3b1022, roughness: 0.55 });
const vein = new THREE.MeshStandardMaterial({ color: 0x52101e, emissive: 0xff2a12, emissiveIntensity: 1.5, roughness: 0.4 });
const iris = new THREE.MeshBasicMaterial({ color: 0xff3a12, toneMapped: false });
const pupil = new THREE.MeshBasicMaterial({ color: 0x120306 });

const onShell = (angle, height, out = 0.97) => {   // a point on the egg, `height` 0 at the waist and 1 at the crown
  const lat = height * Math.PI / 2;
  return [Math.cos(angle) * Math.cos(lat) * out, 1.05 + Math.sin(lat) * 1.36 * out, Math.sin(angle) * Math.cos(lat) * out];
};

/** A glowing vein crawling up the shell from the ground. */
function veinAt(angle, top) {
  const points = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7, a = angle + Math.sin(t * 9 + angle * 3) * 0.13;
    points.push(new THREE.Vector3(...onShell(a, -0.75 + t * (top + 0.75), 1)));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 26, 0.034, 5, false), vein);
}

/** A slit-pupilled eye set into the shell, looking outward. */
function eye(angle, height, size) {
  const at = new THREE.Vector3(...onShell(angle, height));
  const group = new THREE.Group();
  group.position.copy(at);
  group.lookAt(at.clone().multiplyScalar(2).sub(new THREE.Vector3(0, 1.05, 0)));
  const lid = new THREE.Mesh(new THREE.SphereGeometry(size * 1.42, 12, 10), hide);
  lid.scale.set(1.2, 0.86, 0.5);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(size, 14, 10), iris);
  ball.position.z = size * 0.34;
  ball.scale.set(1.1, 0.72, 0.62);
  const slit = new THREE.Mesh(new THREE.SphereGeometry(size * 0.3, 8, 8), pupil);
  slit.position.z = size * 0.9;
  slit.scale.set(0.42, 1.8, 0.3);
  group.add(lid, ball, slit);
  return group;
}

/** Armour spikes in a ring around the shell. */
function spineRing(height, count, length, phase = 0) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const a = phase + i / count * TAU, [x, y, z] = onShell(a, height, 0.9);
    const tall = length * (i % 2 ? 0.72 : 1);
    list.push({ x, y, z, r: 0.1, h: tall, lean: [Math.cos(a) * 1.5, Math.sin(a) * 1.5] });
  }
  return new THREE.Mesh(spikes(list), bone);
}

/** Great tusks curving up out of the ground around the hive. */
function tusks(count, reach, height, phase = 0) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = phase + i / count * TAU, c = Math.cos(a), s = Math.sin(a);
    group.add(claw([c * 0.95, 0, s * 0.95], [c * (reach + 0.5), height * 0.34, s * (reach + 0.5)], [c * (reach - 0.3), height, s * (reach - 0.3)], 0.13, horn));
  }
  return group;
}

/** Limbs that arch up from the mound and hook inward over the shell. */
function hooks(count, phase = 0) {
  const group = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const a = phase + i / count * TAU, c = Math.cos(a), s = Math.sin(a);
    group.add(claw([c * 1.0, 0.1, s * 1.0], [c * 1.75, 2.1, s * 1.75], [c * 0.42, 2.95, s * 0.42], 0.15, hide));
  }
  return group;
}

/* What each upgrade adds, in order. Every piece stays once it has grown. */
const STAGES = [
  () => [veinAt(0.4, 0.7), veinAt(2.5, 0.55), veinAt(4.6, 0.8)],
  () => [spineRing(0.62, 7, 0.5)],
  () => [eye(0.5, 0.2, 0.17), eye(3.6, 0.28, 0.17)],
  () => [tusks(4, 1.55, 1.5, 0.4)],
  () => [spineRing(0.14, 10, 0.68, 0.3), veinAt(1.5, 0.9), veinAt(5.5, 0.85)],
  () => [eye(1.75, 0.42, 0.22), eye(4.95, 0.1, 0.2), eye(2.75, -0.12, 0.14)],
  () => [hooks(5, 0.9)],
  () => [new THREE.Mesh(spikes([
    { x: 0, y: 2.05, z: 0, r: 0.2, h: 1.5 },
    { x: 0.22, y: 2.0, z: 0.1, r: 0.13, h: 0.95, lean: [0.55, 0.2] },
    { x: -0.2, y: 2.0, z: 0.14, r: 0.13, h: 1.05, lean: [-0.5, 0.3] },
    { x: 0.02, y: 2.0, z: -0.24, r: 0.13, h: 0.9, lean: [0, -0.6] }
  ]), bone), tusks(4, 2.05, 2.3, 1.2)]
];
const built = new Map();   // one set of pieces per stage, cloned onto each hive so geometry is shared

function stagePieces(stage) {
  if (!built.has(stage)) built.set(stage, STAGES[stage]());
  return built.get(stage).map(piece => piece.clone());
}

export class Thorns {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.warned = false;
    this.growing = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.slots = Array.from({ length: SLOTS }, () => {
      const mark = new THREE.Mesh(ringShape, new THREE.MeshBasicMaterial({
        color: 0xff3a22, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
      }));
      const thorns = new THREE.Mesh(eruption, bone);
      mark.visible = thorns.visible = false;
      this.group.add(mark, thorns);
      return { mark, thorns, live: false, hive: null, t: 0, x: 0, z: 0, y: 0, damage: 0, trail: 0, struck: false };
    });
  }

  /** The core calls this from `Hive.upgrade`. The next piece of the monster grows in. */
  upgraded(hive) {
    const stage = hive.upgrades - 1;
    const scale = 1 + Math.min(hive.upgrades, SPEC.growthCap) * SPEC.growth;
    const { egg, membrane } = hive.obj.userData, rage = Math.min(1, hive.upgrades / STAGES.length);
    hive.obj.scale.setScalar(scale);
    egg.children[0].material.color.setHex(0x651e32).lerp(CHARRED, rage);   // the flesh blackens
    membrane.color.setHex(0xc39a32).lerp(BLOOD, rage);                     // gold turns to blood
    membrane.emissive.setHex(0x805014).lerp(EMBER, rage);
    hive.lightColour = new THREE.Color(0xe8b840).lerp(EMBER, rage).getHex();
    if (stage >= STAGES.length) return;
    if (stage === STAGES.length - 1) hive.bar.group.position.y = CROWNED_BAR;   // clear of the crown
    for (const piece of stagePieces(stage)) {
      piece.scale.setScalar(0.01);
      egg.add(piece);                 // on the egg, so every piece breathes and swells with it
      this.growing.push({ piece, t: 0 });
    }
  }

  update(dt) {
    const g = this.game;
    for (let i = this.growing.length - 1; i >= 0; i--) {
      const grow = this.growing[i];
      grow.t = Math.min(1, grow.t + dt / SPEC.growTime);
      const k = 1 - (1 - grow.t) ** 3;
      grow.piece.scale.setScalar(Math.max(0.01, k * (1 + Math.sin(grow.t * Math.PI) * 0.18)));
      if (grow.t >= 1) this.growing.splice(i, 1);
    }
    if (!['wave', 'raid'].includes(g.state)) { this.clearStrikes(); return; }
    for (const hive of g.hives) {
      if (hive.dead || hive.battleT < SPEC.awake) continue;
      hive.thornT = (hive.thornT ?? 0) - dt;
      if (hive.thornT > 0) continue;
      const target = this.aim(hive);
      hive.thornT = target ? SPEC.interval : 0.4;   // an idle hive keeps watching
      if (target) this.cast(hive, target);
    }
    for (const slot of this.slots) if (slot.live) this.advance(slot, dt);
  }

  /** Ground troops standing on the ground: crews inside bunkers and aircraft are out of reach. */
  exposed() {
    const g = this.game;
    return [...g.gunners, g.scv].filter(u => u && !u.dead && !u.downed && !u.bunker && !u.flying && !u.swallowed);
  }

  aim(hive) {
    let best = null, bestD = SPEC.range;
    for (const u of this.exposed()) {
      const d = Math.hypot(u.x - hive.x, u.z - hive.z);
      if (d <= bestD) { bestD = d; best = u; }
    }
    return best;
  }

  cast(hive, target) {
    const g = this.game, slot = this.slots.find(s => !s.live);
    if (!slot) return;
    Object.assign(slot, { live: true, hive, t: 0, x: target.x, z: target.z, y: (g.heightAt?.(target.x, target.z) || 0) + 0.06, damage: thornDamage(hive.upgrades), trail: 0, struck: false });
    slot.mark.position.set(slot.x, slot.y, slot.z);
    slot.mark.scale.setScalar(SPEC.radius);
    slot.mark.visible = true;
    hive.hatchT = Math.max(hive.hatchT, 0.8);
    if (!this.warned) {
      this.warned = true;
      this.ui?.callout('HIVE THORNS', 'Move out of the red rings', 'unit');
    }
  }

  advance(slot, dt) {
    const g = this.game;
    slot.t += dt;
    if (slot.t < SPEC.telegraph) {
      const k = slot.t / SPEC.telegraph;
      slot.mark.material.opacity = 0.45 + Math.sin(slot.t * 22) * 0.25 + k * 0.3;
      slot.trail -= dt;
      if (slot.trail <= 0) {          // the thorn tunnels from the hive toward the mark
        slot.trail = 0.07;
        const x = slot.hive.x + (slot.x - slot.hive.x) * k, z = slot.hive.z + (slot.z - slot.hive.z) * k;
        g.fx.smoke({ x, y: (g.heightAt?.(x, z) || 0) + 0.1, z }, 2, [0.3, 0.16, 0.2]);
      }
      return;
    }
    if (!slot.struck) this.strike(slot);
    const age = slot.t - SPEC.telegraph;
    const height = age < RISE ? age / RISE : age < RISE + HOLD ? 1 : 1 - (age - RISE - HOLD) / SINK;
    slot.thorns.scale.set(SPEC.radius, Math.max(0.01, height) * SPEC.radius, SPEC.radius);
    slot.mark.material.opacity = Math.max(0, 0.6 - age * 2.4);
    if (age >= RISE + HOLD + SINK) this.free(slot);
  }

  strike(slot) {
    const g = this.game, at = { x: slot.x, y: slot.y + 0.2, z: slot.z };
    slot.struck = true;
    slot.thorns.position.set(slot.x, slot.y - 0.04, slot.z);
    slot.thorns.rotation.y = Math.random() * TAU;
    slot.thorns.visible = true;
    g.fx.chunks(at, 7, 0x4a2a30);
    g.fx.smoke(at, 6, [0.34, 0.2, 0.22]);
    g.fx.decal(slot.x, slot.z, SPEC.radius * 0.8, 0x180a10, 0.5);
    g.sfx.spine(at);
    for (const u of this.exposed()) {
      if (Math.hypot(u.x - slot.x, u.z - slot.z) > SPEC.radius) continue;
      u.takeDamage(slot.damage, g, Math.atan2(u.z - slot.z, u.x - slot.x));
    }
  }

  free(slot) {
    slot.live = false;
    slot.hive = null;
    slot.mark.visible = slot.thorns.visible = false;
    slot.mark.material.opacity = 0;
  }

  clearStrikes() { for (const slot of this.slots) if (slot.live) this.free(slot); }

  clear() {
    this.clearStrikes();
    this.growing = [];
  }
}

export function installThorns(game, ui) {
  game.thorns = new Thorns(game, ui);
  return game.thorns;
}
