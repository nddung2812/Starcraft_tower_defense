import * as THREE from 'three';
import { CELL, BUILD, ECON, ARMORY, CORE, SPAWN, ROCKS, COLS, ROWS, waveSpec, MARINE_TIERS } from './config.js';
import { Grid } from './grid.js';
import { Marine, Zergling, Wall, Core, Tracer } from './entities.js';
import { buildHatchery, buildRock } from './models.js';
import { Fx } from './fx.js';
import { sfx } from './audio.js';

export class Game {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.fx = new Fx(stage.scene);
    this.sfx = sfx;
    this.grid = new Grid();

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.hatchery = buildHatchery();
    this.hatchery.position.set(SPAWN.x + 0.5, 0, SPAWN.y + 1);
    this.scene.add(this.hatchery);
    this.hatchLight = new THREE.PointLight(0xc06bff, 7, 8, 2);
    this.hatchLight.position.set(SPAWN.x + 0.6, 0.7, SPAWN.y + 1);
    this.scene.add(this.hatchLight);

    this.rockGroup = new THREE.Group();
    ROCKS.forEach(([x, y], i) => {
      const r = buildRock(i + 1);
      r.position.set(x + 0.5, 0, y + 0.5);
      this.rockGroup.add(r);
    });
    this.scene.add(this.rockGroup);

    this.routeLine = null;
    this.listeners = {};
    this.reset();
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  /* ---------------- lifecycle ---------------- */

  reset() {
    for (const e of [...(this.marines || []), ...(this.zerglings || []), ...(this.walls || [])]) {
      this.world.remove(e.obj);
    }
    if (this.core) this.world.remove(this.core.obj);
    for (const t of this.tracers || []) this.scene.remove(t.mesh);
    this.fx.clear();

    this.grid.reset();
    this.marines = [];
    this.zerglings = [];
    this.walls = [];
    this.tracers = [];
    this.core = new Core();
    this.world.add(this.core.obj);

    this.minerals = ECON.startMinerals;
    this.kills = 0;
    this.wave = 0;
    this.time = 0;
    this.state = 'build';
    this.queue = [];
    this.spawnTimer = 0;
    this.armory = [];
    this.selected = null;
    this.placing = null;
    this.speed = 1;

    this.refreshRoute();
    this.emit('change');
  }

  /* ---------------- economy + building ---------------- */

  get nextArmory() { return ARMORY.find((a) => !this.armory.includes(a)); }

  canAfford(cost) { return this.minerals >= cost; }

  placeWall(tx, ty) {
    if (!this.grid.buildable(tx, ty) || !this.canAfford(BUILD.wall.cost)) return false;
    const w = new Wall(tx, ty, BUILD.wall.hp);
    this.grid.set(tx, ty, CELL.WALL, w);
    this.walls.push(w);
    this.world.add(w.obj);
    this.minerals -= BUILD.wall.cost;
    this.fx.sparks({ x: w.x, y: 0.4, z: w.z }, 0, 12, [0.9, 0.95, 1], 3, 6.28);
    sfx.place();
    this.refreshRoute();
    this.emit('change');
    return true;
  }

  placeMarine(tx, ty) {
    if (!this.grid.buildable(tx, ty) || !this.canAfford(BUILD.marine.cost)) return false;
    const m = new Marine(tx, ty, this.armory);
    m.restYaw = Math.atan2(CORE.y + 1 - m.z, SPAWN.x - m.x);
    m.yaw = m.restYaw;
    m.invested = BUILD.marine.cost;
    this.grid.set(tx, ty, CELL.TOWER, m);
    this.marines.push(m);
    this.world.add(m.obj);
    this.minerals -= BUILD.marine.cost;
    this.fx.ring({ x: m.x, z: m.z }, 1.6, 0x5ad7ff);
    sfx.place();
    this.refreshRoute();
    this.emit('change');
    return true;
  }

  sell(entity) {
    if (this.state === 'wave') return false;
    const value = entity.kind === 'wall'
      ? Math.round(BUILD.wall.cost * ECON.refundRate)
      : Math.round(entity.invested * ECON.refundRate);
    this.removeStructure(entity);
    this.minerals += value;
    this.fx.label({ x: entity.x, y: 1, z: entity.z }, '+' + value, 'cash');
    sfx.ui();
    this.emit('change');
    return true;
  }

  upgradeMarine(m) {
    const cost = m.upgradeCost;
    if (cost == null || !this.canAfford(cost)) return false;
    this.minerals -= cost;
    m.invested += cost;
    m.upgrade(this.armory);
    this.fx.ring({ x: m.x, z: m.z }, 2.2, 0xffd36a);
    this.fx.sparks({ x: m.x, y: 0.7, z: m.z }, 0, 26, [1, 0.85, 0.4], 5, 6.28);
    this.stage.kick(1.5);
    sfx.upgrade();
    this.emit('change');
    return true;
  }

  removeStructure(e) {
    this.grid.clear(e.tx, e.ty);
    this.world.remove(e.obj);
    if (e.kind === 'wall') this.walls = this.walls.filter((w) => w !== e);
    else this.marines = this.marines.filter((m) => m !== e);
    if (this.selected === e) this.selected = null;
    this.refreshRoute();
  }

