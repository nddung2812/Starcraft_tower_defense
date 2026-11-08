import { COLS, ROWS, CELL, BREAK_COST, CORE, SPAWN, ROCKS } from './config.js';

const SQRT2 = Math.SQRT2;

export class Grid {
  constructor() {
    this.COLS = COLS;
    this.ROWS = ROWS;
    this.cells = new Uint8Array(COLS * ROWS);
    this.occupants = new Array(COLS * ROWS).fill(null);
    this.version = 0;
    this.reset();
  }

  idx(x, y) { return y * COLS + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < COLS && y < ROWS; }
  get(x, y) { return this.inside(x, y) ? this.cells[this.idx(x, y)] : CELL.ROCK; }
  occupant(x, y) { return this.inside(x, y) ? this.occupants[this.idx(x, y)] : null; }

  reset() {
    this.cells.fill(CELL.OPEN);
    this.occupants.fill(null);
    for (const [x, y] of ROCKS) if (this.inside(x, y)) this.cells[this.idx(x, y)] = CELL.ROCK;
    for (let dy = 0; dy < CORE.h; dy++) {
      for (let dx = 0; dx < CORE.w; dx++) this.cells[this.idx(CORE.x + dx, CORE.y + dy)] = CELL.CORE;
    }
    this.cells[this.idx(SPAWN.x, SPAWN.y)] = CELL.SPAWN;
    this.cells[this.idx(SPAWN.x, SPAWN.y + 1)] = CELL.SPAWN;
    this.version++;
  }

  set(x, y, kind, occupant = null) {
    if (!this.inside(x, y)) return;
    this.cells[this.idx(x, y)] = kind;
    this.occupants[this.idx(x, y)] = occupant;
    this.version++;
  }

  clear(x, y) { this.set(x, y, CELL.OPEN, null); }

  buildable(x, y) {
    if (!this.inside(x, y)) return false;
    if (this.cells[this.idx(x, y)] !== CELL.OPEN) return false;
    // keep the hatchery mouth and the bunker doorway clear
    if (x <= 1 && Math.abs(y - SPAWN.y) <= 2) return false;
    if (x >= CORE.x - 1 && x <= CORE.x + CORE.w && y >= CORE.y - 1 && y <= CORE.y + CORE.h) return false;
    return true;
  }

  /** Movement cost: 0 = free, >0 = must be destroyed first, Infinity = never. */
  cost(x, y) {
    const c = this.get(x, y);
    if (c === CELL.ROCK) return Infinity;
    if (c === CELL.WALL || c === CELL.TOWER || c === CELL.BUNKER) return BREAK_COST;
    return 0;
  }

  blocked(x, y) { return this.cost(x, y) > 0; }

  /** A* that treats player structures as expensive but breakable. */
  findPath(sx, sy, tx, ty) {
    const n = COLS * ROWS;
    const g = new Float64Array(n).fill(Infinity);
    const f = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open = [];

    const h = (x, y) => {
      const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
      return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
    };

    const start = this.idx(sx, sy);
    g[start] = 0; f[start] = h(sx, sy);
    open.push(start);

    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const cur = open.splice(bi, 1)[0];
      if (closed[cur]) continue;
      closed[cur] = 1;

      const cx = cur % COLS, cy = (cur / COLS) | 0;
      if (cx === tx && cy === ty) return this.rebuild(from, cur);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.inside(nx, ny)) continue;
          const ni = this.idx(nx, ny);
          if (closed[ni]) continue;
          const step = this.cost(nx, ny);
          if (step === Infinity) continue;
          // no squeezing diagonally between two solid corners
          if (dx && dy && (this.cost(cx + dx, cy) === Infinity || this.cost(cx, cy + dy) === Infinity)) continue;
          const move = (dx && dy ? SQRT2 : 1) + step;
          const tentative = g[cur] + move;
          if (tentative < g[ni]) {
            g[ni] = tentative;
            f[ni] = tentative + h(nx, ny);
            from[ni] = cur;
            open.push(ni);
          }
        }
      }
    }
    return null;
  }

  rebuild(from, end) {
    const out = [];
    let cur = end;
    while (cur !== -1) {
      out.push({ x: cur % COLS, y: (cur / COLS) | 0 });
      cur = from[cur];
    }
    return out.reverse();
  }

  /** Straight line of sight through non-blocking cells, used for path smoothing. */
  clearLine(ax, ay, bx, by) {
    let x = ax, y = ay;
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let err = dx - dy;
    while (x !== bx || y !== by) {
      if (this.blocked(x, y)) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (this.blocked(x, y)) return false;
    }
    return true;
  }

  /** Cell path -> world waypoints, with corners pulled tight for smooth movement. */
  smooth(cellPath) {
    if (!cellPath || cellPath.length < 2) return [];
    const pts = [];
    let i = 0;
    while (i < cellPath.length) {
      pts.push(cellPath[i]);
      if (i === cellPath.length - 1) break;
      let j = cellPath.length - 1;
      // never skip past a blocker we are meant to break
      for (let k = i + 1; k < cellPath.length; k++) {
        if (this.blocked(cellPath[k].x, cellPath[k].y)) { j = k; break; }
      }
      let best = i + 1;
      for (let k = j; k > i + 1; k--) {
        if (this.clearLine(cellPath[i].x, cellPath[i].y, cellPath[k].x, cellPath[k].y)) { best = k; break; }
      }
      i = best;
    }
    return pts.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5, cx: c.x, cy: c.y }));
  }

  route(fromX, fromY) {
    const cells = this.findPath(fromX, fromY, CORE.x, CORE.y);
    return this.smooth(cells);
  }

  /** Would placing here seal the swarm out entirely? (allowed, but worth warning about) */
  wouldFullyBlock(x, y) {
    const prev = this.cells[this.idx(x, y)];
    this.cells[this.idx(x, y)] = CELL.WALL;
    const path = this.findPath(SPAWN.x, SPAWN.y, CORE.x, CORE.y);
    const open = path && path.every((c) => !this.blocked(c.x, c.y));
    this.cells[this.idx(x, y)] = prev;
    return !open;
  }
}
