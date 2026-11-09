import assert from 'node:assert/strict';
import { carveLevel } from '../src/levels.js';
import { Grid } from '../src/grid.js';
import { mapDimensions } from '../src/config.js';

const grid = new Grid();
let checked = 0;
for (const seed of [0, 12345, 0xffffffff]) {
  for (const level of [1,2,3,4,5,6,10,11,15,16,20,21,25,26,30,40,100]) {
    const map = carveLevel(level, seed);
    const size = Math.min(128, 56 + Math.floor((level - 1) / 5) * 16);
    assert.equal(map.cols, size); assert.equal(map.rows, size);
    assert.equal(map.depth.length, size * size);
    const expectedRoutes = level <= 5 ? 1 : level <= 15 ? 2 : 3;
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
