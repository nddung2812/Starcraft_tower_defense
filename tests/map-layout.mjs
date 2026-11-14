import assert from 'node:assert/strict';
import { carveLevel, attackFronts } from '../src/levels.js';
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

// How far in from its own map edge a cell is, and where it sits across that edge.
const depthFrom = (side, size, c) => side === 'west' ? c.x : side === 'east' ? size - 1 - c.x : side === 'north' ? c.y : size - 1 - c.y;
const acrossFrom = (side, c) => side === 'west' || side === 'east' ? c.y : c.x;
const OPPOSITE = { west: 'east', east: 'west', north: 'south', south: 'north' };

const grid = new Grid();
let checked = 0;
const baseSides = new Set();
for (const seed of [0, 12345, 0xffffffff, 7, 99, 2026]) {
  for (const level of [1,2,3,4,5,6,10,11,15,16,20,21,25,26,30,40,100]) {
    const map = carveLevel(level, seed);
    const size = Math.min(128, 56 + Math.floor((level - 1) / 5) * 16);
    assert.equal(map.cols, size); assert.equal(map.rows, size);
    assert.equal(map.depth.length, size * size);
    const expectedRoutes = level <= 6 ? 2 : level <= 15 ? 3 : 4;
    assert.equal(map.routeCount, expectedRoutes);
    assert.equal(map.spawns.length, expectedRoutes);
    assert.equal(map.paths.length, expectedRoutes);
    // Every hive sits on the edge it attacks from; harder rounds open more sides.
    const fronts = attackFronts(level);
    assert.equal(fronts, level <= 6 ? 1 : level <= 15 ? 2 : level <= 20 ? 3 : 4);
    assert.equal(map.fronts, fronts);
    assert.equal(map.sides.length, expectedRoutes);
    assert.equal(new Set(map.sides).size, fronts, `Expected ${fronts} attack sides at ${level}/${seed}`);
    map.spawns.forEach((s, i) => assert.ok(depthFrom(map.sides[i], size, s) < 6, 'Hive is not on its map edge'));
    const baseDepth = depthFrom(map.sides[0], size, map.core);
    if (fronts === 1) {
      // One front: the base is at the far end, on whichever side the seed picked.
      assert.ok(baseDepth >= size - 6, 'Single-front base must sit at the far end');
      baseSides.add(OPPOSITE[map.sides[0]]);
    } else if (fronts === 4) {
      for (const at of [map.core.x, map.core.y]) assert.ok(at > size * 0.38 && at < size * 0.62, 'Surrounded base must be mid-map');
    } else assert.ok(baseDepth > size * 0.55 && baseDepth < size - 12, 'Flanked base must sit inland');
    assert.deepEqual(map.front, { west: { dx: -1, dy: 0 }, east: { dx: 1, dy: 0 }, north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 } }[map.sides[0]]);
    assert.ok(map.open.every(([x,y]) => x >= 0 && y >= 0 && x < size && y < size));
    assert.deepEqual(map, carveLevel(level, seed), 'Same seed must reproduce routes and obstacles');
    grid.load(map);
    assert.equal(grid.cells.length, size * size);
    assert.equal(grid.COLS, size); assert.equal(grid.ROWS, size);
    assert.equal(grid.inside(size, size - 1), false);
    const halfway = {}, outer = [];
    map.spawns.forEach((spawn, i) => {
      const side = map.sides[i];
      const path = grid.findPath(spawn.x, spawn.y, map.core.x, map.core.y);
      assert.ok(path?.length >= 38, `Blocked or trivially short route at ${level}/${seed}`);
      // Half way in from its edge, each approach is still its own corridor.
      const middle = path.find(c => depthFrom(side, size, c) === Math.floor(depthFrom(side, size, map.core) / 2));
      assert.ok(middle, 'Route skipped the middle of its approach');
      (halfway[side] ||= []).push(acrossFrom(side, middle));
      outer.push(new Set(path.slice(0, Math.floor(path.length / 2)).map(c => c.y * size + c.x)));
      assert.ok(Number.isFinite(grid.field().dist[grid.idx(spawn.x, spawn.y)]));
      assertRockFreeRoute(grid, spawn, map.core);
    });
    for (const rows of Object.values(halfway)) {
      rows.sort((a,b) => a-b);
      assert.ok(rows.slice(1).every((y,i) => y-rows[i] >= 4), 'Attack routes collapsed into one corridor');
    }
    outer.forEach((cells, i) => outer.slice(i + 1).forEach(other =>
      assert.ok([...cells].every(k => !other.has(k)), `Approaches merge far from the base at ${level}/${seed}`)));
    assert.equal(grid.field(), grid.field(), 'Swarm flow field must remain shared/cached');
    assert.equal(grid.field().dist.length, size * size);
    checked++;
  }
}
assert.deepEqual([...baseSides].sort(), ['east', 'north', 'south', 'west'], 'The base should turn up on every side');
// Saved runs from earlier map versions keep every hive in the west and the base in the east.
for (const version of [1, 2, 3]) for (const level of [1, 6, 16, 26]) {
  const map = carveLevel(level, 12345, version), size = map.cols;
  assert.ok(map.spawns.every(s => s.x < 6) && map.core.x >= size - 6, `Version ${version} layout moved`);
  assert.equal(map.fronts, 1); assert.ok(map.sides.every(side => side === 'west'));
}
assert.equal(mapDimensions(1).cols, 56);
assert.equal(mapDimensions(5).cols, 56);
assert.equal(mapDimensions(6).cols, 72);
assert.equal(mapDimensions(1000000).cols, 128);
console.log(`PASS: ${checked} seeded maps; 56→72→88→104→120→128 growth, bases on all four sides, 1→2→3→4 attack fronts, separate routes, reachability, bounds, resized grids and cached flow fields`);
