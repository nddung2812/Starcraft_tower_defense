// Optional layer. The hero: one soldier named after the commander, who shoots, cuts down anything close
// for double damage, and keeps levels and gear between runs. Bosses drop the gear. The core reaches this
// only through `game.hero?.…`, so a missing file costs the hero and nothing else. Tuning is `HERO` and
// `LOOT` in config; the rules and the save are in heroitems.js and the gear screen in heropanel.js.
import * as THREE from 'three';
import { CELL, HERO, LOOT, UNITS } from './config.js';
import { Marine, AirBomb } from './entities.js';
import { registerModel } from './assets.js';
import { buildMarine } from './models.js';
import { savedName } from './scores.js';
import { addXp, equip, heroStats, readProfile, rollItem, scrap, stash, writeProfile, xpToNext } from './heroitems.js';
import { HeroPanel } from './heropanel.js';

const GOLD = 0xffc24a;
const tone = rarity => new THREE.Color(LOOT.rarity[rarity]?.color || '#9fd8ff').getHex();
const angleTo = (a, b) => Math.atan2(b.z - a.z, b.x - a.x);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const girth = bug => bug.kind === 'hive' ? 1 : 0.3 * (bug.scale || 1);

/* One set of geometry and materials for the hero's kit and every drop: never dispose or recolour them. */
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const capeCloth = () => {
  const g = new THREE.PlaneGeometry(0.42, 0.8, 4, 8).translate(0, -0.4, 0).rotateY(Math.PI / 2), at = g.attributes.position;
  for (let i = 0; i < at.count; i++) {
    const t = -at.getY(i) / 0.8;                      // 0 at the shoulders, 1 at the hem
    at.setZ(i, at.getZ(i) * (1 + t * 0.5));
    at.setX(i, -t * t * 0.14 + Math.cos(at.getZ(i) * 22) * 0.012 * t);
  }
  g.computeVertexNormals();
  return g;
};
const shapes = {
  receiver: box(0.3, 0.06, 0.05, 0.07), stock: box(0.13, 0.055, 0.04, -0.15, -0.01), mag: box(0.05, 0.1, 0.035, 0.1, -0.07),
  barrel: new THREE.CylinderGeometry(0.014, 0.014, 0.28, 8).rotateZ(Math.PI / 2).translate(0.35, 0.008, 0),
  brake: box(0.06, 0.036, 0.036, 0.5, 0.008), rail: box(0.24, 0.014, 0.056, 0.07, 0.034),
  coil: new THREE.TorusGeometry(0.026, 0.007, 6, 14).rotateY(Math.PI / 2),
  hilt: box(0.13, 0.036, 0.036, -0.05), guard: box(0.026, 0.04, 0.17, 0.03),
  edge: box(1, 0.016, 0.05, 0.5), glowEdge: box(1, 0.04, 0.09, 0.5),
  cape: capeCloth(), collar: box(0.05, 0.035, 0.34, -0.1, 0.03),
  pad: new THREE.SphereGeometry(0.1, 12, 8).scale(1.1, 0.72, 1), padRim: new THREE.TorusGeometry(0.095, 0.011, 6, 18).rotateX(Math.PI / 2),
  fin: box(0.11, 0.05, 0.016, -0.01, 0.075), crest: new THREE.OctahedronGeometry(0.042, 0).scale(0.5, 1.2, 1),
  orb: new THREE.IcosahedronGeometry(0.09, 0),
  drone: new THREE.OctahedronGeometry(0.12, 0),
  slash: new THREE.RingGeometry(0.55, 1.4, 24, 1, -1.15, 2.3).rotateX(-Math.PI / 2),
  aura: new THREE.RingGeometry(0.7, 0.75, 40).rotateX(-Math.PI / 2),
  shield: new THREE.SphereGeometry(0.95, 18, 12),
  beam: new THREE.CylinderGeometry(0.1, 0.22, 5, 10, 1, true).translate(0, 2.5, 0),
  gem: new THREE.OctahedronGeometry(0.2, 0),
  halo: new THREE.RingGeometry(0.38, 0.48, 28).rotateX(-Math.PI / 2)
};
const GUNMETAL = new THREE.MeshStandardMaterial({ color: 0x20262f, metalness: 0.75, roughness: 0.38 });
const STEEL = new THREE.MeshStandardMaterial({ color: 0xb4bec8, metalness: 0.85, roughness: 0.28 });
const GILT = new THREE.MeshStandardMaterial({ color: 0xf2bb3e, metalness: 0.9, roughness: 0.3, emissive: 0x3a2400 });
const CAPE = new THREE.MeshStandardMaterial({ color: 0xa3121f, roughness: 0.72, side: THREE.DoubleSide, emissive: 0x240205 });

/* How each part sits on the suit's bones: these turn a bone's axes back to the hero's own (+X forward, +Y up). */
const SEATS = {
  WristR: { turn: [0.0471, 0.0756, 0.625, 0.7755], at: [0.3, 0.9, 0.2] },
  Chest: { turn: [-0.0414, -0.7044, 0.0398, 0.7075], at: [0.05, 0.9, 0] },
  ShoulderR: { turn: [0.2245, -0.7946, -0.4105, -0.387], at: [0.05, 0.92, 0.2] },
  ShoulderL: { turn: [0.4202, 0.3797, -0.2001, 0.7995], at: [0.05, 0.92, -0.2] }
};
const SWING = 0.42;   // seconds the energy blade stays lit for one strike
const PLATE_Y = 1.42;
const CRIMSON = new THREE.MeshStandardMaterial({ color: 0xa8101c, metalness: 0.5, roughness: 0.4, emissive: 0x2a0306 });

