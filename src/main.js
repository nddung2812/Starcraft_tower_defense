import * as THREE from 'three';
import { BUILD, COLS, ROWS, UNITS, AIR_STRIKE } from './config.js';
import { Stage } from './scene.js';
import { Game } from './game.js';
import { UI } from './ui.js';
import { Minimap } from './minimap.js';
import { loadModels } from './assets.js';
import { sfx } from './audio.js';
import { voice } from './voice.js';

// any .glb files in assets/models/ replace the built-in unit models
await loadModels();

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

/* ---------------- selection decals: one ring under everything selected ---------------- */

const RING_GEO = new THREE.RingGeometry(0.44, 0.52, 36).rotateX(-Math.PI / 2);
const RING_SIZE = { core: 2.1, tank: 1.35, goliath: 1.2, bunker: 1.15 };
const decals = [];

function decal(i) {
  while (decals.length <= i) {
    const m = new THREE.Mesh(RING_GEO, new THREE.MeshBasicMaterial({
      color: 0x5ef08a, transparent: true, opacity: 0.9, depthWrite: false
    }));
    m.position.y = 0.03;
    m.visible = false;
    stage.scene.add(m);
    decals.push(m);
  }
  return decals[i];
}

/* ---------------- input state ---------------- */

const ndc = new THREE.Vector2();
const proj = new THREE.Vector3();
let hoverTile = null;
let placing = null;
let airAim = false;
let targeting = null;          // 'attack' while waiting for the A-click
const drag = { on: false, mode: null, x: 0, y: 0, sx: 0, sy: 0, moved: 0 };
const pointer = { x: 0, y: 0, inside: false };
const keys = new Set();
const EDGE = 36;
const EDGE_SPEED = 14;
const selbox = document.getElementById('selbox');

const selection = [];
game.selection = selection;
const groups = Array.from({ length: 10 }, () => []);
let lastTap = { n: -1, t: 0 };

/* ---------------- picking ---------------- */

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

/** Bugs first (they are what you are usually clicking at), then our own things. */
function entityAt(tile) {
  if (!tile) return null;
  const wx = tile.world.x, wz = tile.world.z;
  let best = null, bd = 0.6;
  for (const z of game.zerglings) {
    if (z.dead) continue;
    const d = Math.hypot(z.x - wx, z.z - wz) / (z.scale || 1);
    if (d < bd) { bd = d; best = z; }
  }
  if (best) return best;
  bd = 0.6;
  for (const m of game.gunners) {
    if (m.dead || m.bunker) continue;
    const d = Math.hypot(m.x - wx, m.z - wz);
    if (d < bd) { bd = d; best = m; }
  }
  if (game.scv && !game.scv.dead && Math.hypot(game.scv.x - wx, game.scv.z - wz) < bd) best = game.scv;
  if (best) return best;
  const occ = game.grid.occupant(tile.x, tile.y);
  if (occ && !occ.dead) return occ;
  if (tile.x >= game.core.tx && tile.x < game.core.tx + 2 && tile.y >= game.core.ty && tile.y < game.core.ty + 2) return game.core;
  return null;
}

function isGun(e) { return !!(e && UNITS[e.kind]); }

/** Things you can box-select, group, and order around. */
function isUnit(e) {
  if (!e || e.dead) return false;
  if (e.kind === 'scv') return e === game.scv;
  return isGun(e) && !e.downed && !e.bunker;
}

function alive(e) {
  if (!e) return false;
  if (e.kind === 'scv') return e === game.scv && !e.dead;
  if (isGun(e)) return game.gunners.includes(e) && !e.dead;
  if (e.kind === 'wall') return game.walls.includes(e);
  if (e.kind === 'bunker') return game.bunkers.includes(e);
  if (e.kind === 'core') return e === game.core;
  if (e.kind === 'zergling') return !e.dead && game.zerglings.includes(e);
  return false;
}

function army() { return selection.filter(isUnit); }

function screenPos(e) {
  proj.set(e.x, 0.4, e.z).project(stage.camera);
  const r = canvas.getBoundingClientRect();
  return {
    x: r.left + ((proj.x + 1) / 2) * r.width,
    y: r.top + ((1 - proj.y) / 2) * r.height,
    front: proj.z < 1
  };
}

