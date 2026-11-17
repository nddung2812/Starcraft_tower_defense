/*
 * node tests/skirmish-maps.mjs
 * Every Skirmish setup must carve a playable battlefield: the chosen hive count and size, every
 * hive reaching the base by a real march, hives apart from each other, and the same map again
 * for the same seed. Runs every hive count at every size the setup screen allows.
 */
import assert from 'node:assert/strict';
import { carveMatch } from '../src/levels.js';
import { Grid } from '../src/grid.js';
import { SKIRMISH, CELL } from '../src/config.js';

const seeds = [0, 1, 7, 99, 12345, 2026, 31337, 424242, 0x7fffffff, 0xffffffff, 555, 90210];
let maps = 0;
const report = [];
for (let hives = 1; hives <= SKIRMISH.maxHives; hives++) {
  for (const size of SKIRMISH.sizes.filter(s => s >= SKIRMISH.minSize[hives])) {
    let shortest = Infinity, closest = Infinity;
    for (const seed of seeds) {
      const layout = carveMatch(seed, { hives, size });
      const label = `${hives} hives, ${size}, seed ${seed}`;
      assert.equal(layout.cols, size, label); assert.equal(layout.rows, size, label);
      assert.equal(layout.spawns.length, hives, label);
      assert.equal(layout.sides.length, hives, label);
      assert.deepEqual(layout.spawn, layout.spawns[0], label);
      const grid = new Grid(size, size);
      grid.load(layout);
      for (const [x, y] of layout.boulders) grid.cells[grid.idx(x, y)] = CELL.ROCK;
      const c = layout.core;
      assert.ok(c.x >= 3 && c.y >= 3 && c.x + c.w <= size - 3 && c.y + c.h <= size - 3, `${label}: base inside the map`);
      for (const s of layout.spawns) {
        const path = grid.findPath(s.x, s.y, c.x, c.y);
        assert.ok(path?.length, `${label}: hive at ${s.x},${s.y} cannot reach the base`);
        shortest = Math.min(shortest, path.length);
      }
      layout.spawns.forEach((a, i) => layout.spawns.forEach((b, j) => {
        if (j > i) closest = Math.min(closest, Math.hypot(a.x - b.x, a.y - b.y));
      }));
      assert.deepEqual(carveMatch(seed, { hives, size }).open, layout.open, `${label}: not reproducible`);
      maps++;
    }
    assert.ok(shortest >= SKIRMISH.minMarch, `${hives} hives on ${size}: shortest march is only ${shortest} tiles`);
    if (hives > 1) assert.ok(closest >= 8, `${hives} hives on ${size}: two hives only ${closest.toFixed(1)} tiles apart`);
    report.push(`${hives}h ${size}: march ≥ ${shortest}${hives > 1 ? `, hives ≥ ${closest.toFixed(0)} apart` : ''}`);
  }
}
// Different setups on one seed are different maps, and out-of-range input is clamped.
assert.notDeepEqual(carveMatch(5, { hives: 2, size: 72 }).open, carveMatch(5, { hives: 3, size: 72 }).open);
assert.equal(carveMatch(5, { hives: 99, size: 9999 }).spawns.length, 7);
assert.equal(carveMatch(5, { hives: 99, size: 9999 }).cols, 128);
assert.equal(carveMatch(5, {}).spawns.length, 2);
console.log(report.join('\n'));
console.log(`PASS: ${maps} Skirmish maps`);