/* The War Robot, drawn 50% taller than the hero: facing +X, feet at y = 0, one set of shapes for every build. */
let robotKit = null;
/** A box that narrows or flares from bottom to top, so the armour has a shape. */
const taper = (geometry, top, bottom = 1) => {
  const at = geometry.attributes.position;
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  for (let i = 0; i < at.count; i++) {
    const k = bottom + (top - bottom) * (at.getY(i) - min.y) / (max.y - min.y);
    at.setX(i, at.getX(i) * k);
    at.setZ(i, at.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
};
/** A wing feather that comes to a point. */
const blade = length => {
  const geometry = box(0.2, 0.026, length, 0, 0, length / 2), at = geometry.attributes.position;
  for (let i = 0; i < at.count; i++) at.setX(i, at.getX(i) * (1 - 0.8 * at.getZ(i) / length));
  geometry.computeVertexNormals();
  return geometry;
};
const robotShapes = () => robotKit ||= {
  thigh: taper(box(0.2, 0.3, 0.2), 1.1, 0.72), knee: taper(box(0.2, 0.1, 0.2), 0.8, 1.05), shin: taper(box(0.25, 0.34, 0.25), 0.72, 1.05), foot: taper(box(0.36, 0.08, 0.24), 0.7, 1),
  pelvis: taper(box(0.28, 0.17, 0.4), 1, 0.65), torso: taper(box(0.4, 0.42, 0.62), 1.08, 0.62), chest: taper(box(0.07, 0.26, 0.38), 1.1, 0.55), core: new THREE.OctahedronGeometry(0.075, 0),
  neck: box(0.1, 0.06, 0.1), head: taper(box(0.24, 0.18, 0.21), 0.68, 1), visor: box(0.03, 0.045, 0.17), crest: taper(box(0.26, 0.1, 0.035), 0.3, 1),
  shoulder: taper(box(0.3, 0.2, 0.27), 0.68, 1), upper: taper(box(0.15, 0.24, 0.15), 1, 0.78), gun: box(0.5, 0.15, 0.15),
  barrel: new THREE.CylinderGeometry(0.032, 0.032, 0.32, 10).rotateZ(Math.PI / 2), brake: box(0.08, 0.09, 0.09), strip: box(0.34, 0.02, 0.16),
  flame: new THREE.ConeGeometry(0.08, 0.44, 10).rotateX(Math.PI),
  feather: [0.86, 0.68, 0.5].map(blade), tip: [0.86, 0.68, 0.5].map(l => box(0.05, 0.03, 0.09, 0, 0, l - 0.03))
};
function buildRobot() {
  const k = robotShapes(), root = new THREE.Group(), arms = [], tips = [], wings = [], flames = [];
  const add = (parent, shape, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(shape, material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  add(root, k.pelvis, GUNMETAL, 0, 0.66);
  add(root, k.torso, GUNMETAL, 0, 0.93);
  add(root, k.chest, GILT, 0.19, 0.96);
  add(root, k.core, glow(0x3fe8ff), 0.235, 0.96);
  add(root, k.neck, STEEL, 0, 1.15);
  add(root, k.head, GILT, 0.01, 1.26);
  add(root, k.visor, glow(0x3fe8ff), 0.125, 1.27);
  add(root, k.crest, CRIMSON, 0, 1.37);
  for (const side of [-1, 1]) {
    add(root, k.thigh, GUNMETAL, 0, 0.5, side * 0.14);
    add(root, k.knee, CRIMSON, 0.03, 0.35, side * 0.14);
    add(root, k.shin, GILT, 0, 0.18, side * 0.14);
    add(root, k.foot, GUNMETAL, 0.05, 0.035, side * 0.14);
    add(root, k.shoulder, GILT, 0, 1.08, side * 0.39);

    // An arm that ends in a cannon.
    const arm = new THREE.Group();
    arm.position.set(0, 1.0, side * 0.39);
    add(arm, k.upper, CRIMSON, 0, -0.08);
    add(arm, k.gun, GUNMETAL, 0.2, -0.26);
    add(arm, k.strip, glow(0x3fe8ff), 0.2, -0.18);
    add(arm, k.barrel, STEEL, 0.6, -0.26);
    add(arm, k.brake, GILT, 0.77, -0.26);
    const tip = new THREE.Object3D();
    tip.position.set(0.84, -0.26, 0);
    arm.add(tip);
    arms.push(arm); tips.push(tip);
    root.add(arm);

    // Three swept feathers a side, tipped in crimson.
    const wing = new THREE.Group();
    wing.position.set(-0.22, 1.1, side * 0.2);
    wing.scale.z = side;
    k.feather.forEach((shape, i) => {
      const feather = new THREE.Group();
      feather.rotation.y = -0.3 - i * 0.42;
      add(feather, shape, i === 1 ? GUNMETAL : GILT);
      add(feather, k.tip[i], CRIMSON);
      wing.add(feather);
    });
    wings.push({ wing, side });
    root.add(wing);

    flames.push(add(root, k.flame, soft(0x4fd8ff, 0.7), -0.24, 0.62, side * 0.12));
  }
  root.userData = { arms, tips, wings, flames };
  return root;
}

const _tip = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();

const glowCache = new Map(), softCache = new Map();
function glow(hex) {
  if (!glowCache.has(hex)) glowCache.set(hex, new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }));
  return glowCache.get(hex);
}
function soft(hex, opacity) {
  const key = `${hex}:${opacity}`;
  if (!softCache.has(key)) softCache.set(key, new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  return softCache.get(key);
}

/* ------------------------------------------------------------------ */
/*  THE UNIT                                                           */
/* ------------------------------------------------------------------ */

export class Hero extends Marine {
  constructor(tx, ty, corps) {
    super('hero', tx, ty, [], corps.game.baseLevel);
    this.isHero = true;
    this.corps = corps;
    this.swing = 0;
    this.shots = 0;
    this.droneT = 0;
    this.staticT = 0;
    this.aegisCd = 0;
    this.shieldT = 0;
    // While the blade is out, the suit plays its sword strike over whatever else it was doing.
    const play = this.model.userData.anim;
    if (play) this.model.userData.anim = (state, dt) => play(this.swing > 0 && state !== 'death' ? 'attack' : state, dt);
    this.seats = [];
    this.robotT = 0;
    this.gunKick = 0;
    this.lift = 0;
    this.slashMark = new THREE.Mesh(shapes.slash, new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.slashMark.position.y = 0.62;
    this.slashMark.visible = false;
    this.aura = new THREE.Mesh(shapes.aura, soft(0xff8a2a, 0.5));
    this.aura.position.y = 0.03;
    this.shieldBall = new THREE.Mesh(shapes.shield, soft(0xffd98a, 0.28));
    this.shieldBall.position.y = 0.7;
    this.shieldBall.visible = false;
    this.orbit = new THREE.Group();
    this.orbit.position.y = 1.22;
    this.obj.add(this.slashMark, this.aura, this.shieldBall, this.orbit);
    this.dress();
  }

  /** The hero's numbers come from the sheet, not from the Trooper armory. */
  applyStats() {
    const sheet = heroStats(Hero.profile, this.baseLevel);
    const ratio = this.stats ? this.hp / this.stats.hp : 1;
    this.gear = sheet.gear;
    this.meleeFactor = sheet.melee;
    this.stats = sheet.stats;
    if (this.robotT > 0) {
      const robot = HERO.skills.robot;
      this.stats.damage *= robot.damage;
      this.stats.attackSpeed /= robot.haste;
      this.stats.moveSpeed *= robot.speed;
      this.stats.range += robot.range;
    }
    this.hp = Math.min(this.stats.hp, this.stats.hp * ratio);
  }

  get attackDamage() { return Math.max(1, Math.round(this.stats.damage * (this.strike || 1))); }

  /** Charging a bug it was ordered to attack: it closes to blade reach instead of stopping at gun range. */
  charging() {
    const t = this.order?.type === 'attack' ? this.order.target : null;
    return !this.flying && !!t && !t.flying && t.kind !== 'hive' && t !== this.noCharge;
  }

  get attackRange() {
    return this.charging() ? HERO.melee.reach + girth(this.order.target) : super.attackRange;
  }

  /** A bug that cannot be walked up to gets shot instead. */
  chase(game) {
    if (this.charging()) {
      const t = this.order.target;
      if (!game.grid.attackRoute(Math.floor(this.x), Math.floor(this.z), t.x, t.z, this.attackRange * 0.9)) this.noCharge = t;
    }
    super.chase(game);
  }

  inReach(bug) { return !this.flying && !bug.flying && this.distTo(bug) <= HERO.melee.reach + girth(bug); }

  fire(game) {
    const t = this.target;
    if (this.silenceT > 0 || !game.isEnemy(t)) return;
    this.strike = Math.random() * 100 < this.gear.crit ? HERO.critMultiplier : 1;
    if (this.robotT > 0) {
      // Both cannons, one shot each.
      for (const tip of this.robot.userData.tips) { this.aimMuzzle(tip); super.fire(game); }
      this.gunKick = 1;
      this.afterShot(t, game);
    } else if (this.inReach(t)) this.slash(t, game);
    else { this.aimMuzzle(); super.fire(game); this.afterShot(t, game); }
    this.strike = 1;
  }

  /** Shots leave the end of the rifle, wherever the animation has put it. */
  aimMuzzle(tip = this.muzzleTip) {
    const weapon = this.model.userData.weapon;
    this.obj.updateWorldMatrix(true, true);
    tip.getWorldPosition(_tip);
    weapon.userData.muzzles = [weapon.worldToLocal(_tip).clone()];
  }

  /** The blade: twice the gun, and more with melee gear. */
  slash(target, game) {
    const power = Math.round(this.attackDamage * this.meleeFactor), powers = this.gear.powers;
    this.swing = 1;
    this.slashMark.visible = true;
    this.slashMark.rotation.y = -this.yaw;
    const sweep = powers.has('reaper') ? LOOT.legendaries.reaper.radius : 0;
    const struck = sweep ? game.combatTargets.filter(b => !b.dead && !b.flying && this.distTo(b) <= sweep + girth(b)) : [target];
    if (!struck.includes(target)) struck.push(target);
    for (const bug of struck) bug.takeDamage(power, game, angleTo(this, bug));
    if (sweep) game.fx.ring(this, sweep, 0xff8a2a);
    if (this.gear.leech) this.mend(power * struck.length * this.gear.leech / 100);
    game.fx.sparks({ x: target.x, y: 0.5, z: target.z }, this.yaw, 10, [1, 0.9, 0.65], 5, 1.4);
    game.stage.kick(0.7);
    if (powers.has('ember')) this.emberWave(power, game);
    if (!game.called) { game.called = true; game.voice.say('acquired'); }
  }

  mend(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }

  emberWave(power, game) {
    const spec = LOOT.legendaries.ember;
    const from = { x: this.x + Math.cos(this.yaw) * 0.4, y: 0.6, z: this.z + Math.sin(this.yaw) * 0.4 };
    game.fx.flame(from, this.yaw, spec.reach, spec.arc, this);
    for (const bug of game.combatTargets.slice()) {
      if (bug.dead || bug.flying || this.distTo(bug) > spec.reach + girth(bug)) continue;
      if (Math.abs(wrap(angleTo(this, bug) - this.yaw)) > spec.arc) continue;
      game.fx.burning(bug.x, 0.3, bug.z, Math.max(0.8, Math.min(2, bug.scale || 1)));
      bug.takeDamage(Math.round(power * spec.damage), game, this.yaw, true);
    }
  }

  afterShot(target, game) {
    this.shots++;
    const powers = this.gear.powers, storm = LOOT.legendaries.storm, cinder = LOOT.legendaries.cinder;
    if (powers.has('storm') && this.shots % storm.every === 0) {
      const seen = new Set([target]);
      let from = target;
      for (let hop = 0; hop < storm.hops; hop++) {
        let next = null, best = storm.radius;
        for (const bug of game.combatTargets) {
          if (bug.dead || seen.has(bug)) continue;
          const d = Math.hypot(bug.x - from.x, bug.z - from.z);
          if (d <= best) { best = d; next = bug; }
        }
        if (!next) break;
        seen.add(next);
        game.fx.lightning(from, next);
        next.takeDamage(Math.round(this.attackDamage * storm.damage), game, angleTo(from, next));
        from = next;
      }
    }
    if (powers.has('cinder') && this.shots % cinder.every === 0 && !target.flying) {
      game.spawnShell({ x: this.x, y: 0.8, z: this.z }, target.x, target.z, Math.round(this.attackDamage * cinder.damage), cinder.radius);
    }
  }

  takeDamage(amount, game, fromAngle) {
    if (this.shieldT > 0) return;
    const aegis = LOOT.legendaries.aegis;
    if (this.gear.powers.has('aegis') && this.aegisCd <= 0 && !this.downed && !this.dead
      && this.hp - Math.max(1, amount - this.stats.armor) < this.maxHp * aegis.below) {
      this.aegisCd = aegis.cooldown;
      this.shieldT = aegis.seconds;
      this.nova(aegis.radius, Math.round(this.stats.damage * aegis.damage), 0xffd98a, game);
      game.fx.label({ x: this.x, y: 1.6, z: this.z }, 'AEGIS', 'evolution');
      game.stage.kick(3);
      game.sfx.cannonHit();
      return;
    }
    // A lethal hit breaks the robot instead of the pilot.
    if (this.robotT > 0 && !this.corps.shielded(this) && this.hp - Math.max(1, amount - this.stats.armor) <= 0) {
      this.endRobot(game);
      this.hp = Math.max(1, Math.round(this.maxHp * 0.25));
      return;
    }
    super.takeDamage(amount, game, fromAngle);
  }

  /** Skill three: up into the air as the War Robot. Aircraft own no ground tile. */
  startRobot(game) {
    if (game.grid.occupant(this.tx, this.ty) === this) game.grid.clear(this.tx, this.ty);
    this.robotT = HERO.skills.robot.seconds;
    this.flying = true;
    this.lift = 0;
    this.applyStats();
    if (!this.robot) { this.robot = buildRobot(); this.obj.add(this.robot); }
    this.robot.visible = true;
    this.model.visible = false;
    this.barHome ??= this.bar.group.position.y;
    this.bar.group.position.y = 1.72;
    this.orbit.position.y = 1.7;
    this.corps.plate.position.y = 1.95;
    game.fx.ring(this, 2.6, 0x3fe8ff);
    game.fx.ring(this, 1.5, GOLD);
    game.fx.sparks({ x: this.x, y: 0.8, z: this.z }, 0, 40, [0.4, 0.9, 1], 8, 6.28);
    game.fx.label({ x: this.x, y: 2.2, z: this.z }, 'WAR ROBOT', 'evolution');
    game.stage.kick(3);
    game.sfx.upgrade();
  }

  /** Back on foot, on the nearest open ground. */
  endRobot(game) {
    this.robotT = 0;
    this.flying = false;
    this.altitude = 0;
    this.driving = false;
    this.waypoints = null;
    this.applyStats();
    this.robot.visible = false;
    this.model.visible = true;
    this.bar.group.position.y = this.barHome;
    this.orbit.position.y = 1.22;
    this.corps.plate.position.y = PLATE_Y;
    const spot = game.grid.nearestOpen(Math.floor(this.x), Math.floor(this.z), 16) || this.corps.landing();
    if (spot) {
      this.tx = this.goalTx = spot.x; this.ty = this.goalTy = spot.y;
      this.x = spot.x + 0.5; this.z = spot.y + 0.5;
      game.grid.set(spot.x, spot.y, CELL.TOWER, this);
    }
    this.obj.position.set(this.x, 0, this.z);
    game.fx.ring(this, 1.8, 0x3fe8ff);
    game.fx.smoke({ x: this.x, y: 0.3, z: this.z }, 8, [0.5, 0.5, 0.55]);
    game.stage.kick(2);
    this.corps.cd.robot = HERO.skills.robot.cooldown;
  }

  /** Airborne: rises into place, flaps, and keeps both guns firing on the move. */
  flyRobot(dt, game) {
    this.robotT -= dt;
    if (this.robotT <= 0) { this.endRobot(game); return; }
    if (this.driving && this.silenceT <= 0) {
      const prey = this.acquire(game);
      if (prey) {
        this.target = prey;
        this.yaw = Math.atan2(prey.z - this.z, prey.x - this.x);
        this.cooldown -= dt;
        if (this.cooldown <= 0) { this.fire(game); this.cooldown = this.stats.attackSpeed; }
      }
    }
    this.lift = Math.min(1, this.lift + dt * 1.8);
    this.obj.position.y = this.altitude * this.lift * (2 - this.lift);
    this.gunKick = Math.max(0, this.gunKick - dt * 7);
    const parts = this.robot.userData, t = game.time;
    this.robot.rotation.y = -this.yaw;
    this.robot.rotation.z = this.driving ? -0.16 : 0;
    this.robot.position.y = Math.sin(t * 3) * 0.05;
    for (const { wing, side } of parts.wings) wing.rotation.x = -side * (0.42 + Math.sin(t * (this.driving ? 11 : 4)) * 0.16);
    for (const arm of parts.arms) arm.position.x = -this.gunKick * 0.07;
    for (const flame of parts.flames) flame.scale.y = (this.driving ? 1.5 : 1) + Math.sin(t * 43 + flame.position.z * 9) * 0.22;
  }

  /** A ring of damage around the hero. */
  nova(radius, damage, color, game) {
    game.fx.ring(this, radius, color);
    for (const bug of game.combatTargets.slice()) {
      if (!bug.dead && !bug.flying && this.distTo(bug) <= radius + girth(bug)) bug.takeDamage(damage, game, angleTo(this, bug), true);
    }
  }

  update(dt, game) {
    super.update(dt, game);
    const up = !this.dead && !this.downed;
    this.aura.visible = up && this.aura.userData.on;
    this.orbit.visible = up;
    if (!up) { this.shieldBall.visible = false; this.slashMark.visible = false; return; }
    this.aegisCd = Math.max(0, this.aegisCd - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    if (this.gear.regen) this.mend(this.gear.regen * dt);
    if (['wave', 'raid'].includes(game.state)) this.runPowers(dt, game);
    if (this.robotT > 0) this.flyRobot(dt, game);
    this.animateKit(dt, game);
  }

  runPowers(dt, game) {
    const powers = this.gear.powers;
    if (powers.has('static')) {
      const spec = LOOT.legendaries.static;
      this.staticT -= dt;
      if (this.staticT <= 0 && game.zerglings.some(b => !b.dead && !b.flying && this.distTo(b) <= spec.radius + girth(b))) {
        this.staticT = spec.every;
        this.nova(spec.radius, Math.round(this.stats.damage * spec.damage), 0x71e7e0, game);
        game.sfx.laser?.();
      }
    }
    if (powers.has('drone') && this.silenceT <= 0) {
      const spec = LOOT.legendaries.drone;
      this.droneT -= dt;
      if (this.droneT <= 0) {
        const prey = game.zerglings.filter(b => !b.dead && this.distTo(b) <= spec.range).sort((a, b) => this.distTo(a) - this.distTo(b))[0];
        if (prey) {
          this.droneT = spec.every;
          const at = this.droneMesh ? this.droneMesh.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(this.x, 1.2, this.z);
          game.spawnTracer(at, prey, Math.max(1, Math.round(this.stats.damage * spec.damage)), this);
        }
      }
    }
  }

  animateKit(dt, game) {
    this.swing = Math.max(0, this.swing - dt / SWING);
    const lit = this.swing > 0;
    this.rifle.visible = !lit;
    this.handBlade.visible = lit;
    this.backBlade.visible = !lit;
    if (lit) {
      const p = 1 - this.swing;
      this.slashMark.material.opacity = Math.sin(p * Math.PI) * 0.85;
      this.handBlade.scale.x = Math.min(1, p * 5);    // the beam snaps out of the hilt
    } else this.slashMark.visible = false;
    const flap = (this.driving ? -0.55 : -0.08) + Math.sin(game.time * (this.driving ? 9 : 2.6)) * (this.driving ? 0.09 : 0.04);
    this.capeMesh.rotation.z += (flap - this.capeMesh.rotation.z) * Math.min(1, dt * 7);
    this.orbit.rotation.y += dt * 2.2;
    this.aura.scale.setScalar(1 + Math.sin(game.time * 3) * 0.05);
    this.shieldBall.visible = this.shieldT > 0;
    if (this.shieldBall.visible) this.shieldBall.scale.setScalar(1 + Math.sin(game.time * 14) * 0.04);
  }

  /** A mount on one of the suit's bones, measured in the hero's own units. */
  seat(bone) {
    const spec = SEATS[bone], parent = this.model.getObjectByName(bone), mount = new THREE.Group();
    if (parent) {
      this.model.updateWorldMatrix(true, true);
      mount.scale.setScalar(this.model.getWorldScale(_a).x / parent.getWorldScale(_b).x);
      mount.quaternion.fromArray(spec.turn);
      parent.add(mount);
    } else {                                           // the built-in model has no bones to hold on to
      mount.position.fromArray(spec.at);
      this.model.add(mount);
    }
    this.seats.push(mount);
    return mount;
  }

  /** An energy sword along +X. Sheathed it shows a dark blade with a lit edge. */
  sword(color, length, lit) {
    const group = new THREE.Group(), beam = new THREE.Group();
    group.add(new THREE.Mesh(shapes.hilt, GUNMETAL), new THREE.Mesh(shapes.guard, GILT));
    const core = new THREE.Mesh(shapes.edge, lit ? glow(0xffffff) : STEEL);
    beam.add(core);
    if (lit) beam.add(new THREE.Mesh(shapes.glowEdge, soft(color, 0.6)));
    else { const line = new THREE.Mesh(shapes.edge, glow(color)); line.scale.set(1, 1.25, 0.35); beam.add(line); }
    beam.position.x = 0.04;
    beam.scale.x = length;
    group.add(beam);
    return group;
  }

  /** What the hero wears shows on the suit: every slot changes something you can see. */
  dress() {
    for (const mount of this.seats) mount.removeFromParent();
    this.seats = [];
    this.orbit.clear();
    this.droneMesh = null;
    const worn = Hero.profile.worn;

    // The rifle in the right hand: its rail and coils take the colour of the gun worn.
    const gun = worn.weapon, rail = gun ? tone(gun.rarity) : 0x3fe8ff;
    const hand = this.seat('WristR'), rifle = this.rifle = new THREE.Group();
    rifle.position.set(0.04, 0.02, 0);
    rifle.scale.setScalar(1.2);
    for (const part of [shapes.receiver, shapes.stock, shapes.mag]) rifle.add(new THREE.Mesh(part, GUNMETAL));
    rifle.add(new THREE.Mesh(shapes.barrel, STEEL), new THREE.Mesh(shapes.brake, GILT), new THREE.Mesh(shapes.rail, glow(rail)));
    const coils = gun ? { magic: 1, rare: 2, legendary: 3 }[gun.rarity] : 0;
    for (let i = 0; i < coils; i++) {
      const coil = new THREE.Mesh(shapes.coil, glow(rail));
      coil.position.set(0.28 + i * 0.065, 0.008, 0);
      rifle.add(coil);
    }
    this.muzzleTip = new THREE.Object3D();
    this.muzzleTip.position.set(0.54, 0.008, 0);
    rifle.add(this.muzzleTip);
    hand.add(rifle);

    // The blade: sheathed across the back, lit in the hand for each strike. Better steel is longer and brighter.
    const steel = worn.blade, edge = steel ? tone(steel.rarity) : 0x3fe8ff;
    const length = steel ? { magic: 0.68, rare: 0.78, legendary: 0.92 }[steel.rarity] : 0.58;
    this.handBlade = this.sword(edge, length, true);
    this.handBlade.position.set(0.05, 0.02, 0);
    this.handBlade.visible = false;
    hand.add(this.handBlade);
    this.slashMark.material.color.setHex(edge);

    const chest = this.seat('Chest');
    this.backBlade = new THREE.Group();                // hilt over the right shoulder, point at the left hip
    this.backBlade.position.set(-0.15, 0.1, 0.13);
    this.backBlade.rotation.x = -1.05;
    const sheathed = this.sword(edge, length, false);
    sheathed.rotation.y = Math.PI / 2;
    this.backBlade.add(sheathed);
    chest.add(this.backBlade);

    // The cape hangs from a gilt collar.
    this.capeMesh = new THREE.Mesh(shapes.cape, CAPE);
    this.capeMesh.position.set(-0.11, 0.03, 0);
    chest.add(this.capeMesh, new THREE.Mesh(shapes.collar, GILT));

    // Gilded shoulders; armour worn lights their rims and a crest on the chest.
    const plate = worn.armor ? glow(tone(worn.armor.rarity)) : GUNMETAL;
    for (const [bone, side] of [['ShoulderR', 1], ['ShoulderL', -1]]) {
      const mount = this.seat(bone), pad = new THREE.Group();
      pad.position.set(0, 0.03, side * 0.05);
      const rim = new THREE.Mesh(shapes.padRim, plate);
      rim.position.y = -0.012;
      pad.add(new THREE.Mesh(shapes.pad, GILT), rim, new THREE.Mesh(shapes.fin, GUNMETAL));
      mount.add(pad);
    }
    if (worn.armor) {
      const crest = new THREE.Mesh(shapes.crest, plate);
      crest.position.set(0.125, -0.03, 0);
      chest.add(crest);
    }

    if (worn.relic) {
      const drone = worn.relic.power === 'drone';
      const mesh = new THREE.Mesh(drone ? shapes.drone : shapes.orb, glow(tone(worn.relic.rarity)));
      mesh.position.set(drone ? 0.9 : 0.42, drone ? 0.25 : 0, 0);
      this.orbit.add(mesh);
      if (drone) this.droneMesh = mesh;
    }
    this.aura.userData.on = Object.values(worn).some(i => i?.rarity === 'legendary');
  }
}

/* ------------------------------------------------------------------ */
/*  LOOT ON THE GROUND                                                 */
/* ------------------------------------------------------------------ */

class Drop {
  constructor(item, from, to) {
    this.item = item;
    this.from = from;
    this.x = to.x; this.z = to.z;
    this.t = 0;
    const color = tone(item.rarity);
    this.obj = new THREE.Group();
    this.gem = new THREE.Mesh(shapes.gem, glow(color));
    this.beam = new THREE.Mesh(shapes.beam, soft(color, 0.3));
    const halo = new THREE.Mesh(shapes.halo, soft(color, 0.8));
    halo.position.y = 0.04;
    this.obj.add(this.gem, this.beam, halo);
    this.obj.position.set(from.x, 0.5, from.z);
  }

  update(dt) {
    this.t += dt;
    const k = Math.min(1, this.t / 0.7);
    this.obj.position.set(this.from.x + (this.x - this.from.x) * k, Math.sin(k * Math.PI) * 1.6, this.from.z + (this.z - this.from.z) * k);
    this.gem.position.y = 0.45 + Math.sin(this.t * 3) * 0.07;
    this.gem.rotation.y += dt * 2.4;
  }
}

/* ------------------------------------------------------------------ */
/*  THE LAYER                                                          */
/* ------------------------------------------------------------------ */

export class HeroCorps {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.profile = Hero.profile = readProfile();
    this.unit = null;
    this.drops = [];
    this.respawnT = 0;
    this.nearKills = 0;
    this.cd = { grenade: 0, shield: 0, robot: 0 };
    this.grenades = [];
    this.guards = new Map();
    this.guardT = 0;
    this.shownHud = '';
    this.panel = new HeroPanel(this);
    this.buildPlate();
    this.buildButton();
    game.on('brief', () => this.muster());
    game.on('bossDown', ({ level }) => this.bossFell(level));
    game.on('roundCleared', () => this.collectAll());
    game.on('matchOver', () => { this.collectAll(); this.save(); });
    game.on('over', () => { this.collectAll(); this.save(); });
    game.on('change', () => this.syncHud());
    window.addEventListener('pagehide', () => this.save());
    window.addEventListener('keydown', ev => this.onKey(ev));
    this.syncHud();
  }

  get name() { return savedName() || 'Commander'; }

  /** On the field and fighting, or swallowed and waiting to be cut free. */
  get present() {
    const u = this.unit;
    return !!u && !u.dead && (u.swallowed || this.game.gunners.includes(u));
  }

  save() { writeProfile(this.profile); }

  onKey(ev) {
    if (ev.target instanceof HTMLElement && ev.target.closest('input, textarea, [contenteditable]')) return;
    if (!document.getElementById('intro').hidden || document.querySelector('dialog[open]')) return;
    if (!ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
    const k = ev.key.toLowerCase();
    if (k === 'w') this.selectHero();
    else if (k === 'c') this.panel.open();
  }

  selectHero() {
    const u = this.unit;
    if (!u || u.dead || u.downed || u.swallowed || !this.game.gunners.includes(u)) { this.game.sfx.deny(); return; }
    this.game.emit('selectOnly', u);
    this.game.stage.focus.set(u.x, 0, u.z);
  }

  /* ---------------- on the field ---------------- */

  /** Every round opens with the hero at the defense line, at full health. */
  muster() {
    this.collectAll();
    this.save();
    this.respawnT = 0;
    this.clearSkills();
    this.deploy();
  }

  landing() {
    const g = this.game, anchor = g.deployAnchor() || g.grid.core, ax = Math.floor(anchor.x), ay = Math.floor(anchor.y);
    for (let r = 0; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r && g.canBuildAt(ax + dx, ay + dy)) return { x: ax + dx, y: ay + dy };
        }
      }
    }
    return null;
  }

  deploy() {
    const g = this.game;
    if (this.unit && !this.unit.dead && g.gunners.includes(this.unit)) return this.unit;
    const spot = this.landing();
    if (!spot) return null;
    const info = UNITS.hero.info;
    info.name = this.name;
    info.role = `Hero · Level ${this.profile.level}`;
    const u = this.unit = new Hero(spot.x, spot.y, this);
    u.restYaw = u.yaw = g.threatYaw(u.x, u.z);
    g.grid.set(spot.x, spot.y, CELL.TOWER, u);
    g.gunners.push(u);
    g.world.add(u.obj);
    u.obj.add(this.plate);
    this.plate.position.y = PLATE_Y;
    this.paintPlate();
    g.fx.ring({ x: u.x, z: u.z }, 1.8, GOLD);
    this.syncHud();
    return u;
  }

  /** Once per device, after the round's opening messages have had their moment. */
  introduce(dt) {
    if (this.profile.met || this.game.state !== 'wave' || !this.present) return;
    this.introT = (this.introT || 0) + dt;
    if (this.introT < HERO.introDelay) return;
    this.profile.met = true;
    this.save();
    this.ui.toast(`${this.name} joins the line`, 'Shift+W selects your hero. Right-click a bug to charge it. Shift+C opens gear.', 'unlock');
  }

  /** Called every tick from game.update. */
  update(dt) {
    const g = this.game;
    this.introduce(dt);
    this.tickSkills(dt);
    for (const drop of this.drops) drop.update(dt);
    const u = this.unit;
    if (u && !u.dead && !u.downed && !u.swallowed) {
      const near = this.drops.find(d => d.t > 0.7 && Math.hypot(d.x - u.x, d.z - u.z) <= 1.1);
      if (near) this.collect(near);
    }
    if (this.present || !['brief', 'wave', 'raid'].includes(g.state)) return;
    if (this.respawnT <= 0) {
      this.respawnT = HERO.respawn;
      this.ui.toast(`${this.name} is down`, `Back at the line in ${HERO.respawn} seconds. Experience and gear are safe.`, 'warn');
    }
    this.respawnT -= dt;
    if (this.respawnT <= 0) { this.respawnT = 0; this.deploy(); }
    this.syncHud();
  }

  /* ---------------- passive skills ---------------- */

  /** Between rounds: nothing carries over but the timers, and a new run starts them all ready. */
  clearSkills() {
    const g = this.game;
    for (const grenade of this.grenades) g.scene.remove(grenade.mesh);
    this.grenades = [];
    this.dropShields(false);
    if (this.unit?.robotT > 0) this.cd.robot = HERO.skills.robot.cooldown;
    if (g.level === 1 && g.kills === 0) this.cd = { grenade: 0, shield: 0, robot: 0 };
  }

  grenadeDamage() { return HERO.skills.grenade.base + HERO.skills.grenade.perLevel * this.profile.level; }

  shielded(unit) { return this.guards.has(unit); }

  dropShields(spent = true) {
    for (const [unit, mesh] of this.guards) unit.obj.remove(mesh);
    this.guards.clear();
    if (this.guardT > 0 && spent) this.cd.shield = HERO.skills.shield.cooldown;
    this.guardT = 0;
  }

  /** Called every tick: timers run, and each skill that is ready goes off when the fight calls for it. */
  tickSkills(dt) {
    const g = this.game, cd = this.cd, u = this.unit, skills = HERO.skills;
    cd.grenade = Math.max(0, cd.grenade - dt);
    if (this.guardT > 0) {
      this.guardT -= dt;
      if (this.guardT <= 0) { this.guardT = 1e-9; this.dropShields(); }
    } else cd.shield = Math.max(0, cd.shield - dt);
    if (!(u?.robotT > 0)) cd.robot = Math.max(0, cd.robot - dt);
    for (const [unit, mesh] of this.guards) {
      if (unit.dead || unit.bunker || !g.gunners.includes(unit)) { unit.obj.remove(mesh); this.guards.delete(unit); }
      else mesh.scale.setScalar((mesh.userData.size || 1) * (1 + Math.sin(g.time * 7) * 0.03));
    }
    this.flyGrenades(dt);
    if (!this.present || u.swallowed || u.downed || u.silenceT > 0 || !['wave', 'raid'].includes(g.state)) return;

    const foes = g.zerglings.filter(b => !b.dead && u.distTo(b) <= skills.robot.sight);
    if (!foes.length) return;
    if (cd.grenade <= 0) this.tossGrenade(foes);
    if (cd.shield <= 0 && this.guardT <= 0) {
      const allies = g.gunners.filter(a => !a.dead && !a.downed && !a.bunker && u.distTo(a) <= skills.shield.radius);
      if (allies.some(a => a.hp < a.maxHp * skills.shield.hurt)) this.raiseShields(allies);
    }
    const danger = foes.length >= skills.robot.crowd || foes.some(b => b.isBoss) || u.hp < u.maxHp * 0.5;
    if (cd.robot <= 0 && u.robotT <= 0 && danger) u.startRobot(g);
  }

  /** Skill one: the grenade goes where the most ground bugs are standing. */
  tossGrenade(foes) {
    const spec = HERO.skills.grenade, u = this.unit, g = this.game;
    const ground = foes.filter(b => !b.flying && u.distTo(b) <= spec.range);
    if (!ground.length) return false;
    const crowd = b => ground.filter(o => Math.hypot(o.x - b.x, o.z - b.z) <= spec.radius).length;
    const aim = ground.reduce((best, b) => crowd(b) > crowd(best) ? b : best);
    const mesh = new THREE.Mesh(shapes.orb, glow(0xffa030));
    mesh.scale.setScalar(0.9);
    g.scene.add(mesh);
    this.grenades.push({ mesh, t: 0, from: { x: u.x, y: u.obj.position.y + 1, z: u.z }, to: { x: aim.x, z: aim.z }, damage: this.grenadeDamage() });
    this.cd.grenade = spec.cooldown;
    g.sfx.ui();
    return true;
  }

  flyGrenades(dt) {
    const spec = HERO.skills.grenade, g = this.game;
    for (const grenade of this.grenades.slice()) {
      grenade.t += dt;
      const k = Math.min(1, grenade.t / spec.flight), { from, to, mesh } = grenade;
      mesh.position.set(from.x + (to.x - from.x) * k, from.y * (1 - k) + Math.sin(k * Math.PI) * 1.8 + 0.1, from.z + (to.z - from.z) * k);
      mesh.rotation.x += dt * 14;
      g.fx.spawn(mesh.position.x, mesh.position.y, mesh.position.z, 0, 0.2, 0, 0.3, 0.09, [1, 0.6, 0.2], { drag: 1 });
      if (k < 1) continue;
      this.grenades = this.grenades.filter(o => o !== grenade);
      g.scene.remove(mesh);
      const at = { x: to.x, y: 0.35, z: to.z };
      g.fx.explosion(at, 1.3);
      g.fx.ring(at, spec.radius, 0xffa030);
      g.fx.decal(to.x, to.z, spec.radius * 0.55, 0x1a130d, 0.5);
      g.stage.kick(2.6);
      g.sfx.cannonHit();
      for (const bug of g.combatTargets.slice()) {
        if (bug.dead || bug.flying || Math.hypot(bug.x - to.x, bug.z - to.z) > spec.radius + girth(bug)) continue;
        bug.takeDamage(grenade.damage, g, Math.atan2(bug.z - to.z, bug.x - to.x));
      }
    }
  }

  /** Skill two: a bubble over every allied unit nearby that stops all damage while it lasts. */
  raiseShields(allies) {
    const g = this.game, u = this.unit, spec = HERO.skills.shield;
    this.guardT = spec.seconds;
    g.fx.ring(u, spec.radius, 0x4fd8ff);
    g.fx.label({ x: u.x, y: 2, z: u.z }, 'PLASMA SHIELD', 'evolution');
    g.sfx.upgrade();
    for (const ally of allies) {
      const mesh = new THREE.Mesh(shapes.shield, soft(0x4fd8ff, 0.26));
      mesh.userData.size = ally.kind === 'cruiser' ? 2.6 : ally.kind === 'tank' || ally.kind === 'goliath' ? 1.35 : ally.robotT > 0 ? 1.7 : 1;
      mesh.position.y = 0.6;
      ally.obj.add(mesh);
      this.guards.set(ally, mesh);
      if (ally !== u) g.fx.link({ x: u.x, y: 1, z: u.z }, { x: ally.x, y: 0.7, z: ally.z }, 0x4fd8ff, 0.3, 0.04);
    }
  }

  /** What the gear screen says about each skill right now. */
  skillSheet() {
    const { grenade, shield, robot } = HERO.skills, cd = this.cd, wait = t => `Ready in ${Math.ceil(t)}s`;
    const flying = this.unit?.robotT > 0;
    return [
      { name: grenade.name, text: `Throws a grenade into the thickest group for ${this.grenadeDamage()} damage.`, every: grenade.cooldown, state: cd.grenade > 0 ? wait(cd.grenade) : 'Ready' },
      { name: shield.name, text: `Allied units within ${shield.radius} tiles take no damage for ${shield.seconds} seconds.`, every: shield.cooldown, state: this.guardT > 0 ? `Active ${Math.ceil(this.guardT)}s` : cd.shield > 0 ? wait(cd.shield) : 'Ready' },
      { name: robot.name, text: `Becomes a winged robot for ${robot.seconds} seconds: 50% bigger, flying, twin guns, and 50% more speed, attack speed and damage.`, every: robot.cooldown, state: flying ? `Active ${Math.ceil(this.unit.robotT)}s` : cd.robot > 0 ? wait(cd.robot) : 'Ready' }
    ];
  }

  /* ---------------- experience ---------------- */

  /** Called for every bug that dies. Close to the hero pays in full. */
  killed(bug) {
    if (!bug) return;
    const u = this.present ? this.unit : null, spec = HERO.xp;
    const close = !!u && Math.hypot(bug.x - u.x, bug.z - u.z) <= spec.near;
    let xp = Math.max(1, (bug.maxHp || 0) * spec.perHp) * (close ? 1 : spec.far);
    if (bug.isBoss) xp = Math.max(1, (bug.maxHp || 0) * spec.perHp) + spec.bossPerRound * this.game.level;
    this.gain(xp);
    if (close && u.gear.powers.has('skyfall') && ++this.nearKills >= LOOT.legendaries.skyfall.kills) {
      this.nearKills = 0;
      this.skyfall(bug);
    }
  }

  skyfall(at) {
    const g = this.game, spec = LOOT.legendaries.skyfall, u = this.unit;
    g.fx.ring({ x: at.x, z: at.z }, spec.radius, 0xff8a2a);
    g.sfx.airstrike();
    for (let i = 0; i < spec.bombs; i++) {
      const a = (i / spec.bombs) * Math.PI * 2;
      const bomb = new AirBomb(at.x + Math.cos(a) * 0.7, at.z + Math.sin(a) * 0.7, Math.round(u.stats.damage * spec.damage), spec.radius, 0.3 + i * 0.2);
      g.scene.add(bomb.mesh);
      g.scene.add(bomb.mark);
      g.bombs.push(bomb);
    }
  }

  gain(xp) {
    const gained = addXp(this.profile, xp);
    if (gained) this.leveled();
    this.syncHud();
  }

  leveled() {
    const u = this.unit, g = this.game, level = this.profile.level;
    UNITS.hero.info.role = `Hero · Level ${level}`;
    this.save();
    this.paintPlate();
    g.sfx.upgrade();
    this.ui.toast(`${this.name} reached level ${level}`, 'More health and damage, and fully healed.', 'unlock');
    if (!this.present) return;
    u.applyStats();
    u.hp = u.maxHp;
    g.fx.ring({ x: u.x, z: u.z }, 2.4, GOLD);
    g.fx.sparks({ x: u.x, y: 0.8, z: u.z }, 0, 30, [1, 0.85, 0.4], 6, 6.28);
    g.fx.label({ x: u.x, y: 1.7, z: u.z }, `LEVEL ${level}`, 'evolution');
  }

  /* ---------------- gear ---------------- */

  /** Worn gear changed: the numbers and the model follow. */
  refit() {
    this.save();
    if (!this.present) return;
    this.unit.applyStats();
    this.unit.dress();
  }

  wear(id) {
    if (!equip(this.profile, id)) return false;
    this.refit();
    this.game.sfx.upgrade();
    return true;
  }

  breakDown(id) {
    const xp = scrap(this.profile, id);
    if (!xp) return 0;
    this.gain(xp);
    this.save();
    this.game.sfx.ui();
    return xp;
  }

  bossFell(round) {
    const g = this.game, boss = g.assault.boss, plan = g.assault.plan;
    const from = { x: boss?.x ?? g.core.x, z: boss?.z ?? g.core.z };
    const count = plan?.hard ? LOOT.drops.hard : LOOT.drops.medium;
    const used = new Set();
    for (let i = 0; i < count; i++) {
      // The first item a hero ever finds, and one item from each boss on a `rareRounds` round, is at least rare.
      const floor = i === 0 && (this.profile.found === 0 || LOOT.rareRounds.includes(round)) ? 'rare' : null;
      const item = rollItem(round, { hard: !!plan?.hard, floor });
      const a = (i / count) * Math.PI * 2, tx = Math.floor(from.x + Math.cos(a) * 1.6), ty = Math.floor(from.z + Math.sin(a) * 1.6);
      const spot = g.grid.nearestOpen(tx, ty, 4, used);
      if (spot) used.add(g.grid.idx(spot.x, spot.y));
      const drop = new Drop(item, from, spot ? { x: spot.x + 0.5, z: spot.y + 0.5 } : from);
      this.drops.push(drop);
      g.world.add(drop.obj);
    }
    g.sfx.drop();
  }

  collect(drop) {
    const g = this.game, item = drop.item, rarity = LOOT.rarity[item.rarity];
    this.drops = this.drops.filter(d => d !== drop);
    g.world.remove(drop.obj);
    const { equipped, scrapped } = stash(this.profile, item);
    if (scrapped) this.gain(LOOT.rarity[scrapped.rarity].scrapXp);
    if (equipped) this.refit(); else this.save();
    g.fx.ring({ x: drop.x, z: drop.z }, 1.4, tone(item.rarity));
    g.sfx.pickup();
    this.ui.toast(`${rarity.name}: ${item.name}`, equipped ? 'Equipped.' : scrapped === item ? 'Bag full, scrapped for XP.' : 'In the bag. Shift+C to wear it.', 'unlock');
  }

  /** Nothing is ever lost: whatever is still on the ground when the fight ends goes in the bag. */
  collectAll() {
    for (const drop of this.drops.slice()) this.collect(drop);
  }

  /** A click on a drop picks it up. Returns true so the click selects nothing else. */
  grabLoot(point) {
    if (!point) return false;
    const drop = this.drops.find(d => Math.hypot(d.x - point.x, d.z - point.z) < 0.9);
    if (!drop) return false;
    this.collect(drop);
    return true;
  }

  /* ---------------- name plate and toolbar ---------------- */

  buildPlate() {
    const canvas = this.plateCanvas = document.createElement('canvas');
    canvas.width = 384; canvas.height = 64;
    this.plateTexture = new THREE.CanvasTexture(canvas);
    this.plateTexture.colorSpace = THREE.SRGBColorSpace;
    this.plate = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.plateTexture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
    this.plate.scale.set(1.8, 0.3, 1);
    this.plate.position.y = PLATE_Y;
    this.plate.renderOrder = 998;
  }

  paintPlate() {
    const ctx = this.plateCanvas.getContext('2d'), text = `${this.name} · ${this.profile.level}`;
    ctx.clearRect(0, 0, 384, 64);
    ctx.font = '700 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(8, 10, 14, 0.9)';
    ctx.strokeText(text, 192, 34, 372);
    ctx.fillStyle = '#ffd98a';
    ctx.fillText(text, 192, 34, 372);
    this.plateTexture.needsUpdate = true;
  }

  buildButton() {
    const button = this.button = document.createElement('button');
    button.id = 'btnHero';
    button.type = 'button';
    button.className = 'btn btn--hero';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'heroDialog');
    this.buttonText = document.createElement('span');
    this.buttonXp = document.createElement('i');
    button.append(this.buttonText, this.buttonXp);
    button.addEventListener('click', () => this.panel.open());
    // A phone's toolbar has no room for it, so there it waits under the ⋯ menu with the other settings.
    const narrow = window.matchMedia('(max-width: 800px)');
    const seat = () => {
      if (narrow.matches) document.querySelector('.hud__settings')?.prepend(button);
      else document.getElementById('btnScout')?.before(button);
    };
    narrow.addEventListener('change', seat);
    seat();
  }

  syncHud() {
    const p = this.profile, g = this.game, away = this.respawnT > 0;
    const text = away ? `★ ${Math.ceil(this.respawnT)}s` : `★ ${p.level}`;
    const full = p.level >= HERO.maxLevel ? 100 : Math.min(100, p.xp / xpToNext(p.level) * 100);
    const state = `${text}|${full.toFixed(0)}|${g.ended}|${!!g.pendingEvolution}`;
    if (state === this.shownHud) return;
    this.shownHud = state;
    this.buttonText.textContent = text;
    this.buttonXp.style.width = `${full}%`;
    this.button.classList.toggle('is-down', away);
    this.button.disabled = g.ended || !!g.pendingEvolution;
    this.button.title = `${this.name} · Level ${p.level}. Gear and stats (Shift+C). Select hero (Shift+W).`;
    this.button.setAttribute('aria-label', `Hero, level ${p.level}. Open gear and stats`);
  }
}

export function installHero(game, ui) {
  registerModel('hero', tier => buildMarine(tier), [GOLD, 0.34]);
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'src/hero.css';
  document.head.append(style);
  game.hero = new HeroCorps(game, ui);
  return game.hero;
}
