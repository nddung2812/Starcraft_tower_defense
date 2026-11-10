import { ARMORY, TREASURE, TREASURE_RULES, BUILD, UNITS, CELL, applyBaseUpgrade, BASE_LASER } from './config.js';
import { Grid } from './grid.js';
import { carveLevel, SUPPORTED_MAP_VERSIONS } from './levels.js';
import { Marine, Wall, Bunker } from './entities.js';
import { EVOLUTIONS, EVOLUTION_RULES, evolutionPower } from './config.js';
import { syncEvolutionVisual } from './evolutions.js';

export const SAVE_KEY = 'td.checkpoint.v1';
const number = (v, min = 0, max = 1e12) => Number.isFinite(v) && v >= min && v <= max;
const integer = (v, min = 0, max = 1e9) => Number.isInteger(v) && number(v, min, max);
const fields = ['tx', 'ty', 'x', 'z', 'hp', 'tier', 'invested', 'yaw', 'restYaw', 'cooldown',
  'stimT', 'blindT', 'silenceT', 'goalTx', 'goalTy', 'wp', 'driving', 'waypoints'];

/** Only peaceful planning/countdown states can become checkpoints. Combat replays the round. */
export function captureCheckpoint(g, meta) {
  if (!['build', 'brief'].includes(g.state)) return null;
  const snapshot = {
    version: 1, savedAt: Date.now(), ...meta,
    level: g.level, seed: g.mapSeed, minerals: g.minerals, kills: g.kills, time: g.time,
    mapVersion: g.mapVersion, baseLevel: g.baseLevel, laserCharge: g.laserCharge,
    airStrikeCd: g.airStrikeCd, phase: g.state, coreHp: g.core.hp,
    armory: g.armory.map(a => a.id),
    evolutions: { ...g.evolutions },
    treasure: g.treasureLoot.map(({ id, boxType, earnedLevel, expiresAfterLevel }) =>
      ({ id, boxType, earnedLevel, expiresAfterLevel })),
    walls: g.walls.map(w => ({ tx: w.tx, ty: w.ty, hp: w.hp })),
    bunkers: g.bunkers.map(b => ({ tx: b.tx, ty: b.ty, hp: b.hp, facing: b.facing,
      lastStandT: b.lastStandT || 0, lastStandCd: b.lastStandCd || 0 })),
    units: g.gunners.map(m => ({ kind: m.kind, ...Object.fromEntries(fields.map(k => [k, m[k]])),
      placed: m.isPlaced(g), bunker: g.bunkers.indexOf(m.bunker),
      garrisonOrder: m.order?.type === 'garrison' ? g.bunkers.indexOf(m.order.bunker) : -1,
      attackMove: m.order?.type === 'amove' })),
    scv: { x: g.scv.x, z: g.scv.z, hp: g.scv.hp, dead: g.scv.dead, yaw: g.scv.yaw }
  };
  // Detach paths and metadata from the live simulation.
  return JSON.parse(JSON.stringify(snapshot));
}

