import { CELL, CORE_HP, LEVELS, AUTHORED_LEVELS, mapDimensions } from './config.js';
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
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - a[0] - dx * t, py - a[1] - dy * t);
}
function distToPath(x, y, path) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, distToSeg(x, y, path[i - 1], path[i]));
  return best;
}

function rockDepth(cols, rows, isWalkable) {
  const d = new Float32Array(cols * rows).fill(1e9);
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (isWalkable(x, y)) d[y * cols + x] = 0;
  const pass = (x, y, dx, dy, cost) => {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
    const i = y * cols + x;
    d[i] = Math.min(d[i], d[ny * cols + nx] + cost);
  };
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    pass(x,y,-1,0,1); pass(x,y,0,-1,1); pass(x,y,-1,-1,Math.SQRT2); pass(x,y,1,-1,Math.SQRT2);
  }
  for (let y = rows - 1; y >= 0; y--) for (let x = cols - 1; x >= 0; x--) {
    pass(x,y,1,0,1); pass(x,y,0,1,1); pass(x,y,1,1,Math.SQRT2); pass(x,y,-1,1,Math.SQRT2);
  }
  return d;
}

const SECTORS = ['Ash Flats', 'Red Gully', 'Shale Run', 'Dust Basin', 'Scar Ridge', 'Cinder Pass', 'Hollow Reach', 'Iron Wash', 'Broken Mesa', 'Last Light'];

/** Several separated western approaches converge only near the eastern command center. */
export function carveLevel(level, seed) {
  const { cols, rows, routeCount } = mapDimensions(level);
  const rng = mulberry32((seed ^ Math.imul(level, 0x9e3779b1)) >>> 0);
  const key = (x,y) => y * cols + x;
  const core = { x: cols - 5, y: Math.floor(rows / 2) - 1, w: 2, h: 2, hp: CORE_HP };
  const radius = 1.75 + (cols - 56) / 100;
  const laneY = routeCount === 1 ? [Math.floor(rows / 2)]
    : Array.from({length: routeCount}, (_,i) => Math.round(rows * (0.18 + 0.64 * i / (routeCount - 1))));
  // The primary hive is central; every hive remains on the western edge.
  laneY.sort((a,b) => Math.abs(a - rows / 2) - Math.abs(b - rows / 2) || a - b);
  const spawns = laneY.map(y => ({ x: 3, y }));
  const spawn = spawns[0];
  const paths = laneY.map(y => {
    const wiggle = () => (rng() - 0.5) * Math.min(6, rows / routeCount * 0.25);
    return [[3.5,y + 0.5], [cols * 0.25,y + wiggle()], [cols * 0.5,y + wiggle()],
      [cols * 0.75,y + wiggle()], [cols - 7,core.y + 1], [core.x + 1,core.y + 1]];
  });
  const open = new Set();
  const nearestLane = (x,y) => Math.min(...paths.map(path => distToPath(x,y,path)));
  for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
    if (nearestLane(x + 0.5,y + 0.5) <= radius) open.add(key(x,y));
  }
  const carve = (cx,cy,r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1) open.add(key(x,y));
    }
  };
  spawns.forEach(s => carve(s.x,s.y,2));
  carve(core.x,core.y,3);
  const grid = new Grid(cols,rows);
  grid.load({ cols,rows,open: [...open].map(k=>[k%cols,Math.floor(k/cols)]),spawn,spawns,core });
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  };
  const candidates = [...open].map((k) => [k % cols, Math.floor(k / cols)]).filter(([x, y]) =>
    x > 5 && x < cols - 8 && spawns.every((s) => Math.hypot(x - s.x, y - s.y) > 4));
  shuffle(candidates);
  const boulders = [];
  const want = Math.min(30, Math.round(cols / 8 + level / 3));
  for (const [x, y] of candidates) {
    if (boulders.length >= want) break;
    if (boulders.some(([bx, by]) => Math.hypot(x - bx, y - by) < 3)) continue;
    grid.cells[grid.idx(x, y)] = CELL.ROCK;
    if (!spawns.every((s) => grid.findPath(s.x, s.y, core.x, core.y))) {
      grid.cells[grid.idx(x, y)] = CELL.OPEN;
      continue;
    }
    boulders.push([x, y]);
    open.delete(key(x, y));
  }
  const boulderSet = new Set(boulders.map(([x, y]) => key(x, y)));
  const depth = rockDepth(cols, rows, (x, y) => open.has(key(x, y)) || boulderSet.has(key(x, y)));
  const highGround = [];
  for (let y = 4; y < rows - 4; y++) {
    for (let x = 4; x < cols - 4; x++) {
      if (depth[key(x, y)] >= 4 && depth[key(x, y)] <= 10) highGround.push([x, y]);
    }
  }
  shuffle(highGround);
  const peaks = [];
  for (const [x, y] of highGround) {
    if (peaks.length >= Math.max(2, Math.round(cols * rows / 1800))) break;
    if (!peaks.some(([px, py]) => Math.hypot(px - x, py - y) < 9)) peaks.push([x, y, 0]);
  }
  const approach = grid.findPath(spawn.x, spawn.y, core.x, core.y);
  const front = approach[Math.max(0, approach.length - 9)];
  const focus = {
    x: (core.x + 1) * 0.4 + (front.x + 0.5) * 0.6,
    z: (core.y + 1) * 0.4 + (front.y + 0.5) * 0.6
  };
  const name = level <= AUTHORED_LEVELS ? LEVELS[level - 1].name
    : `${SECTORS[(level - AUTHORED_LEVELS - 1) % SECTORS.length]} · Sector ${level}`;
  return {
    cols, rows, routeCount, paths, name,
    blurb: `${cols}×${rows} battlefield. ${routeCount} western attack ${routeCount === 1 ? 'route converges' : 'routes converge'} on your base. Defend every approach.`,
    open: [...open].map((k) => [k % cols, Math.floor(k / cols)]),
    spawn, spawns, core, peaks, boulders, depth, focus
  };
}
