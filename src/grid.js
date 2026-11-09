import { COLS, ROWS, CELL, BREAK_COST, CORE_HP } from './config.js';

const SQRT2 = Math.SQRT2;

/** Binary min-heap of cell indices keyed by priority (stale entries are skipped by the callers). */
class MinHeap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }
  push(id, key) {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop(), lastKey = keys.pop();
    const n = ids.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lastKey;
        if (l < n && keys[l] < mk) { m = l; mk = keys[l]; }
        if (r < n && keys[r] < mk) { m = r; mk = keys[r]; }
        if (m === i) break;
        ids[i] = ids[m]; keys[i] = keys[m];
        i = m;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}

export class Grid {
  constructor(cols = COLS, rows = ROWS) {
    this.COLS = cols;
    this.ROWS = rows;
    this.cells = new Uint8Array(cols * rows);
    this.occupants = new Array(cols * rows).fill(null);
    this.version = 0;
    this.spawn = { x: 0, y: 7 };
    this.spawns = [this.spawn];
    this.core = { x: 22, y: 7, w: 2, h: 2, hp: CORE_HP };
    this.cells.fill(CELL.ROCK);
  }

  idx(x, y) { return y * this.COLS + x; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.COLS && y < this.ROWS; }
  get(x, y) { return this.inside(x, y) ? this.cells[this.idx(x, y)] : CELL.ROCK; }
  occupant(x, y) { return this.inside(x, y) ? this.occupants[this.idx(x, y)] : null; }

