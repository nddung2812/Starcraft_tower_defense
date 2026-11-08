import * as THREE from 'three';
import { BUILD, CELL, COLS, ROWS, UNITS, AIR_STRIKE } from './config.js';
import { Stage } from './scene.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { sfx } from './audio.js';
import { voice } from './voice.js';

const canvas = document.getElementById('game');
const stage = new Stage(canvas);
const game = new Game(stage);
window.game = game;
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

const focusRing = new THREE.Mesh(
  new THREE.RingGeometry(0.34, 0.46, 4).rotateX(-Math.PI / 2).rotateY(Math.PI / 4),
  new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })
);
focusRing.position.y = 0.05;
focusRing.visible = false;
stage.scene.add(focusRing);

/* ---------------- input ---------------- */

const ndc = new THREE.Vector2();
let hoverTile = null;
let placing = null;
let airAim = false;
const drag = { on: false, mode: null, x: 0, y: 0, moved: 0 };
const pointer = { x: 0, y: 0, inside: false };
const keys = new Set();
const EDGE = 36;
const EDGE_SPEED = 14;

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
  if (game.scv && !game.scv.dead && Math.hypot(game.scv.x - tile.world.x, game.scv.z - tile.world.z) < 0.7) return game.scv;
  if (tile.x >= game.core.tx && tile.x < game.core.tx + 2 && tile.y >= game.core.ty && tile.y < game.core.ty + 2) return game.core;
  let best = null, bd = 0.7;
  for (const z of game.zerglings) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - (tile.world.x), z.z - (tile.world.z));
    if (d < bd) { bd = d; best = z; }
  }
  for (const m of game.gunners) {
    if (!m.downed) continue;
    const d = Math.hypot(m.x - tile.world.x, m.z - tile.world.z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function isGun(e) { return !!(e && UNITS[e.kind]); }

function setPlacing(id) {
  placing = placing === id ? null : id;
  if (placing) setAirAim(false);
  ui.setPlacing(placing);
  rangeRing.visible = !!(placing && UNITS[placing]);
  if (placing) select(null);
  updateTip();
}

function setAirAim(on) {
  if (on && (!game.airStrikeReady || (game.state !== 'wave' && game.state !== 'brief'))) {
    sfx.deny();
    return;
  }
  airAim = !!on;
  if (airAim) {
    placing = null;
    ui.setPlacing(null);
    select(null);
  }
  ui.setAirArmed(airAim);
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
  selRing.material.color.setHex(e.kind === 'zergling' ? 0xc06bff : e.kind === 'scv' ? 0xe2b13c : 0x5ad7ff);
  selRange.visible = isGun(e) && !e.bunker;
  if (selRange.visible) {
    selRange.position.set(e.x, 0.04, e.z);
    selRange.scale.setScalar(e.stats.range);
    selRange.material.color.setHex(UNITS[e.kind].accent);
  }
  const tab = e.kind === 'zergling' || isGun(e) ? e.kind : ui.inspect.kind;
  ui.showUnit(tab, isGun(e) ? e.tier : 0, e);
}

function updateTip() {
  if (game.state !== 'build') { ui.tip(''); return; }
  if (placing === 'wall') ui.tip('Walls redirect the swarm. Drag to lay a run. They cannot leave the canyon.');
  else if (placing === 'marine') ui.tip('Place a Marine. Select him and click open ground to move.');
  else if (placing === 'goliath') ui.tip('Goliath. Twin autocannons, long reach. Too big for a bunker.');
  else if (placing === 'tank') ui.tip('Siege Tank. Select it and click open ground to drive. Twin cannons, wide blast.');
  else if (placing === 'bunker') ui.tip('Bunker faces the bugs. Put a Marine in it for the armour.');
  else if (airAim) ui.tip(`Air Strike armed. Click the lane — ${AIR_STRIKE.damage} damage, ${AIR_STRIKE.radius.toFixed(1)} tile blast. ${AIR_STRIKE.cooldown}s cooldown.`);
  else ui.tip(`${game.layout?.name || 'Canyon'}. Select a Marine or Siege Tank, then click the canyon to move them.`);
}

function trackPointer(ev) {
  pointer.x = ev.clientX;
  pointer.y = ev.clientY;
  const r = canvas.getBoundingClientRect();
  pointer.inside = ev.clientX >= r.left && ev.clientX <= r.right
    && ev.clientY >= r.top && ev.clientY <= r.bottom;
}

canvas.addEventListener('pointermove', (ev) => {
  trackPointer(ev);

  if (drag.on) {
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'orbit') {
      stage.spin(dx * 0.012);
      stage.pitch = Math.max(0.28, Math.min(1.25, stage.pitch + dy * 0.006));
    } else if (drag.mode === 'pan') {
      const k = stage.dist * 0.0016;
      stage.pan(dx * k, dy * k);
    } else if (drag.mode === 'build' && placing) {
      const t = tileAt(ev);
      if (t && (!hoverTile || t.x !== hoverTile.x || t.y !== hoverTile.y)) tryPlace(t);
    }
    drag.x = ev.clientX; drag.y = ev.clientY;
    if (drag.mode !== 'build') return;
  }

  hoverTile = tileAt(ev);
  if (!hoverTile) { cursor.visible = false; return; }

  if (airAim) {
    cursor.visible = true;
    cursor.position.set(hoverTile.x + 0.5, 0, hoverTile.y + 0.5);
    cursorPlate.material.color.setHex(0xff5a4a);
    cursorEdge.material.color.setHex(0xff5a4a);
    rangeRing.visible = true;
    rangeRing.scale.setScalar(AIR_STRIKE.radius);
    rangeRing.material.color.setHex(0xff5a4a);
  } else if (placing) {
    const ok = game.grid.buildable(hoverTile.x, hoverTile.y) && game.canAfford(BUILD[placing].cost);
    cursor.visible = true;
    cursor.position.set(hoverTile.x + 0.5, 0, hoverTile.y + 0.5);
    const col = ok ? 0x5ef08a : 0xff5a4a;
    cursorPlate.material.color.setHex(col);
    cursorEdge.material.color.setHex(col);
    const spec = UNITS[placing];
    rangeRing.visible = !!(spec && ok);
    if (spec) {
      rangeRing.scale.setScalar(spec.tiers[0].range);
      rangeRing.material.color.setHex(spec.accent);
    }
  } else if (game.selected?.spec?.mobile && !game.selected.dead && !game.selected.downed && !game.selected.bunker) {
    const open = game.grid.get(hoverTile.x, hoverTile.y) === CELL.OPEN;
    cursor.visible = true;
    cursor.position.set(hoverTile.x + 0.5, 0, hoverTile.y + 0.5);
    const col = open ? 0x5ad7ff : 0xff5a4a;
    cursorPlate.material.color.setHex(col);
    cursorEdge.material.color.setHex(col);
    rangeRing.visible = false;
  } else {
    cursor.visible = false;
  }
});

canvas.addEventListener('pointerleave', (ev) => {
  if (!drag.on) pointer.inside = false;
  else trackPointer(ev);
});
canvas.addEventListener('pointerenter', trackPointer);

function tryPlace(t) {
  if (!placing) return;
  const ok = placing === 'wall' ? game.placeWall(t.x, t.y)
    : placing === 'bunker' ? game.placeBunker(t.x, t.y)
    : game.placeGunner(placing, t.x, t.y);
  if (!ok) { sfx.deny(); return; }
  if (placing !== 'wall') setPlacing(null);
}

canvas.addEventListener('pointerdown', (ev) => {
  sfx.resume();
  voice.unlock();
  if (ev.button === 1) ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);
  drag.on = true;
  drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0;

  if (ev.button === 2 || ev.altKey) { drag.mode = 'orbit'; return; }
  if (ev.button === 1 || ev.shiftKey) { drag.mode = 'pan'; return; }

  const t = tileAt(ev);
  if (airAim && t && ev.button === 0) {
    drag.mode = 'air';
    if (game.callAirStrike(t.x + 0.5, t.y + 0.5)) setAirAim(false);
    else sfx.deny();
    return;
  }
  if (placing && t && ev.button === 0) { drag.mode = 'build'; tryPlace(t); return; }
  drag.mode = 'pan';
});

