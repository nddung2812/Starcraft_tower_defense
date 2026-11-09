import * as THREE from 'three';
import { milestonePlan } from './config.js';
import { Zergling } from './entities.js';

/** Existing creature animation/model contract, with a unique crown and boss stats. */
export class MilestoneBoss extends Zergling {
  constructor(x, z, plan) {
    super(x, z, 'warrior', 1, 1);
    this.isBoss = true;
    this.breed = { ...this.breed, name: plan.name, role: 'Milestone boss', hp: plan.hp, armor: plan.armor, damage: plan.damage, speed: plan.speed, bounty: 15, aggro: 4.5 };
    this.maxHp = this.hp = plan.hp;
    this.damage = plan.damage;
    this.armor = plan.armor;
    this.speed = plan.speed;
    this.scale = plan.scale;
    const crown = new THREE.Mesh(
      new THREE.TorusGeometry(0.7, 0.065, 6, 32).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff684b, transparent: true, opacity: 0.9 })
    );
    crown.position.y = 1.5;
    this.model.add(crown);
    this.crown = crown;
  }
}

export class MilestoneAssault {
  constructor(game) { this.game = game; this.marks = []; }

  reset() {
    this.clearMarks();
    this.plan = milestonePlan(this.game.level);
    this.boss = null;
    this.pending = false;
    this.elapsed = 0;
    this.strikeT = this.plan?.strikeInterval || 0;
    this.reinforceT = this.plan?.reinforcementInterval || 0;
    this.enraged = false;
    this.cleared = false;
    this.pulse = 0;
    this.status = this.plan ? 'Prepare your line. Spread out before the bombardment.' : '';
  }

  start() {
    if (!this.plan) return;
    this.pending = true;
    this.status = 'BOSS INBOUND · contact in 6 seconds';
    this.game.sfx.alarm();
  }

  removeMark(mark) {
    this.game.scene.remove(mark.mesh);
    mark.mesh.geometry.dispose();
    mark.mesh.material.dispose();
  }
  clearMarks() {
    for (const mark of this.marks) this.removeMark(mark);
    this.marks.length = 0;
  }

  spawnBoss() {
    const g = this.game, sp = g.grid.spawns[0];
    this.boss = new MilestoneBoss(sp.x + 0.5, sp.y + 0.85, this.plan);
    g.zerglings.push(this.boss);
    g.world.add(this.boss.obj);
    this.pending = false;
    this.status = 'Focus the boss. Red circles mark incoming impacts.';
    g.fx.ring({ x: this.boss.x, z: this.boss.z }, 3.5, 0xff684b);
    g.stage.kick(4);
    g.sfx.screech();
    g.lastAlert = { x: this.boss.x, z: this.boss.z };
    g.pings.push({ ...g.lastAlert, t: 0 });
    g.emit('change');
  }

