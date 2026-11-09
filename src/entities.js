import * as THREE from 'three';
import { CELL, UNITS, BREEDS, UNIT_SCALE, BUG_SCALE } from './config.js';
import { buildWall, buildCore } from './models.js';
import { makeModel } from './assets.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

function angleLerp(a, b, t) {
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

function mitigate(damage, armor) { return Math.max(1, damage - armor); }

function normAngle(a) { return ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; }
function clampAngle(a, lim) { const d = normAngle(a); return Math.max(-lim, Math.min(lim, d)); }

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
  constructor(kind, tx, ty, armory) {
    this.kind = kind;
    this.spec = UNITS[kind];
    this.flying = !!this.spec.flying;
    this.altitude = this.flying ? 2.6 : 0;
    this.tiers = this.spec.tiers;
    this.info = this.spec.info;
    this.tx = tx; this.ty = ty;
    this.tier = 0;
    this.x = tx + 0.5; this.z = ty + 0.5;
    this.yaw = -Math.PI / 2;
    this.cooldown = 0;
    this.recoil = 0;
    this.hurt = 0;
    this.target = null;
    this.dead = false;
    this.downed = false;
    this.downT = 0;
    this.deathT = 0;
    this.spawnT = 0;
    this.invested = 0;
    this.stimT = 0;
    this.blindT = 0;
    this.silenceT = 0;
    this.bunker = null;
    this.warned = false;
    this.waypoints = null;
    this.wp = 0;
    this.goalTx = tx;
    this.goalTy = ty;
    this.driving = false;
    this.trackDist = 0;
    this.order = null;   // null | { type: 'attack', target } | { type: 'amove' } | { type: 'garrison', bunker }
    this.chaseT = 0;
    this.stimLight = new THREE.PointLight(0xff6633, 0, 3.2, 2);
    this.stimLight.position.y = 0.9;
    this.obj = new THREE.Group();

    this.obj.position.set(this.x, 0, this.z);
    this.obj.add(this.stimLight);
    this.visualScale = UNIT_SCALE * (this.spec.visualScale ?? 1);
    this.model = makeModel(kind, 0);
    this.model.scale.setScalar(this.visualScale);
    this.obj.add(this.model);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.spec.accent, transparent: true, opacity: 0.85, depthWrite: false })
    );
    this.ring.position.y = 0.02;
    this.ring.visible = true;
    this.ring.material.opacity = 0.55;
    this.obj.add(this.ring);

    const barY = (kind === 'goliath' ? 1.62 : kind === 'tank' ? 0.98 : 1.28) * this.visualScale;
    this.bar = new HealthBar(this.obj, kind === 'tank' ? 0.78 : 0.62, 0.08, barY);
    this.applyStats(armory);
    this.hp = this.stats.hp;
  }

  applyStats(armory) {
    const base = this.tiers[this.tier];
    const s = {
      hp: base.hp, damage: base.damage, attackSpeed: base.attackSpeed,
      range: base.range, armor: this.info.armor, moveSpeed: this.spec.speed
    };
    if (this.spec.armory) for (const u of armory) u.apply(s);
    const ratio = this.stats ? this.hp / this.stats.hp : 1;
    this.stats = s;
    this.hp = Math.min(s.hp, s.hp * ratio);
  }

  get attackRange() { return this.stats.range * (this.blindT > 0 ? 0.5 : 1); }

  get maxHp() { return this.stats.hp; }
  get upgradeCost() { return this.tiers[this.tier].upgradeCost; }
  get rank() { return this.tiers[this.tier].rank; }

  upgrade(armory) {
    if (this.tier >= this.tiers.length - 1) return false;
    this.tier++;
    const old = this.model;
    this.model = makeModel(this.kind, this.tier);
    this.model.scale.copy(old.scale);
    this.model.rotation.y = old.rotation.y;
    this.obj.remove(old);
    this.obj.add(this.model);
    this.applyStats(armory);
    this.hp = this.stats.hp;
    return true;
  }

  orderMove(tx, ty, game) {
    if (!this.spec.mobile || this.dead || this.downed || this.bunker) return false;
    if (this.flying) {
      if (!game.grid.inside(tx, ty)) return false;
      this.goalTx = tx; this.goalTy = ty;
      this.waypoints = [{ x: tx + 0.5, y: ty + 0.5 }];
      this.wp = 0; this.driving = true;
      return true;
    }
    if (!game.grid.inside(tx, ty) || game.grid.get(tx, ty) !== CELL.OPEN) return false;
    const sx = Math.max(0, Math.min(game.grid.COLS - 1, Math.floor(this.x)));
    const sy = Math.max(0, Math.min(game.grid.ROWS - 1, Math.floor(this.z)));
    const path = game.grid.walkRoute(sx, sy, tx, ty);
    if (!path || path.length < 2) return false;
    if (game.grid.occupant(this.tx, this.ty) === this) game.grid.clear(this.tx, this.ty);
    this.waypoints = path;
    this.wp = 1;
    this.goalTx = tx;
    this.goalTy = ty;
    this.driving = true;
    return true;
  }

  stepMove(dt, game) {
    if (!this.driving || !this.waypoints) return false;
    const node = this.waypoints[this.wp];
    if (!node) { this.finishMove(game); return false; }
    const dx = node.x - this.x, dz = node.y - this.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.07) {
      this.wp++;
      if (this.wp >= this.waypoints.length) this.finishMove(game);
      return this.driving;
    }
    const want = Math.atan2(dz, dx);
    this.restYaw = want;
    const step = Math.min(dist, this.stats.moveSpeed * (this.stimT > 0 ? 1.5 : 1) * dt);
    const nx = this.x + (dx / dist) * step;
    const nz = this.z + (dz / dist) * step;
    if (this.flying || game.grid.get(Math.floor(nx), Math.floor(this.z)) !== CELL.ROCK) this.x = nx;
    if (this.flying || game.grid.get(Math.floor(this.x), Math.floor(nz)) !== CELL.ROCK) this.z = nz;
    this.trackDist += step;
    const treads = this.model.userData.treads;
    if (treads) {
      for (const tr of treads) {
        let x = tr.userData.baseX + (this.trackDist % 0.16);
        if (x > 0.48) x -= 0.96;
        tr.position.x = x;
      }
    }
    return true;
  }

  /** Standing on its own tile, as opposed to walking or garrisoned. */
  isPlaced(game) { return !this.flying && game.grid.occupant(this.tx, this.ty) === this; }

  /** Stop where you are: walk the last few steps onto the current tile and dig in. */
  halt(game) {
    if (this.flying) { this.driving = false; this.waypoints = null; return; }
    if (!this.driving) return;
    const cx = Math.floor(this.x), cy = Math.floor(this.z);
    this.goalTx = cx;
    this.goalTy = cy;
    this.waypoints = [{ x: cx + 0.5, y: cy + 0.5, cx, cy }];
    this.wp = 0;
  }

  stop(game) {
    this.order = null;
    this.halt(game);
  }

  /** Shoot this bug. Mobile units close the distance if it is out of range. */
  orderAttack(target, game) {
    if (this.dead || this.downed || !target || target.dead || (target.flying && this.spec.targetsAir === false)) return false;
    this.order = { type: 'attack', target };
    this.chaseT = 0;
    return true;
  }

  /** Re-route toward an attack target that is out of range. */
  chase(game) {
    const t = this.order.target;
    if (this.flying) { this.orderMove(Math.floor(t.x), Math.floor(t.z), game); return; }
    const goal = game.grid.nearestOpen(Math.floor(t.x), Math.floor(t.z), 3);
    if (!goal) return;
    if (this.driving && goal.x === this.goalTx && goal.y === this.goalTy) return;
    this.orderMove(goal.x, goal.y, game);
  }

  finishMove(game) {
    this.driving = false;
    this.waypoints = null;
    const o = this.order;
    if (o?.type === 'amove') this.order = null;
    if (this.flying) { this.tx = Math.floor(this.x); this.ty = Math.floor(this.z); return; }
    if (o?.type === 'garrison') {
      this.order = null;
      const b = o.bunker;
      if (!b.dead && b.garrison.length < 2 && Math.hypot(b.x - this.x, b.z - this.z) < 1.8 && game.garrison(this, b, true)) return;
    }
    let spot = null;
    if (game.grid.inside(this.goalTx, this.goalTy) && game.grid.get(this.goalTx, this.goalTy) === CELL.OPEN) {
      spot = { x: this.goalTx, y: this.goalTy };
    } else {
      const ox = Math.floor(this.x), oy = Math.floor(this.z);
      for (let r = 0; r <= 2 && !spot; r++) {
        for (let dy = -r; dy <= r && !spot; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = ox + dx, y = oy + dy;
            if (game.grid.inside(x, y) && game.grid.get(x, y) === CELL.OPEN) { spot = { x, y }; break; }
          }
        }
      }
    }
    if (!spot) return;
    this.tx = spot.x;
    this.ty = spot.y;
    this.x = spot.x + 0.5;
    this.z = spot.y + 0.5;
    game.grid.set(spot.x, spot.y, CELL.TOWER, this);
  }

  update(dt, game) {
    this.blindT = Math.max(0, this.blindT - dt);
    this.silenceT = Math.max(0, this.silenceT - dt);
    this.ring.material.color.set(this.silenceT > 0 ? 0xc06bff : this.blindT > 0 ? 0x8296ff : (game.armyColour || this.spec.accent));
    if (this.flying && !this.dead) {
      this.altitude = (game.heightAt?.(this.x, this.z) || 0) + 2.6 + Math.sin(game.time * 2.5) * 0.1;
      this.obj.position.y = this.altitude;
    }
    this.spawnT = Math.min(1, this.spawnT + dt * 3);
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.hurt = Math.max(0, this.hurt - dt * 4);
    this.stimT = Math.max(0, this.stimT - dt);
    this.stimLight.intensity = this.stimT > 0 ? 3.5 + Math.sin(game.time * 28) * 1.6 : 0;
    const t = game.time;

    const anim = this.model.userData.anim;
    if (this.dead) {
      this.deathT += dt;
      if (anim) anim('death', dt);
      else {
        this.model.rotation.z = Math.min(Math.PI / 2, this.deathT * 3.4);
        this.model.position.y = -Math.min(0.35, this.deathT * 0.4);
      }
      this.bar.group.visible = false;
      this.ring.visible = false;
      return;
    }

    if (this.downed) {
      this.downT -= dt;
      if (anim) anim('death', dt);
      else {
        this.model.rotation.z = 1.15;
        this.model.position.y = -0.18;
      }
      this.bar.set(0.02, game.camera, true);
      if (this.downT <= 0) this.finishDeath(game);
      return;
    }

    let o = this.order;
    if (o?.type === 'attack' && (!o.target || o.target.dead)) this.order = o = null;
    if (o?.type === 'attack' && !this.bunker && this.spec.mobile) {
      // close in until comfortably inside range, then hold; only give chase again once it is truly out of reach
      const d = this.distTo(o.target);
      const chasing = this.driving ? d > this.attackRange * 0.9 : d > this.attackRange;
      if (!chasing) this.halt(game);
      else {
        this.chaseT -= dt;
        if (this.chaseT <= 0) { this.chaseT = 0.6; this.chase(game); }
      }
    }
    // attack-move: plant feet while something is in the sights, then carry on
    const engaged = o?.type === 'amove' && this.driving && !!this.acquire(game);
    const driving = this.bunker || engaged ? false : this.stepMove(dt, game);

    if (this.bunker) {
      this.x = this.bunker.x;
      this.z = this.bunker.z;
      this.obj.visible = false;
    } else {
      this.obj.visible = true;
      this.obj.position.set(this.x, this.altitude, this.z);
    }

    const grow = this.spawnT * this.spawnT * (3 - 2 * this.spawnT);
    this.model.scale.setScalar(grow * this.visualScale);

    const ordered = this.order?.type === 'attack' && this.target !== this.order.target;
    if (ordered || !this.target || this.target.dead || this.distTo(this.target) > this.attackRange || !this.inArc(this.target)) {
      this.target = this.acquire(game);
    }

    const ud = this.model.userData;
    const turret = this.spec.turret && !ud.solid;   // a one-piece model file turns its whole body to aim
    const rest = this.bunker ? this.bunker.facing : (this.restYaw ?? -Math.PI / 2);
    const holdFire = driving && !turret;
    if (holdFire) {
      this.target = null;
      this.yaw = angleLerp(this.yaw, rest, Math.min(1, dt * 8));
    } else if (this.target) {
      let want = Math.atan2(this.target.z - this.z, this.target.x - this.x);
      if (this.bunker) want = rest + clampAngle(want - rest, 0.65);
      this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 9));
      this.cooldown -= dt;
      const aligned = Math.abs(normAngle(want - this.yaw)) < 0.3;
      if (this.cooldown <= 0 && aligned && this.silenceT <= 0) {
        this.fire(game);
        this.cooldown = this.stats.attackSpeed * (this.stimT > 0 ? 0.45 : 1);
      }
    } else {
      this.yaw = angleLerp(this.yaw, rest, Math.min(1, dt * 2));
      this.cooldown = Math.min(this.cooldown, 0.1);
    }

    if (turret) {
      this.model.rotation.y = -rest;
      ud.torso.rotation.y = -normAngle(this.yaw - rest);
      const baseX = ud.weapon.userData.baseX ?? (ud.weapon.userData.baseX = ud.weapon.position.x);
      ud.weapon.position.x = baseX - this.recoil * 0.12;
    } else {
      this.model.rotation.y = -this.yaw;
      ud.torso.position.x = -this.recoil * (this.kind === 'goliath' ? 0.03 : 0.045);
      ud.weapon.rotation.z = this.recoil * (this.kind === 'goliath' ? 0.08 : 0.34);
    }
    if (ud.torso.userData.baseY == null) ud.torso.userData.baseY = ud.torso.position.y;
    const bob = driving ? Math.abs(Math.sin(t * (this.spec.turret ? 8 : 12))) * 0.035 : Math.sin(t * 2.2) * 0.008;
    ud.torso.position.y = ud.torso.userData.baseY + (anim ? 0 : bob);
    if (anim) anim(driving ? 'walk' : this.target ? 'shoot' : 'idle', dt);

    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  inArc(e) {
    if (!this.bunker || !e) return true;
    return Math.abs(normAngle(Math.atan2(e.z - this.z, e.x - this.x) - this.bunker.facing)) < 0.72;
  }

  distTo(e) { return Math.hypot(e.x - this.x, e.z - this.z); }

  acquire(game) {
    const mine = this.order?.type === 'attack' ? this.order.target : null;
    if (mine && !(mine.flying && this.spec.targetsAir === false) && !mine.dead && this.distTo(mine) <= this.attackRange && this.inArc(mine)) return mine;
    const focus = game.focus;
    if (focus && !(focus.flying && this.spec.targetsAir === false) && !focus.dead && this.distTo(focus) <= this.attackRange && this.inArc(focus)) return focus;
    let best = null, bestScore = -Infinity;
    for (const z of game.zerglings) {
      if (z.dead || (z.flying && this.spec.targetsAir === false)) continue;
      if (this.distTo(z) > this.attackRange || !this.inArc(z)) continue;
      const score = -Math.hypot(z.x - game.core.x, z.z - game.core.z) + (z.breedId === 'tanker' ? 2 : z.breedId === 'needler' ? 1.5 : 0);
      if (score > bestScore) { bestScore = score; best = z; }
    }
    return best;
  }

  fire(game) {
    if (this.silenceT > 0) return;
    this.recoil = 1;
    const ud = this.model.userData;
    const locals = [];
    if (this.bunker) {
      const f = this.bunker.facing;
      locals.push(new THREE.Vector3(this.x + Math.cos(f) * 0.55, 0.38, this.z + Math.sin(f) * 0.55));
    } else {
      ud.weapon.updateWorldMatrix(true, false);
      const pts = ud.weapon.userData.muzzles || [ud.weapon.userData.muzzle];
      for (const p of pts) locals.push(p.clone().applyMatrix4(ud.weapon.matrixWorld));
    }
    for (const muzzle of locals) {
      game.fx.muzzleFlash(muzzle, -this.yaw);
      if (this.spec.shell) game.spawnShell(muzzle, this.target.x, this.target.z, this.stats.damage, this.spec.splash);
      else game.spawnTracer(muzzle, this.target, this.stats.damage, this);
    }
    game.stage.kick(this.spec.shell ? 1.3 : 0.45);
    if (this.spec.shell) game.sfx.cannon();
    else game.sfx.gauss();
    if (!game.called) { game.called = true; game.voice.say('acquired'); }
  }

  stim(game) {
    if (this.silenceT > 0 || !this.spec.canStim || !game.stimUnlocked || this.dead || this.downed || this.stimT > 0) return false;
    this.stimT = 4.2;
    this.hp = Math.max(1, this.hp - 12);
    game.voice.say('stim');
    game.fx.ring({ x: this.x, z: this.z }, 1.4, 0xff8844);
    return true;
  }

  takeDamage(amount, game, fromAngle) {
    if (this.downed) { this.finishDeath(game); return; }
    const dealt = mitigate(amount, this.stats.armor + (this.bunker ? 2 : 0));
    this.hp -= dealt;
    this.hurt = 1;
    game.fx.sparks({ x: this.x, y: 0.6, z: this.z }, fromAngle + Math.PI, 6, [1, 0.8, 0.5], 4);
    game.fx.label({ x: this.x, y: 1.3, z: this.z }, '-' + dealt, 'dmg-self');
    game.sfx.impact();
    game.alert(this);
    if (!this.warned && this.hp < this.maxHp * 0.45 && this.hp > 0) {
      this.warned = true;
      game.voice.say('hit');
    }
    if (this.hp <= 0 && !this.dead) {
      this.hp = 0;
      if (this.flying) { this.finishDeath(game); return; }
      this.downed = true;
      this.downT = 9;
      this.target = null;
      this.order = null;
      this.driving = false;
      this.waypoints = null;
      if (this.bunker) game.eject(this, true);
      game.voice.say('down');
      game.stage.kick(1.4);
    }
  }

  finishDeath(game) {
    if (this.dead) return;
    this.downed = false;
    this.dead = true;
    this.obj.visible = true;
    game.fx.explosion({ x: this.x, y: 0.5, z: this.z }, 0.8);
    game.fx.chunks({ x: this.x, y: 0.6, z: this.z }, 8, 0x2f74a8);
    game.stage.kick(2.4);
    game.sfx.marineDown();
  }

  revive(game) {
    this.downed = false;
    this.warned = false;
    this.hp = Math.round(this.maxHp * 0.5);
    this.model.rotation.z = 0;
    this.model.position.y = 0;
    game.voice.say('revive');
    game.fx.ring({ x: this.x, z: this.z }, 1.3, 0x5ef08a);
    // went down in the open: get up and dig in on the nearest tile
    if (!this.bunker && !this.isPlaced(game)) {
      this.driving = true;
      this.halt(game);
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
    const dmg = 1 - this.hp / this.maxHp;
    const paint = this.model.userData.paint;
    if (paint) {
      paint.color.setRGB(0.43 * (1 - dmg * 0.55), 0.47 * (1 - dmg * 0.45), 0.49 * (1 - dmg * 0.35));
      paint.emissive.setHex(0xff6a2a);
      paint.emissiveIntensity = dmg > 0.5 ? (dmg - 0.5) * 1.8 : 0;
    }
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  takeDamage(amount, game, fromAngle) {
    game.alert(this);
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
  constructor(spec) {
    this.kind = 'core';
    this.tx = spec.x; this.ty = spec.y;
    this.w = spec.w; this.h = spec.h;
    this.x = spec.x + spec.w / 2;
    this.z = spec.y + spec.h / 2;
    this.maxHp = spec.hp;
    this.hp = spec.hp;
    this.dead = false;

    this.obj = new THREE.Group();
    this.obj.position.set(this.x, 0, this.z);
    this.model = buildCore();
    this.obj.add(this.model);

    this.light = new THREE.PointLight(0xffc56a, 6, 7, 2);
    this.light.position.set(1.0, 0.7, 0);
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
    ud.reactor.material.color.setHex(pct < 0.35 ? 0xffb0a0 : 0xffe7a2);
    ud.reactor.material.emissive.setHex(pct < 0.35 ? 0xff4a35 : 0xffa020);
    this.light.color.setHex(pct < 0.35 ? 0xff5a4a : 0xffc56a);
    this.bar.set(pct, game.camera, true);
  }

  takeDamage(amount, game, fromAngle) {
    game.alert(this);
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
  constructor(x, z, breedId, hpScale, speedScale) {
    this.kind = 'zergling';
    this.breedId = breedId;
    this.breed = BREEDS[breedId];
    this.flying = !!this.breed.flying;
    this.altitude = this.flying ? 2.6 : 0;
    this.x = x; this.z = z;
    this.yaw = 0;
    this.maxHp = Math.round(this.breed.hp * hpScale);
    this.hp = this.maxHp;
    this.speed = this.breed.speed * speedScale;
    this.damage = this.breed.damage;
    this.armor = this.breed.armor;
    this.scale = this.breed.scale * BUG_SCALE;
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
    this.air = null;
    this.jumpCd = 0;
    this.prey = null;
    this.huntIn = Math.random() * 0.3;

    this.obj = new THREE.Group();
    this.obj.position.set(x, 0, z);
    this.model = makeModel(breedId);
    this.obj.add(this.model);
    this.bar = new HealthBar(this.obj, 0.5 * this.scale, 0.07, 0.55 + 0.35 * this.scale);
  }

  update(dt, game) {
    this.hurt = Math.max(0, this.hurt - dt * 4);
    this.swing = Math.max(0, this.swing - dt * 3);

    if (this.dead) {
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 0.8);
      if (this.model.userData.anim) this.model.userData.anim('death', dt);
      else {
        this.model.rotation.z = k * 1.5;
        this.model.position.y = -k * 0.3;
        this.model.scale.setScalar(this.scale * (1 - k * 0.25));
      }
      this.bar.group.visible = false;
      return;
    }

    this.spawnT = Math.min(1, this.spawnT + dt * 2.2);
    this.jumpCd = Math.max(0, this.jumpCd - dt);
    if (!this.air) this.model.scale.setScalar(this.scale * (0.35 + this.spawnT * 0.65));

    if (this.flying) {
      this.altitude = (game.heightAt?.(this.x, this.z) || 0) + 2.6;
      const prey = this.rangedPrey(game);
      if (prey) this.spit(prey, dt, game);
      else {
        const dx = game.core.x - this.x, dz = game.core.z - this.z;
        const d = Math.hypot(dx, dz) || 1;
        const step = Math.min(d, this.speed * dt);
        this.x += dx / d * step; this.z += dz / d * step;
        this.yaw = angleLerp(this.yaw, Math.atan2(dz, dx), Math.min(1, dt * 8));
        this.moving = 1;
      }
      this.animate(dt, game);
      this.bar.set(this.hp / this.maxHp, game.camera);
      return;
    }
    if (this.air) {
      this.fly(dt, game);
      this.animate(dt, game);
      this.bar.set(this.hp / this.maxHp, game.camera);
      return;
    }

    this.repathIn -= dt;
    if (!this.path || this.pathVersion !== game.grid.version || this.repathIn <= 0) {
      this.repath(game);
    }

    const loose = this.looseVictim(game);
    if (loose) {
      this.attack(loose, dt, game);
    } else if (this.breed.ranged) {
      const prey = this.rangedPrey(game);
      if (prey) this.spit(prey, dt, game);
      else this.advance(dt, game);
    } else {
      const prey = this.hunt(game, dt);
      const blocker = prey ? null : this.blockerAhead(game);
      if (prey) {
        if (Math.hypot(prey.x - this.x, prey.z - this.z) <= this.breed.range + 0.15) this.attack(prey, dt, game);
        else this.steer(prey.x, prey.z, dt, game, true);
      } else if (blocker && this.breed.jump && blocker.kind === 'wall' && this.tryJump(blocker, game)) {
        /* airborne next frame */
      } else if (blocker) this.attack(blocker, dt, game);
      else this.advance(dt, game);
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
      // A route is smoothed from tile centers, but the bug may be off-center
      // after spawning or steering around the swarm. Visit this tile's center
      // first if the direct shortcut would run through rock.
      this.wp = pts.length > 1 && game.grid.clearWorldLine(this.x, this.z, pts[1].x, pts[1].y, true) ? 1 : 0;
    }
    this.pathVersion = game.grid.version;
    this.repathIn = 0.5 + Math.random() * 0.5;
  }

  /** An SCV, or a soldier caught walking in the open, close enough to bite. */
  looseVictim(game) {
    if (game.scv && !game.scv.dead && Math.hypot(game.scv.x - this.x, game.scv.z - this.z) < 0.85) return game.scv;
    for (const m of game.gunners) {
      if (m.dead || m.flying || m.bunker || m.isPlaced(game)) continue;
      if (Math.hypot(m.x - this.x, m.z - this.z) < 0.85) return m;
    }
    return null;
  }

  /** Worth chasing: alive, standing up, and out in the open (bunkered troops are the bunker's problem). */
  preyOk(p, game) {
    if (!p || p.dead || p.downed || p.bunker || p.flying) return false;
    if (p.kind === 'scv') return p === game.scv;
    if (p.kind === 'wall') return game.walls.includes(p);
    if (p.kind === 'bunker') return game.bunkers.includes(p);
    return game.gunners.includes(p);
  }

  /**
   * Troops, walls or bunkers close to the swarm's route: break off, wreck it, then carry on to the base.
   * Troops are preferred over buildings at the same distance. Hoppers vault walls instead of chewing them.
   * Stays on a target until it is gone or well out of reach; only notices things it can walk up to.
   */
  hunt(game, dt) {
    const aggro = this.breed.aggro || 0;
    if (!aggro) return null;
    if (this.prey && (!this.preyOk(this.prey, game)
      || Math.hypot(this.prey.x - this.x, this.prey.z - this.z) > aggro + 1.5)) this.prey = null;
    this.huntIn -= dt;
    if (!this.prey && this.huntIn <= 0) {
      this.huntIn = 0.25 + Math.random() * 0.15;
      const cx = Math.floor(this.x), cz = Math.floor(this.z);
      let best = null, bd = aggro;
      const pool = [...game.gunners, ...game.bunkers];
      if (game.scv) pool.push(game.scv);
      if (!this.breed.jump) pool.push(...game.walls);
      for (const p of pool) {
        if (!this.preyOk(p, game)) continue;
        const building = p.kind === 'wall' || p.kind === 'bunker';
        const d = Math.hypot(p.x - this.x, p.z - this.z) + (building ? 0.4 : 0);
        if (d < bd && game.grid.lineOpen(cx, cz, Math.floor(p.x), Math.floor(p.z))) { bd = d; best = p; }
      }
      this.prey = best;
    }
    return this.prey;
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
      this.attackCd = this.breed.attackSpeed;
      this.swing = 1;
      victim.takeDamage(this.damage, game, want);
    }
    this.moving = 0;
  }

  /** Something to shoot from here: troops before buildings, and only over open ground. */
  rangedPrey(game) {
    let best = null, bestScore = Infinity;
    const cx = Math.floor(this.x), cz = Math.floor(this.z);
    const troops = game.gunners.filter((m) => !m.dead && !m.downed && !m.bunker);
    if (game.scv && !game.scv.dead) troops.push(game.scv);
    const pile = [...troops, ...game.walls, ...game.bunkers, game.core];
    for (const s of pile) {
      if (!s || s.dead || (s.flying && !this.breed.targetsAir)) continue;
      const d = Math.hypot(s.x - this.x, s.z - this.z);
      if (d > this.breed.range) continue;
      const score = d + (troops.includes(s) ? 0 : 1.2);
      if (score >= bestScore) continue;
      if (!this.flying && !s.flying && s.kind !== 'core' && !game.grid.lineOpen(cx, cz, Math.floor(s.x), Math.floor(s.z))) continue;
      bestScore = score; best = s;
    }
    return best;
  }

  spit(victim, dt, game) {
    this.target = victim;
    const want = Math.atan2(victim.z - this.z, victim.x - this.x);
    this.yaw = angleLerp(this.yaw, want, Math.min(1, dt * 6));
    this.attackCd -= dt;
    this.moving = 0;
    if (this.attackCd <= 0) {
      this.attackCd = this.breed.attackSpeed;
      this.swing = 1;
      const [mx, my] = this.breed.muzzle || [0, 0.45];
      const s = this.scale;
      const shot = new Acid(
        this.x + Math.cos(this.yaw) * mx * s, this.altitude + my * s, this.z + Math.sin(this.yaw) * mx * s,
        victim, this.damage, this.breed.projectile
      );
      game.acids.push(shot);
      game.scene.add(shot.mesh);
      if (this.breed.projectile === 'spine') game.sfx.spine();
      else game.sfx.screech();
    }
  }

  tryJump(blocker, game) {
    if (this.jumpCd > 0) return false;
    const dx = Math.sign(blocker.x - this.x);
    const dz = Math.abs(blocker.x - this.x) > Math.abs(blocker.z - this.z) ? 0 : Math.sign(blocker.z - this.z);
    const tx = blocker.tx + dx;
    const tz = blocker.ty + dz;
    if (!game.grid.inside(tx, tz) || game.grid.blocked(tx, tz)) return false;
    this.air = { sx: this.x, sz: this.z, x: tx + 0.5, z: tz + 0.5, t: 0, dur: 0.48 };
    this.jumpCd = 2.4;
    return true;
  }

  fly(dt, game) {
    const a = this.air;
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    this.x = a.sx + (a.x - a.sx) * k;
    this.z = a.sz + (a.z - a.sz) * k;
    this.obj.position.y = Math.sin(k * Math.PI) * 1.25;
    this.moving = 1;
    this.gait += dt * 14;
    if (k >= 1) {
      this.air = null;
      this.obj.position.y = 0;
      this.repath(game);
    }
  }

  advance(dt, game) {
    // routes are short stretches of the swarm's route map; read the next one when this runs out
    if (!this.path || this.wp >= this.path.length) this.repath(game);
    if (!this.path || this.wp >= this.path.length) { this.moving = 0; return; }
    const node = this.path[this.wp];
    if (Math.hypot(node.x - this.x, node.y - this.z) < 0.18) {
      this.wp++;
      if (this.wp >= this.path.length) this.repath(game);
      return;
    }
    this.steer(node.x, node.y, dt, game, false);
  }

  /** Run toward a point with the swarm's spacing. `solid` also keeps out of walls and bunkers (off-route chases). */
  steer(px, pz, dt, game, solid) {
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz) || 1;

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
    const nx = this.x + Math.cos(this.yaw) * spd * dt;
    const nz = this.z + Math.sin(this.yaw) * spd * dt;
    const free = (x, z) => {
      const c = game.grid.get(Math.floor(x), Math.floor(z));
      return c !== CELL.ROCK && !(solid && (c === CELL.WALL || c === CELL.BUNKER));
    };
    if (free(nx, this.z)) this.x = nx;
    if (free(this.x, nz)) this.z = nz;
    this.moving = spd / this.speed;
    this.gait += dt * spd * 6.5;

    if (Math.random() < dt * 5 * this.moving) {
      game.fx.spawn(this.x - Math.cos(this.yaw) * 0.3, 0.06, this.z - Math.sin(this.yaw) * 0.3,
        (Math.random() - 0.5) * 0.5, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5,
        0.45, 0.07, [0.38, 0.3, 0.24], { drag: 1.6, grow: 0.25 });
    }
    if (Math.random() < dt * 1.6 * this.moving) game.fx.decal(this.x, this.z, 0.28, 0x4a1848, 0.4);
  }

  animate(dt, game) {
    const ud = this.model.userData;
    const hop = this.air ? Math.sin(Math.min(1, this.air.t / this.air.dur) * Math.PI) * 1.25 : 0;
    this.obj.position.set(this.x, this.flying ? this.altitude : hop, this.z);
    this.model.rotation.y = -this.yaw;

    if (ud.anim) {
      const state = this.swing > 0 || (this.target && !this.moving) ? 'attack' : this.moving > 0.05 ? 'walk' : 'idle';
      ud.anim(state, dt);
      return;
    }
    if (ud.serpent) { this.animateSerpent(dt, game); return; }

    const run = this.moving ?? 0;
    const lift = this.air ? 0.15 : 1;
    for (const hip of ud.legs) {
      const ph = this.gait + hip.userData.phase;
      hip.rotation.x = Math.sin(ph) * 0.55 * (0.2 + run) * lift;
      hip.userData.knee.rotation.x = hip.userData.side * (0.35 + Math.max(0, Math.cos(ph)) * 0.45 * run);
    }

    ud.body.position.y = 0.28 + Math.abs(Math.sin(this.gait)) * 0.04 * run;
    ud.body.rotation.z = Math.sin(this.gait) * 0.06 * run;

    const sw = this.swing;
    ud.blades.forEach((b) => {
      const s = b.userData.side;
      b.rotation.x = s * (0.7 + sw * 0.35);
      b.rotation.z = -sw * 0.9;
      b.position.x = 0.16 + sw * 0.06;
    });

    const sway = Math.sin(this.gait * 0.6) * 0.35 * (0.3 + run);
    ud.tail.rotation.y = sway;
    ud.tail2.rotation.y = sway * 0.8;
    ud.tail.rotation.z = -0.25;
  }

  /** Needler: slither, sway while it waits, rear back and flare the quills on every shot. */
  animateSerpent(dt, game) {
    const ud = this.model.userData;
    const run = this.moving ?? 0;
    this.gait += dt * (2 + run * 9);
    ud.tail.forEach((seg, i) => {
      seg.rotation.y = Math.sin(this.gait - seg.userData.phase) * (0.18 + run * 0.32) * (i ? 1 : 0.5);
    });
    const sw = this.swing;
    ud.torso.rotation.z = Math.sin(game.time * 1.7 + this.gait * 0.1) * 0.05 + sw * 0.32 - run * 0.12;
    ud.torso.rotation.x = Math.sin(this.gait * 0.5) * 0.06 * (0.3 + run);
    ud.head.rotation.z = -0.35 - sw * 0.25;
    ud.crest.scale.set(1, 1 + sw * 0.25, 1 + sw * 0.6);
    ud.sac.scale.setScalar(1 + sw * 0.5 + Math.sin(game.time * 6) * 0.05);
    for (const a of ud.arms) a.rotation.z = Math.sin(game.time * 3 + a.userData.side) * 0.12 + sw * 0.4;
  }

  takeDamage(amount, game, fromAngle) {
    const dealt = mitigate(amount, this.armor);
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
/*  BUNKER, SCV, ACID                                                  */
/* ------------------------------------------------------------------ */

export class Bunker {
  constructor(tx, ty, hp, facing) {
    this.kind = 'bunker';
    this.tx = tx; this.ty = ty;
    this.x = tx + 0.5; this.z = ty + 0.5;
    this.maxHp = hp;
    this.hp = hp;
    this.facing = facing;
    this.garrison = [];
    this.dead = false;
    this.spawnT = 0;
    this.shake = 0;
    this.obj = new THREE.Group();
    this.obj.position.set(this.x, 0, this.z);
    this.obj.rotation.y = -facing;
    this.model = makeModel('bunker');
    this.obj.add(this.model);
    this.bar = new HealthBar(this.obj, 0.7, 0.08, 0.85);
  }

  update(dt, game) {
    this.spawnT = Math.min(1, this.spawnT + dt * 3);
    this.model.scale.y = this.spawnT;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 5);
      this.model.position.x = (Math.random() - 0.5) * this.shake * 0.04;
    }
    const dmg = 1 - this.hp / this.maxHp;
    const paint = this.model.userData.paint;
    if (paint) {
      paint.emissive.setHex(0xff6a2a);
      paint.emissiveIntensity = dmg > 0.45 ? (dmg - 0.45) * 2 : 0;
    }
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  takeDamage(amount, game, fromAngle) {
    game.alert(this);
    this.hp -= amount;
    this.shake = 1;
    game.fx.sparks({ x: this.x, y: 0.4, z: this.z }, fromAngle + Math.PI, 6, [0.9, 0.85, 0.7], 4);
    game.sfx.impact();
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      game.fx.explosion({ x: this.x, y: 0.4, z: this.z }, 1);
      game.fx.chunks({ x: this.x, y: 0.4, z: this.z }, 10, 0x6d777d);
      game.stage.kick(3);
      game.onStructureLost(this);
    }
  }
}

