// Optional layer. Medic mines: a unit whose spec carries `mines` (only the Medic) scatters a few
// proximity mines over the open ground around the tile it is first placed on. A ground bug that
// walks onto one sets it off. The core reaches this only through `game.minefield?.…`, so a missing
// file costs the mines and nothing else. Tuning is `MINES` in config.
import * as THREE from 'three';
import { MINES } from './config.js';

const TEAM = 0x7dffb0;
let kit = null;

/** One set of geometry and materials for every mine: never dispose or recolour them per mine. */
function parts() {
  return kit ||= {
    body: new THREE.CylinderGeometry(0.17, 0.23, 0.09, 10),
    lamp: new THREE.SphereGeometry(0.06, 8, 6),
    ring: new THREE.RingGeometry(0.34, 0.39, 24).rotateX(-Math.PI / 2),
    shell: new THREE.MeshStandardMaterial({ color: 0x2b3238, roughness: 0.7, metalness: 0.3, flatShading: true }),
    on: new THREE.MeshBasicMaterial({ color: 0xff4a3a }),
    off: new THREE.MeshBasicMaterial({ color: 0x4a1512 }),
    mark: new THREE.MeshBasicMaterial({ color: TEAM, transparent: true, opacity: 0.55, depthWrite: false })
  };
}

function buildMine() {
  const p = parts(), obj = new THREE.Group();
  const body = new THREE.Mesh(p.body, p.shell);
  body.position.y = 0.045;
  const lamp = new THREE.Mesh(p.lamp, p.on);
  lamp.position.y = 0.1;
  const ring = new THREE.Mesh(p.ring, p.mark);
  ring.position.y = 0.025;
  obj.add(body, lamp, ring);
  obj.userData = { lamp, ring };
  return obj;
}

/** How far a bug's body reaches past its centre, so a Behemoth trips a mine it is standing over. */
const girth = (bug) => 0.3 * (bug.scale || 1);

export class Minefield {
  constructor(game) {
    this.game = game;
    this.mines = [];
  }

  /** Called once when a unit is placed: one that carries mines throws them onto free tiles around it. */
  deployed(unit) {
    const spec = unit.spec?.mines;
    if (!spec) return [];
    const grid = this.game.grid, laid = [];
    for (let attempt = 0; attempt < 80 && laid.length < spec.count; attempt++) {
      const a = Math.random() * Math.PI * 2, r = spec.near + Math.random() * (spec.far - spec.near);
      const tx = Math.floor(unit.x + Math.cos(a) * r), ty = Math.floor(unit.z + Math.sin(a) * r);
      if (!grid.buildable(tx, ty) || this.mines.some(m => !m.dead && m.tx === tx && m.ty === ty)) continue;
      laid.push(this.lay(tx + 0.5, ty + 0.5, unit, spec, false));
    }
    return laid;
  }

  lay(x, z, owner, spec = MINES, settled = true) {
    const mine = {
      kind: 'mine', x, z, tx: Math.floor(x), ty: Math.floor(z), owner, spec, dead: false,
      t: settled ? spec.arm : 0, armed: settled, from: owner && !settled ? { x: owner.x, z: owner.z } : { x, z },
      blink: Math.random() * 2, obj: buildMine()
    };
    mine.obj.position.set(mine.from.x, settled ? 0 : 0.5, mine.from.z);
    mine.obj.userData.ring.visible = settled;
    this.mines.push(mine);
    this.game.world.add(mine.obj);
    return mine;
  }

  /** Unexploded mines a unit laid. */
  count(unit) { return this.mines.filter(m => !m.dead && m.owner === unit).length; }

  update(dt) {
    const g = this.game;
    for (const mine of this.mines) {
      if (mine.dead) continue;
      mine.t += dt;
      const ud = mine.obj.userData;
      if (!mine.armed) {
        // Thrown from the Medic's hands: a short arc, then it settles and arms.
        const k = Math.min(1, mine.t / mine.spec.arm);
        mine.obj.position.set(
          mine.from.x + (mine.x - mine.from.x) * k,
          0.5 * (1 - k) + Math.sin(k * Math.PI) * 0.9,
          mine.from.z + (mine.z - mine.from.z) * k
        );
        mine.obj.rotation.x = (1 - k) * 5;
        if (k < 1) continue;
        mine.armed = true;
        mine.obj.position.set(mine.x, 0, mine.z);
        mine.obj.rotation.x = 0;
        ud.ring.visible = true;
        g.fx.ring(mine, 0.7, TEAM);
      }
      ud.lamp.material = (mine.t + mine.blink) % 1.4 < 0.22 ? parts().on : parts().off;
      for (const bug of g.zerglings) {
        if (bug.dead || bug.flying) continue;
        if (Math.hypot(bug.x - mine.x, bug.z - mine.z) > mine.spec.trigger + girth(bug)) continue;
        this.detonate(mine);
        break;
      }
    }
    this.sweep();
  }

  detonate(mine) {
    if (mine.dead) return;
    const g = this.game, spec = mine.spec, at = { x: mine.x, y: 0.3, z: mine.z };
    mine.dead = true;
    g.fx.explosion(at, 0.75);
    g.fx.ring(at, spec.blast, TEAM);
    g.fx.decal(mine.x, mine.z, spec.blast * 0.5, 0x1a130d, 0.5);
    g.fx.chunks(at, 3, 0x5a4a3a);
    g.sfx.cannonHit(mine);
    g.stage.kick(1.3);
    // The full charge reaches every ground enemy in the blast; aircraft fly over it.
    for (const bug of g.combatTargets.slice()) {
      if (bug.dead || bug.flying) continue;
      if (Math.hypot(bug.x - mine.x, bug.z - mine.z) > spec.blast + girth(bug)) continue;
      bug.takeDamage(spec.damage, g, Math.atan2(bug.z - mine.z, bug.x - mine.x));
    }
    g.emit('mine', mine);
  }

  /** Salvaging a unit takes its unexploded mines with it, so selling and rebuying lays no free field. */
  recall(unit) {
    for (const mine of this.mines) if (mine.owner === unit) mine.dead = true;
    this.sweep();
  }

  sweep() {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      if (!this.mines[i].dead) continue;
      this.game.world.remove(this.mines[i].obj);
      this.mines.splice(i, 1);
    }
  }

  clear() {
    for (const mine of this.mines) this.game.world.remove(mine.obj);
    this.mines = [];
  }

  /** Checkpoint field: where each mine lies and which unit (by index, -1 for none) laid it. */
  capture() {
    return this.mines.filter(m => !m.dead).map(m => ({ x: m.x, z: m.z, unit: this.game.gunners.indexOf(m.owner) }));
  }

  restore(list) {
    this.clear();
    for (const m of list || []) {
      const owner = this.game.gunners[m.unit] || null;
      this.lay(m.x, m.z, owner, owner?.spec.mines || MINES, true);
    }
  }
}

export function installMines(game) {
  game.minefield = new Minefield(game);
  return game.minefield;
}