canvas.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); });

canvas.addEventListener('pointerup', (ev) => {
  if (drag.mode === 'pan' && drag.moved < 6) {
    const t = tileAt(ev);
    const e = entityAt(t);
    const sel = game.selected;
    if (sel?.kind === 'marine' && e?.kind === 'bunker') game.garrison(sel, e);
    else if (sel?.kind === 'scv' && e && (e.kind === 'wall' || e.kind === 'bunker') && e.hp < e.maxHp) {
      sel.order = { type: 'repair', target: e };
      voice.say('repair');
    } else if (sel?.kind === 'scv' && e?.kind === 'marine' && e.downed) {
      sel.order = { type: 'revive', target: e };
      voice.say('repair');
    } else if ((game.state === 'wave' || game.state === 'brief') && e?.kind === 'zergling') {
      game.focus = e;
      select(e);
    } else if (sel?.spec?.mobile && !e && t && !sel.dead && !sel.downed && !sel.bunker) {
      if (sel.orderMove(t.x, t.y, game)) sfx.ui();
      else if (game.grid.get(t.x, t.y) !== CELL.OPEN) select(null);
      else sfx.deny();
    } else select(e);
  }
  drag.on = false;
  drag.mode = null;
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (placing) setPlacing(null);
  if (airAim) setAirAim(false);
});

canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  stage.zoomBy(ev.deltaY > 0 ? 1.12 : 0.88);
}, { passive: false });