/** Validate everything before touching a live run; no functions are loaded from storage. */
export function validateCheckpoint(s) {
  try {
    if (!s || s.version !== 1 || !integer(s.savedAt, 1, 1e14) || typeof s.player !== 'string' || s.player.length > 16 ||
      typeof s.quickDeployment !== 'boolean' || typeof s.guideDismissed !== 'boolean' ||
      !integer(s.level, 1, 100000) || !integer(s.seed, 0, 0xffffffff) ||
      !number(s.minerals) || !integer(s.kills) || !number(s.time) || !number(s.airStrikeCd) ||
      !['build', 'brief'].includes(s.phase) || !number(s.coreHp, 0.001)) return false;
    if (s.laserCharge !== undefined && !number(s.laserCharge, 0, BASE_LASER.chargeTime)) return false;
    if (s.baseLevel !== undefined && !integer(s.baseLevel, 0, 100000)) return false;
    if (s.mapVersion !== undefined && !SUPPORTED_MAP_VERSIONS.includes(s.mapVersion)) return false;
    if (s.evolutions !== undefined && (!s.evolutions || Array.isArray(s.evolutions) || typeof s.evolutions !== 'object' ||
      !Object.entries(s.evolutions).every(([id, rank]) => EVOLUTIONS.some(e => e.id === id) && integer(rank, 1, 20000)) ||
      Object.values(s.evolutions).reduce((sum, rank) => sum + rank, 0) > Math.floor((s.level - 1) / 5))) return false;
    if (!Array.isArray(s.armory) || s.armory.length > ARMORY.length || new Set(s.armory).size !== s.armory.length ||
      !s.armory.every(id => ARMORY.some(a => a.id === id))) return false;
    if (!Array.isArray(s.treasure) || s.treasure.length > 10000 || !s.treasure.every(t =>
      t && TREASURE.some(a => a.id === t.id) && ['gold', 'silver'].includes(t.boxType) &&
      integer(t.earnedLevel, 1, s.level) && (t.boxType === 'gold' ? t.expiresAfterLevel === null :
        t.expiresAfterLevel === t.earnedLevel + TREASURE_RULES.silverRounds && t.expiresAfterLevel >= s.level))) return false;
    const grid = new Grid();
    grid.load(carveLevel(s.level, s.seed, s.mapVersion ?? 1));
    if (s.coreHp > grid.core.hp) return false;
    const pos = e => e && number(e.x, 0, grid.COLS - 0.001) && number(e.z, 0, grid.ROWS - 0.001);
    const tile = e => e && integer(e.tx, 0, grid.COLS - 1) && integer(e.ty, 0, grid.ROWS - 1);
    const ownTile = e => {
      if (!tile(e) || !grid.buildable(e.tx, e.ty)) return false;
      grid.set(e.tx, e.ty, CELL.TOWER, true); return true;
    };
    for (const [list, kind] of [[s.walls, 'wall'], [s.bunkers, 'bunker']]) {
      if (!Array.isArray(list) || list.length > grid.COLS * grid.ROWS ||
        !list.every(e => ownTile(e) && number(e.hp, 0.001, BUILD[kind].hp) && (kind !== 'bunker' || number(e.facing, -100, 100)))) return false;
    }
    const slots = new Map();
    if (!s.bunkers.every(b => (b.lastStandT === undefined || number(b.lastStandT, 0,
      s.evolutions?.stand ? EVOLUTION_RULES.standDuration + EVOLUTION_RULES.standDurationStep * evolutionPower(s.evolutions.stand) : 0)) &&
      (b.lastStandCd === undefined || number(b.lastStandCd, 0, EVOLUTION_RULES.standCooldown)))) return false;
    if (!Array.isArray(s.units) || s.units.length > 5000 || !s.units.every(u => {
      if (!u || !Object.hasOwn(UNITS, u.kind) || !pos(u) || !tile(u) ||
        !integer(u.tier, 0, UNITS[u.kind].tiers.length - 1) || !number(u.hp, 0.001, 1e7) ||
        !number(u.invested) || !number(u.yaw, -100, 100) ||
        (u.restYaw != null && !number(u.restYaw, -100, 100)) ||
        !['cooldown', 'stimT', 'blindT', 'silenceT'].every(k => number(u[k])) ||
        typeof u.placed !== 'boolean' || typeof u.driving !== 'boolean' || typeof u.attackMove !== 'boolean' ||
        !integer(u.bunker, -1, s.bunkers.length - 1) || !integer(u.garrisonOrder, -1, s.bunkers.length - 1)) return false;
      if (u.bunker >= 0) {
        slots.set(u.bunker, (slots.get(u.bunker) || 0) + 1);
        if (u.kind !== 'marine' || u.placed || u.driving || slots.get(u.bunker) > 2) return false;
      }
      if (u.placed && (u.driving || UNITS[u.kind].flying || !ownTile(u))) return false;
      if (!integer(u.goalTx, 0, grid.COLS - 1) || !integer(u.goalTy, 0, grid.ROWS - 1) || !integer(u.wp, 0, 100000)) return false;
      if (u.waypoints !== null && (!Array.isArray(u.waypoints) || u.waypoints.length > 20000 ||
        !u.waypoints.every(p => p && number(p.x, 0, grid.COLS) && number(p.y, 0, grid.ROWS) &&
          (p.cx == null || integer(p.cx, 0, grid.COLS - 1)) && (p.cy == null || integer(p.cy, 0, grid.ROWS - 1))))) return false;
      return !u.driving || (u.waypoints?.length > u.wp);
    })) return false;
    const scvStats = { hp: 70 };
    applyBaseUpgrade(scvStats, s.baseLevel ?? 0);
    return pos(s.scv) && number(s.scv.hp, 0, scvStats.hp) && typeof s.scv.dead === 'boolean' &&
      (s.scv.dead || s.scv.hp > 0) && number(s.scv.yaw, -100, 100);
  } catch { return false; }
}

