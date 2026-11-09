import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { carveLevel, MAP_VERSION } from '../src/levels.js';
import { Grid } from '../src/grid.js';

let checked = 0;
const totals = {};
for (let seed = 0; seed < 24; seed++) {
  for (const level of [1, 5, 6, 11, 16, 21, 26, 40, 100]) {
    const map = carveLevel(level, seed);
    assert.equal(map.mapVersion, MAP_VERSION);
    // Fill boulders back in to measure the underlying canyon rather than obstacle gaps.
    const terrain = new Set([...map.open, ...map.boulders].map(([x,y]) => y * map.cols + x));
    const hist = {};
    const necks = [];
    for (let x = 6; x < Math.floor(map.cols * 0.75); x++) {
      let run = [];
      const measure = () => {
        if (!run.length) return;
        assert.ok(run.length >= 2 && run.length <= 7, `Unexpected width ${run.length} at ${level}/${seed}/${x}`);
        hist[run.length] = (hist[run.length] || 0) + 1;
        if (run.length <= 3) necks.push({ x, ys: run.slice() });
        run = [];
      };
      for (let y = 1; y < map.rows; y++) {
        if (terrain.has(y * map.cols + x)) run.push(y); else measure();
      }
      measure();
    }
    for (const width of [2,3,4,6,7]) assert.ok(hist[width] > 0, `Missing ${width}-tile section at ${level}/${seed}`);
    const broad = (hist[5] || 0) + (hist[6] || 0) + (hist[7] || 0);
    assert.ok(broad > (hist[2] || 0) + (hist[3] || 0), 'Narrow sections dominate the map');
    // Two-tile necks stay completely clear; in three-tile necks the two-cell spine stays clear.
    const open = new Set(map.open.map(([x,y]) => y * map.cols + x));
    for (const { x, ys } of necks) assert.ok(ys.filter(y => open.has(y * map.cols + x)).length >= 2, 'Boulder reduced a neck below two open tiles');
    const grid = new Grid(); grid.load(map);
    for (const spawn of map.spawns) assert.ok(grid.findPath(spawn.x, spawn.y, map.core.x, map.core.y)?.length, `Unreachable route at ${level}/${seed}`);
    for (const [width, n] of Object.entries(hist)) totals[width] = (totals[width] || 0) + n;
    checked++;
  }
}

// Original map fixtures protect already-saved unit/building positions across this update.
const legacy = [
  [1, 12345, '918ec4b8dc1c2bb5aac2f6c762f9e4b3e28bbf1b0d7dc99836afde9cf9a0370e'],
  [6, 0, '1e6aff4f6f099a4000a15ad7890a863a237f9093905794bdc97a350462ed8b15'],
  [26, 4294967295, 'd9fceee3a6b61e2315a6162e5bcfbf9f67115ce4f09f211b1bbf2a77620846fd']
];
for (const [level, seed, expected] of legacy) {
  const m = carveLevel(level, seed, 1);
  const hash = createHash('sha256').update(JSON.stringify({ open: m.open, boulders: m.boulders, peaks: m.peaks, paths: m.paths, focus: m.focus })).digest('hex');
  assert.equal(hash, expected, 'Legacy terrain changed');
}
assert.throws(() => carveLevel(1, 0, 99), /Unsupported map version/);
console.log(`PASS: ${checked} maps with 2/3/4/6/7-tile sections, broader majority, protected necks, connected routes and legacy terrain; widths:`, totals);
