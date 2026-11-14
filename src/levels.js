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
export const MAP_VERSION = 4;
export const SUPPORTED_MAP_VERSIONS = [1, 2, 3, MAP_VERSION];

/** How many sides of the base the swarm attacks from. Harder rounds open more fronts. */
export function attackFronts(level) { return level <= 6 ? 1 : level <= 15 ? 2 : level <= 20 ? 3 : 4; }

const SIDES = ['west', 'east', 'north', 'south'];
// The two sides beside each front, listed low edge first in that front's own frame.
const FLANKS = { west: ['north', 'south'], east: ['north', 'south'], north: ['west', 'east'], south: ['west', 'east'] };
const TOWARD = { west: { dx: -1, dy: 0 }, east: { dx: 1, dy: 0 }, north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 } };
/*
 * Every approach is laid out in its own frame and then turned onto the square map:
 * u runs in from that side's map edge, v runs across it.
 */
const cellFrom = (side, n, u, v) => side === 'west' ? [u, v] : side === 'east' ? [n - 1 - u, v]
  : side === 'north' ? [v, u] : [v, n - 1 - u];
const pointFrom = (side, n, u, v) => side === 'west' ? [u, v] : side === 'east' ? [n - u, v]
  : side === 'north' ? [v, u] : [v, n - u];
/** The base's corner cell as an approach from `side` sees it. */
const baseFrom = (side, n, core) => side === 'west' ? [core.x, core.y] : side === 'east' ? [n - 2 - core.x, core.y]
  : side === 'north' ? [core.y, core.x] : [n - 2 - core.y, core.x];

/**
 * Version 4: the base sits on a random side while one front attacks, moves inland as a
 * flank opens, and ends up mid-map with hives on all four sides.
 */
function planFronts(level, n, rng) {
  const fronts = attackFronts(level);
  const primary = SIDES[Math.floor(rng() * SIDES.length)];
  const flanks = FLANKS[primary].slice();
  const flankLow = rng() < 0.5;          // which flank opens first
  if (!flankLow) flanks.reverse();
  const jitter = (range) => Math.round((rng() - 0.5) * range);
  const mid = Math.floor(n / 2) - 1;
  // Base corner in the primary front's frame.
  let bu, bv;
  if (fronts === 1) { bu = n - 5; bv = mid + jitter(6); }
  else if (fronts === 2) {
    // Inland, and pushed away from the flank so that approach is still a real march.
    bu = Math.round(n * 0.66);
    bv = flankLow ? Math.round(n * 0.58) - 1 : n - 1 - Math.round(n * 0.58);
  } else if (fronts === 3) { bu = Math.round(n * 0.64); bv = mid + jitter(6); }
  else { bu = mid + jitter(n * 0.12); bv = mid + jitter(n * 0.12); }
  const core = primary === 'west' ? { x: bu, y: bv } : primary === 'east' ? { x: n - 2 - bu, y: bv }
    : primary === 'north' ? { x: bv, y: bu } : { x: bv, y: n - 2 - bu };
  Object.assign(core, { w: 2, h: 2, hp: CORE_HP });

  const lanes = [];
  if (fronts === 4) {
    for (const side of [primary, ...flanks, SIDES.find(s => s !== primary && !flanks.includes(s))]) {
      const across = baseFrom(side, n, core)[1];
      lanes.push({ side, entry: Math.max(Math.round(n * 0.2), Math.min(Math.round(n * 0.8), across + jitter(n * 0.2))), join: 9 });
    }
  } else {
    // Two approaches share the main front and a longer firing line, as in earlier maps.
    const spread = fronts === 1 ? [0.18, 0.82] : fronts === 3 ? [0.22, 0.78] : flankLow ? [0.34, 0.84] : [0.16, 0.66];
    const entries = spread.map(f => Math.round(n * f) + jitter(4));
    entries.sort((a, b) => Math.abs(a - bv) - Math.abs(b - bv) || a - b);   // the more central hive leads
    for (const entry of entries) lanes.push({ side: primary, entry, join: 12 });
    // Flank hives come in just behind the base, clear of the main approaches.
    const behind = primary === 'west' || primary === 'north' ? 1 : -1;
    for (const side of flanks.slice(0, fronts - 1)) {
      const across = baseFrom(side, n, core)[1];
      const entry = across + behind * (1 + Math.round(rng() * n * 0.06));
      lanes.push({ side, entry: Math.max(8, Math.min(n - 9, entry)), join: 9, flank: true });
    }
  }
  return { fronts, primary, core, lanes };
}