export function readCheckpoint(storage) {
  try {
    storage ||= localStorage;
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return { save: null, message: '' };
    if (raw.length > 4e6) throw Error();
    const save = JSON.parse(raw);
    if (!validateCheckpoint(save)) throw Error();
    return { save, message: '' };
  } catch { return { save: null, message: 'Saved run could not be read. You can start a new run.' }; }
}

export function restoreCheckpoint(g, s) {
  if (!validateCheckpoint(s)) throw Error('This saved run is incompatible or damaged.');
  g.wipeUnits();
  Object.assign(g, { level: s.level, mapSeed: s.seed, minerals: s.minerals, kills: s.kills, score: s.kills,
    mapVersion: s.mapVersion ?? 1, baseLevel: s.baseLevel ?? 0, laserCharge: s.laserCharge ?? 0,
    time: s.time, airStrikeCd: s.airStrikeCd, state: 'build', paused: true, queue: [],
    armory: s.armory.map(id => ARMORY.find(a => a.id === id)),
    evolutions: { ...(s.evolutions || {}) }, pendingEvolution: null,
    treasureLoot: s.treasure.map(({ id, boxType, earnedLevel, expiresAfterLevel }) =>
      ({ ...TREASURE.find(a => a.id === id), boxType, earnedLevel, expiresAfterLevel })),
    stimUnlocked: s.armory.includes('stim'), selected: null, focus: null, speed: 1, drama: 1,
    pings: [], lastAlert: null, spawnTimer: 0, briefT: 0, called: false, roundCoreDamaged: false });
  g.loadLevel();
  g.core.hp = s.coreHp;
  for (const key of ['x', 'z', 'hp', 'dead', 'yaw']) g.scv[key] = s.scv[key];
  g.scv.obj.position.set(s.scv.x, 0, s.scv.z);
  for (const w of s.walls) {
    const e = new Wall(w.tx, w.ty, BUILD.wall.hp); e.hp = w.hp;
    g.walls.push(e); g.world.add(e.obj); g.grid.set(e.tx, e.ty, CELL.WALL, e);
  }
  for (const b of s.bunkers) {
    const e = new Bunker(b.tx, b.ty, BUILD.bunker.hp, b.facing); e.hp = b.hp;
    e.lastStandT = b.lastStandT || 0; e.lastStandCd = b.lastStandCd || 0;
    syncEvolutionVisual(e, g);
    g.bunkers.push(e); g.world.add(e.obj); g.grid.set(e.tx, e.ty, CELL.BUNKER, e);
  }
  for (const u of s.units) {
    const e = new Marine(u.kind, u.tx, u.ty, g.marineUpgrades, g.baseLevel);
    syncEvolutionVisual(e, g);
    while (e.tier < u.tier) e.upgrade(g.marineUpgrades);
    for (const k of fields) if (u[k] != null) e[k] = u[k];
    e.hp = Math.min(e.maxHp, u.hp);
    e.obj.position.set(e.x, e.altitude, e.z);
    if (u.bunker >= 0) {
      e.bunker = g.bunkers[u.bunker]; e.bunker.garrison.push(e); e.obj.visible = false;
    }
    if (u.placed) g.grid.set(e.tx, e.ty, CELL.TOWER, e);
    e.order = u.garrisonOrder >= 0 ? { type: 'garrison', bunker: g.bunkers[u.garrisonOrder] }
      : u.attackMove ? { type: 'amove' } : null;
    g.gunners.push(e); g.world.add(e.obj);
  }
  // A build checkpoint also needs a countdown: there is no separate Launch control.
  g.startWave();
  g.paused = true;
  g.emit('change');
}
