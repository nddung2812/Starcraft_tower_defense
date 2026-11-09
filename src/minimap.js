import * as THREE from 'three';
import { CELL, COLS, ROWS } from './config.js';

const CELL_COLOR = {
  [CELL.OPEN]: '#6b5a44',
  [CELL.SPAWN]: '#5a2f6e',
  [CELL.CORE]: '#6b5a44',
  [CELL.ROCK]: '#1a1f26',
  [CELL.WALL]: '#9aa3a8',
  [CELL.BUNKER]: '#e8b44a',
  [CELL.TOWER]: '#6b5a44'
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
    this.scale = 130 / COLS;   // always 130 px wide, whatever the map size
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(COLS * this.scale), h = Math.round(ROWS * this.scale);
    this.scale = w / COLS;
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
    const r = this.canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(COLS - 0.01, ((ev.clientX - r.left) / r.width) * COLS)),
      z: Math.max(0, Math.min(ROWS - 0.01, ((ev.clientY - r.top) / r.height) * ROWS))
    };
  }

  look(p) {
    this.stage.focus.set(p.x, 0, p.z);
  }

  /** Terrain and buildings only change when the grid does, so cache them. */
  paintTerrain() {
    const grid = this.game.grid;
    if (this.terrainVersion === grid.version) return;
    this.terrainVersion = grid.version;
    const c = this.terrain.getContext('2d');
    const s = this.scale * this.dpr;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        c.fillStyle = CELL_COLOR[grid.get(x, y)] || '#1a1f26';
        c.fillRect(x * s, y * s, s, s);
      }
    }
    const core = grid.core;
    c.fillStyle = '#ffc56a';
    c.fillRect(core.x * s + 1, core.y * s + 1, core.w * s - 2, core.h * s - 2);
  }

  draw() {
    const g = this.game;
    if (!g.grid || !g.core) return;
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

    const sel = new Set(g.selection || []);
    for (const m of g.gunners) {
      if (m.dead || m.bunker) continue;
      dot(m.x, m.z, m.kind === 'tank' ? 3 : 2.4, sel.has(m) ? '#ffffff' : m.downed ? '#ff5a4a' : '#5ad7ff');
    }
    if (g.scv && !g.scv.dead) dot(g.scv.x, g.scv.z, 2.2, sel.has(g.scv) ? '#ffffff' : '#e2b13c');
    for (const z of g.zerglings) {
      if (!z.dead) dot(z.x, z.z, z.breed?.scale > 1.2 ? 2.8 : 1.8, '#d05aff');
    }

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
