import * as THREE from 'three';
import { EVOLUTION_RULES as R, evolutionPower } from './config.js';

const braceGeo = new THREE.BoxGeometry(0.5, 0.12, 0.16);
const coilGeo = new THREE.TorusGeometry(0.23, 0.045, 5, 14);
const haloGeo = new THREE.RingGeometry(0.8, 0.91, 32).rotateX(-Math.PI / 2);
const gold = new THREE.MeshBasicMaterial({ color: 0xf0b23c });
const cyan = new THREE.MeshBasicMaterial({ color: 0x71e7e0 });
const coral = new THREE.MeshBasicMaterial({ color: 0xff8066, side: THREE.DoubleSide });

export function evolutionDescription(id, rank) {
  const power = evolutionPower(rank);
  if (id === 'siege') return `After ${R.deployTime}s stationary, deploy for +${(R.siegeRange + R.siegeRangeStep * power).toFixed(1)} range and +${R.siegeSplash} blast radius. Move orders pack up automatically.`;
  if (id === 'chain') return `Each shot arcs to ${R.chainHops} other enemies within ${R.chainRadius} tiles, dealing ${Math.round((R.chainDamage + R.chainDamageStep * power) * 100)}% weapon damage per jump. Hits ground and air.`;
  return `Taking damage below 30% bunker health triggers ${R.standFireRate}× garrison fire rate for ${(R.standDuration + R.standDurationStep * power).toFixed(1)}s. ${R.standCooldown}s cooldown. Keep the bunker alive!`;
}

export function packSiege(unit) {
  unit.siegeT = 0;
  unit.siegeDeployed = false;
  if (unit.evolutionVisual && unit.kind === 'tank') unit.evolutionVisual.visible = false;
}

// Additions attach to the unit group, so custom models and promotions keep their effects.
export function syncEvolutionVisual(unit, game) {
  const id = unit.kind === 'tank' ? 'siege' : unit.kind === 'goliath' ? 'chain' : unit.kind === 'bunker' ? 'stand' : null;
  const rank = id ? (game.evolutions[id] || 0) : 0;
  unit.evolutionRank = rank;
  if (!rank || unit.evolutionVisual) return;
  const group = new THREE.Group();
  if (id === 'siege') {
    for (const x of [-0.55, 0.55]) for (const z of [-0.55, 0.55]) {
      const brace = new THREE.Mesh(braceGeo, gold);
      brace.position.set(x, 0.12, z); brace.rotation.y = z > 0 ? -0.65 : 0.65;
      group.add(brace);
    }
    group.visible = false;
  } else if (id === 'chain') {
    for (const x of [-0.35, 0.35]) {
      const coil = new THREE.Mesh(coilGeo, cyan);
      coil.position.set(x, 1.25, 0); group.add(coil);
    }
  } else {
    const halo = new THREE.Mesh(haloGeo, coral);
    halo.position.y = 0.08; group.add(halo);
  }
  unit.obj.add(group);
  unit.evolutionVisual = group;
}

export function updateUnitEvolution(unit, dt, game) {
  syncEvolutionVisual(unit, game);
  if (unit.dead || unit.downed) {
    if (unit.evolutionVisual) unit.evolutionVisual.visible = false;
    packSiege(unit);
    return;
  }
  if (unit.kind === 'goliath' && unit.evolutionVisual) {
    unit.evolutionVisual.visible = true;
    unit.evolutionVisual.rotation.y += dt * 1.5;
  }
  if (unit.kind !== 'tank' || !unit.evolutionRank) return;
  if (unit.driving) { packSiege(unit); return; }
  unit.siegeT = Math.min(R.deployTime, (unit.siegeT || 0) + dt);
  if (!unit.siegeDeployed && unit.siegeT >= R.deployTime) {
    unit.siegeDeployed = true;
    unit.evolutionVisual.visible = true;
    game.fx.ring(unit, 1.5, 0xf0b23c);
    game.fx.label({ x: unit.x, y: 1.4, z: unit.z }, 'SIEGE READY', 'evolution');
  }
}

export function updateBunkerEvolution(bunker, dt, game) {
  syncEvolutionVisual(bunker, game);
  bunker.lastStandT = Math.max(0, (bunker.lastStandT || 0) - dt);
  bunker.lastStandCd = Math.max(0, (bunker.lastStandCd || 0) - dt);
  if (bunker.evolutionVisual) {
    const active = bunker.lastStandT > 0;
    bunker.evolutionVisual.scale.setScalar(active ? 1.15 + Math.sin(game.time * 16) * 0.12 : 1);
  }
}

export function triggerLastStand(bunker, game) {
  const rank = game.evolutions.stand || 0;
  if (!rank || bunker.hp <= 0 || bunker.hp / bunker.maxHp >= R.standThreshold || bunker.lastStandCd > 0) return;
  bunker.lastStandT = R.standDuration + R.standDurationStep * evolutionPower(rank);
  bunker.lastStandCd = R.standCooldown;
  for (const unit of bunker.garrison) unit.cooldown = 0;
  game.fx.ring(bunker, 2.2, 0xff8066);
  game.fx.label({ x: bunker.x, y: 1.5, z: bunker.z }, 'LAST STAND · 3× FIRE', 'evolution');
}

export function chainLightning(tracer, game) {
  const rank = game.evolutions.chain || 0;
  if (!rank || tracer.owner?.kind !== 'goliath') return;
  const visited = new Set([tracer.target]);
  let previous = tracer.target;
  for (let hop = 0; hop < R.chainHops; hop++) {
    let next = null, distance = R.chainRadius;
    for (const enemy of game.combatTargets) {
      if (enemy.dead || visited.has(enemy)) continue;
      const d = Math.hypot(enemy.x - previous.x, enemy.z - previous.z);
      if (d <= distance) { distance = d; next = enemy; }
    }
    if (!next) break;
    visited.add(next);
    game.fx.lightning(previous, next);
    next.takeDamage(tracer.damage * (R.chainDamage + R.chainDamageStep * evolutionPower(rank)), game,
      Math.atan2(next.z - previous.z, next.x - previous.x));
    previous = next;
  }
}
