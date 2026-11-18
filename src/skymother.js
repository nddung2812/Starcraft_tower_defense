import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SKYMOTHER, BREEDS } from './config.js';
import { Zergling, Acid } from './entities.js';
import { registerModel } from './assets.js';

/*
 * Optional layer. The Skymother: the swarm's answer to the Titan. A slow armoured flyer with no
 * weapon of her own. She carries a brood of Talons, launches them at whatever comes into reach
 * (a Titan first), calls them home when nothing does and grows back the ones you shoot down.
 *
 * `game.skyfleet` is null until this file installs it, and the core then leaves her out of the wave.
 * Talons are in `game.zerglings` so every weapon can hit them, but they score nothing and pay
 * nothing: she can always grow more, so a kill would be free score. They die with her.
 */

const TAU = Math.PI * 2;
const angleLerp = (a, b, k) => a + ((((b - a + Math.PI) % TAU) + TAU) % TAU - Math.PI) * k;
const isBuilding = (t) => t.kind === 'wall' || t.kind === 'bunker' || t.kind === 'core';

/* ------------------------------ models ------------------------------ */

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const M = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(
  V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

/** A faceted piece painted from `low` at its underside to `high` on top. */
function piece(geo, matrix, high, low = high) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(matrix);
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  g.computeBoundingBox();
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const a = new THREE.Color(low), b = new THREE.Color(high), c = new THREE.Color();
  const { min, max } = g.boundingBox, span = (max.y - min.y) || 1;
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, (pos.getY(i) - min.y) / span);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}
const orb = (w = 12, h = 8) => new THREE.SphereGeometry(1, w, h);
const dome = (w = 12, h = 4) => new THREE.SphereGeometry(1, w, h, 0, TAU, 0, Math.PI / 2);
const spike = (sides = 5) => new THREE.ConeGeometry(1, 1, sides);

/** A cone reaching from `from` to `to`, `r` wide at its root. */
function horn(from, to, r, high, low = high) {
  const dir = to.clone().sub(from), length = dir.length();
  const turn = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
  const mid = from.clone().add(to).multiplyScalar(0.5);
  return piece(spike(), new THREE.Matrix4().compose(mid, turn, V(r, length, r)), high, low);
}

/** A broad flat fin lying in the XZ plane, reaching out along `side`, dark at the root and pale at the rim. */
function finGeometry(side, length, chord, root, rim) {
  const shape = new THREE.Shape();
  shape.moveTo(chord * 0.5, 0);
  shape.bezierCurveTo(chord * 0.62, length * 0.42, chord * 0.2, length * 0.86, -chord * 0.28, length);
  shape.bezierCurveTo(-chord * 0.42, length * 0.8, -chord * 0.3, length * 0.66, -chord * 0.62, length * 0.56);
  shape.bezierCurveTo(-chord * 0.6, length * 0.42, -chord * 0.46, length * 0.3, -chord * 0.72, length * 0.2);
  shape.lineTo(-chord * 0.5, 0);
  shape.closePath();
  const flat = new THREE.ShapeGeometry(shape, 10).rotateX(Math.PI / 2);   // shape y becomes z
  if (side < 0) flat.scale(1, 1, -1);
  const web = piece(flat, new THREE.Matrix4(), root);
  const pos = web.attributes.position, col = web.attributes.color;
  const a = new THREE.Color(root), b = new THREE.Color(rim), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, Math.min(1, Math.abs(pos.getZ(i)) / length) ** 1.6);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  const bone = 0xd8ccb0;
  const spars = [
    horn(V(chord * 0.42, 0.03, 0), V(-chord * 0.24, 0.01, side * length * 0.98), 0.04, bone),
    horn(V(0.05, 0.03, 0), V(-chord * 0.58, 0.01, side * length * 0.56), 0.03, bone),
    horn(V(-0.14, 0.03, 0), V(-chord * 0.68, 0.01, side * length * 0.22), 0.024, bone)
  ];
  return mergeGeometries([web, ...spars]);
}

const SHELL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.18, flatShading: true });
const WEB = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.02, side: THREE.DoubleSide, flatShading: true });
const GLOW = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xff8a1e, emissiveIntensity: 2.3, roughness: 0.4 });
const POD = new THREE.MeshStandardMaterial({ color: 0xffc56a, emissive: 0xff8a1e, emissiveIntensity: 1.7, roughness: 0.35 });

/** Where the docked Talons hang under her belly, one lit pod for each. */
const PODS = [0.5, 0.17, -0.17, -0.5].flatMap((x) => [-1, 1].map((s) => M(x, -0.31, s * 0.27, 0, 0, 0, 0.17, 0.11, 0.13)));

