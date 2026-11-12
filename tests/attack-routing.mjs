import assert from 'node:assert/strict';
import { Grid } from '../src/grid.js';
import { CELL } from '../src/config.js';

// Independent exhaustive shortest-distance oracle, including disconnected firing positions.
for (let seed = 1; seed <= 50; seed++) {
  const grid = new Grid(12, 10);
  let state = seed;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  for (let y = 0; y < 10; y++) for (let x = 0; x < 12; x++) if (random() > 0.28) grid.set(x, y, CELL.OPEN);
  grid.set(1, 4, CELL.TOWER, {});
  const target = { x: 10.5, z: 5.5 }, range = 2.7;
  const distance = new Map([['1,4', 0]]), queue = [[1, 4, 0]];
  const pass = (x, y) => [CELL.OPEN, CELL.TOWER].includes(grid.get(x, y));
  while (queue.length) {
    queue.sort((a, b) => a[2] - b[2]);
    const [x, y, d] = queue.shift();
    if (d > distance.get(`${x},${y}`)) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy || !pass(x + dx, y + dy)) continue;
      if (dx && dy && (!pass(x + dx, y) || !pass(x, y + dy))) continue;
      const key = `${x + dx},${y + dy}`, next = d + Math.hypot(dx, dy);
      if (next >= (distance.get(key) ?? Infinity)) continue;
      distance.set(key, next); queue.push([x + dx, y + dy, next]);
    }
  }
  let best = Infinity;
  for (const [key, d] of distance) {
    const [x, y] = key.split(',').map(Number);
    if (grid.get(x, y) === CELL.OPEN && Math.hypot(x + .5 - target.x, y + .5 - target.z) <= range) best = Math.min(best, d);
  }
  const route = grid.attackRoute(1, 4, target.x, target.z, range);
  if (!Number.isFinite(best)) { assert.equal(route, null); continue; }
  assert.ok(route);
  let cost = 0;
  for (let i = 1; i < route.length; i++) {
    assert.ok(grid.clearWalkLine(route[i - 1].x, route[i - 1].y, route[i].x, route[i].y));
    cost += Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y);
  }
  assert.ok(Math.abs(cost - best) < 1e-8, `Seed ${seed}: ${cost} != ${best}`);
}
const open = new Grid(12, 10); open.cells.fill(CELL.OPEN);
assert.equal(open.attackRoute(1, 4, 3.5, 4.5, 3).length, 1, 'Already in range stays put');
assert.equal(open.attackRoute(1, 4, 10.5, 4.5, 3).at(-1).cx, 7, 'Stops at nearest firing position');
console.log('PASS: shortest firing routes match exhaustive distances on 50 maps; already-in-range and stopping distance.');