export class Scv {
  constructor(x, z) {
    this.kind = 'scv';
    this.x = x; this.z = z;
    this.yaw = 0;
    this.maxHp = 70;
    this.hp = 70;
    this.speed = 1.9;
    this.dead = false;
    this.deathT = 0;
    this.order = null;
    this.channel = 0;
    this.obj = new THREE.Group();
    this.model = makeModel('scv');
    this.obj.add(this.model);
    this.bar = new HealthBar(this.obj, 0.5, 0.06, 0.55);
  }

  update(dt, game) {
    if (this.dead) {
      this.deathT += dt;
      if (this.model.userData.anim) this.model.userData.anim('death', dt);
      else this.model.rotation.z = Math.min(1.2, this.deathT * 3);
      this.bar.group.visible = false;
      return;
    }
    const px = this.x, pz = this.z;
    const o = this.order;
    if (o?.target && (o.target.dead || (o.type === 'revive' && !o.target.downed) || (o.type === 'repair' && o.target.hp >= o.target.maxHp))) {
      this.order = null;
    }
    if (this.order) {
      const t = this.order.type === 'move' ? this.order : this.order.target;
      const reach = this.order.type === 'move' ? 0.06 : 0.85;
      const d = Math.hypot(t.x - this.x, t.z - this.z);
      if (d > reach) {
        this.walkToward(t, dt, game);
        this.channel = 0;
      } else if (this.order.type === 'move') {
        this.order = null;
        this.route = null;
      } else if (this.order.type === 'repair') {
        t.hp = Math.min(t.maxHp, t.hp + 60 * dt);
        if (Math.random() < dt * 8) game.fx.sparks({ x: t.x, y: 0.4, z: t.z }, 0, 2, [0.7, 0.95, 1], 2, 6);
      } else {
        this.channel += dt;
        if (this.channel > 1.1) { t.revive(game); this.order = null; this.channel = 0; }
      }
      if (this.order && d <= reach) this.yaw = angleLerp(this.yaw, Math.atan2(t.z - this.z, t.x - this.x), Math.min(1, dt * 8));
    }
    this.obj.position.set(this.x, 0, this.z);
    this.model.rotation.y = -this.yaw;
    this.model.scale.setScalar(UNIT_SCALE);
    const anim = this.model.userData.anim;
    if (anim) {
      const working = this.order && this.order.type !== 'move' && Math.hypot(px - this.x, pz - this.z) < 1e-4;
      anim(Math.hypot(px - this.x, pz - this.z) > 1e-4 ? 'walk' : working ? 'attack' : 'idle', dt);
    }
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  /** Follow open ground toward a point, re-routing now and then; straight line for the last stretch. */
  walkToward(goal, dt, game) {
    this.repathIn = (this.repathIn ?? 0) - dt;
    if (!this.route || this.repathIn <= 0 || this.routeGoal !== goal) {
      this.routeGoal = goal;
      this.repathIn = 0.8;
      const sx = Math.max(0, Math.min(game.grid.COLS - 1, Math.floor(this.x)));
      const sy = Math.max(0, Math.min(game.grid.ROWS - 1, Math.floor(this.z)));
      const end = game.grid.nearestOpen(Math.floor(goal.x), Math.floor(goal.z), 2);
      this.route = end ? game.grid.walkRoute(sx, sy, end.x, end.y) : null;
      this.wp = 1;
    }
    let px = goal.x, pz = goal.z;
    const node = this.route?.[this.wp];
    if (node) {
      if (Math.hypot(node.x - this.x, node.y - this.z) < 0.1) this.wp++;
      const n = this.route[this.wp];
      if (n) { px = n.x; pz = n.y; }
    }
    const dx = px - this.x, dz = pz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    this.yaw = angleLerp(this.yaw, Math.atan2(dz, dx), Math.min(1, dt * 10));
    const step = Math.min(d, this.speed * dt);
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
  }

  takeDamage(amount, game) {
    game.alert(this);
    this.hp -= amount;
    if (this.hp <= 0 && !this.dead) {
      this.hp = 0;
      this.dead = true;
      this.order = null;
      game.fx.explosion({ x: this.x, y: 0.3, z: this.z }, 0.6);
      game.stage.kick(2);
      game.emit('change');
    }
  }
}

const ACID_GEO = new THREE.SphereGeometry(0.12, 8, 6);
const ACID_MAT = new THREE.MeshBasicMaterial({ color: 0xb6ff3a });
const SPINE_GEO = new THREE.ConeGeometry(0.035, 0.34, 6).rotateZ(-Math.PI / 2);
const SPINE_MAT = new THREE.MeshBasicMaterial({ color: 0xf4ead0 });

/** A bug's ranged shot: a slow acid glob (tanker) or a fast bone spine (needler). */
export class Acid {
  constructor(x, y, z, target, damage, style = 'acid') {
    this.x = x; this.y = y; this.z = z;
    this.target = target;
    this.damage = damage;
    this.style = style;
    this.speed = style === 'spine' ? 15 : 7.5;
    this.dead = false;
    this.mesh = new THREE.Mesh(style === 'spine' ? SPINE_GEO : ACID_GEO, style === 'spine' ? SPINE_MAT : ACID_MAT);
    this.mesh.position.set(x, y, z);
  }