  load(layout) {
    const cols = layout.cols || this.COLS, rows = layout.rows || this.ROWS;
    if (cols !== this.COLS || rows !== this.ROWS) {
      this.COLS = cols; this.ROWS = rows;
      this.cells = new Uint8Array(cols * rows);
      this.occupants = new Array(cols * rows).fill(null);
      this._field = null;
    }
    this.spawn = layout.spawn;
    this.spawns = layout.spawns?.length ? layout.spawns : [layout.spawn];
    this.core = layout.core;
    this.cells.fill(CELL.ROCK);
    this.occupants.fill(null);
    for (const [x, y] of layout.open) {
      if (this.inside(x, y)) this.cells[this.idx(x, y)] = CELL.OPEN;
    }
    const c = layout.core;
    for (let dy = 0; dy < c.h; dy++) {
      for (let dx = 0; dx < c.w; dx++) {
        if (this.inside(c.x + dx, c.y + dy)) this.cells[this.idx(c.x + dx, c.y + dy)] = CELL.CORE;
      }
    }
    for (const s of this.spawns) {
      if (this.inside(s.x, s.y)) this.cells[this.idx(s.x, s.y)] = CELL.SPAWN;
      if (this.inside(s.x, s.y + 1)) this.cells[this.idx(s.x, s.y + 1)] = CELL.SPAWN;
    }
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
    for (const s of this.spawns || [this.spawn]) {
      if (Math.abs(x - s.x) <= 1 && Math.abs(y - s.y) <= 2) return false;
    }
    const c = this.core;
    if (x >= c.x - 1 && x <= c.x + c.w && y >= c.y - 1 && y <= c.y + c.h) return false;
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

  /** A*. walk=true stays on open ground and will not chew through buildings. */
  findPath(sx, sy, tx, ty, walk = false) {
    const n = this.COLS * this.ROWS;
    const g = new Float64Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const closed = new Uint8Array(n);
    const open = new MinHeap();

    const h = (x, y) => {
      const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
      return (dx + dy) + (SQRT2 - 2) * Math.min(dx, dy);
    };
    const price = (x, y) => {
      if (!walk) return this.cost(x, y);
      if (x === sx && y === sy) return 0;
      // squadmates step aside: walk through a friendly unit's tile, never through walls or bunkers
      const c = this.get(x, y);
      if (c === CELL.OPEN) return 0;
      if (c === CELL.TOWER && !(x === tx && y === ty)) return 0.4;
      return Infinity;
    };

    const start = this.idx(sx, sy);
    g[start] = 0;
    open.push(start, h(sx, sy));

    while (open.size) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;

      const cx = cur % this.COLS, cy = (cur / this.COLS) | 0;
      if (cx === tx && cy === ty) return this.rebuild(from, cur);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.inside(nx, ny)) continue;
          const ni = this.idx(nx, ny);
          if (closed[ni]) continue;
          const step = price(nx, ny);
          if (step === Infinity) continue;
          // no squeezing diagonally between two solid corners
          if (dx && dy && (price(cx + dx, cy) === Infinity || price(cx, cy + dy) === Infinity)) continue;
          const tentative = g[cur] + (dx && dy ? SQRT2 : 1) + step;
          if (tentative < g[ni]) {
            g[ni] = tentative;
            from[ni] = cur;
            open.push(ni, tentative + h(nx, ny));
          }
        }
      }
    }
    return null;
  }

  /**
   * The swarm's route map: for every cell, the cheapest next step toward the base
   * (chewing through buildings when that is cheaper than walking around). Built once per
   * grid change with a single Dijkstra out from the base, and shared by every bug.
   */
  field() {
    if (this._field && this._field.version === this.version) return this._field;
    const n = this.COLS * this.ROWS;
    const dist = new Float64Array(n).fill(Infinity);
    const next = new Int32Array(n).fill(-1);
    const heap = new MinHeap();
    const c = this.core;
    for (let dy = 0; dy < c.h; dy++) {
      for (let dx = 0; dx < c.w; dx++) {
        const i = this.idx(c.x + dx, c.y + dy);
        dist[i] = 0;
        heap.push(i, 0);
      }
    }
    while (heap.size) {
      const cur = heap.pop();
      const cx = cur % this.COLS, cy = (cur / this.COLS) | 0;
      // stepping onto `cur` from a neighbour costs whatever `cur` costs to get through
      const enter = this.cost(cx, cy);
      if (enter === Infinity) continue;
      const base = dist[cur] + enter;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (!this.inside(nx, ny)) continue;
          if (this.cost(nx, ny) === Infinity) continue;
          if (dx && dy && (this.cost(cx + dx, cy) === Infinity || this.cost(cx, cy + dy) === Infinity)) continue;
          const ni = this.idx(nx, ny);
          const d = base + (dx && dy ? SQRT2 : 1);
          if (d < dist[ni]) {
            dist[ni] = d;
            next[ni] = cur;
            heap.push(ni, d);
          }
        }
      }
    }
    this._field = { version: this.version, dist, next };
    return this._field;
  }

  rebuild(from, end) {
    const out = [];
    let cur = end;
    while (cur !== -1) {
      out.push({ x: cur % this.COLS, y: (cur / this.COLS) | 0 });
      cur = from[cur];
    }
    return out.reverse();
  }

  /** Straight line of sight through non-blocking cells, used for path smoothing. */
  clearLine(ax, ay, bx, by) {
    return this.clearWorldLine(ax + 0.5, ay + 0.5, bx + 0.5, by + 0.5);
  }

  /** Check the exact route from a moving bug to its next waypoint. */
  clearWorldLine(ax, ay, bx, by, allowBlockedEnd = false) {
    // Walk every tile the segment touches. Bresenham can skip a
    // rock at a shallow angle, making a smoothed waypoint impossible to reach.
    let x = Math.floor(ax), y = Math.floor(ay);
    const tx = Math.floor(bx), ty = Math.floor(by);
    const dx = bx - ax, dy = by - ay;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const stepX = dx ? 1 / Math.abs(dx) : Infinity;
    const stepY = dy ? 1 / Math.abs(dy) : Infinity;
    let edgeX = sx > 0 ? (x + 1 - ax) * stepX : sx < 0 ? (ax - x) * stepX : Infinity;
    let edgeY = sy > 0 ? (y + 1 - ay) * stepY : sy < 0 ? (ay - y) * stepY : Infinity;
    while (x !== tx || y !== ty) {
      if (this.blocked(x, y)) return false;
      if (edgeX < edgeY - 1e-12) { x += sx; edgeX += stepX; }
      else if (edgeY < edgeX - 1e-12) { y += sy; edgeY += stepY; }
      else {
        // A line exactly through a corner must not cut between solid tiles.
        if (this.blocked(x + sx, y) || this.blocked(x, y + sy)) return false;
        x += sx; y += sy;
        edgeX += stepX; edgeY += stepY;
      }
      if (this.blocked(x, y) && !(allowBlockedEnd && x === tx && y === ty)) return false;
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

  /**
   * The next stretch of a bug's march, read off the shared route map: up to `ahead`
   * cells toward the base, smoothed. Bugs re-read it as they go, so it never needs the whole way.
   */
  route(fromX, fromY, ahead = 24) {
    const f = this.field();
    let cur = this.idx(fromX, fromY);
    if (f.dist[cur] === Infinity) {
      // standing somewhere odd (spawn edge, a cell that just closed): start from the best neighbour
      let best = -1, bd = Infinity;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const x = fromX + dx, y = fromY + dy;
          if (!this.inside(x, y)) continue;
          const i = this.idx(x, y);
          if (f.dist[i] < bd) { bd = f.dist[i]; best = i; }
        }
      }
      if (best < 0) return [];
      cur = best;
    }
    const cells = [{ x: cur % this.COLS, y: (cur / this.COLS) | 0 }];
    while (cells.length < ahead && f.next[cur] !== -1) {
      cur = f.next[cur];
      cells.push({ x: cur % this.COLS, y: (cur / this.COLS) | 0 });
    }
    return this.smooth(cells);
  }

  /** Cell centers a marine or tank can drive, staying on open ground. */
  walkRoute(sx, sy, tx, ty) {
    const cells = this.findPath(sx, sy, tx, ty, true);
    if (!cells) return null;
    return cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5, cx: c.x, cy: c.y }));
  }

  /**
   * Can something walk straight from cell A to cell B? Rock, walls and bunkers in
   * between block it; troops standing in the way do not. The end cells themselves are not checked.
   */
  lineOpen(ax, ay, bx, by) {
    let x = ax, y = ay;
    const dx = Math.abs(bx - ax), dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
    let err = dx - dy;
    while (x !== bx || y !== by) {
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
      if (x === bx && y === by) break;
      const c = this.get(x, y);
      if (c === CELL.ROCK || c === CELL.WALL || c === CELL.BUNKER) return false;
    }
    return true;
  }

  /** Closest open (walkable, unoccupied) cell to (tx, ty), searching rings out to maxR. */
  nearestOpen(tx, ty, maxR = 3, skip = null) {
    for (let r = 0; r <= maxR; r++) {
      let best = null, bd = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = tx + dx, y = ty + dy;
          if (!this.inside(x, y) || this.get(x, y) !== CELL.OPEN) continue;
          if (skip && skip.has(this.idx(x, y))) continue;
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = { x, y }; }
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Would placing here seal the swarm out entirely? (allowed, but worth warning about) */
  wouldFullyBlock(x, y) {
    const prev = this.cells[this.idx(x, y)];
    this.cells[this.idx(x, y)] = CELL.WALL;
    const path = this.findPath(this.spawn.x, this.spawn.y, this.core.x, this.core.y);
    const open = path && path.every((c) => !this.blocked(c.x, c.y));
    this.cells[this.idx(x, y)] = prev;
    return !open;
  }
}