  onStructureLost(e) {
    this.grid.clear(e.tx, e.ty);
    this.walls = this.walls.filter((w) => w !== e);
    setTimeout(() => this.world.remove(e.obj), 0);
    if (this.selected === e) this.selected = null;
    this.refreshRoute();
    this.emit('change');
  }

  /* ---------------- waves ---------------- */

  startWave() {
    if (this.state !== 'build') return;
    this.wave++;
    const spec = waveSpec(this.wave);
    this.queue = [];
    for (let i = 0; i < spec.count; i++) {
      this.queue.push({ at: i * spec.gap, hpScale: spec.hpScale, speedScale: spec.speedScale });
    }
    this.spawnTimer = 0;
    this.state = 'wave';
    this.selected = null;
    sfx.alarm();
    this.emit('change');
    this.emit('wave', this.wave);
  }

  onKill() {
    this.kills++;
    this.minerals += ECON.perKill;
    const next = this.nextArmory;
    if (next && this.kills >= next.kills) {
      this.armory.push(next);
      for (const m of this.marines) m.applyStats(this.armory);
      sfx.unlock();
      this.emit('unlock', next);
    }
    this.emit('change');
  }

  onCoreDestroyed() {
    this.state = 'defeat';
    this.fx.explosion({ x: this.core.x, y: 1, z: this.core.z }, 3);
    this.stage.kick(9);
    sfx.defeat();
    this.emit('over', false);
  }

  completeWave() {
    this.state = 'build';
    const bonus = ECON.waveClearBase + this.wave * ECON.waveClearPerWave;
    this.minerals += bonus;
    this.fx.label({ x: this.core.x, y: 2.6, z: this.core.z }, '+' + bonus + ' minerals', 'cash');
    sfx.victory();
    this.refreshRoute();
    this.emit('change');
    this.emit('cleared', { wave: this.wave, bonus });
  }

  /* ---------------- route preview ---------------- */

  refreshRoute() {
    if (this.routeLine) {
      this.scene.remove(this.routeLine);
      this.routeLine.geometry.dispose();
      this.routeLine = null;
    }
    const pts = this.grid.route(SPAWN.x, SPAWN.y);
    if (!pts || !pts.length) return;
    const curve = new THREE.CatmullRomCurve3(
      pts.map((p) => new THREE.Vector3(p.x, 0.05, p.y)), false, 'catmullrom', 0.15
    );
    const geo = new THREE.TubeGeometry(curve, Math.max(8, pts.length * 5), 0.07, 6, false);
    this.routeLine = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color: 0xc06bff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.scene.add(this.routeLine);
  }

  spawnTracer(from, target, damage, owner) {
    const t = new Tracer(from, target, damage, owner);
    this.scene.add(t.mesh);
    this.tracers.push(t);
  }

  /* ---------------- tick ---------------- */

  update(dt) {
    this.time += dt;

    this.hatchery.userData.ring.rotation.z += dt * 0.6;
    this.hatchLight.intensity = 6 + Math.sin(this.time * 2) * 2;
    if (this.routeLine) {
      this.routeLine.material.opacity = this.state === 'build'
        ? 0.26 + Math.sin(this.time * 2.4) * 0.12
        : 0.1;
    }

    if (this.state === 'wave') {
      this.spawnTimer += dt;
      while (this.queue.length && this.queue[0].at <= this.spawnTimer) {
        const s = this.queue.shift();
        const z = new Zergling(
          SPAWN.x + 0.5 + (Math.random() - 0.5) * 0.5,
          SPAWN.y + 1 + (Math.random() - 0.5) * 1.2,
          s.hpScale, s.speedScale
        );
        this.zerglings.push(z);
        this.world.add(z.obj);
        this.fx.sparks({ x: z.x, y: 0.3, z: z.z }, 0, 8, [0.7, 0.35, 1], 3, 6.28);
      }
    }

    for (const m of this.marines) m.update(dt, this);
    for (const w of this.walls) w.update(dt, this);
    for (const z of this.zerglings) z.update(dt, this);
    this.core.update(dt, this);
    for (const t of this.tracers) t.update(dt, this);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (this.tracers[i].dead) {
        this.scene.remove(this.tracers[i].mesh);
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.zerglings.length - 1; i >= 0; i--) {
      const z = this.zerglings[i];
      if (z.dead && z.deathT > 1.6) {
        this.world.remove(z.obj);
        this.zerglings.splice(i, 1);
      }
    }
    for (let i = this.marines.length - 1; i >= 0; i--) {
      const m = this.marines[i];
      if (m.dead && m.deathT > 1.8) {
        this.grid.clear(m.tx, m.ty);
        this.world.remove(m.obj);
        this.marines.splice(i, 1);
        this.refreshRoute();
        this.emit('change');
      }
    }

    if (this.state === 'wave' && !this.queue.length && !this.zerglings.some((z) => !z.dead)) {
      this.completeWave();
    }

    this.fx.update(dt, this.camera, this.viewport);
  }
}