function onScreen(p) {
  const r = canvas.getBoundingClientRect();
  return p.front && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
}

function candidates() {
  const out = game.gunners.filter(isUnit);
  if (isUnit(game.scv)) out.push(game.scv);
  return out;
}

/* ---------------- selection ---------------- */

function setSelection(list) {
  const uniq = [];
  for (const e of list) if (e && !uniq.includes(e)) uniq.push(e);
  // a group is only ever units; buildings and bugs are inspected one at a time
  const next = uniq.length > 1 ? uniq.filter(isUnit) : uniq;
  selection.length = 0;
  selection.push(...next);
  game.selected = selection[0] || null;
  inspect(game.selected);
  ui.setSelection(selection);
}

function select(e) { setSelection(e ? [e] : []); }

function inspect(e) {
  ui.inspect.entity = e;
  selRange.visible = selection.length === 1 && isGun(e) && !e.bunker && !e.downed;
  if (selRange.visible) {
    selRange.scale.setScalar(e.stats.range);
    selRange.material.color.setHex(UNITS[e.kind].accent);
  }
  if (!e) { ui.showUnit(ui.inspect.kind, ui.inspect.tier, null); return; }
  const tab = e.kind === 'zergling' || isGun(e) ? e.kind : ui.inspect.kind;
  ui.showUnit(tab, isGun(e) ? e.tier : 0, e);
}

function pruneSelection() {
  if (selection.some((e) => !alive(e) || (selection.length > 1 && !isUnit(e)))) {
    setSelection(selection.filter(alive));
  }
}

function syncDecals(raw) {
  let i = 0;
  for (const e of selection) {
    if (e.bunker) continue;
    const d = decal(i++);
    d.visible = true;
    d.position.set(e.x, 0.03, e.z);
    d.scale.setScalar(RING_SIZE[e.kind] || 1);
    d.material.color.setHex(e.kind === 'zergling' ? 0xc06bff : e.downed ? 0xff5a4a : 0x5ef08a);
    d.rotation.y += raw * 0.8;
  }
  for (; i < decals.length; i++) decals[i].visible = false;
  const e = selection[0];
  if (selRange.visible && e) {
    selRange.position.set(e.x, 0.04, e.z);
    selRange.scale.setScalar(e.stats.range);
  }
}

function boxSelect(ev) {
  const x0 = Math.min(drag.sx, ev.clientX), x1 = Math.max(drag.sx, ev.clientX);
  const y0 = Math.min(drag.sy, ev.clientY), y1 = Math.max(drag.sy, ev.clientY);
  const picks = candidates().filter((e) => {
    const p = screenPos(e);
    return p.front && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  });
  if (ev.shiftKey) setSelection([...army(), ...picks]);
  else setSelection(picks);
}

function selectKindOnScreen(kind, add) {
  const picks = candidates().filter((e) => e.kind === kind && onScreen(screenPos(e)));
  setSelection(add ? [...army(), ...picks] : picks);
}

function clickSelect(t, ev) {
  const e = entityAt(t);
  if (ev.shiftKey && isUnit(e)) {
    const cur = army();
    setSelection(cur.includes(e) ? cur.filter((u) => u !== e) : [...cur, e]);
    return;
  }
  if (ev.ctrlKey && isUnit(e)) { selectKindOnScreen(e.kind, false); return; }
  select(e);
}

/* ---------------- control groups ---------------- */

function setGroup(n, add) {
  const units = army();
  if (!units.length && !add) return;
  groups[n] = add ? [...new Set([...groups[n].filter(alive), ...units])] : units.slice();
  ui.say(`<b>Group ${n} ${add ? 'updated' : 'set'}.</b> ${groups[n].length} unit${groups[n].length === 1 ? '' : 's'}. Press ${n} to select, ${n} twice to jump to them.`);
  sfx.ui();
}

function recallGroup(n) {
  groups[n] = groups[n].filter(alive);
  const list = groups[n].filter(isUnit);
  if (!list.length) return;
  const now = performance.now();
  if (lastTap.n === n && now - lastTap.t < 400) centerOn(list);
  lastTap = { n, t: now };
  setSelection(list);
}

function centerOn(list) {
  if (!list.length) return;
  let x = 0, z = 0;
  for (const e of list) { x += e.x; z += e.z; }
  stage.focus.set(x / list.length, 0, z / list.length);
}