function motherKit() {
  const P = { shell: 0x120a20, plate: 0x2a1846, edge: 0x5f3f86, belly: 0x4a3452, bone: 0xe6dcc0 };
  const plates = [[0.66, 0.34, 0.36], [0.3, 0.42, 0.46], [-0.08, 0.44, 0.5], [-0.46, 0.4, 0.42], [-0.8, 0.31, 0.29]];
  const hull = mergeGeometries([
    piece(orb(18, 10), M(0, 0, 0, 0, 0, 0, 1.12, 0.36, 0.66), P.plate, P.belly),
    piece(orb(12, 8), M(1.03, 0.02, 0, 0, 0, -0.08, 0.42, 0.2, 0.34), P.plate, P.belly),                 // head
    piece(dome(), M(1.08, 0.08, 0, 0, 0, -0.2, 0.42, 0.17, 0.33), P.shell, P.edge),                      // brow shield
    piece(spike(6), M(-1.32, -0.01, 0, 0, 0, Math.PI / 2, 0.24, 0.62, 0.17), P.plate, P.shell),          // tail
    ...plates.flatMap(([x, l, w]) => [
      piece(dome(), M(x, 0.2, 0, 0, 0, 0.22, l, 0.2, w), P.edge, P.shell),                               // the armour down her back
      piece(dome(), M(x + 0.05, 0.25, 0, 0, 0, 0.22, l * 0.7, 0.17, w * 0.62), P.plate, P.shell)
    ]),
    ...[-1, 1].flatMap((s) => [0.44, 0.04, -0.38].map((x) =>
      piece(dome(10, 3), M(x, 0.05, s * 0.54, s * 0.72, 0, 0.14, 0.3, 0.1, 0.2), P.edge, P.shell))),      // flank plates
    ...plates.map(([x], i) => horn(V(x + 0.03, 0.36, 0), V(x - 0.17, 0.72 - i * 0.05, 0), 0.075, P.bone, P.edge)),
    ...[-1, 1].flatMap((s) => [
      horn(V(1.26, 0, s * 0.17), V(1.86, -0.05, s * 0.3), 0.075, P.bone, P.edge),                         // mandibles
      horn(V(1.16, -0.05, s * 0.25), V(1.56, -0.17, s * 0.46), 0.05, P.bone, P.edge)
    ]),
    ...PODS.map((m) => {   // a dark cradle round each pod
      const at = new THREE.Vector3().setFromMatrixPosition(m);
      return piece(new THREE.TorusGeometry(1, 0.2, 5, 10).rotateX(Math.PI / 2), M(at.x, at.y + 0.02, at.z, 0, 0, 0, 0.17, 0.13, 0.14), P.shell);
    })
  ]);
  const amber = 0xffb347;
  const glow = mergeGeometries([
    ...[-1, 1].map((s) => piece(orb(8, 6), M(1.27, 0.05, s * 0.2, 0, s * 0.5, 0, 0.11, 0.03, 0.055), amber)),
    ...plates.slice(0, 4).map(([x, , w]) => piece(orb(8, 4), M(x - 0.27, 0.22, 0, 0, 0, 0, 0.02, 0.018, w * 0.72), amber)),
    piece(orb(8, 5), M(0, -0.355, 0, 0, 0, 0, 0.62, 0.012, 0.05), amber)
  ]);
  const tendril = mergeGeometries([
    horn(V(0, 0, 0), V(-0.3, -0.48, 0), 0.05, P.plate, P.shell),
    horn(V(-0.26, -0.42, 0), V(-0.42, -0.86, 0), 0.034, P.edge, P.plate),
    horn(V(-0.4, -0.8, 0), V(-0.48, -1.12, 0), 0.02, amber, P.edge)
  ]);
  return { hull, glow, tendril, fins: [-1, 1].map((s) => finGeometry(s, 1.55, 1.06, 0x1c0f2e, 0x76509a)), pod: new THREE.SphereGeometry(1, 10, 8) };
}
const motherParts = () => (motherParts.kit ||= motherKit());

