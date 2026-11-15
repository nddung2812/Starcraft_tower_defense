import * as THREE from 'three';
import { MAW, CELL } from './config.js';
import { Zergling } from './entities.js';

const ease = (k) => k * k * (3 - 2 * k);
/** Ground units out in the open. Aircraft, bunker troops and a tank up on the rock or in a lake are out of its reach. */
const exposed = (u, g) => !u.dead && !u.downed && !u.flying && !u.bunker && u.spec?.mobile && !u.offGround?.(g);

/**
 * The worm itself: it never marches. It rises where the ambush marked, holds whatever it
 * swallowed for a few seconds, then dives. Kill it while it is up and the unit comes back out.
 */
export class TunnelMaw extends Zergling {
  constructor(x, z, hpScale) {
    super(x, z, 'maw', hpScale, 1);
    this.isMaw = true;
    this.meal = null;
    this.phase = 'rise';
    this.phaseT = 0;
    this.holdT = MAW.empty;
    this.gulpT = 0;
    this.sway = Math.random() * 6.28;
    this.model.scale.setScalar(this.scale);
    this.pose(0, 1);
  }

  /** k: how far out of the ground (0 buried, 1 fully up). open: how wide the jaws gape. */
  pose(k, open) {
    const { rings, jaws, height } = this.model.userData.maw;
    this.model.userData.torso.position.y = -height * (1 - k);
    const lean = Math.sin(this.sway) * 0.07, roll = Math.cos(this.sway * 0.7) * 0.05;
    for (const ring of rings) { ring.rotation.z = lean; ring.rotation.x = roll; }
    for (const jaw of jaws) jaw.rotation.x = 0.12 + open * 0.95;
    // the swallowed unit shows as a lump travelling down the trunk
    rings.forEach((ring, i) => {
      const lump = this.meal ? Math.max(0, 1 - Math.abs(i - (rings.length - 1 - this.gulpT * 5)) * 0.7) : 0;
      ring.scale.setScalar(1 + lump * 0.35);
    });
  }

  /** Take a unit off the field. It is alive in there until the worm dives. */
  gulp(unit, game) {
    this.meal = unit;
    this.gulpT = 0;
    this.holdT = MAW.hold;
    if (unit.isPlaced(game)) game.grid.clear(unit.tx, unit.ty);
    unit.swallowed = true;
    unit.target = null; unit.order = null; unit.driving = false; unit.waypoints = null;
    game.gunners.splice(game.gunners.indexOf(unit), 1);
    game.world.remove(unit.obj);
    if (game.focus === unit) game.focus = null;
    game.emit('deselect', unit);
    game.lastAlert = { x: this.x, z: this.z };
    game.pings.push({ x: this.x, z: this.z, t: 0 });
    game.fx.label({ x: this.x, y: 2.6, z: this.z }, `${unit.spec.info.name.toUpperCase()} SWALLOWED · KILL THE MAW`, 'boss-spell');
    game.sfx.gulp();
    game.voice.say('down');
    game.emit('mawGulp', unit);
    game.emit('change');
  }

  /** Spit the unit back onto the nearest free tile, worse for wear. */
  release(game) {
    const unit = this.meal;
    if (!unit) return;
    this.meal = null;
    unit.swallowed = false;
    const spot = game.grid.nearestOpen(Math.floor(this.x), Math.floor(this.z), 3);
    unit.x = spot ? spot.x + 0.5 : this.x;
    unit.z = spot ? spot.y + 0.5 : this.z;
    unit.obj.position.set(unit.x, 0, unit.z);
    unit.obj.visible = true;
    game.gunners.push(unit);
    game.world.add(unit.obj);
    if (spot) {
      unit.tx = spot.x; unit.ty = spot.y;
      game.grid.set(spot.x, spot.y, CELL.TOWER, unit);
    } else { unit.driving = true; unit.halt(game); }   // no room: walk to the nearest tile
    game.fx.ring({ x: unit.x, z: unit.z }, 1.2, 0x5ef08a);
    game.fx.label({ x: unit.x, y: 1.5, z: unit.z }, 'FREED', 'evolution');
    game.emit('mawFreed', unit);
    game.emit('change');
  }

  update(dt, game) {
    this.hurt = Math.max(0, this.hurt - dt * 4);
    this.sway += dt * 2.1;
    if (this.dead) {
      // killed: the trunk goes limp and slides back down its hole
      this.deathT += dt;
      const k = Math.min(1, this.deathT / 1.2);
      this.pose(1 - k * 0.85, 0.6);
      this.model.rotation.z = k * 0.35;
      this.bar.group.visible = false;
      return;
    }
    this.phaseT += dt;
    if (this.meal) {
      this.gulpT = Math.min(1, this.gulpT + dt * 0.5);
      this.meal.hp = Math.max(1, this.meal.hp - this.meal.maxHp * MAW.digest * dt);
    }
    if (this.phase === 'rise') {
      const k = Math.min(1, this.phaseT / MAW.rise);
      this.pose(ease(k), this.meal ? 1 - k : 1);       // jaws snap shut on the way up
      if (k >= 1) { this.phase = 'up'; this.phaseT = 0; }
    } else if (this.phase === 'up') {
      this.holdT -= dt;
      this.pose(1, this.meal ? 0.05 + Math.abs(Math.sin(this.phaseT * 3)) * 0.08 : 0.45 + Math.sin(this.phaseT * 4) * 0.3);
      if (this.holdT <= 0) { this.phase = 'dive'; this.phaseT = 0; game.sfx.rumble(); }
    } else {
      const k = Math.min(1, this.phaseT / MAW.dive);
      this.pose(1 - ease(k), 0.1);
      if (Math.random() < dt * 30) game.fx.smoke({ x: this.x, y: 0.15, z: this.z }, 1, [0.5, 0.42, 0.33]);
      if (k >= 1) this.vanish(game);
    }
    this.spawnT = 1;
    this.bar.set(this.hp / this.maxHp, game.camera);
  }

