// Optional layer. Air strike ground fire: every bomb that lands leaves a patch of flame that burns
// ground enemies standing in it. Patches overlap without stacking, so an enemy burns at one rate
// however many it stands in. The core reaches this only through `game.groundFire?.…`, so a missing
// file costs the flames and nothing else. Tuning is `AIR_STRIKE.fire` in config.
import * as THREE from 'three';
import { AIR_STRIKE } from './config.js';

const SPEC = AIR_STRIKE.fire;
const FLAMES_PER_SECOND = 70;    // for one patch
const SMOKE_PER_SECOND = 3;
const ROCK_HEIGHT = 0.35;        // fire stays on the canyon floor: no flames floating on the mountainside
const SETTLED = 1e-6;            // what repeated subtraction leaves of a spent timer

let glowShape = null;

/** A disc that is bright in the middle and fades to nothing at its rim. Shared by every patch. */
function glowGeometry() {
  if (glowShape) return glowShape;
  glowShape = new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2);
  const count = glowShape.attributes.position.count;
  const colours = new Float32Array(count * 3);
  colours.set([1, 0.34, 0.05]);  // the centre vertex; the rim stays black, which adds no light
  glowShape.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  return glowShape;
}

export class GroundFire {
  constructor(game) {
    this.game = game;
    this.fires = [];
    this.heat = new WeakMap();   // damage owed to each enemy, paid out in whole points
  }

  ignite(x, z) {
    const glow = new THREE.Mesh(glowGeometry(), new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false, fog: false
    }));
    glow.position.set(x, 0.045, z);
    glow.scale.setScalar(SPEC.radius * 1.2);
    this.game.scene.add(glow);
    this.fires.push({ x, z, life: SPEC.seconds, age: 0, flames: 0, smoke: 0, seed: Math.random() * 6.28, glow });
  }

  update(dt) {
    if (!this.fires.length) return;
    this.burn(dt);
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      this.draw(fire, dt);
      fire.age += dt;
      fire.life -= dt;
      if (fire.life <= SETTLED) { this.remove(fire); this.fires.splice(i, 1); }
    }
  }

  /** Armour is added back so the flames deal their stated damage to everything. */
  burn(dt) {
    const g = this.game;
    for (const bug of g.combatTargets.slice()) {
      if (bug.dead || bug.flying) continue;
      if (!this.fires.some(f => Math.hypot(bug.x - f.x, bug.z - f.z) <= SPEC.radius)) continue;
      const owed = (this.heat.get(bug) || 0) + SPEC.dps * dt;
      const whole = Math.floor(owed);
      this.heat.set(bug, owed - whole);
      if (whole > 0) bug.takeDamage(whole + (bug.armor || 0), g, 0, true);
      if (Math.random() < dt * 7) {
        g.fx.burning(bug.x, bug.kind === 'hive' ? 0.6 : 0.3, bug.z, bug.kind === 'hive' ? 2.2 : Math.max(0.8, Math.min(2, bug.scale || 1)), 2);
      }
    }
  }

  draw(fire, dt) {
    const fx = this.game.fx;
    const strength = Math.min(1, fire.age / 0.15) * Math.min(1, fire.life);
    fire.glow.material.opacity = strength * (0.5 + Math.sin(fire.age * 17 + fire.seed) * 0.08);
    fire.flames += FLAMES_PER_SECOND * Math.min(1, fire.life) * dt;
    for (; fire.flames >= 1; fire.flames--) {
      const spot = this.spot(fire);
      if (spot) fx.burning(spot.x, spot.y + 0.06, spot.z, 1.3, 1);
    }
    fire.smoke += SMOKE_PER_SECOND * Math.min(1, fire.life) * dt;
    for (; fire.smoke >= 1; fire.smoke--) {
      const spot = this.spot(fire);
      if (!spot) continue;
      fx.spawn(spot.x, spot.y + 0.5, spot.z, (Math.random() - 0.5) * 0.5, 1.2 + Math.random() * 0.8, (Math.random() - 0.5) * 0.5,
        1.2 + Math.random() * 0.7, 0.45 + Math.random() * 0.25, [0.17, 0.15, 0.14],
        { dark: true, drag: 0.9, gravity: 0.5, grow: 0.7, peak: 0.34, turb: 2.5 });
    }
  }

  /** A random point on the patch's floor, or nothing if that point is up on the rock. */
  spot(fire) {
    const angle = Math.random() * Math.PI * 2, reach = SPEC.radius * Math.sqrt(Math.random());
    const x = fire.x + Math.cos(angle) * reach, z = fire.z + Math.sin(angle) * reach;
    const y = this.game.heightAt?.(x, z) || 0;
    return y > ROCK_HEIGHT ? null : { x, y, z };
  }

  remove(fire) {
    this.game.scene.remove(fire.glow);
    fire.glow.material.dispose();
  }

  clear() {
    for (const fire of this.fires) this.remove(fire);
    this.fires.length = 0;
  }
}

export function installGroundFire(game) {
  game.groundFire = new GroundFire(game);
  return game.groundFire;
}