/** Her body. `userData.setPods(n)` lights one belly pod for every Talon still docked. */
export function buildSkymother() {
  const kit = motherParts();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const add = (parent, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = mat !== GLOW; parent.add(m); return m; };
  add(body, kit.hull, SHELL);
  add(body, kit.glow, GLOW);
  const pods = new THREE.InstancedMesh(kit.pod, POD, PODS.length);
  PODS.forEach((m, i) => pods.setMatrixAt(i, m));
  pods.frustumCulled = false;
  body.add(pods);
  const fins = [-1, 1].map((side, i) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.02, 0.05, side * 0.5);
    add(pivot, kit.fins[i], WEB);
    body.add(pivot);
    return { pivot, side };
  });
  const tendrils = [[-0.62, 0.3], [-0.72, -0.3], [-0.92, 0.14], [-0.98, -0.14]].map(([x, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, -0.2, z);
    add(pivot, kit.tendril, SHELL);
    body.add(pivot);
    return { pivot, phase: i * 1.7 };
  });
  const weapon = new THREE.Group();
  weapon.userData.muzzle = V(0, -0.35, 0);
  body.add(weapon);
  root.userData.torso = body;
  root.userData.weapon = weapon;
  root.userData.setPods = (n) => { pods.count = Math.max(0, Math.min(PODS.length, n)); };
  let time = Math.random() * 6, fallen = 0;
  root.userData.anim = (state, dt) => {
    time += dt;
    const dying = state === 'death';
    if (dying) fallen += dt;
    for (const f of fins) f.pivot.rotation.x = f.side * (dying ? -Math.min(0.95, fallen * 1.3) : Math.sin(time * 1.5) * 0.2 + 0.05);
    for (const t of tendrils) {
      t.pivot.rotation.z = Math.sin(time * 1.2 + t.phase) * 0.2 - 0.1;
      t.pivot.rotation.x = Math.cos(time * 0.9 + t.phase) * 0.16;
    }
    body.position.y = dying ? 0 : Math.sin(time * 1.1) * 0.05;
    body.rotation.x = dying ? 0 : Math.sin(time * 0.7) * 0.03;
  };
  return root;
}

function talonKit() {
  const P = { shell: 0x1d1030, edge: 0x7c4fa8, belly: 0xb99ac4, bone: 0xece2c6, web: 0x8d63b8 };
  const blade = (s) => {
    const g = new THREE.BufferGeometry().setFromPoints([V(0.16, 0.02, s * 0.05), V(-0.5, 0.05, s * 0.72), V(-0.1, 0.02, s * 0.1)]);
    return piece(g, new THREE.Matrix4(), P.web);
  };
  const hull = mergeGeometries([
    piece(orb(8, 6), M(0, 0, 0, 0, 0, 0, 0.36, 0.1, 0.11), P.edge, P.belly),
    piece(dome(8, 3), M(0.03, 0.03, 0, 0, 0, 0, 0.3, 0.09, 0.1), P.shell, P.edge),
    horn(V(0.3, 0, 0), V(0.74, -0.03, 0), 0.04, P.bone, P.edge),                  // sting
    horn(V(-0.28, 0.01, 0), V(-0.72, 0.05, 0), 0.05, P.shell, P.edge),            // tail
    ...[-1, 1].flatMap((s) => [blade(s), horn(V(0.14, 0.03, s * 0.06), V(-0.5, 0.06, s * 0.73), 0.018, P.bone)])
  ]);
  const glow = mergeGeometries([-1, 1].map((s) => piece(orb(6, 4), M(0.25, 0.04, s * 0.06, 0, 0, 0, 0.05, 0.03, 0.03), 0xffb347)));
  return { hull, glow };
}
const talonParts = () => (talonParts.kit ||= talonKit());

/** One Talon. Every one shares the same two meshes' geometry, so a full brood stays cheap to draw. */
export function buildTalon() {
  const kit = talonParts();
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const hull = new THREE.Mesh(kit.hull, WEB);
  hull.castShadow = true;
  body.add(hull, new THREE.Mesh(kit.glow, GLOW));
  const weapon = new THREE.Group();
  weapon.userData.muzzle = V(0.7, 0, 0);
  body.add(weapon);
  root.userData.torso = body;
  root.userData.weapon = weapon;
  let time = Math.random() * 6;
  root.userData.anim = (state, dt) => {
    time += dt;
    hull.scale.z = 1 + Math.sin(time * 38) * 0.16;   // wings a blur
  };
  return root;
}

/* ------------------------------ the brood ------------------------------ */

class Talon extends Zergling {
  constructor(mother, slot) {
    super(mother.x, mother.z, 'talon', mother.broodScale, 1);
    this.isTalon = true;
    this.mother = mother;
    this.altitude = mother.altitude - 0.7;
    this.yaw = mother.yaw + (slot / SKYMOTHER.brood) * TAU;
    this.orbit = (slot / SKYMOTHER.brood) * TAU;
    this.turn = slot % 2 ? 1 : -1;
    this.pass = Math.random() * TAU;
    this.attackCd = Math.random() * this.breed.attackSpeed;
    this.bank = 0;
  }

