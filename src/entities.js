import * as THREE from 'three';
import { CELL, MARINE_TIERS, MARINE_INFO, ZERG_INFO, CORE } from './config.js';
import { buildMarine, buildZergling, buildWall, buildCore, MAT } from './models.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

function angleLerp(a, b, t) {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

function mitigate(damage, armor) { return Math.max(1, damage - armor); }

/* ------------------------------------------------------------------ */

const BAR_BG = new THREE.MeshBasicMaterial({ color: 0x0a0f14, depthTest: false, transparent: true, opacity: 0.8 });
const BAR_GEO = new THREE.PlaneGeometry(1, 1);

class HealthBar {
  constructor(parent, width, height, y) {
    this.group = new THREE.Group();
    this.group.position.y = y;
    this.group.renderOrder = 999;

    this.bg = new THREE.Mesh(BAR_GEO, BAR_BG);
    this.bg.scale.set(width + 0.035, height + 0.035, 1);
    this.group.add(this.bg);

    this.mat = new THREE.MeshBasicMaterial({ color: 0x5ef08a, depthTest: false, transparent: true });
    this.fill = new THREE.Mesh(BAR_GEO, this.mat);
    this.fill.scale.set(width, height, 1);
    this.group.add(this.fill);

    this.width = width;
    this.group.visible = false;
    parent.add(this.group);
  }

  set(pct, camera, always = false) {
    this.group.visible = always || pct < 0.999;
    if (!this.group.visible) return;
    this.fill.scale.x = Math.max(0.0001, this.width * pct);
    this.fill.position.x = -(this.width - this.fill.scale.x) / 2;
    this.mat.color.setHex(pct > 0.55 ? 0x5ef08a : pct > 0.25 ? 0xf0b23c : 0xff5a4a);
    this.group.quaternion.copy(camera.quaternion);
  }
}

/* ------------------------------------------------------------------ */
/*  MARINE                                                             */
/* ------------------------------------------------------------------ */

export class Marine {
  constructor(tx, ty, armory) {
    this.kind = 'marine';
    this.tx = tx; this.ty = ty;
    this.tier = 0;
    this.x = tx + 0.5; this.z = ty + 0.5;
    this.yaw = -Math.PI / 2;
    this.cooldown = 0;
    this.recoil = 0;
    this.hurt = 0;
    this.target = null;
    this.dead = false;
    this.deathT = 0;
    this.spawnT = 0;
    this.invested = 0;

    this.obj = new THREE.Group();
    this.obj.position.set(this.x, 0, this.z);
    this.model = buildMarine(0);
    this.obj.add(this.model);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x5ad7ff, transparent: true, opacity: 0.85, depthWrite: false })
    );
    this.ring.position.y = 0.02;
    this.ring.visible = false;
    this.obj.add(this.ring);

    this.bar = new HealthBar(this.obj, 0.62, 0.08, 1.28);
    this.applyStats(armory);
    this.hp = this.stats.hp;
  }

  applyStats(armory) {
    const base = MARINE_TIERS[this.tier];
    const s = {
      hp: base.hp, damage: base.damage, attackSpeed: base.attackSpeed,
      range: base.range, armor: MARINE_INFO.armor
    };
    for (const u of armory) u.apply(s);
    const ratio = this.stats ? this.hp / this.stats.hp : 1;
    this.stats = s;
    this.hp = Math.min(s.hp, s.hp * ratio);
  }

  get maxHp() { return this.stats.hp; }
  get upgradeCost() { return MARINE_TIERS[this.tier].upgradeCost; }
  get rank() { return MARINE_TIERS[this.tier].rank; }

  upgrade(armory) {
    if (this.tier >= MARINE_TIERS.length - 1) return false;
    this.tier++;
    const old = this.model;
    this.model = buildMarine(this.tier);
    this.model.rotation.y = old.rotation.y;
    this.obj.remove(old);
    this.obj.add(this.model);
    this.applyStats(armory);
    this.hp = this.stats.hp;
    return true;
  }

  update(dt, game) {
    this.spawnT = Math.min(1, this.spawnT + dt * 3);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.hurt = Math.max(0, this.hurt - dt * 4);
    const t = game.time;

    if (this.dead) {
      this.deathT += dt;
      this.model.rotation.z = Math.min(Math.PI / 2, this.deathT * 3.4);
      this.model.position.y = -Math.min(0.35, this.deathT * 0.4);
      this.bar.group.visible = false;
      this.ring.visible = false;
      return;
    }

    const grow = this.spawnT * this.spawnT * (3 - 2 * this.spawnT);
    this.model.scale.setScalar(grow);

    if (!this.target || this.target.dead || this.distTo(this.target) > this.stats.range) {
      this.target = this.acquire(game);
    }

    const ud = this.model.userData;
    if (this.target) {
      const want = Math.atan2(this.target.z - this.z, this.target.x - this.x);
      this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 9));
      this.cooldown -= dt;
      const aligned = Math.abs(((want - this.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI) < 0.3;
      if (this.cooldown <= 0 && aligned) {
        this.fire(game);
        this.cooldown = this.stats.attackSpeed;
      }
    } else {
      this.yaw = angleLerp(this.yaw, this.restYaw ?? -Math.PI / 2, Math.min(1, dt * 2));
      this.cooldown = Math.min(this.cooldown, 0.1);
    }

    this.model.rotation.y = -this.yaw;
    ud.torso.position.x = -this.recoil * 0.045;
    ud.weapon.rotation.z = this.recoil * 0.34;
    ud.torso.position.y = 0.73 + Math.sin(t * 2.2) * 0.008;
    ud.visor.material.emissiveIntensity = 0.9 + Math.sin(t * 3 + this.tx) * 0.25;

    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  distTo(e) { return Math.hypot(e.x - this.x, e.z - this.z); }

  acquire(game) {
    let best = null, bestScore = -Infinity;
    for (const z of game.zerglings) {
      if (z.dead) continue;
      if (this.distTo(z) > this.stats.range) continue;
      // shoot whatever is deepest into the base first
      const score = -Math.hypot(z.x - (CORE.x + 1), z.z - (CORE.y + 1));
      if (score > bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  fire(game) {
    this.recoil = 1;
    const ud = this.model.userData;
    ud.weapon.updateWorldMatrix(true, false);
    const muzzle = ud.weapon.userData.muzzle.clone().applyMatrix4(ud.weapon.matrixWorld);
    game.fx.muzzleFlash(muzzle, -this.yaw);
    game.spawnTracer(muzzle, this.target, this.stats.damage, this);
    game.stage.kick(0.5);
    game.sfx.gauss();
  }

  takeDamage(amount, game, fromAngle) {
    const dealt = mitigate(amount, this.stats.armor);
    this.hp -= dealt;
    this.hurt = 1;
    game.fx.sparks({ x: this.x, y: 0.6, z: this.z }, fromAngle + Math.PI, 6, [1, 0.8, 0.5], 4);
    game.fx.label({ x: this.x, y: 1.3, z: this.z }, '-' + dealt, 'dmg-self');
    game.sfx.impact();
    if (this.hp <= 0 && !this.dead) {
      this.hp = 0;
      this.dead = true;
      game.fx.explosion({ x: this.x, y: 0.5, z: this.z }, 0.9);
      game.fx.chunks({ x: this.x, y: 0.6, z: this.z }, 9, 0x2f74a8);
      game.stage.kick(3);
      game.sfx.marineDown();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  STRUCTURES                                                         */
/* ------------------------------------------------------------------ */

export class Wall {
  constructor(tx, ty, hp) {
    this.kind = 'wall';
    this.tx = tx; this.ty = ty;
    this.x = tx + 0.5; this.z = ty + 0.5;
    this.maxHp = hp;
    this.hp = hp;
    this.dead = false;
    this.spawnT = 0;
    this.shake = 0;

    this.obj = new THREE.Group();
    this.obj.position.set(this.x, 0, this.z);
    this.model = buildWall();
    this.obj.add(this.model);
    this.bar = new HealthBar(this.obj, 0.6, 0.07, 0.92);
  }

  update(dt, game) {
    this.spawnT = Math.min(1, this.spawnT + dt * 4);
    const e = 1 - Math.pow(1 - this.spawnT, 3);
    this.model.scale.set(1, e, 1);
    this.model.position.y = (e - 1) * 0.2;

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 5);
      this.model.position.x = (Math.random() - 0.5) * this.shake * 0.05;
      this.model.position.z = (Math.random() - 0.5) * this.shake * 0.05;
    }
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  takeDamage(amount, game, fromAngle) {
    this.hp -= amount;
    this.shake = 1;
    game.fx.sparks({ x: this.x, y: 0.5, z: this.z }, fromAngle + Math.PI, 5, [0.9, 0.85, 0.7], 4);
    game.sfx.impact();
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.fx.explosion({ x: this.x, y: 0.35, z: this.z }, 0.7);
      game.fx.chunks({ x: this.x, y: 0.4, z: this.z }, 12, 0x6d777d);
      game.stage.kick(2.5);
      game.onStructureLost(this);
    }
  }
}

export class Core {
  constructor() {
    this.kind = 'core';
    this.tx = CORE.x; this.ty = CORE.y;
    this.x = CORE.x + CORE.w / 2;
    this.z = CORE.y + CORE.h / 2;
    this.maxHp = CORE.hp;
    this.hp = CORE.hp;
    this.dead = false;

    this.obj = new THREE.Group();
    this.obj.position.set(this.x, 0, this.z);
    this.model = buildCore();
    this.obj.add(this.model);

    this.light = new THREE.PointLight(0x5ad7ff, 8, 9, 2);
    this.light.position.set(0, 1.4, 0);
    this.obj.add(this.light);

    this.bar = new HealthBar(this.obj, 1.6, 0.12, 2.1);
  }

  update(dt, game) {
    const ud = this.model.userData;
    ud.dish.rotation.y += dt * 0.7;
    const pct = this.hp / this.maxHp;
    const pulse = 1 + Math.sin(game.time * 2.4) * 0.1;
    ud.reactor.scale.setScalar(pulse);
    ud.reactor.material.emissiveIntensity = 2.6 * pulse;
    ud.reactor.material.color.setHex(pct < 0.35 ? 0xffb0a0 : 0x9ae8ff);
    ud.reactor.material.emissive.setHex(pct < 0.35 ? 0xff4a35 : 0x3cc8ff);
    this.light.color.setHex(pct < 0.35 ? 0xff5a4a : 0x5ad7ff);
    this.bar.set(pct, game.camera, true);
  }

  takeDamage(amount, game, fromAngle) {
    this.hp -= amount;
    game.fx.sparks({ x: this.x, y: 0.9, z: this.z }, fromAngle + Math.PI, 8, [1, 0.6, 0.4], 5);
    game.fx.label({ x: this.x, y: 2.3, z: this.z }, '-' + amount, 'dmg-self');
    game.stage.kick(1.6);
    game.sfx.impact();
    if (this.hp <= 0 && !this.dead) {
      this.hp = 0;
      this.dead = true;
      game.onCoreDestroyed();
    }
  }
}

/* ------------------------------------------------------------------ */
/*  ZERGLING                                                           */
/* ------------------------------------------------------------------ */

export class Zergling {
  constructor(x, z, hpScale, speedScale) {
    this.kind = 'zergling';
    this.x = x; this.z = z;
    this.yaw = 0;
    this.maxHp = Math.round(ZERG_INFO.hp * hpScale);
    this.hp = this.maxHp;
    this.speed = ZERG_INFO.speed * speedScale;
    this.damage = ZERG_INFO.damage;
    this.dead = false;
    this.deathT = 0;
    this.spawnT = 0;
    this.gait = Math.random() * TAU;
    this.attackCd = 0;
    this.swing = 0;
    this.hurt = 0;
    this.path = null;
    this.wp = 0;
    this.pathVersion = -1;
    this.target = null;
    this.repathIn = Math.random() * 0.4;

    this.obj = new THREE.Group();
    this.obj.position.set(x, 0, z);
    this.model = buildZergling();
    this.obj.add(this.model);
    this.bar = new HealthBar(this.obj, 0.5, 0.07, 0.85);
  }

  update(dt, game) {
    this.hurt = Math.max(0, this.hurt - dt * 4);
    this.swing = Math.max(0, this.swing - dt * 3);

    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.8);
      this.model.rotation.z = k * 1.5;
      this.model.position.y = -k * 0.3;
      this.model.scale.setScalar(1 - k * 0.25);
      this.bar.group.visible = false;
      return;
    }

    this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
    this.model.scale.setScalar(0.35 + this.spawnT * 0.65);

    this.repathIn -= dt;
    if (!this.path || this.pathVersion !== game.grid.version || this.repathIn <= 0) {
      this.repath(game);
    }

    const blocker = this.blockerAhead(game);
    if (blocker) {
      this.attack(blocker, dt, game);
    } else {
      this.advance(dt, game);
    }

    this.animate(dt, game);
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  repath(game) {
    const cx = Math.max(0, Math.min(game.grid.COLS - 1, Math.floor(this.x)));
    const cz = Math.max(0, Math.min(game.grid.ROWS - 1, Math.floor(this.z)));
    const pts = game.grid.route(cx, cz);
    if (pts && pts.length) {
      this.path = pts;
      this.wp = pts.length > 1 ? 1 : 0;
    }
    this.pathVersion = game.grid.version;
    this.repathIn = 0.5 + Math.random() * 0.5;
  }

  /** The next thing on the route we need to chew through, if any. */
  blockerAhead(game) {
    if (!this.path || this.wp >= this.path.length) return null;
    const node = this.path[this.wp];
    if (Math.hypot(node.x - this.x, node.y - this.z) > 1.35) return null;
    const occ = game.grid.occupant(node.cx, node.cy);
    if (occ && !occ.dead) return occ;
    const c = game.grid.get(node.cx, node.cy);
    if (c === CELL.CORE) return game.core;
    return null;
  }

  attack(victim, dt, game) {
    this.target = victim;
    const want = Math.atan2(victim.z - this.z, victim.x - this.x);
    this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 11));
    this.attackCd -= dt;
    if (this.attackCd <= 0) {
      this.attackCd = ZERG_INFO.attackSpeed;
      this.swing = 1;
      victim.takeDamage(this.damage, game, want);
    }
    this.moving = 0;
  }

  advance(dt, game) {
    if (!this.path || this.wp >= this.path.length) { this.moving = 0; return; }
    const node = this.path[this.wp];
    let dx = node.x - this.x, dz = node.y - this.z;
    let d = Math.hypot(dx, dz);
    if (d < 0.18) {
      this.wp++;
      if (this.wp >= this.path.length) { this.moving = 0; return; }
      return;
    }

    // separation keeps the swarm from collapsing into one point
    let sx = 0, sz = 0;
    for (const o of game.zerglings) {
      if (o === this || o.dead) continue;
      const ox = this.x - o.x, oz = this.z - o.z;
      const od = ox * ox + oz * oz;
      if (od < 0.36 && od > 0.0001) {
        const w = (0.36 - od) / 0.36;
        const inv = 1 / Math.sqrt(od);
        sx += ox * inv * w; sz += oz * inv * w;
      }
    }

    let mx = dx / d + sx * 1.3;
    let mz = dz / d + sz * 1.3;
    const ml = Math.hypot(mx, mz) || 1;
    mx /= ml; mz /= ml;

    const want = Math.atan2(mz, mx);
    this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 8));

    // only commit to full speed once roughly facing the right way
    const align = Math.cos(this.yaw - want);
    const spd = this.speed * Math.max(0.35, align);
    this.x += Math.cos(this.yaw) * spd * dt;
    this.z += Math.sin(this.yaw) * spd * dt;
    this.moving = spd / this.speed;
    this.gait += dt * spd * 6.5;

    if (Math.random() < dt * 5 * this.moving) {
      game.fx.spawn(this.x - Math.cos(this.yaw) * 0.3, 0.06, this.z - Math.sin(this.yaw) * 0.3,
        (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5,
        0.45, 0.07, [0.38, 0.3, 0.24], { drag: 1.6, grow: 0.25 });
    }
  }

  animate(dt, game) {
    const ud = this.model.userData;
    this.obj.position.set(this.x, 0, this.z);
    this.model.rotation.y = -this.yaw;

    const run = this.moving ?? 0;
    for (const hip of ud.legs) {
      const ph = this.gait + hip.userData.phase;
      hip.rotation.z = Math.sin(ph) * 0.55 * (0.25 + run);
      hip.rotation.y = hip.userData.side * (0.4 + Math.cos(ph) * 0.18 * run);
      hip.userData.knee.rotation.z = -0.5 - Math.max(0, Math.cos(ph)) * 0.7 * run;
    }

    ud.body.position.y = 0.24 + Math.abs(Math.sin(this.gait)) * 0.035 * run;
    ud.body.rotation.z = Math.sin(this.gait) * 0.05 * run;

    const sw = this.swing;
    ud.blades.forEach((b) => {
      const s = b.userData.side;
      b.rotation.y = s * (-0.1 + (1 - sw) * 0.35) + Math.sin(this.gait * 0.5) * 0.05;
      b.rotation.z = -sw * 1.1;
      b.position.x = 0.14 + sw * 0.08;
    });

    const sway = Math.sin(this.gait * 0.6) * 0.35 * (0.3 + run);
    ud.tail.rotation.y = sway;
    ud.tail2.rotation.y = sway * 0.8;
    ud.tail.rotation.z = -0.25;
  }

  takeDamage(amount, game, fromAngle) {
    const dealt = mitigate(amount, ZERG_INFO.armor);
    this.hp -= dealt;
    this.hurt = 1;
    game.fx.blood({ x: this.x, y: 0.3, z: this.z }, fromAngle, 7);
    game.fx.label({ x: this.x, y: 0.9, z: this.z }, '-' + dealt, 'dmg');
    game.sfx.hitFlesh();
    if (this.hp <= 0 && !this.dead) {
      this.hp = 0;
      this.dead = true;
      game.fx.blood({ x: this.x, y: 0.3, z: this.z }, fromAngle, 26);
      game.fx.chunks({ x: this.x, y: 0.3, z: this.z }, 5, 0x6a3a78);
      game.stage.kick(1.1);
      game.sfx.screech();
      game.onKill(this);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  GAUSS TRACER                                                       */
/* ------------------------------------------------------------------ */

const TRACER_GEO = new THREE.BoxGeometry(1, 0.035, 0.035);
const TRACER_MAT = new THREE.MeshBasicMaterial({
  color: 0xbfe9ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
});

export class Tracer {
  constructor(from, target, damage, owner) {
    this.x = from.x; this.y = from.y; this.z = from.z;
    this.target = target;
    this.damage = damage;
    this.owner = owner;
    this.speed = 46;
    this.dead = false;
    this.mesh = new THREE.Mesh(TRACER_GEO, TRACER_MAT);
    this.mesh.scale.x = 0.55;
  }

  update(dt, game) {
    if (!this.target || this.target.dead) { this.dead = true; return; }
    const ty = this.target.kind === 'zergling' ? 0.3 : 0.6;
    const dx = this.target.x - this.x, dy = ty - this.y, dz = this.target.z - this.z;
    const d = Math.hypot(dx, dy, dz);
    const step = this.speed * dt;
    if (d <= step) {
      this.dead = true;
      game.fx.impact({ x: this.target.x, y: ty, z: this.target.z }, Math.atan2(dz, dx));
      this.target.takeDamage(this.damage, game, Math.atan2(dz, dx));
      return;
    }
    this.x += dx / d * step;
    this.y += dy / d * step;
    this.z += dz / d * step;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = -Math.atan2(dz, dx);
    this.mesh.rotation.z = Math.asin(Math.max(-1, Math.min(1, dy / d)));
  }
}
