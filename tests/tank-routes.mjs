import assert from 'node:assert/strict';
import { Grid } from '../src/grid.js';
import { CELL, UNITS, mapDimensions } from '../src/config.js';
import { carveLevel } from '../src/levels.js';

// The Hammer's all-terrain routing: grid.driveSearch() against an independent exhaustive search,
// then the behaviour that matters on real maps. Run with `node tests/tank-routes.mjs`.
const off = UNITS.tank.offroad;
assert.ok(off && off.rock > 0 && off.rock < 1 && off.water > 0 && off.water < off.rock && off.climb > 0, 'Tank off-road tuning');
for (const kind of Object.keys(UNITS)) if (kind !== 'tank') assert.equal(UNITS[kind].offroad, undefined, `${kind} stays on the canyon floor`);

/** Travel time of a route, priced the way the tuning describes it rather than by calling the search. */
function routeTime(grid, route, start) {
  const pace = (x, y) => {
    if (x === start.x && y === start.y) return Math.min(grid.drivePace(x, y, off), 1.4);
    return grid.drivePace(x, y, off);
  };
  let t = 0;
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1], b = route[i], dx = b.cx - a.cx, dy = b.cy - a.cy;
    assert.ok(Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (dx || dy), 'Routes step to a neighbouring tile');
    assert.ok(Number.isFinite(pace(b.cx, b.cy)), `Route enters an undrivable tile ${b.cx},${b.cy}`);
    if (dx && dy) assert.ok(Number.isFinite(pace(a.cx + dx, a.cy)) && Number.isFinite(pace(a.cx, a.cy + dy)), 'No cutting a solid corner');
    const climb = Math.abs(grid.ground.height[grid.idx(b.cx, b.cy)] - grid.ground.height[grid.idx(a.cx, a.cy)]) * off.climb;
    t += (Math.hypot(dx, dy) + climb) * (pace(a.cx, a.cy) + pace(b.cx, b.cy)) / 2;
  }
  return t;
}

/** Plain O(n²) Dijkstra over the same rules: every cell's best time from the start. */
function allTimes(grid, sx, sy) {
  const n = grid.COLS * grid.ROWS, time = new Array(n).fill(Infinity), seen = new Array(n).fill(false);
  const pace = (x, y) => x === sx && y === sy ? Math.min(grid.drivePace(x, y, off), 1.4) : grid.drivePace(x, y, off);
  time[grid.idx(sx, sy)] = 0;
  for (;;) {
    let cur = -1;
    for (let i = 0; i < n; i++) if (!seen[i] && time[i] < (cur < 0 ? Infinity : time[cur])) cur = i;
    if (cur < 0) break;
    seen[cur] = true;
    const x = cur % grid.COLS, y = Math.floor(cur / grid.COLS);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!Number.isFinite(pace(nx, ny))) continue;
      if (dx && dy && (!Number.isFinite(pace(x + dx, y)) || !Number.isFinite(pace(x, y + dy)))) continue;
      const next = grid.idx(nx, ny);
      const climb = Math.abs(grid.ground.height[next] - grid.ground.height[cur]) * off.climb;
      const t = time[cur] + (Math.hypot(dx, dy) + climb) * (pace(x, y) + pace(nx, ny)) / 2;
      if (t < time[next]) time[next] = t;
    }
  }
  return time;
}