/* ---------------- modes ---------------- */

function setPlacing(id) {
  placing = placing === id ? null : id;
  if (placing) { airAim = false; ui.setAirArmed(false); setTargeting(null); }
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
    setTargeting(null);
  }
  ui.setAirArmed(airAim);
  updateTip();
}

function setTargeting(mode) {
  if (mode && !army().some(isGun)) { sfx.deny(); return; }
  targeting = mode;
  if (mode) {
    placing = null;
    ui.setPlacing(null);
    airAim = false;
    ui.setAirArmed(false);
  }
  canvas.classList.toggle('is-targeting', !!mode);
  ui.setArmed('attack', !!mode);
  updateTip();
}

function cancelModes() {
  if (placing) setPlacing(null);
  if (airAim) setAirAim(false);
  if (targeting) setTargeting(null);
}

let modeTip = false;   // is the status line showing a mode hint we should clear afterwards?

function updateTip() {
  if (airAim || targeting) {
    modeTip = true;
    ui.tip(airAim
      ? `<b>Air Strike armed.</b> Click the lane — ${AIR_STRIKE.damage} damage, ${AIR_STRIKE.radius.toFixed(1)} tile blast. Right-click cancels.`
      : '<b>Attack.</b> Click a bug to focus it, or ground to attack-move. Right-click cancels.');
    return;
  }
  if (game.state !== 'build') {
    // mid-fight the line belongs to briefings and alerts; only wipe our own hint
    if (modeTip) ui.tip('');
    modeTip = false;
    return;
  }
  modeTip = false;
  if (placing === 'wall') ui.tip('Walls redirect the swarm. Drag to lay a run. They cannot leave the canyon.');
  else if (placing === 'marine') ui.tip('Place a Marine. Right-click the ground to move him later.');
  else if (placing === 'goliath') ui.tip('Goliath. Twin autocannons, long reach. Too big for a bunker, and it does not move.');
  else if (placing === 'tank') ui.tip('Siege Tank. Twin cannons, wide blast. Right-click the ground to drive it.');
  else if (placing === 'bunker') ui.tip('Bunker faces the bugs. Select Marines and right-click it to garrison.');
  else ui.tip(`<b>${game.layout?.name || 'Canyon'}.</b> Drag to select · right-click to move or attack · Ctrl+1–9 to group · A attack-move.`);
}

/* ---------------- orders ---------------- */

function marker(x, z, kind) {
  game.fx.ring({ x, z }, kind === 'attack' ? 0.75 : 0.55, kind === 'attack' ? 0xff5a4a : 0x5ef08a);
}

/** Right-click: do the obvious thing for what's under the cursor. */
function smartCommand(t) {
  if (!t) return;
  const e = entityAt(t);
  let units = army();
  const guns = units.filter(isGun);

  if (e?.kind === 'zergling') {
    if (guns.length) {
      game.commandAttack(guns, e);
      voice.say('acquired');
    } else if (game.state === 'wave' || game.state === 'brief') {
      game.focus = e;
    } else return;
    marker(e.x, e.z, 'attack');
    return;
  }
  if (!units.length) return;

  const scv = units.find((u) => u.kind === 'scv');
  if (scv && e && (e.kind === 'wall' || e.kind === 'bunker') && e.hp < e.maxHp) {
    scv.order = { type: 'repair', target: e };
    scv.route = null;
    voice.say('repair');
    units = units.filter((u) => u !== scv);
  } else if (scv && isGun(e) && e.downed) {
    scv.order = { type: 'revive', target: e };
    scv.route = null;
    voice.say('repair');
    units = units.filter((u) => u !== scv);
  }
  if (e && e.kind !== 'zergling' && units.length !== army().length) marker(e.x, e.z, 'move');
  if (!units.length) return;

  if (e?.kind === 'bunker' && units.some((u) => u.kind === 'marine')) {
    game.commandGarrison(units, e);
    marker(e.x, e.z, 'move');
    sfx.ui();
    return;
  }
  if (game.commandMove(units, t.x, t.y, 'move')) {
    marker(t.world.x, t.world.z, 'move');
    sfx.ui();
  } else sfx.deny();
}

