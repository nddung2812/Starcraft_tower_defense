// Optional layer. Boss siege magic: while a boss lives it takes turns calling a Firestorm and an
// Earthquake down on your buildings. The core reaches this only through `game.bossMagic?.…`, so a
// missing file costs the two spells and nothing else. Tuning is `BOSS_MAGIC` in config, and the
// damage of each boss is in `milestonePlan()`.
import * as THREE from 'three';
import { BOSS_MAGIC as SPEC } from './config.js';

const TAU = Math.PI * 2;
const ROCK_HEIGHT = 0.35;     // flames stay on the canyon floor
const FLAMES_PER_SECOND = 60;
const CORE_REACH = 1;         // the Ridge Relay is wider than one tile
const LOOK = {
  fire: { name: 'FIRESTORM', colour: 0xff5a14, status: 'FIRESTORM · pull troops out and repair after the flames' },
  quake: { name: 'EARTHQUAKE', colour: 0xffb347, status: 'EARTHQUAKE · buildings at the centre take the worst of it' }
};

const ringShape = new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2);
const discShape = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const meteorShape = new THREE.IcosahedronGeometry(0.6, 1);
const meteorSkin = new THREE.MeshBasicMaterial({ color: 0xffc46a, toneMapped: false });

/** A disc that is bright in the middle and fades to nothing at its rim. Shared by every patch. */
const glowShape = (() => {
  const shape = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  const colours = new Float32Array(shape.attributes.position.count * 3);
  colours.set([1, 0.3, 0.04]);   // the centre vertex; the black rim adds no light
  shape.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return shape;
})();

