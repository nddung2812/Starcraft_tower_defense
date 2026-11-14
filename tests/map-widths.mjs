import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { carveLevel, attackFronts, MAP_VERSION } from '../src/levels.js';
import { Grid } from '../src/grid.js';

let checked = 0;
const totals = {};
for (let seed = 0; seed < 24; seed++) {
  for (const level of [1, 5, 6, 11, 16, 21, 26, 40, 100]) {
    const raw = carveLevel(level, seed);
    assert.equal(raw.mapVersion, MAP_VERSION);
    // Turn the map so its main front attacks from the west, then measure as before.
    const side = raw.sides[0], n = raw.cols;
    const turn = ([x, y]) => side === 'west' ? [x, y] : side === 'east' ? [n - 1 - x, y] : side === 'north' ? [y, x] : [n - 1 - y, x];
    const map = { ...raw, open: raw.open.map(turn), boulders: raw.boulders.map(turn) };
    const base = turn([raw.core.x, raw.core.y])[0] - (side === 'east' || side === 'south' ? 1 : 0);
    const fronts = attackFronts(level);
    // Past this column other fronts' canyons cross the main one, so widths stop being comparable.
    const limit = Math.min(Math.floor((base + 5) * 0.64), fronts === 4 ? Math.floor(base - n * 0.1 - 11) : Infinity);
    // Fill boulders back in to measure the underlying canyon rather than obstacle gaps.
    const terrain = new Set([...map.open, ...map.boulders].map(([x,y]) => y * map.cols + x));
    const hist = {};
    const necks = [];
    for (let x = 6; x < limit; x++) {
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
    if (fronts < 4) {
      for (const width of [2,3,4,6,7]) assert.ok(hist[width] > 0, `Missing ${width}-tile section at ${level}/${seed}`);
      const broad = (hist[5] || 0) + (hist[6] || 0) + (hist[7] || 0);
      assert.ok(broad > (hist[2] || 0) + (hist[3] || 0), 'Narrow sections dominate the map');
    }
    // Two-tile necks stay completely clear; in three-tile necks the two-cell spine stays clear.
    const open = new Set(map.open.map(([x,y]) => y * map.cols + x));
    for (const { x, ys } of necks) assert.ok(ys.filter(y => open.has(y * map.cols + x)).length >= 2, 'Boulder reduced a neck below two open tiles');
    const grid = new Grid(); grid.load(raw);
    for (const spawn of raw.spawns) assert.ok(grid.findPath(spawn.x, spawn.y, raw.core.x, raw.core.y)?.length, `Unreachable route at ${level}/${seed}`);
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
const versionTwo = [
  [1, 12345, 'bf1c8e2e7cc1d9d6ae75b4db47c3c278d4b1120082f445537369f5af393587a4'],
  [6, 0, '32cb9275a86f32640f4befe52769ca9eef315fe522c4e74e3b95509ae062ed9e'],
  [26, 4294967295, '9632a8f8c40c7b0d3c8e9de9c620f3953c55962882e7e27ae359e4500d803631']
];
for (const [level, seed, expected] of versionTwo) {
  const m = carveLevel(level, seed, 2);
  const hash = createHash('sha256').update(JSON.stringify({ open: m.open, boulders: m.boulders, peaks: m.peaks, paths: m.paths, focus: m.focus })).digest('hex');
  assert.equal(hash, expected, 'Version-2 terrain changed');
}
const versionThree = [
  [1, 12345, 'a9b322d8b4bb4de69c9c226bf416bf5baf68639c4602de25fe6148c55da55e72'],
  [6, 0, '61d055729c4dddd52e4404c64f1f292007496d326f36c576a424013ead6f4738'],
  [26, 4294967295, 'e9bdc5f95903af4260829d0af3a406e7b6caea81c0d3ad36846060a593cc1c90']
];
for (const [level, seed, expected] of versionThree) {
  const m = carveLevel(level, seed, 3);
  const hash = createHash('sha256').update(JSON.stringify({ open: m.open, boulders: m.boulders, peaks: m.peaks, paths: m.paths, focus: m.focus })).digest('hex');
  assert.equal(hash, expected, 'Version-3 terrain changed');
}
for (const width of [2,3,4,6,7]) assert.ok(totals[width] > 0, `No ${width}-tile sections anywhere`);
assert.throws(() => carveLevel(1, 0, 99), /Unsupported map version/);
console.log(`PASS: ${checked} maps with 2/3/4/6/7-tile sections, broader majority, protected necks, connected routes and legacy terrain; widths:`, totals);