/** Left-click while A is armed: a bug means focus it, ground means attack-move. */
function attackClick(t) {
  const guns = army().filter(isGun);
  const e = entityAt(t);
  if (e?.kind === 'zergling') {
    game.commandAttack(guns, e);
    marker(e.x, e.z, 'attack');
  } else if (game.commandMove(guns, t.x, t.y, 'amove')) {
    marker(t.world.x, t.world.z, 'attack');
  } else sfx.deny();
  setTargeting(null);
}

function stimSelected() {
  let any = false;
  for (const u of army()) if (u.kind === 'marine' && u.stim(game)) any = true;
  if (!any && game.selected?.kind === 'marine') game.selected.stim(game);
}

function runCommand(id) {
  sfx.resume();
  if (id === 'attack') setTargeting(targeting ? null : 'attack');
  else if (id === 'stop') { game.commandStop(army()); sfx.ui(); }
  else if (id === 'stim') stimSelected();
  else if (id === 'air') setAirAim(!airAim);
  else if (id === 'promote') { if (game.selected?.upgrade) game.upgradeGunner(game.selected); }
  else if (id === 'salvage') { if (game.selected && game.selected.kind !== 'core' && game.selected.kind !== 'zergling') game.sell(game.selected); }
  else if (id === 'army') setSelection(candidates().filter(isGun));
  else if (id === 'scv') { if (isUnit(game.scv)) { select(game.scv); centerOn([game.scv]); } }
  else if (id === 'wave') {
    if (game.state === 'build') game.startWave();
    else if (game.lastAlert) stage.focus.set(game.lastAlert.x, 0, game.lastAlert.z);
  }
}

/* ---------------- pointer ---------------- */

function trackPointer(ev) {
  pointer.x = ev.clientX;
  pointer.y = ev.clientY;
  const r = canvas.getBoundingClientRect();
  pointer.inside = ev.clientX >= r.left && ev.clientX <= r.right
    && ev.clientY >= r.top && ev.clientY <= r.bottom;
}

function drawBox(ev) {
  const r = canvas.getBoundingClientRect();
  const x0 = Math.max(r.left, Math.min(drag.sx, ev.clientX)), x1 = Math.min(r.right, Math.max(drag.sx, ev.clientX));
  const y0 = Math.max(r.top, Math.min(drag.sy, ev.clientY)), y1 = Math.min(r.bottom, Math.max(drag.sy, ev.clientY));
  selbox.hidden = false;
  selbox.style.left = (x0 - r.left) + 'px';
  selbox.style.top = (y0 - r.top) + 'px';
  selbox.style.width = (x1 - x0) + 'px';
  selbox.style.height = (y1 - y0) + 'px';
}

canvas.addEventListener('pointermove', (ev) => {
  trackPointer(ev);

  if (drag.on) {
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.mode === 'right' && drag.moved > 6) drag.mode = 'orbit';
    if (drag.mode === 'orbit') {
      stage.spin(dx * 0.012);
      stage.pitch = Math.max(0.28, Math.min(1.25, stage.pitch + dy * 0.006));
    } else if (drag.mode === 'pan') {
      const k = stage.dist * 0.0016;
      stage.pan(dx * k, dy * k);
    } else if (drag.mode === 'box' && drag.moved > 6) {
      drawBox(ev);
    } else if (drag.mode === 'build' && placing) {
      const t = tileAt(ev);
      if (t && (!hoverTile || t.x !== hoverTile.x || t.y !== hoverTile.y)) tryPlace(t);
    }
    drag.x = ev.clientX; drag.y = ev.clientY;
    if (drag.mode !== 'build') return;
  }

  hoverTile = tileAt(ev);
  if (!hoverTile) { cursor.visible = false; return; }

  const paint = (col) => {
    cursor.visible = true;
    cursor.position.set(hoverTile.x + 0.5, 0, hoverTile.y + 0.5);
    cursorPlate.material.color.setHex(col);
    cursorEdge.material.color.setHex(col);
  };

  if (airAim) {
    paint(0xff5a4a);
    rangeRing.visible = true;
    rangeRing.scale.setScalar(AIR_STRIKE.radius);
    rangeRing.material.color.setHex(0xff5a4a);
  } else if (targeting) {
    paint(0xff5a4a);
    rangeRing.visible = false;
  } else if (placing) {
    const ok = game.grid.buildable(hoverTile.x, hoverTile.y) && game.canAfford(BUILD[placing].cost);
    paint(ok ? 0x5ef08a : 0xff5a4a);
    const spec = UNITS[placing];
    rangeRing.visible = !!(spec && ok);
    if (spec) {
      rangeRing.scale.setScalar(spec.tiers[0].range);
      rangeRing.material.color.setHex(spec.accent);
    }
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
  drag.x = drag.sx = ev.clientX;
  drag.y = drag.sy = ev.clientY;
  drag.moved = 0;

  if (ev.button === 2) { drag.mode = 'right'; return; }
  if (ev.button === 1) { drag.mode = 'pan'; return; }
  if (ev.altKey) { drag.mode = 'orbit'; return; }

  const t = tileAt(ev);
  if (airAim) {
    drag.mode = 'cmd';
    if (t && game.callAirStrike(t.x + 0.5, t.y + 0.5)) setAirAim(false);
    else sfx.deny();
    return;
  }
  if (targeting) {
    drag.mode = 'cmd';
    if (t) attackClick(t);
    return;
  }
  if (placing && t) { drag.mode = 'build'; tryPlace(t); return; }
  drag.mode = 'box';
});