document.getElementById('camLeft').addEventListener('click', () => stage.spin(-0.4));
document.getElementById('camRight').addEventListener('click', () => stage.spin(0.4));
document.getElementById('camIn').addEventListener('click', () => stage.zoomBy(0.82));
document.getElementById('camOut').addEventListener('click', () => stage.zoomBy(1.22));
document.getElementById('camReset').addEventListener('click', () => stage.resetView());

window.addEventListener('keydown', (ev) => {
  if (['w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
    keys.add(ev.key.toLowerCase().startsWith('arrow') ? ev.key : ev.key.toLowerCase());
  }
  if (ev.key === '1') setPlacing('wall');
  if (ev.key === '2') setPlacing('marine');
  if (ev.key === '3') setPlacing('bunker');
  if (ev.key === '4') setPlacing('goliath');
  if (ev.key === '5') setPlacing('tank');
  if (ev.key === 'f' || ev.key === 'F') {
    if (game.selected?.kind === 'marine') game.selected.stim(game);
  }
  if (ev.key === 'r' || ev.key === 'R') setAirAim(!airAim);
  if (ev.key === 'q' || ev.key === 'Q') stage.spin(-0.35);
  if (ev.key === 'e' || ev.key === 'E') stage.spin(0.35);
  if (ev.key === '-' || ev.key === '_') stage.zoomBy(1.15);
  if (ev.key === '=' || ev.key === '+') stage.zoomBy(0.87);
  if (ev.key === 'Escape') { setPlacing(null); setAirAim(false); game.focus = null; select(null); }
  if (ev.code === 'Space') { ev.preventDefault(); sfx.resume(); game.startWave(); }
  if (ev.key === 'u' || ev.key === 'U') {
    if (game.selected?.upgrade) game.upgradeGunner(game.selected);
  }
  if (ev.key === 'x' || ev.key === 'X') {
    if (game.selected && game.selected.kind !== 'core') game.sell(game.selected);
  }
});

window.addEventListener('keyup', (ev) => {
  keys.delete(ev.key);
  keys.delete(ev.key.toLowerCase());
});

window.addEventListener('blur', () => keys.clear());

game.on('pick', setPlacing);
game.on('airstrike', () => setAirAim(!airAim));
game.on('level', () => { setPlacing(null); setAirAim(false); select(null); updateTip(); });
game.on('restart', () => {
  game.reset();
  setPlacing(null);
  setAirAim(false);
  select(null);
  ui.hideBanner();
  ui.hideReel();
  ui.sync();
});
game.on('change', () => {
  if (game.selected?.dead && !game.selected.downed) select(null);
  if (game.selected) {
    selRing.position.set(game.selected.x, 0.03, game.selected.z);
    if (isGun(game.selected)) selRange.scale.setScalar(game.selected.stats.range);
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
  const dt = raw * game.speed * (game.drama || 1);

  game.update(dt);

  // keep the selection decals glued to live entities
  if (game.selected && !game.selected.dead) {
    selRing.position.set(game.selected.x, 0.03, game.selected.z);
    selRing.rotation.y += raw * 0.8;
    if (selRange.visible) selRange.position.set(game.selected.x, 0.04, game.selected.z);
  } else if (game.selected?.dead) {
    select(null);
  }

  focusRing.visible = !!(game.focus && !game.focus.dead);
  if (focusRing.visible) {
    focusRing.position.set(game.focus.x, 0.06, game.focus.z);
    focusRing.rotation.y += raw * 2;
  }

  if (cursor.visible) {
    cursorEdge.rotation.y += raw * 1.4;
    cursorPlate.material.opacity = 0.28 + Math.sin(now * 0.005) * 0.12;
  }

  // RTS camera: edge scroll + WASD / arrows
  if (!drag.on) {
    let sx = 0, sy = 0;
    if (pointer.inside) {
      const r = canvas.getBoundingClientRect();
      const lx = pointer.x - r.left, ly = pointer.y - r.top;
      if (lx < EDGE) sx -= 1 - lx / EDGE;
      else if (r.width - lx < EDGE) sx += 1 - (r.width - lx) / EDGE;
      if (ly < EDGE) sy -= 1 - ly / EDGE;
      else if (r.height - ly < EDGE) sy += 1 - (r.height - ly) / EDGE;
    }
    if (keys.has('a') || keys.has('ArrowLeft')) sx -= 1;
    if (keys.has('d') || keys.has('ArrowRight')) sx += 1;
    if (keys.has('w') || keys.has('ArrowUp')) sy -= 1;
    if (keys.has('s') || keys.has('ArrowDown')) sy += 1;
    if (sx || sy) {
      const len = Math.hypot(sx, sy) || 1;
      const speed = EDGE_SPEED * (stage.dist / 15);
      stage.pan((sx / len) * speed * raw, (sy / len) * speed * raw);
    }
  }

  ui.update(raw);
  stage.updateCamera();
  stage.applyShake(raw);
  stage.render();
  requestAnimationFrame(frame);
}

resize();
ui.sync();
updateTip();
requestAnimationFrame(frame);
