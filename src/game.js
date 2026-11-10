import * as THREE from 'three';
import { CELL, BUILD, ECON, ARMORY, UNITS, AIR_STRIKE, TREASURE, TREASURE_RULES, baseUpgradeCost, applyBaseUpgrade, HIVE_RAID, BASE_LASER, wavePlan, STREAK, SUPPLY, unlockRound } from './config.js';
import { Grid } from './grid.js';
import { carveLevel, MAP_VERSION } from './levels.js';
import { Marine, Zergling, Wall, Bunker, Scv, Core, Hive, Tracer, Shell, AirBomb, SupplyCrate } from './entities.js';
import { buildRock, buildBoulder } from './models.js';
import { buildTerrain } from './terrain.js';
import { sceneryBoulder, scenerySpire } from './scenery.js';
import { Fx } from './fx.js';
import { sfx } from './audio.js';
import { voice } from './voice.js';
import { MilestoneAssault } from './milestones.js';
import { EVOLUTIONS } from './config.js';
import { syncEvolutionVisual } from './evolutions.js';

const GUN = new Set(Object.keys(UNITS));

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
    this.crates = [];
    this.listeners = {};
    this.assault = new MilestoneAssault(this);
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
    this.clearCrates();
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

  reset(seed = null) {
    this.wipeUnits();
    this.level = 1;
    this.mapVersion = MAP_VERSION;
    this.mapSeed = Number.isInteger(seed) ? seed >>> 0 : (Math.random() * 0x7fffffff) >>> 0;
    this.minerals = ECON.startMinerals;
    this.baseLevel = 0;
    this.laserCharge = 0;
    this.kills = 0;
    this.score = 0;
    this.time = 0;
    this.state = 'build';
    this.paused = false;
    this.queue = [];
    this.spawnTimer = 0;
    this.armory = [];
    this.treasureLoot = [];
    this.evolutions = {};
    this.pendingEvolution = null;
    this.stimUnlocked = false;
    this.selected = null;
    this.placing = null;
    this.focus = null;
    this.speed = 1;
    this.drama = 1;
    this.called = false;
    this.briefT = 0;
    this.airStrikeCd = 0;
    this.roundCoreDamaged = false;
    this.pings = [];
    this.lastAlert = null;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastKillT = -99;
    this.lastArmy = null;
    this.loadLevel();
    this.emit('change');
  }

  clearCrates() {
    for (const crate of this.crates || []) this.world.remove(crate.obj);
    this.crates = [];
    this.crateT = SUPPLY.first;
  }

  loadLevel() {
    this.assault.reset();
    this.raidT = 0;
    this.raidEarned = 0;
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
    this.clearCrates();
    this.streak = 0;

    const layout = carveLevel(this.level, this.mapSeed, this.mapVersion);
    this.layout = layout;
    this.grid.load(layout);
    this.stage.setMapSize(layout.cols, layout.rows);
    this.rebuildTerrain(layout);

    if (this.core) this.world.remove(this.core.obj);
    this.core = new Core(layout.core);
    this.world.add(this.core.obj);

    if (this.scv) this.world.remove(this.scv.obj);
    this.scv = this.spawnScv();
    this.world.add(this.scv.obj);

    this.hatchGroup.clear();
    this.hives = this.grid.spawns.map(s => new Hive(s, this.level));
    for (const hive of this.hives) this.hatchGroup.add(hive.obj);
    this.stage.focus.set(layout.focus.x, 0, layout.focus.z);
    this.stage.homeFocus.copy(this.stage.focus);
    if (!this.stage.userZoomed) this.stage.dist = 14;
    this.selected = null;
  }

  spawnScv() {
    const c = this.grid.core;
    const spots = [[c.x - 1, c.y], [c.x - 1, c.y + 1], [c.x + 2, c.y], [c.x + 2, c.y + 1], [c.x, c.y - 1], [c.x, c.y + 2]];
    for (const [x, y] of spots) {
      if (this.grid.inside(x, y) && this.grid.get(x, y) === CELL.OPEN) return new Scv(x + 0.5, y + 0.5, this.baseLevel);
    }
    return new Scv(c.x + 1, c.y + 0.5, this.baseLevel);
  }

  rebuildTerrain(layout) {
    this.rockGroup.clear();
    if (this.zoneMesh) {
      this.scene.remove(this.zoneMesh);
      const materials = new Set();
      this.zoneMesh.traverse(o => { if (o.isMesh) { o.geometry.dispose(); materials.add(o.material); } });
      for (const material of materials) material.dispose();
      this.zoneMesh = null;
    }

    // mountains: one heightfield around the lanes
    const terrain = buildTerrain(layout.depth, (this.mapSeed ^ (this.level * 2654435761)) >>> 0, layout.cols, layout.rows);
    this.zoneMesh = terrain.mesh;
    this.heightAt = terrain.heightAt;
    this.updateWater = terrain.update;
    this.scene.add(this.zoneMesh);

    const noise = (x, y, i) => (x * 92821 + y * 68917 + this.mapSeed + i * 17) >>> 0;

    // rounded boulders: the ones dropped in the lane, and rock ribs too thin for a mountain to rise on
    const lumps = [...layout.boulders.map(([x, y]) => [x, y, 1]), ...terrain.flatRock.map(([x, y]) => [x, y, 0])];
    lumps.forEach(([x, y, inLane], i) => {
      const n = noise(x, y, i);
      const rock = sceneryBoulder(n) || buildBoulder(n);
      const s = (inLane ? 1.05 : 1.15) + (n % 7) / 30;
      rock.scale.set(s * (0.92 + (n % 5) / 25), s * (0.85 + (n % 6) / 20), s * (0.9 + ((n >> 3) % 5) / 25));
      rock.rotation.y = (n % 628) / 100;
      rock.position.set(x + 0.5 + ((n % 12) - 6) / 60, 0, y + 0.5 + (((n >> 6) % 12) - 6) / 60);
      this.rockGroup.add(rock);
    });

    // a few sharp spires standing on the high ground
    layout.peaks.forEach(([x, y], i) => {
      if (terrain.lakes.some(l => Math.hypot(x + 0.5 - l.x, y + 0.5 - l.z) < l.radius * 1.3)) return;
      const n = noise(x, y, i + 101);
      const rock = scenerySpire(n) || buildRock(n);
      const s = 2.2 + (n % 9) / 8;
      rock.scale.set(s, s * (1.3 + (n % 5) / 10), s);
      rock.rotation.y = (n % 628) / 100;
      rock.position.set(x + 0.5, this.heightAt(x + 0.5, y + 0.5) - 0.6, y + 0.5);
      this.rockGroup.add(rock);
    });
  }

  /* ---------------- economy + building ---------------- */

  get baseUpgradeCost() { return baseUpgradeCost(this.baseLevel); }
  get combatTargets() {
    return ['wave', 'raid'].includes(this.state) ? this.zerglings.concat(this.hives) : this.zerglings;
  }

  isEnemy(target) {
    return !!target && !target.dead && (this.zerglings.includes(target) ||
      (['wave', 'raid'].includes(this.state) && this.hives.includes(target)));
  }

  advanceTarget(unit) {
    const bases = this.hives.filter(h => !h.dead);
    const targets = bases.length ? bases : this.zerglings.filter(z => !z.dead && (!z.flying || unit.spec.targetsAir !== false));
    return targets.reduce((best, target) => !best || unit.distTo(target) < unit.distTo(best) ? target : best, null);
  }

  upgradeBase() {
    if (!['build', 'brief', 'wave', 'raid'].includes(this.state) || this.core.dead || !this.canAfford(this.baseUpgradeCost)) return false;
    this.minerals -= this.baseUpgradeCost;
    this.baseLevel++;
    for (const unit of this.gunners) {
      unit.baseLevel = this.baseLevel;
      unit.applyStats(this.marineUpgrades);
    }
    if (this.scv) {
      const ratio = this.scv.hp / this.scv.maxHp;
      const stats = { hp: 70 };
      applyBaseUpgrade(stats, this.baseLevel);
      this.scv.maxHp = stats.hp;
      this.scv.hp = stats.hp * ratio;
    }
    this.fx.ring({ x: this.core.x, z: this.core.z }, 3, 0xffd36a);
    sfx.upgrade();
    this.emit('change');
    return true;
  }

  get marineUpgrades() { return [...this.armory, ...this.treasureLoot]; }

  get nextArmory() { return ARMORY.find((a) => !this.armory.includes(a)); }

  canAfford(cost) { return this.minerals >= cost; }

  /** Before or during a fight, on open ground, and not on top of a bug (it would be sealed inside). */
  canBuildAt(tx, ty) {
    if (!['build', 'brief', 'wave', 'raid'].includes(this.state)) return false;
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

  /** Specialists join the roster one round at a time. */
  isUnlocked(id) { return this.level >= unlockRound(id); }

  placeGunner(kind, tx, ty) {
    const spec = BUILD[kind];
    if (!spec || !this.isUnlocked(kind) || !this.canBuildAt(tx, ty) || !this.canAfford(spec.cost)) return false;
    const m = new Marine(kind, tx, ty, this.marineUpgrades, this.baseLevel);
    syncEvolutionVisual(m, this);
    const sp = this.grid.spawn;
    m.restYaw = Math.atan2((sp.y + 1) - m.z, (sp.x + 0.5) - m.x);
    m.yaw = m.restYaw;
    m.invested = spec.cost;
    if (!m.flying) this.grid.set(tx, ty, CELL.TOWER, m);
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
    syncEvolutionVisual(b, this);
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
    m.upgrade(this.marineUpgrades);
    this.fx.ring({ x: m.x, z: m.z }, 2.2, 0xffd36a);
    this.fx.sparks({ x: m.x, y: 0.7, z: m.z }, 0, 26, [1, 0.85, 0.4], 5, 6.28);
    this.stage.kick(1.5);
    sfx.upgrade();
    this.emit('change');
    return true;
  }

  awardTreasureBoxes(count, { guaranteedGold = false } = {}) {
    const rewards = [];
    for (let i = 0; i < count; i++) {
      const gold = (guaranteedGold && i === 0) || Math.random() < TREASURE_RULES.goldChance;
      const upgrade = TREASURE[Math.floor(Math.random() * TREASURE.length)];
      const reward = {
        ...upgrade, boxType: gold ? 'gold' : 'silver', earnedLevel: this.level,
        expiresAfterLevel: gold ? null : this.level + TREASURE_RULES.silverRounds
      };
      this.treasureLoot.push(reward);
      rewards.push(reward);
    }
    // Recalculate once: existing, downed and garrisoned Marines all inherit the rewards.
    for (const m of this.gunners) if (m.spec.armory) m.applyStats(this.marineUpgrades);
    if (rewards.length) {
      sfx.upgrade();
      this.emit('treasureApplied', rewards);
      this.emit('change');
    }
    return rewards;
  }

  offerEvolution(bossName) {
    if (this.pendingEvolution || this.state === 'defeat') return;
    this.pendingEvolution = { level: this.level, bossName };
    this.emit('change');
  }

  chooseEvolution(id) {
    if (!this.pendingEvolution || this.state === 'defeat' || !EVOLUTIONS.some(e => e.id === id)) return false;
    this.evolutions[id] = (this.evolutions[id] || 0) + 1;
    this.pendingEvolution = null;
    for (const unit of [...this.gunners, ...this.bunkers]) syncEvolutionVisual(unit, this);
    sfx.unlock();
    this.emit('evolved', { id, rank: this.evolutions[id] });
    this.emit('change');
    return true;
  }

  expireTreasureBoosts() {
    this.treasureLoot = this.treasureLoot.filter(item => item.expiresAfterLevel == null || this.level <= item.expiresAfterLevel);
    for (const m of this.gunners) if (m.spec.armory) m.applyStats(this.marineUpgrades);
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

  /** Spend the normal starting budget on a small squad, then get straight to play. */
  quickDeploy() {
    if (this.state !== 'build' || this.level !== 1 || this.gunners.length) return false;
    const anchor = this.deployAnchor();
    if (!anchor) return false;
    let placed = 0;
    for (let r = 0; r <= 4 && placed < 3; r++) {
      for (let dy = -r; dy <= r && placed < 3; dy++) {
        for (let dx = -r; dx <= r && placed < 3; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.placeGunner('marine', Math.floor(anchor.x) + dx, Math.floor(anchor.y) + dy)) placed++;
        }
      }
    }
    if (!placed) return false;
    this.startWave();
    return true;
  }

  /** Where a fresh squad forms up: the shared approach, a few tiles in front of the base. */
  deployAnchor() {
    const c = this.grid.core;
    const route = this.grid.findPath(this.grid.spawn.x, this.grid.spawn.y, c.x, c.y);
    if (!route?.length) return null;
    // Cover the shared approach, rather than placing the whole squad on one branch.
    return this.grid.spawns.length > 1 ? { x: c.x - 5, y: c.y } : route[Math.max(0, route.length - 9)];
  }

  /**
   * Put last round's army back on the field at the new defense line, promotions included.
   * Costs the normal prices, which the round-end refund already covers. Returns units placed.
   */
  redeployArmy() {
    if (!this.lastArmy?.length || !['build', 'brief', 'wave'].includes(this.state)) return 0;
    const anchor = this.deployAnchor();
    if (!anchor) return 0;
    const ax = Math.floor(anchor.x), ay = Math.floor(anchor.y);
    const spots = [];
    for (let r = 0; r <= 7; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) === r) spots.push([ax + dx, ay + dy]);
        }
      }
    }
    const waiting = [];
    let placed = 0;
    // Dearest first, so a tight budget keeps the units the player invested most in.
    for (const want of this.lastArmy.slice().sort((a, b) => b.invested - a.invested)) {
      const at = spots.findIndex(([x, y]) => this.canBuildAt(x, y));
      const spot = at < 0 ? null : spots.splice(at, 1)[0];
      if (!spot || !this.placeGunner(want.kind, spot[0], spot[1])) { waiting.push(want); continue; }
      const unit = this.gunners[this.gunners.length - 1];
      while (unit.tier < want.tier && unit.upgradeCost != null && this.canAfford(unit.upgradeCost)) {
        this.minerals -= unit.upgradeCost;
        unit.invested += unit.upgradeCost;
        unit.upgrade(this.marineUpgrades);
      }
      placed++;
    }
    this.lastArmy = waiting.length ? waiting : null;
    if (placed) {
      sfx.upgrade();
      this.emit('redeployed', { placed, waiting: waiting.length });
    }
    this.emit('change');
    return placed;
  }

  /* ---------------- supply drops ---------------- */

  spawnCrate() {
    const c = this.grid.core;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 9;
      const tx = Math.floor(c.x + 1 + Math.cos(a) * r), ty = Math.floor(c.y + 1 + Math.sin(a) * r);
      if (!this.grid.inside(tx, ty) || !this.grid.buildable(tx, ty)) continue;
      // It has to be worth a click or a detour: never on top of a waiting unit.
      if (this.gunners.some(u => !u.dead && Math.hypot(u.x - tx - 0.5, u.z - ty - 0.5) < 2.2)) continue;
      const crate = new SupplyCrate(tx, ty, this.level);
      this.crates.push(crate);
      this.world.add(crate.obj);
      sfx.drop();
      this.emit('supply', crate);
      return crate;
    }
    return null;
  }

  collectCrate(crate) {
    if (!crate || crate.dead || !this.crates.includes(crate) || this.state === 'defeat') return false;
    crate.dead = true;
    this.minerals += crate.value;
    const recharge = this.airStrikeCd > 0 && Math.random() < SUPPLY.strikeChance;
    if (recharge) this.airStrikeCd = 0;
    this.fx.ring({ x: crate.x, z: crate.z }, 1.8, 0xffd36a);
    this.fx.sparks({ x: crate.x, y: 0.5, z: crate.z }, 0, 22, [1, 0.85, 0.4], 5, 6.28);
    this.fx.label({ x: crate.x, y: 1.1, z: crate.z }, '+' + crate.value + (recharge ? ' · STRIKE READY' : ''), 'cash');
    sfx.pickup();
    this.emit('supplyCollected', { crate, recharge });
    this.emit('change');
    return true;
  }

  togglePause() {
    if (this.state === 'defeat' || this.pendingEvolution) return;
    this.paused = !this.paused;
    this.emit('change');
  }

  startWave() {
    if (this.state !== 'build') return;
    this.roundCoreDamaged = false;
    this.queue = wavePlan(this.level);
    const mouths = this.grid.spawns.length;
    if (mouths > 1) this.queue.forEach((s, i) => { s.lane = i % mouths; });
    this.spawnTimer = 0;
    this.briefT = 3;
    this.called = false;
    this.state = 'brief';
    this.assault.start();
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
    this.emit('checkpoint');
  }

  onKill(bug) {
    if (bug?.isBoss) this.assault.defeated(bug);
    this.kills++;
    this.score = this.kills;   // your score is simply how many bugs you killed
    this.emit('kill', this.kills);
    this.minerals += ECON.perKill * (bug?.breed?.bounty || 1);
    this.streak = this.time - this.lastKillT <= STREAK.window ? this.streak + 1 : 1;
    this.lastKillT = this.time;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    const tier = STREAK.tiers.find(t => t.at === this.streak);
    if (tier) {
      this.minerals += tier.bonus;
      sfx.streak(STREAK.tiers.indexOf(tier));
      this.emit('streak', { ...tier, streak: this.streak });
    }
    if (this.kills % 6 === 0) voice.say('kill');
    const next = this.nextArmory;
    if (next && this.kills >= next.kills) {
      this.armory.push(next);
      if (next.id === 'stim') this.stimUnlocked = true;
      for (const m of this.gunners) if (m.spec.armory) m.applyStats(this.marineUpgrades);
      sfx.unlock();
      this.emit('unlock', next);
    }
    this.emit('change');
  }

  onCoreDestroyed() {
    this.state = 'defeat';
    this.pendingEvolution = null;
    this.assault.clearMarks();
    this.emit('change');
    this.fx.explosion({ x: this.core.x, y: 1, z: this.core.z }, 3);
    this.stage.kick(9);
    sfx.defeat();
    this.emit('over', false);
  }

  startRaid() {
    if (this.hives.every(h => h.dead)) { this.completeWave(); return; }
    this.state = 'raid';
    this.raidT = HIVE_RAID.duration;
    this.raidEarned = 0;
    this.drama = 1;
    this.focus = null;
    this.assault.clearMarks();
    this.emit('change');
    this.emit('raid');
  }

  completeWave() {
    this.drama = 1;
    this.focus = null;
    const bonus = ECON.waveClearBase + this.level * ECON.waveClearPerWave;
    const prev = this.level;
    const prevName = this.layout.name;
    this.emit('roundCleared', { level: prev, perfect: !this.roundCoreDamaged && this.core.hp === this.core.maxHp });
    // levels never run out: clear one and the next canyon is waiting
    const army = this.gunners.filter(u => !u.dead).map(u => ({ kind: u.kind, tier: u.tier, invested: u.invested }));
    this.lastArmy = army.length ? army : null;
    const refund = this.recoverHardware();
    this.minerals += refund + bonus;
    this.level++;
    this.mapVersion = MAP_VERSION;
    this.expireTreasureBoosts();
    this.loadLevel();
    this.state = 'build';
    sfx.victory();
    this.emit('level');
    for (const b of Object.values(BUILD)) if (b.unlock === this.level) this.emit('unitUnlocked', b);
    this.emit('change');
    this.emit('hold', {
      kicker: `Round ${prev} cleared — Round ${this.level} ready`,
      title: prevName,
      body: `+${bonus} minerals, hardware returned. Unspent minerals carry forward. Round ${this.level} starts automatically in 3 seconds.`
    });
    this.startWave();
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

  get laserReady() { return this.laserCharge >= BASE_LASER.chargeTime; }

  fireLaser(x, z) {
    if (this.paused || !this.laserReady || this.core.dead || !['wave', 'raid'].includes(this.state)) return false;
    const dx = x - this.core.x, dz = z - this.core.z;
    const distance = Math.hypot(dx, dz);
    if (!Number.isFinite(distance) || distance < 0.1) return false;
    const ux = dx / distance, uz = dz / distance;
    const edgeX = ux > 0 ? (this.grid.COLS - this.core.x) / ux : ux < 0 ? -this.core.x / ux : Infinity;
    const edgeZ = uz > 0 ? (this.grid.ROWS - this.core.z) / uz : uz < 0 ? -this.core.z / uz : Infinity;
    const length = Math.min(edgeX, edgeZ);
    this.laserCharge = 0;
    const muzzle = this.core.fireLaser(ux, uz);
    this.fx.laser(muzzle, { x: this.core.x + ux * length, z: this.core.z + uz * length }, BASE_LASER.duration);
    // Resolve the whole line once: no projectile stops at the first enemy.
    for (const target of this.combatTargets.slice()) {
      if (target.dead) continue;
      const tx = target.x - this.core.x, tz = target.z - this.core.z;
      const along = tx * ux + tz * uz;
      const across = Math.abs(tx * uz - tz * ux);
      const radius = target.kind === 'hive' ? 1 : 0.35 * (target.scale || 1);
      if (along < 0 || along > length || across > BASE_LASER.halfWidth + radius) continue;
      target.takeDamage(BASE_LASER.damage, this, Math.atan2(uz, ux));
    }
    sfx.cannon();
    this.stage.kick(4);
    this.emit('change');
    return true;
  }

  get airStrikeReady() { return this.airStrikeCd <= 0; }

  callAirStrike(x, z) {
    if (!this.airStrikeReady) return false;
    if (!['wave', 'brief', 'raid'].includes(this.state)) return false;
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

  /** One press sends every combat unit, including bunker troops, toward enemy bases. */
  commandAdvanceArmy() {
    if (this.state === 'defeat' || this.pendingEvolution) return 0;
    let n = 0;
    for (const unit of this.gunners) {
      if (unit.dead || unit.downed) continue;
      const target = this.advanceTarget(unit);
      if (!target) continue;
      if (unit.bunker) this.eject(unit, true);
      unit.order = { type: 'advance', target };
      unit.target = null;
      unit.chaseT = 0;
      unit.chase(this);
      n++;
    }
    this.focus = null;
    this.emit('change');
    return n;
  }

  /**
   * Move a group. Each unit gets its own open tile around the clicked one so
   * the squad fans out instead of queueing for one square.
   * mode: 'move' ignores bugs on the way, 'amove' stops to shoot.
   */
  commandMove(units, tx, ty, mode = 'move') {
    const flyers = units.filter(u => u.flying && !u.dead);
    let flown = 0;
    for (let i = 0; i < flyers.length; i++) {
      const u = flyers[i];
      const x = Math.max(0, Math.min(this.grid.COLS - 1, tx + (i % 3) - Math.min(1, flyers.length - 1)));
      const y = Math.max(0, Math.min(this.grid.ROWS - 1, ty + Math.floor(i / 3)));
      u.order = mode === 'amove' ? { type: 'amove' } : null;
      if (u.orderMove(x, y, this)) flown++;
    }
    const walkers = units.filter(u => !u.flying).filter((u) => u.kind === 'scv' ? !u.dead : (u.spec?.mobile && !u.dead && !u.downed));
    if (!walkers.length) return flown;
    const taken = new Set();
    for (const m of this.gunners) {
      if (!m.flying && m.driving && !walkers.includes(m)) taken.add(this.grid.idx(m.goalTx, m.goalTy));
    }

    // breadth-first fan-out over open ground from the nearest open tile to the click
    const start = this.grid.nearestOpen(tx, ty, 4, taken);
    if (!start) return flown;
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

    let n = flown;
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
    if (e.kind === 'core') this.roundCoreDamaged = true;
    if ((e._pingT ?? -99) > this.time - 1.4) return;
    e._pingT = this.time;
    this.pings.push({ x: e.x, z: e.z, t: 0 });
    this.lastAlert = { x: e.x, z: e.z };
    this.emit('alert', e);
  }

  /* ---------------- tick ---------------- */

  update(dt) {
    if (this.paused || this.pendingEvolution || this.state === 'defeat') return;
    this.laserCharge = Math.min(BASE_LASER.chargeTime, this.laserCharge + dt);
    if (this.laserCharge >= BASE_LASER.chargeTime - 1e-9) this.laserCharge = BASE_LASER.chargeTime;
    this.time += dt;
    this.updateWater?.(this.time);
    if (this.airStrikeCd > 0) this.airStrikeCd = Math.max(0, this.airStrikeCd - dt);
    for (const p of this.pings) p.t += dt;
    if (this.pings.length && this.pings[0].t > 2.6) this.pings = this.pings.filter((p) => p.t <= 2.6);

    // Finish an expired raid before projectiles can award any late bounty.
    if (this.state === 'raid') {
      this.raidT = Math.max(0, this.raidT - dt);
      if (this.raidT <= 1e-9 || this.hives.every(h => h.dead)) {
        this.completeWave();
        return;
      }
    }
    for (const hive of this.hives) hive.update(dt, this);

    if (this.state === 'brief') {
      const prev = Math.ceil(this.briefT);
      this.briefT -= dt;
      const now = Math.ceil(Math.max(0, this.briefT));
      if (now !== prev && now > 0 && now <= 3) this.emit('count', now);
      if (this.briefT <= 0) {
        // Last peaceful snapshot includes everything built or moved during the countdown.
        this.emit('checkpoint');
        this.state = 'wave';
        this.spawnTimer = 0;
        voice.say('breach');
        for (const sp of this.grid.spawns) this.fx.ring({ x: sp.x + 0.5, z: sp.y + 0.9 }, 2.2, 0xc06bff);
        this.emit('count', 0);
        this.emit('change');
      }
    }

    if (this.state === 'wave') {
      this.assault.update(dt);
      this.spawnTimer += dt;
      while (this.queue.length && this.queue[0].at <= this.spawnTimer) {
        const s = this.queue.shift();
        const mouths = this.grid.spawns;
        const lane = (s.lane || 0) % mouths.length;
        if (this.hives[lane]?.dead) continue;
        const sp = mouths[lane];
        const z = new Zergling(
          sp.x + 0.5 + (Math.random() - 0.5) * 0.28,
          sp.y + 0.85 + (Math.random() - 0.5) * 0.28,
          s.breed, s.hpScale, s.speedScale
        );
        this.zerglings.push(z);
        this.world.add(z.obj);
        this.fx.sparks({ x: z.x, y: 0.3, z: z.z }, 0, 8, [0.7, 0.35, 1], 3, 6.28);
      }
      this.crateT -= dt;
      if (this.crateT <= 0) {
        this.crateT = SUPPLY.interval;
        this.spawnCrate();
      }
    }
    if (this.streak && this.time - this.lastKillT > STREAK.window) this.streak = 0;

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
    for (const crate of this.crates) crate.update(dt, this);
    for (let i = this.crates.length - 1; i >= 0; i--) {
      if (this.crates[i].dead) {
        this.world.remove(this.crates[i].obj);
        this.crates.splice(i, 1);
      }
    }

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
    this.drama = this.state === 'wave' && !this.assault.plan && !this.queue.length && alive === 1 ? 0.38 : 1;
    if (this.focus && this.focus.dead) this.focus = null;

    if (this.state === 'wave' && !this.assault.pending && !this.queue.length && alive === 0) {
      this.startRaid();
    }

    this.fx.update(dt, this.camera, this.viewport);
  }
}
