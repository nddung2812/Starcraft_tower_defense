import { CELL } from './config.js';

const BUCKET = 2;

/** Snapshot local neighbours once per simulation tick, rather than scanning the entire army per bug. */
export function indexSwarm(enemies) {
  const buckets = new Map();
  for (const enemy of enemies) {
    if (enemy.dead || enemy.air) continue;
    const key = `${Math.floor(enemy.x / BUCKET)},${Math.floor(enemy.z / BUCKET)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(enemy);
  }
  return buckets;
}

function neighbours(unit, game) {
  if (!game.swarmIndex) return game.zerglings;
  const out = [], cx = Math.floor(unit.x / BUCKET), cz = Math.floor(unit.z / BUCKET);
  for (let z = cz - 1; z <= cz + 1; z++) for (let x = cx - 1; x <= cx + 1; x++) {
    const bucket = game.swarmIndex.get(`${x},${z}`);
    if (bucket) out.push(...bucket);
  }
  return out;
}

/** Stable personal drift and local avoidance: each creature picks a slightly different approach. */
export function packHeading(unit, px, pz, dt, game) {
  unit.packTime = (unit.packTime || 0) + dt;
  const dx = px - unit.x, dz = pz - unit.z, distance = Math.hypot(dx, dz);
  if (distance < 0.001) return { x: 0, z: 0, distance };
  const fx = dx / distance, fz = dz / distance;
  const phase = unit.packPhase;
  // Slow, continuous changes instead of random direction changes every frame.
  // Taper near waypoints so a creature can still arrive precisely at a tight bend.
  const room = Math.min(1, Math.max(0, (distance - 0.35) / 2));
  const drift = (Math.sin(phase) * 0.42 + Math.sin(unit.packTime * 1.5 + phase) * 0.25) * room * Math.min(1, 3 / distance);
  let sx = 0, sz = 0;
  for (const other of neighbours(unit, game)) {
    if (other === unit || other.dead || other.air || !!other.flying !== !!unit.flying) continue;
    let ox = unit.x - other.x, oz = unit.z - other.z;
    let d = Math.hypot(ox, oz);
    const space = Math.min(1.35, 0.7 + (unit.scale + other.scale) * 0.25);
    if (d >= space) continue;
    if (d < 0.001) { ox = Math.cos(phase); oz = Math.sin(phase); d = 1; }
    const strength = Math.max(0.1, 1 - d / space);
    sx += ox / d * strength; sz += oz / d * strength;
  }
  // Prefer passing beside a slower neighbour over backing up into the next creature.
  const side = Math.max(-1.1, Math.min(1.1, (-fz * sx + fx * sz) * 1.8));
  const forward = Math.max(0.35, 1 + (fx * sx + fz * sz) * 0.55);
  let x = fx * forward - fz * (drift + side), z = fz * forward + fx * (drift + side);
  const length = Math.hypot(x, z);
  x /= length; z /= length;
  return { x, z, distance };
}

/** Sweep the whole step (including corners) so steering never tunnels through terrain. */
export function swarmStepClear(unit, x, z, grid) {
  if (unit.flying) return x >= 0 && z >= 0 && x < grid.COLS && z < grid.ROWS;
  const blocked = (tx, tz) => !grid.inside(tx, tz) || ![CELL.OPEN, CELL.SPAWN].includes(grid.get(tx, tz));
  // A defender can be built on a bug: let it leave its current tile without trapping it.
  const startX = Math.floor(unit.x), startZ = Math.floor(unit.z);
  const obstacle = (tx, tz) => (tx !== startX || tz !== startZ) && blocked(tx, tz);
  return !obstacle(Math.floor(x), Math.floor(z))
    && grid.clearWorldLine(unit.x, unit.z, x, z, false, obstacle);
}