  update(dt, game) {
    if (!this.target || this.target.dead) { this.dead = true; return; }
    const dx = this.target.x - this.x, dy = (this.target.flying ? this.target.obj.position.y + 0.3 : 0.4) - this.y, dz = this.target.z - this.z;
    const d = Math.hypot(dx, dy, dz);
    const step = this.speed * dt;
    if (d <= step) {
      this.dead = true;
      this.target.takeDamage(this.damage, game, Math.atan2(dz, dx));
      if (this.style === 'spine') {
        game.fx.sparks({ x: this.target.x, y: 0.5, z: this.target.z }, Math.atan2(dz, dx) + Math.PI, 6, [0.95, 0.9, 0.75], 3);
      } else {
        game.fx.explosion({ x: this.target.x, y: 0.4, z: this.target.z }, 0.35);
        game.fx.decal(this.target.x, this.target.z, 0.4, 0x6a9a20, 0.55);
      }
      return;
    }
    this.x += dx / d * step; this.y += dy / d * step; this.z += dz / d * step;
    this.mesh.position.set(this.x, this.y, this.z);
    if (this.style === 'spine') {
      this.mesh.rotation.y = -Math.atan2(dz, dx);
      this.mesh.rotation.z = Math.asin(Math.max(-1, Math.min(1, dy / d)));
    }
  }
}

/* ------------------------------------------------------------------ */
/*  SIEGE SHELL                                                        */
/* ------------------------------------------------------------------ */

const SHELL_GEO = new THREE.SphereGeometry(0.09, 8, 6);
const SHELL_MAT = new THREE.MeshBasicMaterial({ color: 0xffc14a });

const BOMB_GEO = new THREE.CylinderGeometry(0.07, 0.11, 0.42, 6);
const BOMB_MAT = new THREE.MeshBasicMaterial({ color: 0xff7a3a });
const MARK_GEO = new THREE.RingGeometry(0.55, 0.72, 32).rotateX(-Math.PI / 2);
const MARK_MAT = new THREE.MeshBasicMaterial({
  color: 0xff5a4a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide
});

export class AirBomb {
  constructor(tx, tz, damage, radius, delay) {
    this.tx = tx;
    this.tz = tz;
    this.damage = damage;
    this.radius = radius;
    this.delay = delay;
    this.t = 0;
    this.dead = false;
    this.falling = false;
    this.y = 9.5;
    this.mesh = new THREE.Mesh(BOMB_GEO, BOMB_MAT);
    this.mesh.visible = false;
    this.mesh.position.set(tx, this.y, tz);
    this.mark = new THREE.Mesh(MARK_GEO, MARK_MAT.clone());
    this.mark.position.set(tx, 0.06, tz);
    this.mark.scale.setScalar(radius * 0.55);
  }