/** Jagged cracks running out from the centre, one unit long, as flat tapering strips. */
function crackShape() {
  const points = [];
  const spokes = 11;
  for (let s = 0; s < spokes; s++) {
    let angle = (s / spokes) * TAU + Math.random() * 0.4;
    const length = 0.6 + Math.random() * 0.4, steps = 6;
    let r = 0.06, x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    for (let i = 0; i < steps; i++) {
      angle += (Math.random() - 0.5) * 0.9;
      r = length * (i + 1) / steps;
      const nx = Math.cos(angle) * r, nz = Math.sin(angle) * r;
      const wide = 0.028 * (1 - i / steps), thin = 0.028 * (1 - (i + 1) / steps);
      const dx = nx - x, dz = nz - z, d = Math.hypot(dx, dz) || 1, sx = -dz / d, sz = dx / d;
      points.push(
        x + sx * wide, 0, z + sz * wide, nx + sx * thin, 0, nz + sz * thin, x - sx * wide, 0, z - sz * wide,
        x - sx * wide, 0, z - sz * wide, nx + sx * thin, 0, nz + sz * thin, nx - sx * thin, 0, nz - sz * thin
      );
      x = nx; z = nz;
    }
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
}

const flat = (shape, colour, opacity, extra = {}) => new THREE.Mesh(shape, new THREE.MeshBasicMaterial({
  color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, ...extra
}));

export class BossMagic {
  constructor(game) {
    this.game = game;
    this.casts = [];
    this.fires = [];
    this.scars = [];
    this.boss = null;
    this.timer = 0;
    this.turn = 0;
    this.burnT = 0;
  }

  update(dt, assault) {
    if (assault.boss !== this.boss) {
      this.boss = assault.boss;
      this.timer = assault.plan.magicInterval * SPEC.firstDelay;
      this.turn = 0;
    }
    this.timer -= dt;
    if (this.timer <= 0) {
      this.cast(assault);
      this.timer = assault.plan.magicInterval * (assault.enraged ? SPEC.enraged : 1);
    }
    for (const cast of [...this.casts]) {
      this.advance(cast, dt, assault.plan);
      if (this.game.state !== 'wave') return;
    }
    this.burn(dt, assault.plan);
    if (this.game.state !== 'wave') return;
    this.drawFires(dt);
    this.fadeScars(dt);
  }

  /** The thickest knot of buildings, bunkers counting most; troops if nothing is built, then the base. */
  aim(radius) {
    const g = this.game;
    const built = [...g.bunkers, ...g.walls].filter(b => !b.dead);
    let best = null, bestScore = 0;
    for (const b of built) {
      if (this.casts.some(c => Math.hypot(c.x - b.x, c.z - b.z) < c.radius)) continue;
      let score = 0;
      for (const other of built) {
        if (Math.hypot(other.x - b.x, other.z - b.z) <= radius) score += other.kind === 'bunker' ? SPEC.bunkerWeight : 1;
      }
      if (score > bestScore) { bestScore = score; best = b; }
    }
    if (best) return best;
    const troops = g.gunners.filter(u => !u.dead && !u.downed && !u.bunker && !u.flying);
    return troops.length ? troops[this.turn % troops.length] : g.core;
  }

  cast(assault) {
    const g = this.game, kind = SPEC.order[this.turn++ % SPEC.order.length];
    const spell = SPEC[kind], look = LOOK[kind], at = this.aim(spell.radius);
    const mark = new THREE.Group();
    const ring = flat(ringShape, look.colour, 0.9), fill = flat(discShape, look.colour, 0.12);
    mark.add(fill, ring);
    mark.position.set(at.x, 0.14, at.z);
    mark.scale.setScalar(spell.radius);
    g.scene.add(mark);
    this.casts.push({ kind, x: at.x, z: at.z, radius: spell.radius, t: spell.telegraph, mark, ring, fill, rumble: 0, pulse: 0, gap: 0, meteor: null, scar: null });
    assault.status = look.status;
    assault.boss.swing = 1;
    g.fx.ring({ x: assault.boss.x, z: assault.boss.z }, 3.2, look.colour);
    g.fx.label({ x: at.x, y: 2, z: at.z }, `${look.name} INCOMING`, 'boss-spell');
    g.pings.push({ x: at.x, z: at.z, t: 0 });
    g.sfx.alarm();
    if (kind === 'quake') g.sfx.rumble();
  }

  advance(cast, dt, plan) {
    cast.t -= dt;
    const beat = 0.5 + Math.sin(cast.t * 15) * 0.5;
    cast.ring.material.opacity = 0.55 + beat * 0.45;
    cast.fill.material.opacity = 0.08 + beat * 0.12;
    if (cast.kind === 'fire') this.advanceFire(cast, plan);
    else this.advanceQuake(cast, dt, plan);
  }

  advanceFire(cast, plan) {
    const g = this.game, fall = SPEC.fire.fall;
    if (cast.t <= fall && !cast.meteor) {
      cast.meteor = new THREE.Mesh(meteorShape, meteorSkin);
      g.scene.add(cast.meteor);
      g.sfx.airstrikeDrop();
    }
    if (cast.meteor) {
      const k = Math.max(0, cast.t / fall);
      const x = cast.x + k * 5, y = 0.3 + k * 13, z = cast.z - k * 3;
      cast.meteor.position.set(x, y, z);
      cast.meteor.rotation.x += 0.4;
      g.fx.burning(x, y, z, 2.6, 5);
    }
    if (cast.t > 0) return;
    this.finish(cast);
    g.fx.explosion({ x: cast.x, y: 0.3, z: cast.z }, 1.5);
    for (let i = 0; i < 9; i++) {      // scattered scorch marks rather than one black disc
      const a = Math.random() * TAU, r = cast.radius * 0.85 * Math.sqrt(Math.random());
      g.fx.decal(cast.x + Math.cos(a) * r, cast.z + Math.sin(a) * r, 0.35 + Math.random() * 0.4, 0x140a06, 0.32);
    }
    g.stage.kick(5);
    g.sfx.airstrike();
    this.fires.push(this.ignite(cast));
    this.strike(cast.x, cast.z, cast.radius, plan.fireImpact, SPEC.fire.troops);
  }

  ignite(cast) {
    const glow = new THREE.Mesh(glowShape, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false
    }));
    glow.position.set(cast.x, 0.05, cast.z);
    glow.scale.setScalar(cast.radius * 1.2);
    this.game.scene.add(glow);
    return { x: cast.x, z: cast.z, radius: cast.radius, life: SPEC.fire.seconds, age: 0, flames: 0, glow };
  }

  advanceQuake(cast, dt, plan) {
    const g = this.game, spec = SPEC.quake;
    if (cast.t > 0) {
      cast.rumble -= dt;
      if (cast.rumble > 0) return;
      cast.rumble = 0.3;
      g.stage.kick(0.7);
      const a = Math.random() * TAU, r = cast.radius * Math.sqrt(Math.random());
      g.fx.smoke({ x: cast.x + Math.cos(a) * r, y: 0.15, z: cast.z + Math.sin(a) * r }, 4, [0.42, 0.34, 0.26]);
      return;
    }
    cast.gap -= dt;
    if (cast.gap > 0) return;
    cast.gap = spec.gap;
    cast.pulse++;
    const reach = cast.radius * cast.pulse / spec.pulses;
    this.crack(cast, cast.pulse / spec.pulses);
    g.fx.ring({ x: cast.x, z: cast.z }, reach, 0xffb347);
    g.fx.chunks({ x: cast.x, y: 0.2, z: cast.z }, 8, 0x6b5240);
    g.stage.kick(3.5);
    g.sfx.mawErupt();
    const last = cast.pulse >= spec.pulses;
    if (last) this.finish(cast);
    this.strike(cast.x, cast.z, reach, plan.quakeDamage, spec.troops);
  }

  /** The ground splits a little further with every pulse, and glows while it is fresh. */
  crack(cast, share) {
    if (!cast.scar) {
      const shape = crackShape();
      const dark = flat(shape, 0x120a06, 0.85), glow = flat(shape, 0xff7a24, 0.9, { blending: THREE.AdditiveBlending });
      glow.position.y = 0.004;
      const group = new THREE.Group();
      group.add(dark, glow);
      group.position.set(cast.x, 0.04, cast.z);
      this.game.scene.add(group);
      cast.scar = { group, shape, dark, glow, life: SPEC.quake.scar };
      this.scars.push(cast.scar);
    }
    cast.scar.group.scale.setScalar(cast.radius * share);
    cast.scar.glow.material.opacity = 0.9;
  }

  /** Buildings take it all, the base and ground troops a share. Bunker crews and aircraft are safe. */
  strike(x, z, radius, damage, troops) {
    const g = this.game;
    const from = (e) => Math.atan2(e.z - z, e.x - x);
    const near = (e, reach = radius) => Math.hypot(e.x - x, e.z - z) <= reach;
    for (const b of [...g.bunkers, ...g.walls]) {
      if (!b.dead && near(b)) b.takeDamage(damage, g, from(b));
    }
    for (const u of [...g.gunners, g.scv]) {
      if (!u || u.dead || u.downed || u.bunker || u.flying || !near(u)) continue;
      u.takeDamage(Math.max(1, Math.round(damage * troops)), g, from(u));
    }
    if (g.core && !g.core.dead && near(g.core, radius + CORE_REACH)) {
      g.core.takeDamage(Math.max(1, Math.round(damage * SPEC.coreShare)), g, from(g.core));
    }
  }

  /** One burn every tick for whatever stands in the flames: overlapping patches do not stack. */
  burn(dt, plan) {
    if (!this.fires.length) { this.burnT = 0; return; }
    this.burnT += dt;
    if (this.burnT < SPEC.fire.tick) return;
    this.burnT -= SPEC.fire.tick;
    const g = this.game, damage = plan.fireDps * SPEC.fire.tick;
    const inFire = (e, reach = 0) => this.fires.some(f => Math.hypot(e.x - f.x, e.z - f.z) <= f.radius + reach);
    for (const b of [...g.bunkers, ...g.walls]) {
      if (b.dead || !inFire(b)) continue;
      b.takeDamage(Math.max(1, Math.round(damage)), g, 0);
      g.fx.burning(b.x, 0.7, b.z, 1.8, 6);
    }
    for (const u of [...g.gunners, g.scv]) {
      if (!u || u.dead || u.downed || u.bunker || u.flying || !inFire(u)) continue;
      u.takeDamage(Math.max(1, Math.round(damage * SPEC.fire.troops)), g, 0);
      g.fx.burning(u.x, 0.4, u.z, 1.2, 3);
    }
    if (g.core && !g.core.dead && inFire(g.core, CORE_REACH)) {
      g.core.takeDamage(Math.max(1, Math.round(damage * SPEC.coreShare)), g, 0);
    }
  }

  drawFires(dt) {
    const g = this.game;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      fire.age += dt;
      fire.life -= dt;
      const strength = Math.min(1, fire.age / 0.15) * Math.min(1, Math.max(0, fire.life));
      fire.glow.material.opacity = strength * (0.62 + Math.sin(fire.age * 17) * 0.1);
      fire.flames += FLAMES_PER_SECOND * strength * dt;
      for (; fire.flames >= 1; fire.flames--) {
        const a = Math.random() * TAU, r = fire.radius * Math.sqrt(Math.random());
        const x = fire.x + Math.cos(a) * r, z = fire.z + Math.sin(a) * r, y = g.heightAt?.(x, z) || 0;
        if (y <= ROCK_HEIGHT) g.fx.burning(x, y + 0.06, z, 1.5, 1);
      }
      if (fire.life <= 0) { this.dropFire(fire); this.fires.splice(i, 1); }
    }
  }

  fadeScars(dt) {
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const scar = this.scars[i];
      scar.life -= dt;
      scar.glow.material.opacity = Math.max(0, scar.glow.material.opacity - dt * 0.8);
      scar.dark.material.opacity = 0.85 * Math.min(1, Math.max(0, scar.life) / 2);
      if (scar.life <= 0) { this.dropScar(scar); this.scars.splice(i, 1); }
    }
  }

  /** The warning is over. A meteor and a marker go; the cracks stay behind on their own. */
  finish(cast) {
    this.casts = this.casts.filter(c => c !== cast);
    this.dropCast(cast);
  }

  dropCast(cast) {
    this.game.scene.remove(cast.mark);
    cast.ring.material.dispose();
    cast.fill.material.dispose();
    if (cast.meteor) this.game.scene.remove(cast.meteor);
  }

  dropFire(fire) {
    this.game.scene.remove(fire.glow);
    fire.glow.material.dispose();
  }

  dropScar(scar) {
    this.game.scene.remove(scar.group);
    scar.shape.dispose();
    scar.dark.material.dispose();
    scar.glow.material.dispose();
  }

  clear() {
    for (const cast of this.casts) this.dropCast(cast);
    for (const fire of this.fires) this.dropFire(fire);
    for (const scar of this.scars) this.dropScar(scar);
    this.casts = [];
    this.fires = [];
    this.scars = [];
    this.boss = null;
    this.burnT = 0;
  }
}

export function installBossMagic(game) {
  game.bossMagic = new BossMagic(game);
  return game.bossMagic;
}
