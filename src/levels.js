import { COLS, ROWS, CELL, CORE_HP, LEVELS, AUTHORED_LEVELS } from './config.js';
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

/* The level paths in config.js were drawn on a 26 x 16 grid; they stretch to whatever COLS x ROWS is. */
const AUTHORED_COLS = 26, AUTHORED_ROWS = 16;
const SX = COLS / AUTHORED_COLS, SY = ROWS / AUTHORED_ROWS;
const STRETCH = Math.sqrt(SX * SY);
// lanes widen with the map so a big battlefield has room to manoeuvre
const LANE_WIDEN = Math.max(1.12, STRETCH * 0.42);

const SECTOR_NAMES = ['Ash Flats', 'Red Gully', 'Shale Run', 'Dust Basin', 'Scar Ridge', 'Cinder Pass', 'Hollow Reach', 'Iron Wash', 'Broken Mesa', 'Last Light'];

/** Levels past the hand-drawn ones: a random canyon snaking from the west edge to the east. */
function generatedSpec(level, rng) {
  const path = [[1.5, 2.5 + rng() * 11]];
  const legs = 4 + Math.floor(rng() * 3) + Math.min(3, Math.floor((level - AUTHORED_LEVELS) / 6));
  for (let i = 1; i <= legs; i++) {
    const x = 1.5 + (23 * i) / legs;
    const prev = path[path.length - 1][1];
    let y = 2.5 + rng() * 11;
    if (Math.abs(y - prev) < 3) y = prev < 8 ? Math.min(13.5, prev + 4 + rng() * 4) : Math.max(2.5, prev - 4 - rng() * 4);
    // every other leg doubles back in x a little, so canyons wind instead of running straight
    path.push([i < legs && i % 2 === 0 ? x - 1.5 : x, y]);
  }
  const name = `${SECTOR_NAMES[(level - AUTHORED_LEVELS - 1) % SECTOR_NAMES.length]} · Sector ${level}`;
  const blurb = level % 5 === 0
    ? 'A long column with every strain in it. Dig in deep and keep the SCV alive.'
    : 'Uncharted ground. The swarm is bigger and tougher than the last cut.';
  return { name, blurb, radius: Math.max(1.3, 1.48 - (level - AUTHORED_LEVELS) * 0.005), path };
}

/** How far each rock cell is from walkable ground (chamfer distance); 0 for open ground. */
function rockDepth(isWalkable) {
  const n = COLS * ROWS;
  const d = new Float32Array(n).fill(1e9);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (isWalkable(x, y)) d[y * COLS + x] = 0;
  const D = Math.SQRT2;
  const pass = (y, x, ox, oy, w) => {
    const nx = x + ox, ny = y + oy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
    const i = y * COLS + x, j = ny * COLS + nx;
    if (d[j] + w < d[i]) d[i] = d[j] + w;
  };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    pass(y, x, -1, 0, 1); pass(y, x, 0, -1, 1); pass(y, x, -1, -1, D); pass(y, x, 1, -1, D);
  }
  for (let y = ROWS - 1; y >= 0; y--) for (let x = COLS - 1; x >= 0; x--) {
    pass(y, x, 1, 0, 1); pass(y, x, 0, 1, 1); pass(y, x, 1, 1, D); pass(y, x, -1, 1, D);
  }
  return d;
}

/** Carve one level: a dirt lane, locked rock everywhere else, random boulders and peaks. */
export function carveLevel(level, seed) {
  const rng = mulberry32((seed ^ (level * 0x9e3779b1)) >>> 0);
  const spec = level <= AUTHORED_LEVELS ? LEVELS[level - 1] : generatedSpec(level, rng);
  const path = spec.path.map(([x, y]) => [x * SX, y * SY]);
  // Opposing bases: swarm at the western entrance, command center at the eastern exit.
  path[0][0] = 7;
  path[path.length - 1][0] = COLS - 8;
  const radius = spec.radius * LANE_WIDEN;
  const open = new Set();

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (distToPath(x + 0.5, y + 0.5, path) <= radius) open.add(key(x, y));
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

  const spawns = [spawn];
  const grid = new Grid();
  grid.load({ open: [...open].map((k) => [k % COLS, (k / COLS) | 0]), spawn, spawns, core });

  const reserved = new Set();
  for (let dy = 0; dy < core.h; dy++) {
    for (let dx = 0; dx < core.w; dx++) reserved.add(key(core.x + dx, core.y + dy));
  }
  reserved.add(key(spawn.x, spawn.y));
  reserved.add(key(spawn.x, spawn.y + 1));

  // boulders: about half sit right in the lane so the swarm (and your troops) have to go around
  const onLane = [], offLane = [];
  for (const k of open) {
    if (reserved.has(k)) continue;
    const x = k % COLS, y = (k / COLS) | 0;
    if (spawns.some((s) => Math.abs(x - s.x) + Math.abs(y - s.y) < 4)) continue;
    if (Math.abs(x - core.x) + Math.abs(y - core.y) < 4) continue;
    (distToPath(x + 0.5, y + 0.5, path) < 0.72 ? onLane : offLane).push([x, y]);
  }
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
  };
  shuffle(onLane);
  shuffle(offLane);

  const boulders = [];
  const want = Math.min(48, Math.round((3 + Math.min(12, level) * 0.55) * STRETCH));
  const tryPlace = (list, quota) => {
    for (const [x, y] of list) {
      if (boulders.length >= quota) return;
      if (boulders.some(([bx, by]) => Math.abs(bx - x) + Math.abs(by - y) < 3)) continue;
      const i = grid.idx(x, y);
      grid.cells[i] = CELL.ROCK;
      // every breach must still reach the base
      const route = spawns.every((s) => grid.findPath(s.x, s.y, core.x, core.y));
      if (!route) { grid.cells[i] = CELL.OPEN; continue; }
      boulders.push([x, y]);
      open.delete(key(x, y));
    }
  };
  tryPlace(onLane, Math.ceil(want / 2));
  tryPlace(offLane, want);

  // mountains: how deep into the rock each cell sits (boulders count as lane, so the floor stays flat around them)
  const boulderSet = new Set(boulders.map(([x, y]) => key(x, y)));
  const depth = rockDepth((x, y) => open.has(key(x, y)) || boulderSet.has(key(x, y)));

  // only a few sharp spires, up on the high ground well back from the lane
  const peaks = [];
  const spireWant = Math.max(2, Math.round((COLS * ROWS) / 1100));
  const highGround = [];
  for (let y = 2; y < ROWS - 2; y++) {
    for (let x = 2; x < COLS - 2; x++) {
      const dd = depth[y * COLS + x];
      if (dd >= 4 && dd <= 14) highGround.push([x, y]);
    }
  }
  shuffle(highGround);
  for (const [x, y] of highGround) {
    if (peaks.length >= spireWant) break;
    if (peaks.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 9)) continue;
    peaks.push([x, y, 0]);
  }

  let sx = 0, sz = 0, n = 0;
  for (const k of open) { sx += (k % COLS) + 0.5; sz += ((k / COLS) | 0) + 0.5; n++; }

  return {
    name: spec.name,
    blurb: spec.blurb,
    open: [...open].map((k) => [k % COLS, (k / COLS) | 0]),
    spawn,
    spawns,
    core,
    peaks,
    boulders,
    depth,
    // the camera opens on your base
    focus: n ? { x: core.x + 1 - Math.min(8, COLS * 0.06), z: core.y + 1 } : { x: COLS / 2, z: ROWS / 2 }
  };
}