canvas.addEventListener('auxclick', (ev) => { if (ev.button === 1) ev.preventDefault(); });

canvas.addEventListener('pointerup', (ev) => {
  const mode = drag.mode;
  drag.on = false;
  drag.mode = null;
  selbox.hidden = true;
  if (mode === 'right') {
    if (placing || airAim || targeting) cancelModes();
    else smartCommand(tileAt(ev));
  } else if (mode === 'box') {
    if (drag.moved > 6) boxSelect(ev);
    else clickSelect(tileAt(ev), ev);
  }
});

canvas.addEventListener('pointercancel', () => {
  drag.on = false;
  drag.mode = null;
  selbox.hidden = true;
});

// double-click a unit: everything of that type on screen
canvas.addEventListener('dblclick', (ev) => {
  if (placing || airAim || targeting) return;
  const e = entityAt(tileAt(ev));
  if (isUnit(e)) selectKindOnScreen(e.kind, ev.shiftKey);
});

canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  stage.zoomBy(ev.deltaY > 0 ? 1.12 : 0.88);
}, { passive: false });

document.getElementById('camLeft').addEventListener('click', () => stage.spin(-0.4));
document.getElementById('camRight').addEventListener('click', () => stage.spin(0.4));
document.getElementById('camIn').addEventListener('click', () => stage.zoomBy(0.82));
document.getElementById('camOut').addEventListener('click', () => stage.zoomBy(1.22));
document.getElementById('camReset').addEventListener('click', () => stage.resetView());

/* ---------------- minimap ---------------- */

const minimap = new Minimap(document.getElementById('minimap'), game, stage, {
  onCommand: (tx, ty) => {
    const units = army();
    if (units.length && game.commandMove(units, tx, ty, 'move')) {
      marker(tx + 0.5, ty + 0.5, 'move');
      sfx.ui();
    }
  }
});

/* ---------------- keyboard ---------------- */

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

window.addEventListener('keydown', (ev) => {
  if (ARROWS.includes(ev.key)) { keys.add(ev.key); ev.preventDefault(); return; }

  // control groups: Ctrl+N sets, Shift+N adds, N selects, N twice jumps the camera
  const digit = /^Digit(\d)$/.exec(ev.code);
  if (digit) {
    const n = +digit[1];
    if (ev.ctrlKey || ev.metaKey) { ev.preventDefault(); setGroup(n, false); }
    else if (ev.shiftKey) setGroup(n, true);
    else recallGroup(n);
    return;
  }

  if (ev.key === 'F1') { ev.preventDefault(); runCommand('scv'); return; }
  if (ev.key === 'F2') { ev.preventDefault(); runCommand('army'); return; }
  if (ev.code === 'Space') { ev.preventDefault(); runCommand('wave'); return; }
  if (ev.key === 'Escape') {
    if (placing || airAim || targeting) cancelModes();
    else { game.focus = null; select(null); }
    return;
  }
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;

  const k = ev.key.toLowerCase();
  const build = Object.values(BUILD).find((b) => b.key.toLowerCase() === k);
  if (build) { setPlacing(build.id); return; }

  if (k === 'a') runCommand('attack');
  else if (k === 's') runCommand('stop');
  else if (k === 'f') runCommand('stim');
  else if (k === 'r') runCommand('air');
  else if (k === 'u') runCommand('promote');
  else if (k === 'x') runCommand('salvage');
  else if (k === 'q') stage.spin(-0.35);
  else if (k === 'e') stage.spin(0.35);
  else if (k === '-' || k === '_') stage.zoomBy(1.15);
  else if (k === '=' || k === '+') stage.zoomBy(0.87);
});