  /** Gone underground for good. Whatever it still holds goes with it. No kill is scored. */
  vanish(game) {
    const lost = this.meal;
    this.meal = null;
    if (lost) {
      lost.dead = true;
      game.fx.label({ x: this.x, y: 1.4, z: this.z }, `${lost.spec.info.name.toUpperCase()} LOST`, 'dmg-self');
      game.emit('mawTook', lost);
      game.emit('change');
    }
    this.escaped = true;
    this.dead = true;
    this.deathT = 99;            // the wave loop sweeps it up on its next pass
    this.obj.visible = false;
    if (game.focus === this) game.focus = null;
  }

  takeDamage(amount, game, fromAngle, quiet = false) {
    const wasDead = this.dead;
    super.takeDamage(amount, game, fromAngle, quiet);
    if (this.dead && !wasDead) this.release(game);
  }
}

/** Picks the victims, shows where the ground is about to give way, and raises the worm. */
export class MawAmbush {
  constructor(game) { this.game = game; this.marks = []; this.timer = MAW.first; }

  reset() {
    this.clearMarks();
    this.timer = MAW.first;
  }

  clearMarks() {
    for (const mark of this.marks) this.removeMark(mark);
    this.marks.length = 0;
  }

  removeMark(mark) {
    this.game.scene.remove(mark.mesh);
    mark.mesh.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }

  get interval() {
    return Math.max(MAW.minInterval, MAW.interval - (this.game.level - MAW.firstRound) * MAW.intervalStep);
  }

  update(dt) {
    const g = this.game;
    if (g.state !== 'wave') { if (this.marks.length) this.clearMarks(); return; }
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const mark = this.marks[i];
      mark.t -= dt;
      const k = 1 - Math.max(0, mark.t) / MAW.telegraph;
      mark.ring.scale.setScalar(1 - k * 0.25 + Math.sin(g.time * 22) * 0.03);
      mark.ring.material.opacity = 0.45 + k * 0.5;
      mark.pit.scale.setScalar(0.2 + k * 0.8);
      if (Math.random() < dt * (8 + k * 30)) {
        const a = Math.random() * 6.28, r = Math.random() * MAW.radius;
        g.fx.spawn(mark.x + Math.cos(a) * r, 0.08, mark.z + Math.sin(a) * r, 0, 0.9 + Math.random(), 0, 0.5, 0.14, [0.55, 0.45, 0.34], { drag: 1.5, grow: 0.6 });
      }
      if (mark.t <= 0) {
        this.removeMark(mark);
        this.marks.splice(i, 1);
        this.erupt(mark);
      }
    }
    if (g.level < MAW.firstRound) return;
    // Only while the wave is still on: a worm must never be the thing that keeps a cleared round open.
    if (!g.queue.length && !g.zerglings.some((z) => !z.dead && !z.isMaw)) return;
    this.timer -= dt;
    if (this.timer > 0 || this.marks.length || g.zerglings.some((z) => z.isMaw && !z.dead)) return;
    const prey = g.gunners.filter(u => exposed(u, g));
    if (!prey.length) { this.timer = 3; return; }
    this.timer = this.interval;
    for (let n = g.level >= MAW.pairRound ? 2 : 1; n > 0 && prey.length; n--) {
      this.mark(prey.splice(Math.floor(Math.random() * prey.length), 1)[0]);
    }
    if (!g.mawSeen) { g.mawSeen = true; g.emit('maw'); }
  }

  /** The warning: the ground under a unit starts to churn. Move it and the worm comes up empty. */
  mark(unit) {
    const g = this.game, r = MAW.radius;
    const mesh = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.86, r, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    const pit = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 28).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x1c120b, transparent: true, opacity: 0.55, depthWrite: false }));
    mesh.add(ring, pit);
    mesh.position.set(unit.x, 0.14, unit.z);
    g.scene.add(mesh);
    this.marks.push({ x: unit.x, z: unit.z, t: MAW.telegraph, mesh, ring, pit });
    g.pings.push({ x: unit.x, z: unit.z, t: 0 });
    g.lastAlert = { x: unit.x, z: unit.z };
    g.fx.label({ x: unit.x, y: 1.7, z: unit.z }, 'GROUND SHAKING · MOVE!', 'boss-spell');
    g.sfx.rumble();
    g.stage.kick(1.2);
  }

  erupt(mark) {
    const g = this.game;
    const maw = new TunnelMaw(mark.x, mark.z, 1 + (g.level - 1) * 0.10);
    g.zerglings.push(maw);
    g.world.add(maw.obj);
    const at = { x: mark.x, y: 0.2, z: mark.z };
    g.fx.smoke(at, 16, [0.52, 0.43, 0.33]);
    g.fx.chunks(at, 9, 0x6a5a48);
    g.fx.decal(mark.x, mark.z, MAW.radius * 0.9, 0x24170f, 0.55);
    g.fx.ring(at, MAW.radius * 1.3, 0xffb347);
    g.stage.kick(3.2);
    g.sfx.mawErupt();
    let victim = null, best = MAW.radius;
    for (const unit of g.gunners) {
      const d = Math.hypot(unit.x - mark.x, unit.z - mark.z);
      if (exposed(unit, g) && d <= best) { victim = unit; best = d; }
    }
    if (victim) maw.gulp(victim, g);
    else g.fx.label({ x: mark.x, y: 2.4, z: mark.z }, 'MAW MISSED', 'evolution');
    g.emit('mawErupt', maw);
  }
}