  telegraph() {
    const g = this.game;
    const troops = g.gunners.filter(m => !m.dead && !m.downed && !m.bunker && !m.flying);
    // Rotate targets so spreading out and moving the targeted squad both matter.
    const start = this.pulse++;
    const count = Math.min(this.plan.tier >= 3 ? 3 : this.plan.tier >= 2 ? 2 : 1, Math.max(1, troops.length));
    for (let i = 0; i < count; i++) {
      const prey = troops[(start + i) % Math.max(1, troops.length)] || g.core;
      const radius = this.plan.strikeRadius;
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(radius * 0.9, radius, 48).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xff4d39, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide })
      );
      mesh.position.set(prey.x, 0.12 + i * 0.01, prey.z);
      g.scene.add(mesh);
      this.marks.push({ x: prey.x, z: prey.z, radius, t: this.plan.telegraph, mesh });
      g.pings.push({ x: prey.x, z: prey.z, t: 0 });
    }
    this.status = 'BOMBARDMENT · move out of the red circles!';
    g.sfx.alarm();
  }

  detonate(mark) {
    const g = this.game;
    g.fx.explosion({ x: mark.x, y: 0.25, z: mark.z }, mark.radius);
    g.stage.kick(4);
    g.sfx.hitFlesh();
    // Copy: damage may remove structures and eject their garrisons.
    for (const unit of [...g.gunners, ...g.walls, ...g.bunkers, g.scv, g.core]) {
      if (!unit || unit.dead || unit.downed || unit.bunker || unit.flying) continue;
      if (Math.hypot(unit.x - mark.x, unit.z - mark.z) <= mark.radius) unit.takeDamage(this.plan.strikeDamage, g, 0);
    }
  }

  reinforce() {
    const g = this.game;
    const alive = g.zerglings.filter(z => !z.dead).length;
    const count = Math.min(this.plan.reinforcements, Math.max(0, 180 - alive));
    for (let i = 0; i < count; i++) {
      g.queue.push({ at: g.spawnTimer + 0.2 + i * 0.35, breed: this.plan.tier >= 2 && i % 3 === 0 ? 'hopper' : 'zergling',
        hpScale: 1 + (g.level - 1) * 0.12, speedScale: 1.25, lane: i % g.grid.spawns.length });
    }
    g.queue.sort((a, b) => a.at - b.at);
    if (count) this.status = 'REINFORCEMENTS · keep the boss under fire.';
  }

  defeated(bug) {
    if (bug !== this.boss || this.cleared) return;
    const g = this.game;
    this.cleared = true;
    this.clearMarks();
    g.minerals += this.plan.reward;
    g.airStrikeCd = 0;
    const boxes = this.plan.treasureMin + Math.floor(Math.random() * (this.plan.treasureMax - this.plan.treasureMin + 1));
    const rewards = g.awardTreasureBoxes(boxes, { guaranteedGold: this.plan.hard });
    this.status = `BOSS DOWN · +${this.plan.reward} minerals · ${boxes} upgrades auto-applied · air strike recharged.`;
    g.fx.explosion({ x: bug.x, y: 0.8, z: bug.z }, 3);
    g.stage.kick(7);
    g.sfx.victory();
    g.emit('bossDown', { level: g.level, name: this.plan.name, boxes, rewards });
    g.emit('change');
  }

  update(dt) {
    if (!this.plan || this.game.state !== 'wave' || this.cleared) return;
    this.elapsed += dt;
    if (this.pending && this.elapsed >= 6) this.spawnBoss();
    if (!this.boss || this.boss.dead) return;
    if (!this.enraged && this.boss.hp <= this.boss.maxHp * 0.5) {
      this.enraged = true;
      this.boss.speed *= 1.35;
      this.boss.damage = Math.round(this.boss.damage * 1.3);
      this.boss.breed.damage = this.boss.damage;
      this.boss.breed.speed = this.boss.speed;
      this.strikeT = Math.min(this.strikeT, 2);
      this.status = 'ENRAGED · faster attacks. Keep moving!';
      this.game.sfx.alarm();
      this.game.stage.kick(3);
    }
    this.boss.crown.rotation.y += dt * 2;
    this.strikeT -= dt;
    this.reinforceT -= dt;
    if (this.strikeT <= 0) {
      this.telegraph();
      this.strikeT = this.plan.strikeInterval * (this.enraged ? 0.65 : 1);
    }
    if (this.reinforceT <= 0) {
      this.reinforce();
      this.reinforceT = this.plan.reinforcementInterval * (this.enraged ? 0.75 : 1);
    }
    for (const mark of [...this.marks]) {
      mark.t -= dt;
      mark.mesh.material.opacity = 0.4 + (Math.sin(mark.t * 14) + 1) * 0.3;
      if (mark.t <= 0) {
        this.marks = this.marks.filter(m => m !== mark);
        this.removeMark(mark);
        this.detonate(mark);
        if (!this.marks.length) this.status = this.enraged ? 'ENRAGED · bombardments accelerate. Keep moving!' : 'Impact resolved. Reposition and focus the boss.';
        if (this.game.state !== 'wave') break;
      }
    }
  }
}