// 1. Random terrain: open floor, rock of varying height, lakes, boulders, walls and squadmates.
let crossed = 0;
for (let seed = 1; seed <= 60; seed++) {
  const cols = 14, rows = 11, grid = new Grid(cols, rows);
  let state = seed * 7919;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  const height = [], solid = [];
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const r = random();
    if (r < 0.45) grid.set(x, y, CELL.OPEN);
    else if (r < 0.5) grid.set(x, y, CELL.WALL, {});
    else if (r < 0.55) grid.set(x, y, CELL.TOWER, {});
    else if (r < 0.62) solid.push([x, y]);
    height[y * cols + x] = grid.get(x, y) === CELL.ROCK ? (r > 0.9 ? 0.05 : 0.4 + random() * 4) : 0;
  }
  grid.set(1, 5, CELL.TOWER, {});
  grid.set(12, 5, CELL.OPEN);
  height[5 * cols + 1] = height[5 * cols + 12] = 0;
  const heightAt = (x, z) => height[Math.floor(z) * cols + Math.floor(x)];
  grid.setTerrain(heightAt, [{ x: 7, z: 5.5, radius: 20 }], solid, 0.23);
  const times = allTimes(grid, 1, 5);

  const route = grid.driveRoute(1, 5, 12, 5, off);
  const best = times[grid.idx(12, 5)];
  if (!Number.isFinite(best)) assert.equal(route, null, `Seed ${seed}: no route exists`);
  else {
    assert.ok(route && route[0].cx === 1 && route.at(-1).cx === 12 && route.at(-1).cy === 5, `Seed ${seed}: route reaches the tile`);
    assert.ok(Math.abs(routeTime(grid, route, { x: 1, y: 5 }) - best) < 1e-6, `Seed ${seed}: move route is the quickest`);
    for (let i = 1; i < route.length; i++) {
      assert.ok(grid.clearDriveLine(route[i - 1].x, route[i - 1].y, route[i].x, route[i].y, off), `Seed ${seed}: each leg can be driven`);
    }
    if (route.some(p => grid.get(p.cx, p.cy) === CELL.ROCK)) crossed++;
  }

  const target = { x: 12.5, z: 9.5 }, range = 3.1;
  let bestShot = Infinity;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const firing = (x === 1 && y === 5) || grid.get(x, y) === CELL.OPEN;
    if (firing && Math.hypot(x + 0.5 - target.x, y + 0.5 - target.z) <= range) bestShot = Math.min(bestShot, times[grid.idx(x, y)]);
  }
  const attack = grid.driveAttackRoute(1, 5, target.x, target.z, range, off);
  if (!Number.isFinite(bestShot)) assert.equal(attack, null, `Seed ${seed}: no firing position exists`);
  else {
    const end = attack.at(-1);
    assert.ok(Math.hypot(end.x - target.x, end.y - target.z) <= range && grid.get(end.cx, end.cy) === CELL.OPEN, `Seed ${seed}: ends on a free tile in range`);
    assert.ok(Math.abs(routeTime(grid, attack, { x: 1, y: 5 }) - bestShot) < 1e-6, `Seed ${seed}: attack route is the quickest`);
  }

  let bestHome = Infinity;
  for (let i = 0; i < cols * rows; i++) if (grid.cells[i] === CELL.OPEN) bestHome = Math.min(bestHome, times[i]);
  const home = grid.driveHome(1, 5, off);
  if (!Number.isFinite(bestHome)) assert.equal(home, null);
  else assert.ok(Math.abs(routeTime(grid, home, { x: 1, y: 5 }) - bestHome) < 1e-6 && grid.get(home.at(-1).cx, home.at(-1).cy) === CELL.OPEN, `Seed ${seed}: parks on the quickest free tile`);
}
assert.ok(crossed >= 15, `Routes should cross rock on many random maps (${crossed})`);

// 2. A canyon that doubles back round a ridge: over the top when that is quicker, round when it is not.
function horseshoe(ridge, lake = false) {
  const grid = new Grid(21, 15);
  for (let y = 1; y <= 13; y++) { grid.set(2, y, CELL.OPEN); grid.set(18, y, CELL.OPEN); }
  for (let x = 2; x <= 18; x++) grid.set(x, 13, CELL.OPEN);
  const heightAt = (x, z) => {
    if (grid.get(Math.floor(x), Math.floor(z)) !== CELL.ROCK) return 0;
    if (lake) return 0.04;
    return ridge * Math.max(0, 1 - Math.abs(x - 10.5) / 8);
  };
  grid.setTerrain(heightAt, lake ? [{ x: 10.5, z: 2.5, radius: 9 }] : [], [], 0.23);
  return grid;
}
const rock = cells => cells.filter(p => p.rock).length;
const tag = (grid, route) => route.map(p => ({ ...p, rock: grid.get(p.cx, p.cy) === CELL.ROCK }));
const low = horseshoe(1.5), lowRoute = tag(low, low.driveRoute(2, 1, 18, 1, off));
assert.ok(rock(lowRoute) >= 14 && lowRoute.every(p => p.cy <= 3), 'A low ridge is crossed straight over');
assert.equal(low.walkRoute(2, 1, 18, 1).length, 41, 'The canyon walk is the long way round');
assert.ok(routeTime(low, lowRoute, { x: 2, y: 1 }) < 40 * 0.8, 'Crossing beats the canyon by a clear margin');
const high = horseshoe(400), highRoute = tag(high, high.driveRoute(2, 1, 18, 1, off));
assert.equal(rock(highRoute), 0, 'A ridge too steep to be worth it is driven round');
assert.equal(highRoute.length, 39, 'Round the canyon, trimming the two corners a walker has to square off');
const wet = horseshoe(0, true), wetRoute = tag(wet, wet.driveRoute(2, 1, 18, 1, off));
assert.ok(rock(wetRoute) >= 14 && wetRoute.every(p => p.rock ? wet.ground.water[wet.idx(p.cx, p.cy)] : true), 'A lake is forded');
assert.ok(Math.abs(wet.drivePace(10, 2, off) - 1 / off.water) < 1e-9 && Math.abs(low.drivePace(10, 2, off) - 1 / off.rock) < 1e-9, 'Water is slower than rock');