  update(dt, game) {
    this.hurt = Math.max(0, this.hurt - dt * 4);
    if (this.dead) { this.tumble(dt); return; }
    this.spawnT = Math.min(1, this.spawnT + dt * 4);
    this.model.scale.setScalar(this.scale * (0.5 + this.spawnT * 0.5));
    this.attackCd -= dt;
    const mother = this.mother, prey = mother.prey;
    if (prey) this.strike(prey, dt, game);
    else {
      this.flyTo(mother.x, mother.z, mother.altitude - 0.7, dt, game);
      if (Math.hypot(mother.x - this.x, mother.z - this.z) < 0.8) { this.dock(game); return; }
    }
    this.moving = 1;
    this.animate(dt, game);
    this.model.rotation.x = this.bank;
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  /** Swoop round the target in loops that dip in and out, firing whenever it is in reach. */
  strike(prey, dt, game) {
    this.orbit += dt * 1.7 * this.turn;
    this.pass += dt * 1.9;
    const r = 1.55 + Math.sin(this.pass) * 0.75;
    const height = prey.flying ? prey.obj.position.y : (game.heightAt?.(prey.x, prey.z) || 0) + 1.25;
    this.flyTo(prey.x + Math.cos(this.orbit) * r, prey.z + Math.sin(this.orbit) * r, height, dt, game);
    if (this.attackCd > 0 || Math.hypot(prey.x - this.x, prey.z - this.z) > this.breed.range) return;
    this.attackCd = this.breed.attackSpeed;
    this.target = prey;
    const damage = prey.kind === 'cruiser' ? this.damage + SKYMOTHER.titanBonus : this.damage * (isBuilding(prey) ? SKYMOTHER.structureShare : 1);
    const shot = new Acid(this.x, this.altitude, this.z, prey, damage, 'spine', this);
    game.acids.push(shot);
    game.scene.add(shot.mesh);
    game.sfx.spine();
  }

  flyTo(px, pz, height, dt, game) {
    const want = Math.atan2(pz - this.z, px - this.x);
    const before = this.yaw;
    this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 6.5));
    this.bank += (Math.max(-0.75, Math.min(0.75, (this.yaw - before) / Math.max(dt, 0.001) * 0.2)) - this.bank) * Math.min(1, dt * 8);
    this.x = Math.max(0, Math.min(game.grid.COLS - 0.01, this.x + Math.cos(this.yaw) * this.speed * dt));
    this.z = Math.max(0, Math.min(game.grid.ROWS - 0.01, this.z + Math.sin(this.yaw) * this.speed * dt));
    this.altitude += (height - this.altitude) * Math.min(1, dt * 4.5);
  }

  /** Back inside her. Not a kill: the wave loop just sweeps the empty shell away. */
  dock(game) {
    this.mother.docked++;
    this.escaped = true;
    this.dead = true;
    this.deathT = 99;
    this.obj.visible = false;
    if (game.focus === this) game.focus = null;
  }

  /** Shot down, or orphaned when she falls. */
  fall() {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
  }

  tumble(dt) {
    this.deathT += dt;
    this.altitude -= dt * (2 + this.deathT * 11);
    this.obj.position.y = this.altitude;
    this.model.rotation.z += dt * 11;
    this.model.scale.setScalar(this.scale * Math.max(0.2, 1 - this.deathT));
    this.bar.group.visible = false;
    if (this.deathT > 0.9) this.obj.visible = false;
  }

  /** Scores nothing and pays nothing, whoever shot it. */
  takeDamage(amount, game, fromAngle, quiet = false) {
    if (this.dead) return;
    const dealt = Math.max(1, amount - this.armor);
    this.hp -= dealt;
    this.hurt = 1;
    if (!quiet) game.fx.sparks({ x: this.x, y: this.altitude, z: this.z }, fromAngle, 4, [0.85, 0.6, 1], 3);
    if (this.hp <= 0) {
      this.fall();
      game.fx.sparks({ x: this.x, y: this.altitude, z: this.z }, fromAngle, 10, [1, 0.7, 0.3], 4, 6.28);
    }
  }
}

class Skymother extends Zergling {
  constructor(x, z, hpScale, speedScale) {
    super(x, z, 'skymother', hpScale, speedScale);
    this.isSkymother = true;
    this.broodScale = hpScale;
    this.pickRadius = 46;      // she is far bigger than the usual click target
    this.docked = SKYMOTHER.brood;
    this.brood = [];
    this.launchT = 0;
    this.growT = SKYMOTHER.regrow;
    this.lookT = 0;
    this.prey = null;
  }

