import * as THREE from 'three';
import { BUILD, COLS, ROWS } from './config.js';
import { Stage } from './scene.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';

const canvas = document.getElementById('game');
const stage = new Stage(canvas);
const game = new Game(stage);
const ui = new UI(game);

game.viewport = { w: 1, h: 1 };

/* ---------------- build cursor ---------------- */

const cursor = new THREE.Group();
const cursorPlate = new THREE.Mesh(
  new THREE.BoxGeometry(0.92, 0.06, 0.92),
  new THREE.MeshBasicMaterial({ color: 0x5ef08a, transparent: true, opacity: 0.4, depthWrite: false })
);
cursorPlate.position.y = 0.04;
cursor.add(cursorPlate);
const cursorEdge = new THREE.Mesh(
  new THREE.TorusGeometry(0.62, 0.025, 6, 4).rotateX(Math.PI / 2).rotateY(Math.PI / 4),
  new THREE.MeshBasicMaterial({ color: 0x5ef08a, transparent: true, opacity: 0.9, depthWrite: false })
);
cursorEdge.position.y = 0.06;
cursor.add(cursorEdge);
const rangeRing = new THREE.Mesh(
  new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x5ad7ff, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
);
rangeRing.position.y = 0.05;
rangeRing.visible = false;
cursor.add(rangeRing);
cursor.visible = false;
stage.scene.add(cursor);

const selRing = new THREE.Mesh(
  new THREE.RingGeometry(0.44, 0.52, 36).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
);
selRing.position.y = 0.03;
selRing.visible = false;
stage.scene.add(selRing);

const selRange = new THREE.Mesh(
  new THREE.RingGeometry(0.97, 1, 64).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x5ad7ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide })
);
selRange.position.y = 0.04;
selRange.visible = false;
stage.scene.add(selRange);

/* ---------------- input ---------------- */

const ndc = new THREE.Vector2();
let hoverTile = null;
let placing = null;
const drag = { on: false, mode: null, x: 0, y: 0, moved: 0 };

function updateNdc(ev) {
  const r = canvas.getBoundingClientRect();
  ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
}

function tileAt(ev) {
  updateNdc(ev);
  const p = stage.pick(ndc);
  if (!p) return null;
  const tx = Math.floor(p.x), ty = Math.floor(p.z);
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return null;
  return { x: tx, y: ty, world: p };
}

function entityAt(tile) {
  if (!tile) return null;
  const occ = game.grid.occupant(tile.x, tile.y);
  if (occ && !occ.dead) return occ;
  if (tile.x >= game.core.tx && tile.x < game.core.tx + 2 && tile.y >= game.core.ty && tile.y < game.core.ty + 2) return game.core;
  let best = null, bd = 0.62;
  for (const z of game.zerglings) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - (tile.world.x), z.z - (tile.world.z));
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}

function setPlacing(id) {
  placing = placing === id ? null : id;
  ui.setPlacing(placing);
  rangeRing.visible = placing === 'marine';
  if (placing) select(null);
  updateTip();
}

function select(e) {
  game.selected = e;
  ui.inspect.entity = e;
  if (!e) {
    selRing.visible = false;
    selRange.visible = false;
    ui.showUnit(ui.inspect.kind, ui.inspect.tier, null);
    return;
  }
  selRing.visible = true;
  selRing.position.set(e.x, 0.03, e.z);
  selRing.scale.setScalar(e.kind === 'core' ? 2.1 : 1);
  selRing.material.color.setHex(e.kind === 'zergling' ? 0xc06bff : 0x5ad7ff);
  selRange.visible = e.kind === 'marine';
  if (e.kind === 'marine') {
    selRange.position.set(e.x, 0.04, e.z);
    selRange.scale.setScalar(e.stats.range);
  }
  ui.showUnit(e.kind === 'zergling' ? 'zergling' : 'marine', e.kind === 'marine' ? e.tier : 0, e);
}

function updateTip() {
  if (placing) {
    ui.tip(placing === 'wall'
      ? 'Click to lay <b>bunker walls</b> — drag to build a run. The swarm will chew through whatever is cheapest.'
      : 'Click to emplace a <b>Marine</b>. Right-click or Esc to cancel.');
  } else if (game.state === 'build') {
    ui.tip('Build your fort, then <b>launch the wave</b>. Every kill pays for the next upgrade.');
  } else {
    ui.tip('Wave in progress — click any unit to inspect it.');
  }
}