/** Broad building areas separated by short necks; widths are measured in whole tiles. */
function canyonWidths(cols, rng, end = Math.floor(cols * 0.75)) {
  const widths = [6, 4, 7, 3, 6, 2, 7];
  // Rotate/reverse the sequence without ever putting both narrow sections together.
  const offset = Math.floor(rng() * widths.length);
  const ordered = widths.map((_, i) => widths[(i + offset) % widths.length]);
  if (rng() < 0.5) ordered.reverse();
  const start = 6;
  const weights = ordered.map(w => w <= 3 ? 0 : 0.8 + rng() * 0.4);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const broadLength = end - start - 10;
  let x = start;
  const sections = ordered.map((width, i) => {
    const from = x;
    x += width <= 3 ? 5 : broadLength * weights[i] / totalWeight;
    return { from, to: x, width };
  });
  return Array.from({ length: cols }, (_, tx) => {
    const cx = tx + 0.5;
    const i = sections.findIndex(s => cx < s.to);
    const section = sections[i < 0 ? sections.length - 1 : i];
    let width = section.width;
    // Ease each edge over three columns, leaving real 2/3-tile plateaus in the necks.
    if (i > 0 && cx < section.from + 1.5) {
      const t = Math.max(0, Math.min(1, (cx - section.from + 1.5) / 3));
      width = sections[i - 1].width * (1 - t) + width * t;
    } else if (i >= 0 && i < sections.length - 1 && cx > section.to - 1.5) {
      const t = Math.max(0, Math.min(1, (cx - section.to + 1.5) / 3));
      width = width * (1 - t) + sections[i + 1].width * t;
    }
    // Keep the steep final convergence roomy enough for all approaches to meet.
    return Math.max(cx >= end ? 4 : 2, Math.min(7, Math.round(width)));
  });
}

function centerAt(path, x) {
  let i = 1;
  while (i < path.length - 1 && x > path[i][0]) i++;
  const [ax, ay] = path[i - 1], [bx, by] = path[i];
  const t = Math.max(0, Math.min(1, (x - ax) / (bx - ax)));
  return { y: ay + (by - ay) * t, slope: (by - ay) / (bx - ax) };
}

/** A seeded battlefield: separated approaches that converge only near the base. */
export function carveLevel(level, seed, version = MAP_VERSION) {
  if (!SUPPORTED_MAP_VERSIONS.includes(version)) throw new Error('Unsupported map version');
  const { cols, rows } = mapDimensions(level);
  // Old saves must reconstruct the same lanes before validating placed hardware.
  const routeCount = version < 3 ? (level <= 5 ? 1 : level <= 15 ? 2 : 3) : mapDimensions(level).routeCount;
  const rng = mulberry32((seed ^ Math.imul(level, 0x9e3779b1)) >>> 0);
  const plan = version >= 4 ? planFronts(level, cols, rng) : null;
  return plan ? finishLevel(level, seed, version, rng, carveFronts(level, seed, cols, rng, plan))
    : finishLevel(level, seed, version, rng, carveWestern(level, seed, version, rng, cols, rows, routeCount));
}

