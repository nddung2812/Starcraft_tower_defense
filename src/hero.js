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
const shapes = {
  blade: new THREE.BoxGeometry(1, 0.03, 0.085).translate(0.5, 0, 0),
  edge: new THREE.BoxGeometry(1, 0.012, 0.11).translate(0.5, 0, 0),
  hilt: new THREE.BoxGeometry(0.06, 0.05, 0.2),
  grip: new THREE.BoxGeometry(0.16, 0.04, 0.04).translate(-0.08, 0, 0),
  cape: new THREE.PlaneGeometry(0.46, 0.78).translate(0, -0.39, 0).rotateY(Math.PI / 2),
  pad: new THREE.SphereGeometry(0.14, 10, 8).scale(1, 0.75, 1.1),
  plate: new THREE.BoxGeometry(0.1, 0.36, 0.34),
  coil: new THREE.TorusGeometry(0.075, 0.018, 6, 16).rotateY(Math.PI / 2),
  orb: new THREE.IcosahedronGeometry(0.09, 0),
  drone: new THREE.OctahedronGeometry(0.12, 0),
  slash: new THREE.RingGeometry(0.55, 1.4, 24, 1, -1.15, 2.3).rotateX(-Math.PI / 2),
  aura: new THREE.RingGeometry(0.66, 0.76, 36).rotateX(-Math.PI / 2),
  shield: new THREE.SphereGeometry(0.95, 18, 12),
  beam: new THREE.CylinderGeometry(0.1, 0.22, 5, 10, 1, true).translate(0, 2.5, 0),
  gem: new THREE.OctahedronGeometry(0.2, 0),
  halo: new THREE.RingGeometry(0.38, 0.48, 28).rotateX(-Math.PI / 2)
};
const STEEL = new THREE.MeshStandardMaterial({ color: 0xaab4bc, metalness: 0.7, roughness: 0.35 });
const CAPE = new THREE.MeshStandardMaterial({ color: 0x9c1f26, roughness: 0.8, side: THREE.DoubleSide });
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
    this.bladeArm = null;
    this.slashMark = new THREE.Mesh(shapes.slash, new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    this.slashMark.position.y = 0.62;
    this.slashMark.visible = false;
    this.aura = new THREE.Mesh(shapes.aura, soft(0xff8a2a, 0.75));
    this.aura.position.y = 0.03;
    this.shieldBall = new THREE.Mesh(shapes.shield, soft(0xffd98a, 0.28));
    this.shieldBall.position.y = 0.7;
    this.shieldBall.visible = false;
    this.orbit = new THREE.Group();
    this.orbit.position.y = 1.12;
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
    this.hp = Math.min(this.stats.hp, this.stats.hp * ratio);
  }

  get attackDamage() { return Math.max(1, Math.round(this.stats.damage * (this.strike || 1))); }

  /** Charging a bug it was ordered to attack: it closes to blade reach instead of stopping at gun range. */
  charging() {
    const t = this.order?.type === 'attack' ? this.order.target : null;
    return !!t && !t.flying && t.kind !== 'hive' && t !== this.noCharge;
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

  inReach(bug) { return !bug.flying && this.distTo(bug) <= HERO.melee.reach + girth(bug); }

  fire(game) {
    const t = this.target;
    if (this.silenceT > 0 || !game.isEnemy(t)) return;
    this.strike = Math.random() * 100 < this.gear.crit ? HERO.critMultiplier : 1;
    if (this.inReach(t)) this.slash(t, game);
    else { super.fire(game); this.afterShot(t, game); }
    this.strike = 1;
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
    super.takeDamage(amount, game, fromAngle);
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
    const arm = this.bladeArm;
    this.swing = Math.max(0, this.swing - dt / 0.24);
    if (this.swing > 0) {
      const p = 1 - this.swing;
      arm.rotation.set(0, 1.3 - 2.6 * p * p * (3 - 2 * p), -0.12);
      this.slashMark.material.opacity = Math.sin(p * Math.PI) * 0.85;
    } else {
      this.slashMark.visible = false;
      arm.rotation.y += (0.35 - arm.rotation.y) * Math.min(1, dt * 9);
      arm.rotation.z += (-0.95 - arm.rotation.z) * Math.min(1, dt * 9);
    }
    const lean = this.driving ? -0.4 : -0.1;
    this.capeMesh.rotation.z += (lean + Math.sin(game.time * 3.2) * 0.05 - this.capeMesh.rotation.z) * Math.min(1, dt * 6);
    this.orbit.rotation.y += dt * 2.2;
    this.aura.scale.setScalar(1 + Math.sin(game.time * 3) * 0.05);
    this.shieldBall.visible = this.shieldT > 0;
    if (this.shieldBall.visible) this.shieldBall.scale.setScalar(1 + Math.sin(game.time * 14) * 0.04);
  }

  /** What the hero wears shows on the model: every slot changes something you can see. */
  dress() {
    if (this.kit) this.model.remove(this.kit);
    this.orbit.clear();
    this.droneMesh = null;
    const worn = Hero.profile.worn, kit = this.kit = new THREE.Group();

    this.capeMesh = new THREE.Mesh(shapes.cape, CAPE);
    this.capeMesh.position.set(-0.2, 1.0, 0);
    kit.add(this.capeMesh);

    // The blade, longer and brighter with better steel.
    const sword = worn.blade, edge = sword ? tone(sword.rarity) : 0x9fd8ff;
    const length = sword ? { magic: 0.72, rare: 0.82, legendary: 0.98 }[sword.rarity] : 0.6;
    const arm = this.bladeArm = new THREE.Group();
    arm.position.set(0.12, 0.72, -0.3);
    arm.rotation.set(0, 0.35, -0.95);
    const steel = new THREE.Mesh(shapes.blade, STEEL), line = new THREE.Mesh(shapes.edge, glow(edge));
    steel.scale.x = line.scale.x = length;
    arm.add(steel, line, new THREE.Mesh(shapes.hilt, glow(GOLD)), new THREE.Mesh(shapes.grip, STEEL));
    kit.add(arm);
    this.slashMark.material.color.setHex(edge);

    if (worn.weapon) {
      const color = tone(worn.weapon.rarity);
      for (const x of [0.72, 0.86, 1.0]) {
        const coil = new THREE.Mesh(shapes.coil, glow(color));
        coil.position.set(x, 1.0, 0);
        kit.add(coil);
      }
    }
    if (worn.armor) {
      const plate = glow(tone(worn.armor.rarity));
      for (const side of [-1, 1]) {
        const pad = new THREE.Mesh(shapes.pad, plate);
        pad.position.set(0, 1.0, side * 0.27);
        kit.add(pad);
      }
      const chest = new THREE.Mesh(shapes.plate, plate);
      chest.position.set(0.16, 0.78, 0);
      kit.add(chest);
    }
    if (worn.relic) {
      const drone = worn.relic.power === 'drone';
      const mesh = new THREE.Mesh(drone ? shapes.drone : shapes.orb, glow(tone(worn.relic.rarity)));
      mesh.position.set(drone ? 0.9 : 0.42, drone ? 0.25 : 0, 0);
      this.orbit.add(mesh);
      if (drone) this.droneMesh = mesh;
    }
    this.aura.userData.on = Object.values(worn).some(i => i?.rarity === 'legendary');
    this.model.add(kit);
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
    this.plate.position.y = 1.32;
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