canvas.addEventListener('pointermove', (ev) => {
  if (drag.on) {
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'orbit') {
      stage.yaw += dx * 0.006;
      stage.pitch = Math.max(0.42, Math.min(1.45, stage.pitch + dy * 0.005));
    } else if (drag.mode === 'pan') {
      const k = stage.dist * 0.0016;
      const fx = Math.cos(stage.yaw), fz = Math.sin(stage.yaw);
      stage.focus.x += (fx * dy - -fz * dx) * k;
      stage.focus.z += (fz * dy - fx * dx) * k;
      stage.focus.x = Math.max(-4, Math.min(COLS + 4, stage.focus.x));
      stage.focus.z = Math.max(-4, Math.min(ROWS + 4, stage.focus.z));
    } else if (drag.mode === 'build' && placing) {
      const t = tileAt(ev);
      if (t && (!hoverTile || t.x !== hoverTile.x || t.y !== hoverTile.y)) tryPlace(t);
    }
    drag.x = ev.clientX; drag.y = ev.clientY;
    if (drag.mode !== 'build') return;
  }

  hoverTile = tileAt(ev);
  if (!hoverTile) { cursor.visible = false; return; }

  if (placing) {
    const ok = game.grid.buildable(hoverTile.x, hoverTile.y) && game.canAfford(BUILD[placing].cost);
    cursor.visible = true;
    cursor.position.set(hoverTile.x + 0.5, 0, hoverTile.y + 0.5);
    const col = ok ? 0x5ef08a : 0xff5a4a;
    cursorPlate.material.color.setHex(col);
    cursorEdge.material.color.setHex(col);
    rangeRing.visible = placing === 'marine' && ok;
    if (rangeRing.visible) rangeRing.scale.setScalar(game.marineRangePreview ?? 4.4);
  } else {
    cursor.visible = false;
  }
});

function tryPlace(t) {
  if (!placing) return;
  const ok = placing === 'wall' ? game.placeWall(t.x, t.y) : game.placeMarine(t.x, t.y);
  if (!ok) {
    sfx.deny();
    return;
  }
  if (placing === 'marine') setPlacing(null);
}

canvas.addEventListener('pointerdown', (ev) => {
  sfx.resume();
  canvas.setPointerCapture(ev.pointerId);
  drag.on = true;
  drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0;

  if (ev.button === 2) { drag.mode = 'orbit'; return; }
  if (ev.button === 1 || ev.shiftKey) { drag.mode = 'pan'; return; }

  const t = tileAt(ev);
  if (placing && t) { drag.mode = 'build'; tryPlace(t); return; }
  drag.mode = 'select';
});

canvas.addEventListener('pointerup', (ev) => {
  if (drag.mode === 'select' && drag.moved < 6) {
    const t = tileAt(ev);
    select(entityAt(t));
  }
  drag.on = false;
  drag.mode = null;
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (placing) setPlacing(null);
});

canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  stage.userZoomed = true;
  stage.dist = Math.max(7, Math.min(stage.maxDist, stage.dist + Math.sign(ev.deltaY) * stage.dist * 0.09));
}, { passive: false });

window.addEventListener('keydown', (ev) => {
  if (ev.key === '1') setPlacing('wall');
  if (ev.key === '2') setPlacing('marine');
  if (ev.key === 'Escape') { setPlacing(null); select(null); }
  if (ev.code === 'Space') { ev.preventDefault(); sfx.resume(); game.startWave(); }
  if (ev.key === 'u' || ev.key === 'U') {
    if (game.selected?.kind === 'marine') game.upgradeMarine(game.selected);
  }
  if (ev.key === 'x' || ev.key === 'X') {
    if (game.selected && game.selected.kind !== 'core') game.sell(game.selected);
  }
});

game.on('pick', setPlacing);
game.on('restart', () => {
  game.reset();
  setPlacing(null);
  select(null);
  ui.hideBanner();
  ui.sync();
});
game.on('change', () => {
  if (game.selected?.dead) select(null);
  if (game.selected) {
    selRing.position.set(game.selected.x, 0.03, game.selected.z);
    if (game.selected.kind === 'marine') selRange.scale.setScalar(game.selected.stats.range);
  }
});

/* ---------------- audio + speed toggles ---------------- */

const btnSound = document.getElementById('btnSound');
btnSound.addEventListener('click', () => {
  sfx.resume();
  const on = !sfx.isEnabled();
  sfx.setEnabled(on);
  btnSound.textContent = on ? 'ON' : 'OFF';
  btnSound.classList.toggle('btn--off', !on);
});

const btnSpeed = document.getElementById('btnSpeed');
btnSpeed.addEventListener('click', () => {
  game.speed = game.speed === 1 ? 2 : game.speed === 2 ? 3 : 1;
  btnSpeed.textContent = game.speed + 'x';
  sfx.ui();
});

/* ---------------- loop ---------------- */

function resize() {
  const r = canvas.parentElement.getBoundingClientRect();
  game.viewport = { w: r.width, h: r.height };
  stage.resize(r.width, r.height);
  ui.portrait.resize();
}
window.addEventListener('resize', resize);

let last = performance.now();
function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  const dt = raw * game.speed;

  game.update(dt);

  // keep the selection decals glued to live entities
  if (game.selected && !game.selected.dead) {
    selRing.position.set(game.selected.x, 0.03, game.selected.z);
    selRing.rotation.y += raw * 0.8;
    if (selRange.visible) selRange.position.set(game.selected.x, 0.04, game.selected.z);
  } else if (game.selected?.dead) {
    select(null);
  }

  if (cursor.visible) {
    cursorEdge.rotation.y += raw * 1.4;
    cursorPlate.material.opacity = 0.28 + Math.sin(now * 0.005) * 0.12;
  }

  ui.update(raw);
  stage.updateCamera();
  stage.applyShake(raw);
  stage.render();
  requestAnimationFrame(frame);
}

game.marineRangePreview = 4.4;
resize();
ui.sync();
updateTip();
requestAnimationFrame(frame);