  /** A Titan first, whatever else is near; otherwise the closest thing she can reach. */
  pick(game) {
    let titan = null, best = this.breed.range;
    for (const u of game.gunners) {
      if (u.kind !== 'cruiser' || u.dead || u.downed) continue;
      const d = Math.hypot(u.x - this.x, u.z - this.z);
      if (d <= best) { best = d; titan = u; }
    }
    return titan || this.rangedPrey(game);
  }

  update(dt, game) {
    this.hurt = Math.max(0, this.hurt - dt * 4);
    if (this.dead) { this.crash(dt, game); return; }
    this.spawnT = Math.min(1, this.spawnT + dt * 1.2);
    this.model.scale.setScalar(this.scale * (0.5 + this.spawnT * 0.5));
    this.altitude = (game.heightAt?.(this.x, this.z) || 0) + SKYMOTHER.altitude;
    this.lookT -= dt;
    if (this.lookT <= 0 || this.prey?.dead) { this.lookT = 0.4; this.prey = this.pick(game); }
    this.brood = this.brood.filter((t) => !t.dead);
    if (this.prey) {
      this.target = this.prey;
      this.moving = 0;
      this.yaw = angleLerp(this.yaw, Math.atan2(this.prey.z - this.z, this.prey.x - this.x), Math.min(1, dt * 1.4));
      this.launch(dt, game);
    } else {
      this.target = null;
      this.steer(game.core.x, game.core.z, dt, game);
    }
    if (this.docked + this.brood.length < SKYMOTHER.brood) {
      this.growT -= dt;
      if (this.growT <= 0) { this.growT = SKYMOTHER.regrow; this.docked++; }
    } else this.growT = SKYMOTHER.regrow;
    this.model.userData.setPods(this.docked);
    this.animate(dt, game);
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  launch(dt, game) {
    this.launchT -= dt;
    if (this.launchT > 0 || this.docked <= 0) return;
    this.launchT = SKYMOTHER.launchGap;
    this.docked--;
    const talon = new Talon(this, this.brood.length);
    this.brood.push(talon);
    game.zerglings.push(talon);
    game.world.add(talon.obj);
  }

  /** Falling out of the sky, then one last blast where she lands. */
  crash(dt, game) {
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 1.4);
    this.obj.position.y = this.altitude * (1 - k * k);
    this.model.rotation.z = k * 0.45;
    this.model.rotation.x = k * 0.25;
    this.model.userData.anim('death', dt);
    this.bar.group.visible = false;
    if (k < 1 || this.crashed) return;
    this.crashed = true;
    this.obj.visible = false;
    const at = { x: this.x, y: 0.5, z: this.z };
    game.fx.explosion(at, 2.2);
    game.fx.chunks(at, 16, 0x4a2c66);
    game.fx.ring(at, 3.4, 0xffb347);
    game.fx.decal(this.x, this.z, 2.2, 0x24102e, 0.6);
    game.stage.kick(5);
    game.sfx.cannonHit();
  }

  takeDamage(amount, game, fromAngle, quiet = false) {
    if (this.dead) return;
    const before = this.hp;
    super.takeDamage(amount, game, fromAngle, true);
    if (!quiet) {
      game.fx.sparks({ x: this.x, y: this.altitude, z: this.z }, fromAngle + Math.PI, 5, [0.9, 0.75, 1], 3);
      game.fx.label({ x: this.x, y: this.altitude + 1.6, z: this.z }, '-' + Math.round(before - Math.max(0, this.hp)), 'dmg');
      game.sfx.hitFlesh();
    }
    if (this.dead) for (const t of this.brood) t.fall();
  }
}

/** What the core talks to: whether there is room for another Skymother, and hatching her. */
class Skyfleet {
  constructor(game, ui) { this.game = game; this.ui = ui; this.warned = 0; }

  get alive() { return this.game.zerglings.filter((z) => z.isSkymother && !z.dead).length; }

  room() { return this.alive < SKYMOTHER.maxAlive; }

  hatch(x, z, spawn) {
    const g = this.game;
    if (this.warned !== g.level) {
      this.warned = g.level;
      this.ui?.callout(`${BREEDS.skymother.name.toUpperCase()} INBOUND`, 'Heavy armour · launches Talons · Titans, Spectres and Atlas mechs bring her down', 'unit');
      g.sfx.horn(null);
    }
    return new Skymother(x, z, spawn.hpScale, spawn.speedScale);
  }
}

export function installSkymother(game, ui) {
  registerModel('skymother', buildSkymother, [0xc06bff, 0.32]);
  registerModel('talon', buildTalon, [0xc06bff, 0.3]);
  game.skyfleet = new Skyfleet(game, ui);
  return game.skyfleet;
}