  update(dt, game) {
    this.t += dt;
    this.mark.material.opacity = 0.35 + Math.abs(Math.sin(this.t * 10)) * 0.5;
    this.mark.rotation.y += dt * 2.4;

    if (!this.falling) {
      if (this.t < this.delay) return;
      this.falling = true;
      this.mesh.visible = true;
      game.sfx.airstrikeDrop();
    }

    this.y -= 22 * dt;
    this.mesh.position.set(this.tx, this.y, this.tz);
    this.mesh.rotation.x += dt * 8;
    if (this.y > 0.2) return;

    this.dead = true;
    game.scene.remove(this.mesh);
    game.scene.remove(this.mark);
    this.mark.material.dispose();
    game.fx.explosion({ x: this.tx, y: 0.4, z: this.tz }, 1.55);
    game.fx.decal(this.tx, this.tz, this.radius * 0.55, 0x2a1a12, 0.55);
    game.sfx.cannonHit();
    game.stage.kick(3.2);
    for (const bug of game.zerglings) {
      if (bug.dead || bug.flying) continue;
      const d = Math.hypot(bug.x - this.tx, bug.z - this.tz);
      if (d > this.radius) continue;
      const fall = 1 - (d / this.radius) * 0.45;
      bug.takeDamage(Math.max(1, Math.round(this.damage * fall)), game, Math.atan2(bug.z - this.tz, bug.x - this.tx));
    }
  }
}

export class Shell {
  constructor(from, tx, tz, damage, radius) {
    this.x = from.x; this.y = from.y; this.z = from.z;
    this.tx = tx; this.tz = tz;
    this.damage = damage;
    this.radius = radius;
    this.speed = 14;
    this.dead = false;
    this.travel = Math.max(0.001, Math.hypot(tx - from.x, tz - from.z));
    this.mesh = new THREE.Mesh(SHELL_GEO, SHELL_MAT);
    this.mesh.position.set(this.x, this.y, this.z);
  }

