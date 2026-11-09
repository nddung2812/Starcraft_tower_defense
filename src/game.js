import * as THREE from 'three';
import { CELL, BUILD, ECON, ARMORY, UNITS, AIR_STRIKE, wavePlan } from './config.js';
import { Grid } from './grid.js';
import { carveLevel } from './levels.js';
import { Marine, Zergling, Wall, Bunker, Scv, Core, Tracer, Shell, AirBomb } from './entities.js';
import { buildHatchery, buildRock, buildBoulder } from './models.js';
import { buildTerrain } from './terrain.js';
import { Fx } from './fx.js';
import { sfx } from './audio.js';
import { voice } from './voice.js';

const GUN = new Set(['marine', 'goliath', 'tank']);

export class Game {
  constructor(stage) {
    this.stage = stage;
    this.scene = stage.scene;
    this.camera = stage.camera;
    this.fx = new Fx(stage.scene);
    this.sfx = sfx;
    this.voice = voice;
    this.grid = new Grid();

    this.world = new THREE.Group();
    this.scene.add(this.world);

    this.hatchGroup = new THREE.Group();
    this.scene.add(this.hatchGroup);

    this.rockGroup = new THREE.Group();
    this.scene.add(this.rockGroup);
    this.zoneMesh = null;

    this.gunners = [];
    this.zerglings = [];
    this.walls = [];
    this.bunkers = [];
    this.tracers = [];
    this.acids = [];
    this.shells = [];
    this.bombs = [];
    this.listeners = {};
    this.reset();
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { (this.listeners[evt] || []).forEach((f) => f(data)); }

  /* ---------------- lifecycle ---------------- */

  wipeUnits() {
    for (const e of [...this.gunners, ...this.zerglings, ...this.walls, ...this.bunkers]) this.world.remove(e.obj);
    if (this.core) this.world.remove(this.core.obj);
    if (this.scv) this.world.remove(this.scv.obj);
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const a of this.acids) this.scene.remove(a.mesh);
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const b of this.bombs) {
      this.scene.remove(b.mesh);
      this.scene.remove(b.mark);
      b.mark.material.dispose();
    }
    this.fx.clear();
    this.gunners = [];
    this.zerglings = [];
    this.walls = [];
    this.bunkers = [];
    this.tracers = [];
    this.acids = [];
    this.shells = [];
    this.bombs = [];
    this.core = null;
    this.scv = null;
  }

  reset() {
    this.wipeUnits();
    this.level = 1;
    this.mapSeed = (Math.random() * 0x7fffffff) | 0;
    this.minerals = ECON.startMinerals;
    this.kills = 0;
    this.score = 0;
    this.time = 0;
    this.state = 'build';
    this.queue = [];
    this.spawnTimer = 0;
    this.armory = [];
    this.stimUnlocked = false;
    this.selected = null;
    this.placing = null;
    this.focus = null;
    this.speed = 1;
    this.drama = 1;
    this.called = false;
    this.briefT = 0;
    this.airStrikeCd = 0;
    this.pings = [];
    this.lastAlert = null;
    this.loadLevel();
    this.emit('change');
  }

  loadLevel() {
    for (const z of this.zerglings) this.world.remove(z.obj);
    this.zerglings = [];
    for (const t of this.tracers) this.scene.remove(t.mesh);
    for (const a of this.acids) this.scene.remove(a.mesh);
    for (const s of this.shells) this.scene.remove(s.mesh);
    for (const b of this.bombs) {
      this.scene.remove(b.mesh);
      this.scene.remove(b.mark);
      b.mark.material.dispose();
    }
    this.tracers = [];
    this.acids = [];
    this.shells = [];
    this.bombs = [];
    this.fx.clear();

    const layout = carveLevel(this.level, this.mapSeed);
    this.layout = layout;
    this.grid.load(layout);
    this.rebuildTerrain(layout);

    if (this.core) this.world.remove(this.core.obj);
    this.core = new Core(layout.core);
    this.world.add(this.core.obj);

    if (this.scv) this.world.remove(this.scv.obj);
    this.scv = this.spawnScv();
    this.world.add(this.scv.obj);

    this.hatchGroup.clear();
    for (const s of this.grid.spawns) {
      const h = buildHatchery();
      h.position.set(s.x + 0.5, 0, s.y + 0.9);
      const light = new THREE.PointLight(0xc06bff, 6, 7, 2);
      light.position.set(0, 0.7, 0);
      h.add(light);
      this.hatchGroup.add(h);
    }
    this.stage.focus.set(layout.focus.x, 0, layout.focus.z);
    if (!this.stage.userZoomed) this.stage.dist = 18;
    this.selected = null;
  }

  spawnScv() {
    const c = this.grid.core;
    const spots = [[c.x - 1, c.y], [c.x - 1, c.y + 1], [c.x + 2, c.y], [c.x + 2, c.y + 1], [c.x, c.y - 1], [c.x, c.y + 2]];
    for (const [x, y] of spots) {
      if (this.grid.inside(x, y) && this.grid.get(x, y) === CELL.OPEN) return new Scv(x + 0.5, y + 0.5);
    }
    return new Scv(c.x + 1, c.y + 0.5);
  }

  rebuildTerrain(layout) {
    this.rockGroup.clear();
    if (this.zoneMesh) {
      this.scene.remove(this.zoneMesh);
      this.zoneMesh.geometry.dispose();
      this.zoneMesh.material.dispose();
      this.zoneMesh = null;
    }

    // mountains: one heightfield around the lanes
    const terrain = buildTerrain(layout.depth, (this.mapSeed ^ (this.level * 2654435761)) >>> 0);
    this.zoneMesh = terrain.mesh;
    this.heightAt = terrain.heightAt;
    this.scene.add(this.zoneMesh);

    const noise = (x, y, i) => (x * 92821 + y * 68917 + this.mapSeed + i * 17) >>> 0;

    // rounded boulders: the ones dropped in the lane, and rock ribs too thin for a mountain to rise on
    const lumps = [...layout.boulders.map(([x, y]) => [x, y, 1]), ...terrain.flatRock.map(([x, y]) => [x, y, 0])];
    lumps.forEach(([x, y, inLane], i) => {
      const n = noise(x, y, i);
      const rock = buildBoulder(n);
      const s = (inLane ? 1.05 : 1.15) + (n % 7) / 30;
      rock.scale.set(s * (0.92 + (n % 5) / 25), s * (0.85 + (n % 6) / 20), s * (0.9 + ((n >> 3) % 5) / 25));
      rock.rotation.y = (n % 628) / 100;
      rock.position.set(x + 0.5 + ((n % 12) - 6) / 60, 0, y + 0.5 + (((n >> 6) % 12) - 6) / 60);
      this.rockGroup.add(rock);
    });

    // a few sharp spires standing on the high ground
    layout.peaks.forEach(([x, y], i) => {
      const n = noise(x, y, i + 101);
      const rock = buildRock(n);
      const s = 2.2 + (n % 9) / 8;
      rock.scale.set(s, s * (1.3 + (n % 5) / 10), s);
      rock.rotation.y = (n % 628) / 100;
      rock.position.set(x + 0.5, this.heightAt(x + 0.5, y + 0.5) - 0.6, y + 0.5);
      this.rockGroup.add(rock);
    });
  }

  /* ---------------- economy + building ---------------- */

  get nextArmory() { return ARMORY.find((a) => !this.armory.includes(a)); }

  canAfford(cost) { return this.minerals >= cost; }

  /** Before or during a fight, on open ground, and not on top of a bug (it would be sealed inside). */
  canBuildAt(tx, ty) {
    if (this.state !== 'build' && this.state !== 'brief' && this.state !== 'wave') return false;
    if (!this.grid.buildable(tx, ty)) return false;
    for (const z of this.zerglings) {
      if (!z.dead && z.x > tx - 0.2 && z.x < tx + 1.2 && z.z > ty - 0.2 && z.z < ty + 1.2) return false;
    }
    return true;
  }

  placeWall(tx, ty) {
    if (!this.canBuildAt(tx, ty) || !this.canAfford(BUILD.wall.cost)) return false;
    const w = new Wall(tx, ty, BUILD.wall.hp);
    this.grid.set(tx, ty, CELL.WALL, w);
    this.walls.push(w);
    this.world.add(w.obj);
    this.minerals -= BUILD.wall.cost;
    this.fx.sparks({ x: w.x, y: 0.4, z: w.z }, 0, 12, [0.9, 0.95, 1], 3, 6.28);
    sfx.place();
    this.emit('change');
    return true;
  }

  placeGunner(kind, tx, ty) {
    const spec = BUILD[kind];
    if (!spec || !this.canBuildAt(tx, ty) || !this.canAfford(spec.cost)) return false;
    const m = new Marine(kind, tx, ty, this.armory);
    const sp = this.grid.spawn;
    m.restYaw = Math.atan2((sp.y + 1) - m.z, (sp.x + 0.5) - m.x);
    m.yaw = m.restYaw;
    m.invested = spec.cost;
    this.grid.set(tx, ty, CELL.TOWER, m);
    this.gunners.push(m);
    this.world.add(m.obj);
    this.minerals -= spec.cost;
    this.fx.ring({ x: m.x, z: m.z }, kind === 'tank' ? 1.9 : 1.6, UNITS[kind].accent);
    sfx.place();
    this.emit('change');
    return true;
  }

  placeBunker(tx, ty) {
    if (!this.canBuildAt(tx, ty) || !this.canAfford(BUILD.bunker.cost)) return false;
    const sp = this.grid.spawn;
    const facing = Math.atan2((sp.y + 1) - (ty + 0.5), (sp.x + 0.5) - (tx + 0.5));
    const b = new Bunker(tx, ty, BUILD.bunker.hp, facing);
    this.grid.set(tx, ty, CELL.BUNKER, b);
    this.bunkers.push(b);
    this.world.add(b.obj);
    this.minerals -= BUILD.bunker.cost;
    this.fx.ring({ x: b.x, z: b.z }, 1.5, 0xe8b44a);
    sfx.place();
    this.emit('change');
    return true;
  }

  garrison(marine, bunker, force = false) {
    if ((!force && this.state !== 'build') || marine.kind !== 'marine' || marine.bunker || marine.downed || marine.dead) return false;
    if (bunker.dead || bunker.garrison.length >= 2) return false;
    if (marine.isPlaced(this)) this.grid.clear(marine.tx, marine.ty);
    marine.driving = false;
    marine.waypoints = null;
    marine.order = null;
    marine.bunker = bunker;
    bunker.garrison.push(marine);
    marine.obj.visible = false;
    sfx.place();
    this.emit('change');
    return true;
  }

  eject(marine, forced = false) {
    if (!marine.bunker) return false;
    if (!forced && this.state !== 'build') return false;
    const b = marine.bunker;
    b.garrison = b.garrison.filter((m) => m !== marine);
    marine.bunker = null;
    const spot = this.openNear(b.tx, b.ty);
    if (spot) {
      marine.tx = spot.x; marine.ty = spot.y;
      marine.x = spot.x + 0.5; marine.z = spot.y + 0.5;
      this.grid.set(spot.x, spot.y, CELL.TOWER, marine);
    }
    marine.obj.visible = true;
    marine.obj.position.set(marine.x, 0, marine.z);
    this.emit('change');
    return true;
  }

  openNear(tx, ty) {
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (this.grid.buildable(tx + dx, ty + dy)) return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }

  rebuildScv() {
    if (!this.scv?.dead || !this.canAfford(ECON.scvCost)) return false;
    this.world.remove(this.scv.obj);
    this.minerals -= ECON.scvCost;
    this.scv = this.spawnScv();
    this.world.add(this.scv.obj);
    sfx.place();
    this.emit('change');
    return true;
  }

  sell(entity) {
    if (this.state !== 'build') return false;
    if (entity.kind === 'bunker') entity.garrison.slice().forEach((m) => this.eject(m));
    const cost = entity.kind === 'wall' ? BUILD.wall.cost
      : entity.kind === 'bunker' ? BUILD.bunker.cost
      : entity.invested;
    const value = Math.round(cost * ECON.refundRate);
    this.removeStructure(entity);
    this.minerals += value;
    this.fx.label({ x: entity.x, y: 1, z: entity.z }, '+' + value, 'cash');
    sfx.ui();
    this.emit('change');
    return true;
  }

  upgradeGunner(m) {
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
    if (e.bunker) {
      e.bunker.garrison = e.bunker.garrison.filter((m) => m !== e);
      e.bunker = null;
    } else if (e.tx != null && this.grid.occupant(e.tx, e.ty) === e) this.grid.clear(e.tx, e.ty);
    this.world.remove(e.obj);
    if (e.kind === 'wall') this.walls = this.walls.filter((w) => w !== e);
    else if (e.kind === 'bunker') this.bunkers = this.bunkers.filter((b) => b !== e);
    else if (GUN.has(e.kind)) this.gunners = this.gunners.filter((m) => m !== e);
    if (this.selected === e) this.selected = null;
  }

  recoverHardware() {
    let n = 0;
    for (const e of [...this.gunners, ...this.walls, ...this.bunkers]) {
      const cost = e.kind === 'wall' ? BUILD.wall.cost : e.kind === 'bunker' ? BUILD.bunker.cost : e.invested;
      n += cost;
      this.removeStructure(e);
    }
    return n;
  }

  onStructureLost(e) {
    this.grid.clear(e.tx, e.ty);
    if (e.kind === 'bunker') {
      e.garrison.slice().forEach((m) => this.eject(m, true));
      this.bunkers = this.bunkers.filter((b) => b !== e);
    } else this.walls = this.walls.filter((w) => w !== e);
    setTimeout(() => this.world.remove(e.obj), 0);
    if (this.selected === e) this.selected = null;
    this.emit('change');
  }

  /* ---------------- waves ---------------- */

  startWave() {
    if (this.state !== 'build') return;
    this.queue = wavePlan(this.level);
    const mouths = this.grid.spawns.length;
    if (mouths > 1) this.queue.forEach((s, i) => { s.lane = Math.floor(i / 3) % mouths; });
    this.spawnTimer = 0;
    this.briefT = 3.15;
    this.called = false;
    this.state = 'brief';
    sfx.alarm();
    voice.say('contact');
    this.emit('brief', {
      kicker: `Level ${this.level}`,
      title: this.layout.name,
      body: this.layout.blurb + (this.grid.spawns.length > 1
        ? ` Breaches open from ${this.grid.spawns.length} directions.`
        : '')
    });
    this.emit('change');
  }

  onKill(bug) {
    this.kills++;
    this.score = this.kills;   // your score is simply how many bugs you killed
    this.minerals += ECON.perKill * (bug?.breed?.bounty || 1);
    if (this.kills % 6 === 0) voice.say('kill');
    const next = this.nextArmory;
    if (next && this.kills >= next.kills) {
      this.armory.push(next);
      if (next.id === 'stim') this.stimUnlocked = true;
      for (const m of this.gunners) if (m.spec.armory) m.applyStats(this.armory);
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
    this.drama = 1;
    this.focus = null;
    const bonus = ECON.waveClearBase + this.level * ECON.waveClearPerWave;
    const prev = this.level;
    const prevName = this.layout.name;
    // levels never run out: clear one and the next canyon is waiting
    const refund = this.recoverHardware();
    this.minerals += refund + bonus;
    this.level++;
    this.loadLevel();
    this.state = 'build';
    sfx.victory();
    this.emit('level');
    this.emit('change');
    this.emit('hold', {
      kicker: 'Canyon cleared',
      title: prevName,
      body: `Level ${prev} holds. ${this.kills} bugs killed so far. +${bonus} minerals, hardware returned. Next: ${this.layout.name}.`
    });
  }

  spawnTracer(from, target, damage, owner) {
    const t = new Tracer(from, target, damage, owner);
    this.scene.add(t.mesh);
    this.tracers.push(t);
  }

  spawnShell(from, tx, tz, damage, radius) {
    const s = new Shell(from, tx, tz, damage, radius);
    this.scene.add(s.mesh);
    this.shells.push(s);
  }

  get airStrikeReady() { return this.airStrikeCd <= 0; }

  callAirStrike(x, z) {
    if (!this.airStrikeReady) return false;
    if (this.state !== 'wave' && this.state !== 'brief') return false;
    this.airStrikeCd = AIR_STRIKE.cooldown;
    this.fx.ring({ x, z }, AIR_STRIKE.radius * 1.15, 0xff5a4a);
    sfx.airstrike();
    for (let i = 0; i < AIR_STRIKE.bombs; i++) {
      const a = (i / AIR_STRIKE.bombs) * Math.PI * 2 + Math.random() * 0.4;
      const r = 0.35 + Math.random() * 0.85;
      const b = new AirBomb(
        x + Math.cos(a) * r,
        z + Math.sin(a) * r,
        AIR_STRIKE.damage,
        AIR_STRIKE.radius,
        0.35 + i * 0.22
      );
      this.scene.add(b.mesh);
      this.scene.add(b.mark);
      this.bombs.push(b);
    }
    this.emit('change');
    return true;
  }

  /* ---------------- commands ---------------- */

  /**
   * Move a group. Each unit gets its own open tile around the clicked one so
   * the squad fans out instead of queueing for one square.
   * mode: 'move' ignores bugs on the way, 'amove' stops to shoot.
   */
  commandMove(units, tx, ty, mode = 'move') {
    const walkers = units.filter((u) => u.kind === 'scv' ? !u.dead : (u.spec?.mobile && !u.dead && !u.downed));
    if (!walkers.length) return 0;
    const taken = new Set();
    for (const m of this.gunners) {
      if (m.driving && !walkers.includes(m)) taken.add(this.grid.idx(m.goalTx, m.goalTy));
    }

    // breadth-first fan-out over open ground from the nearest open tile to the click
    const start = this.grid.nearestOpen(tx, ty, 4, taken);
    if (!start) return 0;
    const slots = [];
    const seen = new Set([this.grid.idx(start.x, start.y)]);
    const q = [start];
    while (q.length && slots.length < walkers.length) {
      const c = q.shift();
      if (!taken.has(this.grid.idx(c.x, c.y))) slots.push(c);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = c.x + dx, y = c.y + dy, k = this.grid.idx(x, y);
        if (!this.grid.inside(x, y) || seen.has(k) || this.grid.get(x, y) !== CELL.OPEN) continue;
        seen.add(k);
        q.push({ x, y });
      }
    }

    let n = 0;
    const left = walkers.slice();
    for (const slot of slots) {
      // nearest remaining unit takes the slot
      let bi = 0, bd = Infinity;
      left.forEach((u, i) => {
        const d = Math.hypot(u.x - (slot.x + 0.5), u.z - (slot.y + 0.5));
        if (d < bd) { bd = d; bi = i; }
      });
      const u = left.splice(bi, 1)[0];
      if (u.kind === 'scv') {
        u.order = { type: 'move', x: slot.x + 0.5, z: slot.y + 0.5 };
        u.route = null;
        n++;
        continue;
      }
      if (u.bunker) this.eject(u, true);
      u.order = mode === 'amove' ? { type: 'amove' } : null;
      if (u.orderMove(slot.x, slot.y, this)) n++;
      else if (u.order?.type === 'amove') u.order = null;
    }
    return n;
  }

  commandAttack(units, target) {
    let n = 0;
    for (const u of units) if (u.spec && u.orderAttack(target, this)) n++;
    return n;
  }

  /** Marines walk to the bunker and climb in; anyone else just goes next to it. */
  commandGarrison(units, bunker) {
    const marines = units.filter((u) => u.kind === 'marine' && !u.dead && !u.downed && !u.bunker);
    const room = 2 - bunker.garrison.length;
    const going = marines.slice(0, Math.max(0, room));
    for (const m of going) {
      const spot = this.grid.nearestOpen(bunker.tx, bunker.ty, 2);
      if (!spot) continue;
      if (Math.hypot(m.x - bunker.x, m.z - bunker.z) < 1.8 && !m.driving) {
        this.garrison(m, bunker, true);
        continue;
      }
      m.order = { type: 'garrison', bunker };
      if (!m.orderMove(spot.x, spot.y, this)) m.order = null;
    }
    const rest = units.filter((u) => !going.includes(u));
    if (rest.length) this.commandMove(rest, bunker.tx, bunker.ty);
    return going.length;
  }

  commandStop(units) {
    for (const u of units) {
      if (u.kind === 'scv') { u.order = null; u.route = null; }
      else if (u.stop) u.stop(this);
    }
  }

  /** Something of ours is taking damage: ping the minimap, and say so now and then. */
  alert(e) {
    if (this.state !== 'wave' && this.state !== 'brief') return;
    if ((e._pingT ?? -99) > this.time - 1.4) return;
    e._pingT = this.time;
    this.pings.push({ x: e.x, z: e.z, t: 0 });
    this.lastAlert = { x: e.x, z: e.z };
    this.emit('alert', e);
  }

  /* ---------------- tick ---------------- */

  update(dt) {
    this.time += dt;
    if (this.airStrikeCd > 0) this.airStrikeCd = Math.max(0, this.airStrikeCd - dt);
    for (const p of this.pings) p.t += dt;
    if (this.pings.length && this.pings[0].t > 2.6) this.pings = this.pings.filter((p) => p.t <= 2.6);

    const pulse = 6 + Math.sin(this.time * 2) * 2;
    for (const h of this.hatchGroup.children) {
      h.userData.ring.rotation.z += dt * 0.6;
      const light = h.children.find((c) => c.isPointLight);
      if (light) light.intensity = pulse;
    }

    if (this.state === 'brief') {
      const prev = Math.ceil(this.briefT);
      this.briefT -= dt;
      const now = Math.ceil(Math.max(0, this.briefT));
      if (now !== prev && now > 0 && now <= 3) this.emit('count', now);
      if (this.briefT <= 0) {
        this.state = 'wave';
        this.spawnTimer = 0;
        voice.say('breach');
        for (const sp of this.grid.spawns) this.fx.ring({ x: sp.x + 0.5, z: sp.y + 0.9 }, 2.2, 0xc06bff);
        this.emit('count', 0);
        this.emit('change');
      }
    }

    if (this.state === 'wave') {
      this.spawnTimer += dt;
      while (this.queue.length && this.queue[0].at <= this.spawnTimer) {
        const s = this.queue.shift();
        const mouths = this.grid.spawns;
        const sp = mouths[(s.lane || 0) % mouths.length];
        const z = new Zergling(
          sp.x + 0.5 + (Math.random() - 0.5) * 0.28,
          sp.y + 0.85 + (Math.random() - 0.5) * 0.28,
          s.breed, s.hpScale, s.speedScale
        );
        this.zerglings.push(z);
        this.world.add(z.obj);
        this.fx.sparks({ x: z.x, y: 0.3, z: z.z }, 0, 8, [0.7, 0.35, 1], 3, 6.28);
      }
    }

    for (const m of this.gunners) m.update(dt, this);
    for (const w of this.walls) w.update(dt, this);
    for (const b of this.bunkers) b.update(dt, this);
    for (const z of this.zerglings) z.update(dt, this);
    if (this.scv) this.scv.update(dt, this);
    this.core.update(dt, this);
    for (const t of this.tracers) t.update(dt, this);
    for (const a of this.acids) a.update(dt, this);
    for (const s of this.shells) s.update(dt, this);
    for (const b of this.bombs) b.update(dt, this);

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      if (this.tracers[i].dead) {
        this.scene.remove(this.tracers[i].mesh);
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.acids.length - 1; i >= 0; i--) {
      if (this.acids[i].dead) {
        this.scene.remove(this.acids[i].mesh);
        this.acids.splice(i, 1);
      }
    }
    for (let i = this.shells.length - 1; i >= 0; i--) {
      if (this.shells[i].dead) {
        this.scene.remove(this.shells[i].mesh);
        this.shells.splice(i, 1);
      }
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      if (this.bombs[i].dead) this.bombs.splice(i, 1);
    }
    for (let i = this.zerglings.length - 1; i >= 0; i--) {
      const z = this.zerglings[i];
      if (z.dead && z.deathT > 1.6) {
        this.world.remove(z.obj);
        this.zerglings.splice(i, 1);
      }
    }
    for (let i = this.gunners.length - 1; i >= 0; i--) {
      const m = this.gunners[i];
      if (m.dead && m.deathT > 1.8) {
        if (!m.bunker && this.grid.occupant(m.tx, m.ty) === m) this.grid.clear(m.tx, m.ty);
        this.world.remove(m.obj);
        this.gunners.splice(i, 1);
        this.emit('change');
      }
    }

    const alive = this.zerglings.filter((z) => !z.dead).length;
    this.drama = this.state === 'wave' && !this.queue.length && alive === 1 ? 0.38 : 1;
    if (this.focus && this.focus.dead) this.focus = null;

    if (this.state === 'wave' && !this.queue.length && alive === 0) {
      this.completeWave();
    }

    this.fx.update(dt, this.camera, this.viewport);
  }
}