window.addEventListener('keyup', (ev) => keys.delete(ev.key));
window.addEventListener('blur', () => keys.clear());

/* ---------------- game events ---------------- */

game.on('pick', setPlacing);
game.on('airstrike', () => setAirAim(!airAim));
game.on('cmd', runCommand);
game.on('selectOnly', (e) => select(e));
game.on('deselect', (e) => setSelection(selection.filter((u) => u !== e)));
game.on('level', () => { cancelModes(); select(null); updateTip(); });
game.on('restart', () => {
  game.reset();
  cancelModes();
  select(null);
  groups.forEach((g) => { g.length = 0; });
  ui.hideBanner();
  ui.hideReel();
  ui.sync();
});
let alertShownAt = -99;
game.on('alert', (e) => {
  // don't spam: while a warning is still on the status line, give it a few seconds before replacing it
  const showing = /under attack/.test(ui.line || '');
  if (showing && game.time - alertShownAt < 7) return;
  alertShownAt = game.time;
  const what = e.kind === 'core' ? 'Command Center' : e.kind === 'scv' ? 'SCV'
    : e.kind === 'wall' ? 'Wall' : e.kind === 'bunker' ? 'Bunker' : UNITS[e.kind]?.info.name || 'Outpost';
  ui.say(`<b>${what} under attack.</b> Space to look.`);
});
game.on('change', () => {
  pruneSelection();
  if (selRange.visible && isGun(game.selected)) selRange.scale.setScalar(game.selected.stats.range);
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

const btnFx = document.getElementById('btnFx');
function setFx(high) {
  stage.setQuality(high ? 'high' : 'low');
  btnFx.textContent = high ? 'FX HI' : 'FX LO';
  btnFx.classList.toggle('btn--off', !high);
  try { localStorage.setItem('td.fx', high ? 'high' : 'low'); } catch { /* storage unavailable */ }
}
btnFx.addEventListener('click', () => { setFx(stage.quality !== 'high'); sfx.ui(); });
let savedFx = 'high';
try { savedFx = localStorage.getItem('td.fx') || 'high'; } catch { /* storage unavailable */ }
setFx(savedFx !== 'low');

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

  pruneSelection();
  syncDecals(raw);

  const ordered = army().find((u) => u.order?.type === 'attack')?.order.target;
  const mark = game.focus && !game.focus.dead ? game.focus : ordered && !ordered.dead ? ordered : null;
  focusRing.visible = !!mark;
  if (mark) {
    focusRing.position.set(mark.x, 0.06, mark.z);
    focusRing.rotation.y += raw * 2;
  }

  if (cursor.visible) {
    cursorEdge.rotation.y += raw * 1.4;
    cursorPlate.material.opacity = 0.28 + Math.sin(now * 0.005) * 0.12;
  }

  // RTS camera: edge scroll + arrow keys
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
    if (keys.has('ArrowLeft')) sx -= 1;
    if (keys.has('ArrowRight')) sx += 1;
    if (keys.has('ArrowUp')) sy -= 1;
    if (keys.has('ArrowDown')) sy += 1;
    if (sx || sy) {
      const len = Math.hypot(sx, sy) || 1;
      const speed = EDGE_SPEED * (stage.dist / 15);
      stage.pan((sx / len) * speed * raw, (sy / len) * speed * raw);
    }
  }

  ui.update(raw);
  stage.updateCamera();
  stage.applyShake(raw);
  minimap.draw();
  stage.render();
  requestAnimationFrame(frame);
}

resize();
ui.sync();
updateTip();
requestAnimationFrame(frame);
