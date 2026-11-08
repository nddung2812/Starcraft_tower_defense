import { COLS, ROWS, CELL, CORE_HP, LEVELS } from './config.js';
import { Grid } from './grid.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distToSeg(px, py, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby || 1;
  let t = ((px - a[0]) * abx + (py - a[1]) * aby) / len2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (a[0] + abx * t);
  const dy = py - (a[1] + aby * t);
  return Math.hypot(dx, dy);
}

function distToPath(px, py, path) {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) best = Math.min(best, distToSeg(px, py, path[i], path[i + 1]));
  return best;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function key(x, y) { return y * COLS + x; }

/** Carve one level: a dirt lane, locked rock everywhere else, random boulders and peaks. */
export function carveLevel(level, seed) {
  const spec = LEVELS[(level - 1) % LEVELS.length];
  const rng = mulberry32((seed ^ (level * 0x9e3779b1)) >>> 0);
  const path = spec.path;
  const open = new Set();

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (distToPath(x + 0.5, y + 0.5, path) <= spec.radius) open.add(key(x, y));
    }
  }

  const end = path[path.length - 1];
  const core = {
    x: clamp(Math.round(end[0] - 1), 0, COLS - 2),
    y: clamp(Math.round(end[1] - 1), 0, ROWS - 2),
    w: 2, h: 2, hp: CORE_HP
  };
  const start = path[0];
  const spawn = {
    x: clamp(Math.round(start[0] - 0.5), 0, COLS - 1),
    y: clamp(Math.round(start[1] - 1), 0, ROWS - 2)
  };

  for (let y = spawn.y - 1; y <= spawn.y + 2; y++) {
    for (let x = spawn.x; x <= spawn.x + 1; x++) {
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) open.add(key(x, y));
    }
  }
  for (let dy = -1; dy <= core.h; dy++) {
    for (let dx = -1; dx <= core.w; dx++) {
      const x = core.x + dx, y = core.y + dy;
      if (x >= 0 && y >= 0 && x < COLS && y < ROWS) open.add(key(x, y));
    }
  }

  const grid = new Grid();
  grid.load({ open: [...open].map((k) => [k % COLS, (k / COLS) | 0]), spawn, core });

  const reserved = new Set();
  for (let dy = 0; dy < core.h; dy++) {
    for (let dx = 0; dx < core.w; dx++) reserved.add(key(core.x + dx, core.y + dy));
  }
  reserved.add(key(spawn.x, spawn.y));
  reserved.add(key(spawn.x, spawn.y + 1));

  const candidates = [];
  for (const k of open) {
    if (reserved.has(k)) continue;
    const x = k % COLS, y = (k / COLS) | 0;
    if (Math.abs(x - spawn.x) + Math.abs(y - spawn.y) < 4) continue;
    if (Math.abs(x - core.x) + Math.abs(y - core.y) < 4) continue;
    if (distToPath(x + 0.5, y + 0.5, path) < 0.72) continue;
    candidates.push([x, y]);
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = candidates[i]; candidates[i] = candidates[j]; candidates[j] = tmp;
  }

  const boulders = [];
  const want = 3 + Math.floor(level * 0.55);
  for (const [x, y] of candidates) {
    if (boulders.length >= want) break;
    if (boulders.some(([bx, by]) => Math.abs(bx - x) + Math.abs(by - y) < 3)) continue;
    const i = grid.idx(x, y);
    grid.cells[i] = CELL.ROCK;
    const route = grid.findPath(spawn.x, spawn.y, core.x, core.y);
    if (!route) { grid.cells[i] = CELL.OPEN; continue; }
    boulders.push([x, y]);
    open.delete(key(x, y));
  }

  const isOpen = (x, y) => x >= 0 && y >= 0 && x < COLS && y < ROWS && open.has(key(x, y));
  const peaks = [];
  const boulderSet = new Set(boulders.map(([x, y]) => key(x, y)));
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (open.has(key(x, y)) || boulderSet.has(key(x, y))) continue;
      const rim = isOpen(x + 1, y) || isOpen(x - 1, y) || isOpen(x, y + 1) || isOpen(x, y - 1);
      if (rng() < (rim ? 0.55 : 0.14)) peaks.push([x, y, rim ? 1 : 0]);
    }
  }

  let sx = 0, sz = 0, n = 0;
  for (const k of open) { sx += (k % COLS) + 0.5; sz += ((k / COLS) | 0) + 0.5; n++; }

  return {
    name: spec.name,
    blurb: spec.blurb,
    open: [...open].map((k) => [k % COLS, (k / COLS) | 0]),
    spawn,
    core,
    peaks,
    boulders,
    focus: n ? { x: sx / n, z: sz / n } : { x: COLS / 2, z: ROWS / 2 }
  };
}
