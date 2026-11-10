import assert from 'node:assert/strict';
import { carveLevel } from '../src/levels.js';
import { Grid } from '../src/grid.js';
import { CELL, mapDimensions } from '../src/config.js';

function assertRockFreeRoute(grid, spawn, core) {
  let here = { x: spawn.x + 0.5, y: spawn.y + 0.85 };
  for (let stretch = 0; stretch < grid.COLS; stretch++) {
    const route = grid.route(Math.floor(here.x), Math.floor(here.y));
    assert.ok(route.length > 1, 'Swarm route ended before the core');
    const first = grid.clearWorldLine(here.x, here.y, route[1].x, route[1].y, true) ? 1 : 0;
    for (let i = first; i < route.length; i++) {
      const end = route[i];
      const steps = Math.ceil(Math.hypot(end.x - here.x, end.y - here.y) * 40);
      if (!steps) { here = end; continue; }
      for (let step = 0; step <= steps; step++) {
        const x = here.x + (end.x - here.x) * step / steps;
        const y = here.y + (end.y - here.y) * step / steps;
        assert.notEqual(grid.get(Math.floor(x), Math.floor(y)), CELL.ROCK,
          `Swarm route crosses rock at ${x.toFixed(2)}, ${y.toFixed(2)}`);
      }
      here = end;
    }
    if (here.cx >= core.x && here.cx < core.x + core.w && here.cy >= core.y && here.cy < core.y + core.h) return;
  }
  assert.fail('Swarm route never reached the core');
}

const corner = new Grid(3, 3);
corner.cells.fill(CELL.OPEN);
corner.core = { x: 2, y: 0, w: 1, h: 1 };
corner.set(2, 1, CELL.ROCK);
assert.notEqual(corner.field().next[corner.idx(1, 1)], corner.idx(2, 0),
  'Swarm flow must not cut diagonally past a rock corner');

const grid = new Grid();
let checked = 0;
for (const seed of [0, 12345, 0xffffffff]) {
  for (const level of [1,2,3,4,5,6,10,11,15,16,20,21,25,26,30,40,100]) {
    const map = carveLevel(level, seed);
    const size = Math.min(128, 56 + Math.floor((level - 1) / 5) * 16);
    assert.equal(map.cols, size); assert.equal(map.rows, size);
    assert.equal(map.depth.length, size * size);
    const expectedRoutes = level <= 6 ? 2 : level <= 15 ? 3 : 4;
    assert.equal(map.routeCount, expectedRoutes);
    assert.equal(map.spawns.length, expectedRoutes);
    assert.equal(map.paths.length, expectedRoutes);
    if (expectedRoutes === 1) assert.equal(map.spawn.y, Math.floor(size / 2));
    assert.ok(map.spawns.every(s => s.x < 6));
    assert.ok(map.core.x >= size - 6);
    assert.ok(map.open.every(([x,y]) => x >= 0 && y >= 0 && x < size && y < size));
    assert.deepEqual(map, carveLevel(level, seed), 'Same seed must reproduce routes and obstacles');
    grid.load(map);
    assert.equal(grid.cells.length, size * size);
    assert.equal(grid.COLS, size); assert.equal(grid.ROWS, size);
    assert.equal(grid.inside(size, size - 1), false);
    const middleRows = [];
    for (const spawn of map.spawns) {
      const path = grid.findPath(spawn.x, spawn.y, map.core.x, map.core.y);
      assert.ok(path?.length, `Blocked route at ${level}/${seed}`);
      const middle = path.find(c => c.x === Math.floor(size / 2));
      assert.ok(middle, 'Route skipped the middle of the map');
      middleRows.push(middle.y);
      assert.ok(Number.isFinite(grid.field().dist[grid.idx(spawn.x, spawn.y)]));
      assertRockFreeRoute(grid, spawn, map.core);
    }
    middleRows.sort((a,b) => a-b);
    assert.ok(middleRows.slice(1).every((y,i) => y-middleRows[i] >= 4), 'Attack routes collapsed into one corridor');
    assert.equal(grid.field(), grid.field(), 'Swarm flow field must remain shared/cached');
    assert.equal(grid.field().dist.length, size * size);
    checked++;
  }
}
assert.equal(mapDimensions(1).cols, 56);
assert.equal(mapDimensions(5).cols, 56);
assert.equal(mapDimensions(6).cols, 72);
assert.equal(mapDimensions(1000000).cols, 128);
console.log(`PASS: ${checked} seeded maps; 56→72→88→104→120→128 growth, separate routes, reachability, bounds, resized grids and cached flow fields`);