  update(dt, game) {
    const dx = this.tx - this.x, dz = this.tz - this.z;
    const d = Math.hypot(dx, dz);
    const step = this.speed * dt;
    if (d <= step) {
      this.dead = true;
      this.boom(game);
      return;
    }
    this.x += (dx / d) * step;
    this.z += (dz / d) * step;
    const k = 1 - d / this.travel;
    this.y = 0.4 + Math.sin(Math.min(1, Math.max(0, k)) * Math.PI) * 0.85;
    this.mesh.position.set(this.x, this.y, this.z);
  }

  boom(game) {
    game.fx.explosion({ x: this.tx, y: 0.35, z: this.tz }, 1.15);
    game.sfx.cannonHit();
    game.stage.kick(2.2);
    for (const bug of game.zerglings) {
      if (bug.dead || bug.flying) continue;
      const d = Math.hypot(bug.x - this.tx, bug.z - this.tz);
      if (d > this.radius) continue;
      const fall = 1 - (d / this.radius) * 0.4;
      bug.takeDamage(Math.max(1, Math.round(this.damage * fall)), game, Math.atan2(bug.z - this.tz, bug.x - this.tx));
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
    const ty = (this.target.flying ? this.target.obj.position.y : 0) + (this.target.kind === 'zergling' ? 0.3 : 0.6);
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
