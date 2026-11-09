import * as THREE from 'three';
import { CELL } from './config.js';

const CELL_RGB = {
  [CELL.OPEN]: [138, 112, 82],
  [CELL.SPAWN]: [110, 50, 130],
  [CELL.CORE]: [255, 197, 106],
  [CELL.WALL]: [170, 180, 186],
  [CELL.BUNKER]: [232, 180, 74],
  [CELL.TOWER]: [138, 112, 82]
};

const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Top-down overview of the canyon. Left-click or drag moves the camera,
 * right-click sends the selected units, red rings mark where we are being hit.
 */
export class Minimap {
  constructor(canvas, game, stage, { onCommand } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.stage = stage;
    this.onCommand = onCommand;
    this.cols = game.grid.COLS;
    this.rows = game.grid.ROWS;
    this.scale = 130 / Math.max(this.cols, this.rows);
    this.ndc = new THREE.Vector2();
    this.dragging = false;
    this.terrain = document.createElement('canvas');
    this.terrainVersion = -1;
    this.resize();

    canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
    canvas.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      const p = this.toWorld(ev);
      if (ev.button === 2) {
        this.onCommand?.(Math.floor(p.x), Math.floor(p.z));
        return;
      }
      if (ev.button !== 0) return;
      canvas.setPointerCapture(ev.pointerId);
      this.dragging = true;
      this.look(p);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (this.dragging) this.look(this.toWorld(ev));
    });
    const end = () => { this.dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  resize() {
    this.cols = this.game.grid.COLS;
    this.rows = this.game.grid.ROWS;
    this.scale = 130 / Math.max(this.cols, this.rows);
    this.pixels = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(this.cols * this.scale), h = Math.round(this.rows * this.scale);
    this.scale = w / this.cols;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.dpr = dpr;
    this.terrain.width = this.canvas.width;
    this.terrain.height = this.canvas.height;
    this.terrainVersion = -1;
  }

  toWorld(ev) {
    if (this.cols !== this.game.grid.COLS || this.rows !== this.game.grid.ROWS) this.resize();
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(this.cols - 0.01, ((ev.clientX - r.left) / r.width) * this.cols)),
      z: Math.max(0, Math.min(this.rows - 0.01, ((ev.clientY - r.top) / r.height) * this.rows))
    };
  }

  look(p) {
    this.stage.focus.set(p.x, 0, p.z);
  }

  /** Terrain and buildings only change when the grid does: paint one pixel per tile, cache, scale up. */
  paintTerrain() {
    const grid = this.game.grid;
    if (this.terrainVersion === grid.version) return;
    this.terrainVersion = grid.version;
    if (!this.pixels) {
      this.tiles = document.createElement('canvas');
      this.tiles.width = this.cols;
      this.tiles.height = this.rows;
      this.pixels = this.tiles.getContext('2d').createImageData(this.cols, this.rows);
    }
    const data = this.pixels.data;
    const depth = this.game.layout?.depth;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        const kind = grid.get(x, y);
        let rgb = CELL_RGB[kind];
        if (!rgb) {
          // mountains: darker the deeper into the rock
          const d = depth ? Math.min(1, depth[i] / 10) : 0.6;
          rgb = [62 - d * 34, 56 - d * 30, 48 - d * 24];
        }
        data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
      }
    }
    this.tiles.getContext('2d').putImageData(this.pixels, 0, 0);
    const c = this.terrain.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, this.terrain.width, this.terrain.height);
    c.drawImage(this.tiles, 0, 0, this.terrain.width, this.terrain.height);
  }

  draw() {
    const g = this.game;
    if (!g.grid || !g.core) return;
    if (this.cols !== g.grid.COLS || this.rows !== g.grid.ROWS) this.resize();
    this.paintTerrain();
    const ctx = this.ctx;
    const s = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.terrain, 0, 0);

    const dot = (x, z, r, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x * s, z * s, r * this.dpr, 0, Math.PI * 2);
      ctx.fill();
    };

    const airDot = (x, z, color) => {
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(x * s, z * s - 4 * this.dpr);
      ctx.lineTo(x * s + 3.5 * this.dpr, z * s + 3 * this.dpr);
      ctx.lineTo(x * s - 3.5 * this.dpr, z * s + 3 * this.dpr);
      ctx.closePath(); ctx.fill();
    };
    const sel = new Set(g.selection || []);
    for (const m of g.gunners) {
      if (m.dead || m.bunker) continue;
      if (m.flying) { airDot(m.x, m.z, sel.has(m) ? '#ffffff' : '#71e7e0'); continue; }
      dot(m.x, m.z, m.kind === 'tank' ? 3 : 2.4, sel.has(m) ? '#ffffff' : m.downed ? '#ff5a4a' : '#5ad7ff');
    }
    if (g.scv && !g.scv.dead) dot(g.scv.x, g.scv.z, 2.2, sel.has(g.scv) ? '#ffffff' : '#e2b13c');
    for (const z of g.zerglings) {
      if (!z.dead && z.flying) { airDot(z.x, z.z, '#ec89ff'); continue; }
      if (!z.dead) dot(z.x, z.z, z.breed?.scale > 1.2 ? 2.8 : 1.8, '#d05aff');
    }

    for (const hive of g.hives) if (!hive.dead) dot(hive.x, hive.z, 4, g.state === 'raid' ? '#ffd36a' : '#a44be0');

    // attack pings: expanding red rings that fade out
    ctx.lineWidth = 1.5 * this.dpr;
    for (const p of g.pings || []) {
      const k = (p.t % 1.3) / 1.3;
      ctx.strokeStyle = `rgba(255, 90, 74, ${(1 - k) * (1 - p.t / 2.6)})`;
      ctx.beginPath();
      ctx.arc(p.x * s, p.z * s, (3 + k * 12) * this.dpr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // camera footprint
    // top corners can look past the horizon; walk them down the screen until they hit ground
    const pts = [];
    for (const [nx, ny] of CORNERS) {
      let hit = null;
      for (let y = ny; y >= -1 && !hit; y -= 0.1) {
        this.ndc.set(nx, y);
        hit = this.stage.pick(this.ndc);
        if (hit && Math.hypot(hit.x - this.stage.focus.x, hit.z - this.stage.focus.z) > 60) hit = null;
      }
      if (hit) pts.push(hit);
    }
    if (pts.length >= 3) {
      ctx.strokeStyle = 'rgba(234, 245, 255, .85)';
      ctx.lineWidth = 1 * this.dpr;
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.z * s) : ctx.moveTo(p.x * s, p.z * s)));
      ctx.closePath();
      ctx.stroke();
    }
  }
}