// Boulders and spires stay in the way, and so do walls, bunkers, the base and hive mouths.
const walled = horseshoe(1.5);
const barrier = [];
for (let y = 0; y <= 12; y++) barrier.push([10, y]);
walled.setTerrain(walled.ground.heightAt, [], barrier, 0.23);
const round = walled.driveRoute(2, 1, 18, 1, off);
assert.ok(round.every(p => p.cx !== 10 || p.cy >= 13), 'A line of boulders is never driven through');
assert.ok(round.some(p => p.cx === 10 && p.cy >= 13), 'so the tank goes round its end');
for (const kind of [CELL.WALL, CELL.BUNKER, CELL.CORE, CELL.SPAWN]) {
  const g = horseshoe(1.5);
  g.set(10, 2, kind, {});
  assert.equal(g.drivePace(10, 2, off), Infinity);
}
assert.equal(low.drivePace(-1, 2, off), Infinity, 'The map edge is the end of the world');
assert.equal(low.clearDriveLine(2.5, 1.5, 6.5, 1.5, off), true, 'A straight line over rock is drivable');
assert.equal(low.clearWalkLine(2.5, 1.5, 6.5, 1.5), false, 'but not walkable');
assert.equal(walled.clearDriveLine(8.5, 1.5, 12.5, 1.5, off), false, 'A boulder blocks the line');

// Without terrain (a bare grid, or a map whose mountains are not built yet) rock stays closed.
const bare = horseshoe(1.5); bare.ground = null;
assert.equal(bare.driveRoute(2, 1, 18, 1, off).length, 41, 'No terrain: same as the canyon walk');
const reloaded = horseshoe(1.5);
reloaded.load({ cols: 21, rows: 15, open: [[2, 1], [3, 1]], spawn: { x: 0, y: 7 }, core: { x: 18, y: 7, w: 2, h: 2 } });
assert.equal(reloaded.ground, null, 'Loading a map forgets the old mountains');

// The slope costs speed as well as route time, and never more than standing still.
const slope = horseshoe(4);
const flat = slope.driveSpeed(2.5, 5.5, 0, 1, off), climb = slope.driveSpeed(6.5, 2.5, 1, 0, off), along = slope.driveSpeed(6.5, 2.5, 0, 1, off);
assert.equal(flat, 1, 'Full speed on the canyon floor');
assert.ok(Math.abs(along - off.rock) < 1e-9, 'Level rock: the rock share of speed');
assert.ok(climb < along && climb > 0.3, `Climbing is slower still (${climb})`);

// 3. Real maps: the tank reaches every hive from the base, never slower than the canyon route, and
//    the search stays cheap on the largest map.
let shortcuts = 0, checked = 0, worst = 0;
for (const [level, seed] of [[1, 12345], [3, 777], [6, 2024], [9, 4242], [12, 99], [16, 31337], [21, 5], [26, 123456]]) {
  const layout = carveLevel(level, seed, 4), grid = new Grid(layout.cols, layout.rows);
  assert.deepEqual([layout.cols, layout.rows], [mapDimensions(level).cols, mapDimensions(level).rows]);
  grid.load(layout);
  // Mountains like the game's: higher the deeper into the rock, with boulders kept solid.
  const heightAt = (x, z) => Math.min(5.6, layout.depth[Math.min(layout.rows - 1, Math.floor(z)) * layout.cols + Math.min(layout.cols - 1, Math.floor(x))] * 0.9);
  grid.setTerrain(heightAt, [], layout.boulders, 0.23);
  const start = grid.nearestOpen(layout.core.x - 2, layout.core.y, 6) || grid.nearestOpen(layout.core.x + 3, layout.core.y, 6);
  for (const hive of layout.spawns) {
    const range = UNITS.tank.tiers[0].range * 0.9;
    const began = performance.now();
    const drive = grid.driveAttackRoute(start.x, start.y, hive.x + 0.5, hive.y + 1, range, off);
    worst = Math.max(worst, performance.now() - began);
    const walk = grid.attackRoute(start.x, start.y, hive.x + 0.5, hive.y + 1, range);
    assert.ok(drive && walk, `Round ${level}: a route to every hive`);
    const driveTime = routeTime(grid, drive, start), walkTime = routeTime(grid, walk, start);
    assert.ok(driveTime <= walkTime + 1e-6, `Round ${level}: never slower than the canyon (${driveTime} vs ${walkTime})`);
    assert.equal(grid.get(drive.at(-1).cx, drive.at(-1).cy), CELL.OPEN, 'Firing position is a free tile');
    for (const [x, y] of layout.boulders) assert.ok(!drive.some(p => p.cx === x && p.cy === y), 'Never through a boulder');
    if (driveTime < walkTime * 0.97) shortcuts++;
    checked++;
  }
}
assert.ok(shortcuts >= 4, `Real maps should offer shortcuts over the mountains (${shortcuts} of ${checked})`);
assert.ok(worst < 60, `Route search should stay cheap on big maps (${worst.toFixed(1)} ms)`);

console.log(`PASS: tank routes match exhaustive quickest times on 60 random maps (${crossed} cross rock); ridge, lake, boulder and bare-grid cases; ${shortcuts} of ${checked} real hive approaches are quicker over the mountains (slowest search ${worst.toFixed(1)} ms).`);