/** Approaches from one or more sides, each built in its own frame. */
function carveFronts(level, seed, n, rng, plan) {
  const { core } = plan;
  const key = (x, y) => y * n + x;
  const open = new Set(), protectedRoute = new Set();
  const shapes = [[1, -0.8, 0.4], [-0.6, 1, -0.5], [0.4, 1, 0.6], [-0.4, -1, -0.6]];
  const paths = [], spawns = [];
  plan.lanes.forEach((lane, index) => {
    const { side, entry } = lane;
    const [bu, bv] = baseFrom(side, n, core);
    const length = bu + 5;                      // the old full-map approach had its base 5 from the far edge
    const convergence = Math.floor(length * 0.64);
    // Approaches on one front bend together, so they stay apart until they converge.
    const shape = shapes[(level - 1 + (lane.flank ? index : 0)) % shapes.length];
    const bend = lane.flank ? 2 + rng() : 3 + rng() * 2;
    const points = [0.24 * length, 0.44 * length, convergence].map((u, i) =>
      [u, entry + shape[i] * bend + (rng() - 0.5) * 2]);
    const path = [[3.5, entry + 0.5], ...points, [length - lane.join, bv + 1], [bu + 1, bv + 1]];
    const widths = canyonWidths(length, mulberry32((seed ^ Math.imul(level, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0), convergence);
    const mark = (set, u, v) => {
      const [x, y] = cellFrom(side, n, u, v);
      if (x >= 1 && y >= 1 && x < n - 1 && y < n - 1) set.add(key(x, y));
    };
    for (let u = 1; u <= Math.min(n - 2, bu + 3); u++) {
      const center = centerAt(path, u + 0.5);
      const width = u + 0.5 < convergence ? widths[u]
        : Math.max(widths[u], Math.round(widths[u] * Math.hypot(1, center.slope)));
      const bottom = Math.round(center.y - width / 2);
      const spine = Math.round(center.y - 1);
      for (let v = bottom; v < bottom + width; v++) mark(open, u, v);
      mark(protectedRoute, u, spine);
      mark(protectedRoute, u, spine + 1);
    }
    paths.push(path.map(([u, v]) => pointFrom(side, n, u, v)));
    const [x, y] = cellFrom(side, n, 3, entry);
    spawns.push({ x, y });
  });
  const sides = plan.lanes.map(l => l.side);
  return { cols: n, rows: n, routeCount: plan.lanes.length, core, spawns, paths, open, protectedRoute,
    sides, fronts: plan.fronts, front: TOWARD[plan.primary] };
}

/** Versions 1-3: every hive on the western edge, the base on the eastern one. */
function carveWestern(level, seed, version, rng, cols, rows, routeCount) {
  const key = (x,y) => y * cols + x;
  const core = { x: cols - 5, y: Math.floor(rows / 2) - 1, w: 2, h: 2, hp: CORE_HP };
  if (version >= 3) core.y += Math.round((rng() - 0.5) * 6);
  const laneY = routeCount === 1 ? [Math.floor(rows / 2)]
    : Array.from({length: routeCount}, (_,i) => Math.round(rows * (0.18 + 0.64 * i / (routeCount - 1))));
  if (version >= 3) for (let i = 0; i < laneY.length; i++) laneY[i] += Math.round((rng() - 0.5) * 4);
  // The primary hive is central; every hive remains on the western edge.
  laneY.sort((a,b) => Math.abs(a - rows / 2) - Math.abs(b - rows / 2) || a - b);
  const spawns = laneY.map(y => ({ x: 3, y }));
  const spawn = spawns[0];
  const convergence = version >= 3 ? Math.floor(cols * 0.64) : cols * 0.75;
  const paths = laneY.map(y => {
    if (version >= 3) {
      // Alternate gentle bends/sweeps, with small seeded offsets for each approach.
      const shapes = [[1, -0.8, 0.4], [-0.6, 1, -0.5], [0.4, 1, 0.6], [-0.4, -1, -0.6]];
      const shape = shapes[(level - 1) % shapes.length];
      const bend = 3 + rng() * 2;
      const points = [0.24 * cols, 0.44 * cols, convergence].map((x, i) =>
        [x, y + shape[i] * bend + (rng() - 0.5) * 2]);
      // Early lanes share a longer firing line; later lanes approach the base separately.
      const joinX = cols - (routeCount === 2 ? 12 : routeCount === 3 ? 10 : 8);
      return [[3.5, y + 0.5], ...points, [joinX, core.y + 1], [core.x + 1, core.y + 1]];
    }
    const wiggle = () => (rng() - 0.5) * Math.min(6, rows / routeCount * 0.25);
    return [[3.5,y + 0.5], [cols * 0.25,y + wiggle()], [cols * 0.5,y + wiggle()],
      [cols * 0.75,y + wiggle()], [cols - 7,core.y + 1], [core.x + 1,core.y + 1]];
  });
  const open = new Set();
  const protectedRoute = new Set();
  if (version === 1) {
    // Existing checkpoints retain their exact original terrain and boulder sequence.
    const radius = 1.75 + (cols - 56) / 100;
    for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
      if (Math.min(...paths.map(path => distToPath(x + 0.5, y + 0.5, path))) <= radius) open.add(key(x,y));
    }
  } else {
    paths.forEach((path, lane) => {
      const widths = canyonWidths(cols, mulberry32((seed ^ Math.imul(level, 0x9e3779b1) ^ Math.imul(lane + 1, 0x85ebca6b)) >>> 0), Math.floor(convergence));
      for (let x = 1; x < cols - 1; x++) {
        const center = centerAt(path, x + 0.5);
        // Keep 2–7 exact tile rows in the canyon; widen the steep final convergence.
        const width = x + 0.5 < convergence ? widths[x]
          : Math.max(widths[x], Math.round(widths[x] * Math.hypot(1, center.slope)));
        const bottom = Math.round(center.y - width / 2);
        const spine = Math.round(center.y - 1);
        for (let y = bottom; y < bottom + width; y++) {
          if (y >= 1 && y < rows - 1) open.add(key(x, y));
        }
        // Boulders can decorate shoulders, but never reduce a neck to a single tile.
        protectedRoute.add(key(x, spine));
        protectedRoute.add(key(x, spine + 1));
      }
    });
  }
  return { cols, rows, routeCount, core, spawns, paths, open, protectedRoute,
    sides: spawns.map(() => 'west'), fronts: 1, front: TOWARD.west };
}

/** Shared by every map version: clearings, boulders, rock depth, peaks and the briefing. */
function finishLevel(level, seed, version, rng, carved) {
  const { cols, rows, routeCount, core, spawns, paths, open, protectedRoute, sides, fronts, front } = carved;
  const key = (x,y) => y * cols + x;
  const spawn = spawns[0];
  const carve = (cx,cy,r) => {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x >= 1 && y >= 1 && x < cols - 1 && y < rows - 1) open.add(key(x,y));
    }
  };
  spawns.forEach(s => carve(s.x,s.y,2));
  if (fronts > 1) {
    // A base attacked from several sides gets a plaza to form a ring in.
    carve(core.x, core.y, 4);
    carve(core.x + 1, core.y + 1, 4);
  } else carve(core.x,core.y,3);
  const grid = new Grid(cols,rows);
  grid.load({ cols,rows,open: [...open].map(k=>[k%cols,Math.floor(k/cols)]),spawn,spawns,core });
  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  };
  const nearBase = (x, y) => Math.max(Math.abs(x - core.x - 0.5), Math.abs(y - core.y - 0.5));
  const boulderRoom = version < 4 ? (x) => x > 5 && x < cols - 8
    : (x, y) => nearBase(x, y) > (fronts > 1 ? 5.5 : 3.5);
  const candidates = [...open].map((k) => [k % cols, Math.floor(k / cols)]).filter(([x, y]) =>
    boulderRoom(x, y) && !protectedRoute.has(key(x, y)) &&
    spawns.every((s) => Math.hypot(x - s.x, y - s.y) > 4));
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
  // One front: look at the firing line ahead of the base. Several: look at the base itself.
  const line = approach[Math.max(0, approach.length - 9)];
  const focus = fronts > 1 ? { x: core.x + 1, z: core.y + 1 } : {
    x: (core.x + 1) * 0.4 + (line.x + 0.5) * 0.6,
    z: (core.y + 1) * 0.4 + (line.y + 0.5) * 0.6
  };
  const name = level <= AUTHORED_LEVELS ? LEVELS[level - 1].name
    : `${SECTORS[(level - AUTHORED_LEVELS - 1) % SECTORS.length]} · Sector ${level}`;
  const named = [...new Set(sides)];
  const from = named.length === 1 ? `the ${named[0]}`
    : `the ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return {
    cols, rows, routeCount, paths, name, mapVersion: version,
    blurb: `${cols}×${rows} battlefield. ${routeCount} attack ${routeCount === 1 ? 'route converges' : 'routes converge'} on your base from ${from}. ${named.length > 1 ? 'Defend every side.' : 'Defend every approach.'}`,
    open: [...open].map((k) => [k % cols, Math.floor(k / cols)]),
    spawn, spawns, core, peaks, boulders, depth, focus, sides, fronts, front
  };
}
