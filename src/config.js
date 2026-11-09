export const TILE = 40;
export const COLS = 128;
export const ROWS = 128;

/** Real grid dimensions, growing every five levels and capped at 128×128. */
export function mapDimensions(level) {
  const size = Math.min(COLS, 56 + Math.floor(Math.max(0, level - 1) / 5) * 16);
  return { cols: size, rows: size, routeCount: level <= 5 ? 1 : level <= 15 ? 2 : 3 };
}
export const W = TILE * COLS;
export const H = TILE * ROWS;

export const PALETTE = {
  terran: '#5ad7ff',
  zerg: '#c06bff',
  gold: '#f0b23c',
  ok: '#5ef08a',
  danger: '#ff5a4a',
  steel: '#9aa3a8'
};

/* Cell kinds */
export const CELL = { OPEN: 0, WALL: 1, TOWER: 2, CORE: 3, SPAWN: 4, ROCK: 5, BUNKER: 6 };

/* A* cost for routing through something the swarm has to chew through. */
export const BREAK_COST = 9;

export const BUILD = {
  wall: { id: 'wall', name: 'Bunker Wall', cost: 25, hp: 320, icon: 'W', key: 'W', desc: 'Plasteel barricade. The swarm chews through it or goes around.' },
  marine: { id: 'marine', name: 'Marine', cost: 50, icon: 'M', key: 'M', desc: 'Terran Marine. Right-click the canyon to move him. Promote, stim, or garrison a bunker.' },
  bunker: { id: 'bunker', name: 'Bunker', cost: 80, hp: 300, icon: 'B', key: 'B', desc: 'Holds two Marines. Extra armour, a firing slit, and a facing you set by where you build it.' },
  goliath: { id: 'goliath', name: 'Goliath', cost: 175, icon: 'G', key: 'G', desc: 'Walker with twin autocannons. Long reach. Too big for a bunker.' },
  falcon: { id: 'falcon', name: 'Falcon Gunship', cost: 220, icon: 'V', key: 'V', desc: 'Flying gunship. Twin cannons attack ground and air. Flies over terrain; vulnerable to spines and flying hunters.' },
  tank: { id: 'tank', name: 'Siege Tank', cost: 260, icon: 'H', key: 'T', desc: 'Silver heavy tank. Twin shock cannons. Right-click the canyon to drive it.' }
};

export const MARINE_TIERS = [
  { rank: 'Private',  hp: 55,  damage: 7,  attackSpeed: 0.70, range: 4.4, upgradeCost: 90 },
  { rank: 'Corporal', hp: 80,  damage: 11, attackSpeed: 0.58, range: 5.0, upgradeCost: 180 },
  { rank: 'Sergeant', hp: 115, damage: 16, attackSpeed: 0.46, range: 5.6, upgradeCost: 320 },
  { rank: 'Veteran',  hp: 165, damage: 24, attackSpeed: 0.36, range: 6.2, upgradeCost: null }
];

export const MARINE_INFO = {
  id: 'marine',
  name: 'Terran Marine',
  faction: 'Terran Dominion',
  role: 'Rifle Infantry',
  armor: 1,
  accent: '#5ad7ff',
  bio: 'Resocialised shock trooper sealed into CMC-300 powered combat armour. The C-14 "Impaler" gauss rifle fires 8mm spikes at hypersonic velocity.',
  quote: '"You wanna piece of me, boy?"'
};

export const GOLIATH_TIERS = [
  { rank: 'Mk I', hp: 160, damage: 8, attackSpeed: 0.78, range: 6.1, upgradeCost: 150 },
  { rank: 'Mk II', hp: 220, damage: 11, attackSpeed: 0.68, range: 6.7, upgradeCost: 260 },
  { rank: 'Mk III', hp: 290, damage: 15, attackSpeed: 0.58, range: 7.3, upgradeCost: null }
];

export const GOLIATH_INFO = {
  id: 'goliath',
  name: 'Goliath',
  faction: 'Terran Dominion',
  role: 'Combat Walker',
  armor: 2,
  accent: '#c6e07a',
  bio: 'Reverse-joint walker mounting twin 30mm autocannons. Built to pick bugs apart before they reach the trench. The missile rack stays bolted for ground war.',
  quote: '"Target locked. Both barrels."'
};

export const TANK_TIERS = [
  { rank: 'Crucio', hp: 360, damage: 42, attackSpeed: 2.2, range: 7.6, upgradeCost: null }
];

export const TANK_INFO = {
  id: 'tank',
  name: 'Siege Tank',
  faction: 'Terran Dominion',
  role: 'Heavy Armor',
  armor: 3,
  accent: '#e2a84a',
  bio: 'Arclite siege tank in silver plate, red canopy, and twin shock cannons. It drives wherever the canyon is open. The blast punishes a packed swarm.',
  quote: '"Shock cannon armed."'
};

export const FALCON_TIERS = [
  { rank: 'Flight I', hp: 150, damage: 12, attackSpeed: 0.65, range: 6.5, upgradeCost: 200 },
  { rank: 'Flight II', hp: 215, damage: 19, attackSpeed: 0.52, range: 7.2, upgradeCost: null }
];
export const FALCON_INFO = {
  id: 'falcon', name: 'Falcon Gunship', faction: 'Terran Air Wing', role: 'Air / Ground Assault',
  armor: 1, accent: '#71e7e0',
  bio: 'Twin-engine attack craft with tracking cannons for ground and air targets. Flies over mountains and walls without blocking ground troops. Enemy spines and flying hunters can shoot it down.',
  quote: '"Sky clear. Guns ready."'
};

export const UNITS = {
  marine: {
    id: 'marine', tiers: MARINE_TIERS, info: MARINE_INFO, visualScale: 0.56,
    shell: false, splash: 0, canBunker: true, canStim: true, armory: true, turret: false,
    mobile: true, speed: 2.15, accent: 0x5ad7ff
  },
  goliath: {
    id: 'goliath', tiers: GOLIATH_TIERS, info: GOLIATH_INFO, visualScale: 0.8,
    shell: false, splash: 0, canBunker: false, canStim: false, armory: false, turret: false,
    mobile: false, speed: 0, accent: 0xc6e07a
  },
  falcon: {
    id: 'falcon', tiers: FALCON_TIERS, info: FALCON_INFO, visualScale: 0.8,
    flying: true, targetsAir: true, shell: false, splash: 0, canBunker: false, canStim: false, armory: false, turret: true,
    mobile: true, speed: 5.2, accent: 0x71e7e0
  },
  tank: {
    targetsAir: false,
    id: 'tank', tiers: TANK_TIERS, info: TANK_INFO,
    shell: true, splash: 1.45, canBunker: false, canStim: false, armory: false, turret: true,
    mobile: true, speed: 1.25, accent: 0xd21f28
  }
};

export const ZERG_INFO = {
  id: 'zergling',
  name: 'Zergling',
  faction: 'Zerg Swarm',
  role: 'Melee Swarm Breeder',
  hp: 35,
  armor: 0,
  damage: 5,
  attackSpeed: 0.55,
  range: 0.95,
  speed: 2.35,
  accent: '#c06bff',
  bio: 'Bred two at a time from a single larva. Kaiser blades shear plasteel as readily as flesh — walls only slow them down.',
  quote: '"Skree-aa!"'
};

/* Armory unlocks, earned purely by body count. */
export const ARMORY = [
  { kills: 8,   id: 'u238',   name: 'U-238 Shells',   effect: '+2 damage, +0.4 range', apply: (s) => { s.damage += 2; s.range += 0.4; } },
  { kills: 20,  id: 'stim',   name: 'Stimpack',       effect: 'Press F — double fire rate, bleeds HP', apply: () => {} },
  { kills: 40,  id: 'shield', name: 'Combat Shield',  effect: '+40 hit points',        apply: (s) => { s.hp += 40; } },
  { kills: 70,  id: 'maggie', name: 'Mag-Rail Rounds',effect: '+35% damage',           apply: (s) => { s.damage = Math.round(s.damage * 1.35); } }
];

export const ECON = {
  startMinerals: 480,
  perKill: 8,
  waveClearBase: 40,
  waveClearPerWave: 15,
  refundRate: 0.6,
  scvCost: 60
};

export const BREEDS = {
  zergling: { id: 'zergling', name: 'Zergling', role: 'Melee Swarm', hp: 32, armor: 0, damage: 5, attackSpeed: 0.55, range: 0.95, speed: 2.4, scale: 1, bounty: 1, melee: true, aggro: 2.6 },
  warrior:  { id: 'warrior', name: 'Warrior', role: 'Armored Strain', hp: 130, armor: 3, damage: 10, attackSpeed: 0.8, range: 1.05, speed: 1.35, scale: 1.32, bounty: 3, melee: true, aggro: 2.2 },
  hopper:   { id: 'hopper', name: 'Hopper', role: 'Wall Vaulter', hp: 48, armor: 0, damage: 7, attackSpeed: 0.5, range: 0.9, speed: 2.7, scale: 0.82, bounty: 2, melee: true, jump: true, aggro: 3 },
  skyhunter: { id: 'skyhunter', name: 'Sky Hunter', role: 'Flying Assault', flying: true, targetsAir: true, hp: 80, armor: 1, damage: 8, attackSpeed: 1.1, range: 4.5, speed: 3.1, scale: 1.1, bounty: 4, ranged: true, projectile: 'spine', muzzle: [0.5, 0.3] },
  needler:  { targetsAir: true, id: 'needler', name: 'Needler', role: 'Spine Launcher', hp: 70, armor: 1, damage: 9, attackSpeed: 1.05, range: 4.3, speed: 1.85, scale: 1, bounty: 3, ranged: true, projectile: 'spine', muzzle: [0.42, 0.62] },
  tanker:   { id: 'tanker', name: 'Tanker', role: 'Acid Siege', hp: 240, armor: 1, damage: 16, attackSpeed: 1.7, range: 3.6, speed: 1.05, scale: 1.7, bounty: 5, ranged: true }
};

/*
 * Drop-in 3D models. Put a .glb file at `file` and that unit uses it instead of its
 * built-in shape (see assets/models/README.md).
 *   fit / size  scale the model so its height (or length) is this many tiles
 *   yaw         turn so the model faces +X; glTF files usually face +Z, hence π/2
 *   muzzle      optional [x, y, z] where shots leave, in tiles, model facing +X
 *   clips       optional { idle, walk, shoot, attack, death } animation clip names;
 *               otherwise clips are matched by name (Idle, Walk/Run, Shoot/Fire, Death...)
 *   fallback    use another kind's file if this one is missing
 */
export const MODEL_FILES = {
  marine:   { file: 'assets/models/marine.glb',   fit: 'height', size: 1.2 },
  goliath:  { file: 'assets/models/goliath.glb',  fit: 'height', size: 1.45 },
  tank:     { file: 'assets/models/tank.glb',     fit: 'length', size: 1.45 },
  scv:      { file: 'assets/models/scv.glb',      fit: 'length', size: 0.7 },
  bunker:   { file: 'assets/models/bunker.glb',   fit: 'length', size: 1.0 },
  zergling: { file: 'assets/models/zergling.glb', fit: 'length', size: 1.0 },
  warrior:  { file: 'assets/models/warrior.glb',  fit: 'length', size: 1.0, fallback: 'zergling' },
  hopper:   { file: 'assets/models/hopper.glb',   fit: 'length', size: 1.0, fallback: 'zergling' },
  tanker:   { file: 'assets/models/tanker.glb',   fit: 'length', size: 1.0, fallback: 'zergling' },
  needler:  { file: 'assets/models/needler.glb',  fit: 'height', size: 0.85 }
};

/* Units and bugs are drawn a bit larger than one tile so they read against the rock. */
export const UNIT_SCALE = 1.45;
export const BUG_SCALE = 1.12;

export const CORE_HP = 500;
/* The hand-drawn canyons below come first; after them every level is generated. */
export const AUTHORED_LEVELS = 10;

/* Orbital calldown. Click a tile, bombs fall. One every 30 seconds. */
export const AIR_STRIKE = {
  cooldown: 30,
  damage: 95,
  radius: 2.75,
  bombs: 3,
  key: 'R'
};

/* One canyon per level. Waypoints are world-space tile centers. Radius is how far the dirt lane reaches — everything past it is locked mountain. */
export const LEVELS = [
  { name: 'Mar Sara Cut', radius: 1.55, path: [[1.5, 8.5], [8.5, 8.5], [14.5, 4.5], [20.5, 11.5], [24.5, 8.5]], blurb: 'A straight cut through the ridge. Hold the bends. The mountains do not move.' },
  { name: 'Switchback', radius: 1.52, path: [[1.5, 12.5], [12.5, 12.5], [12.5, 3.5], [22.5, 3.5], [22.5, 8.5]], blurb: 'They come along the high shelf, then drop. A wall on the corner catches the whole file.' },
  { name: 'South Hook', radius: 1.5, path: [[1.5, 3.5], [18.5, 3.5], [18.5, 12.5], [8.5, 12.5], [8.5, 8.5]], blurb: 'The lane hooks south and doubles back. Do not fortify the first stretch and forget the return.' },
  { name: 'The Stairs', radius: 1.48, path: [[1.5, 13.5], [7.5, 13.5], [7.5, 9.5], [14.5, 9.5], [14.5, 5.5], [21.5, 5.5], [21.5, 2.5]], blurb: 'Warrior strain in the file. Plated bugs. Gauss skips off the carapace unless you focus them.' },
  { name: 'Serpent', radius: 1.48, path: [[2.5, 8.5], [6.5, 3.5], [11.5, 3.5], [11.5, 12.5], [17.5, 12.5], [17.5, 4.5], [23.5, 8.5]], blurb: 'The cut snakes the whole sector. Overlap the straight sections.' },
  { name: 'High Road', radius: 1.46, path: [[1.5, 2.5], [20.5, 2.5], [20.5, 13.5], [10.5, 13.5], [10.5, 8.5]], blurb: 'Hoppers in the swarm. They vault a single wall. One thin line will not hold.' },
  { name: 'Double Bend', radius: 1.46, path: [[1.5, 6.5], [8.5, 6.5], [8.5, 2.5], [16.5, 2.5], [16.5, 13.5], [23.5, 13.5]], blurb: 'Two long bends. The second one faces the command center — put the heavy gun there.' },
  { name: 'Box Canyon', radius: 1.44, path: [[2.5, 2.5], [8.5, 2.5], [8.5, 8.5], [16.5, 8.5], [16.5, 3.5], [22.5, 3.5], [22.5, 11.5]], blurb: 'A tanker is with them. It will not close. It sits off the breach and melts whatever you built.' },
  { name: 'The Weave', radius: 1.4, path: [[1.5, 10.5], [5.5, 10.5], [5.5, 5.5], [10.5, 5.5], [10.5, 12.5], [15.5, 12.5], [15.5, 4.5], [20.5, 4.5], [20.5, 10.5], [24.5, 8.5]], blurb: 'The narrowest cut so far. Random rock in the lane. Leave yourself a firing step.' },
  { name: 'Final Gauntlet', radius: 1.4, path: [[1.5, 8.5], [6.5, 4.5], [6.5, 12.5], [12.5, 12.5], [12.5, 3.5], [18.5, 3.5], [18.5, 12.5], [24.5, 9.5]], blurb: 'Last canyon. Every strain is in the column. The command center is at the end of the weave.' }
];

/**
 * The column for level n. Levels never end: every strain keeps growing in number and
 * toughness, new strains join as you go, and the column gets longer.
 */
export function wavePlan(n) {
  const hpScale = 1 + (n - 1) * 0.12;
  const speedScale = 1 + Math.min(0.4, (n - 1) * 0.02);
  const out = [];
  const add = (count, start, gap, breed) => {
    for (let i = 0; i < count; i++) out.push({ at: start + i * gap, breed, hpScale, speedScale });
  };
  let t = 0.2;
  const clumps = Math.min(16, 1 + Math.floor(n * 0.6));
  for (let c = 0; c < clumps; c++) {
    const size = Math.min(12, 4 + Math.floor(n / 3));
    add(size, t, 0.1, 'zergling');
    t += 1.05 + size * 0.1;
  }
  if (n >= 5) add(Math.min(12, 2 + Math.floor((n - 5) / 2)), 3.5, 1.15, 'skyhunter');
  if (n >= 3) add(Math.min(14, 1 + Math.floor((n - 3) / 1.5)), 1.8, 1.3, 'needler');    // ranged spine launchers
  if (n >= 4) add(Math.min(14, 1 + Math.floor((n - 4) / 1.5)), 1, 1.5, 'warrior');      // armoured
  if (n >= 6) add(Math.min(14, 2 + Math.floor((n - 6) / 1.5)), 1.4, 0.85, 'hopper');    // wall vaulters
  if (n >= 8) add(Math.min(10, Math.floor((n - 6) / 2.5)), 2.4, 1.7, 'tanker');         // acid siege
  out.sort((a, b) => a.at - b.at);
  return out;
}

// Silver lasts through the next three full rounds; gold lasts for the run.
export const TREASURE_RULES = { silverRounds: 3, goldChance: 0.35 };
// Treasure bonuses stack for all current and future Marines.
export const TREASURE = [
  { id: 'gun', name: 'Gauss Rifle Kit', effect: '+15% Marine gun damage', apply: s => { s.damage *= 1.15; } },
  { id: 'range', name: 'Targeting Scope', effect: '+0.5 Marine range', apply: s => { s.range += 0.5; } },
  { id: 'fire', name: 'Rapid-fire Loader', effect: '+15% Marine firing speed', apply: s => { s.attackSpeed /= 1.15; } },
  { id: 'speed', name: 'Servo Boosters', effect: '+10% Marine movement speed', apply: s => { s.moveSpeed *= 1.1; } }
];

/* Bosses every five levels; decade bosses are the harder encounters. */
export function milestonePlan(level) {
  if (level < 5 || level % 5 !== 0) return null;
  const hard = level % 10 === 0;
  const tier = Math.ceil(level / 10);
  const names = ['THE BREACHER', 'BROODMOTHER', 'THE WORLD EATER'];
  return {
    tier, difficulty: hard ? 'HARD' : 'MEDIUM', hard,
    treasureMin: hard ? 2 : 1, treasureMax: hard ? 3 : 2,
    name: hard ? names[Math.min(tier - 1, 2)] : 'BROOD GUARDIAN',
    hp: Math.round((1800 + (tier - 1) * 2800) * (hard ? 1 : 0.5)),
    armor: (hard ? 3 : 1) + tier, damage: Math.round((22 + tier * 8) * (hard ? 1 : 0.65)),
    scale: 2.1 + Math.min(tier, 5) * 0.25,
    speed: 1.15 + Math.min(tier, 5) * 0.1,
    strikeInterval: Math.max(5, 11 - tier) * (hard ? 1 : 1.4),
    strikeDamage: Math.round((30 + tier * 15) * (hard ? 1 : 0.6)),
    strikeRadius: 2.3 + Math.min(tier, 5) * 0.3,
    telegraph: Math.max(1.8, 3.2 - tier * 0.25),
    reinforcementInterval: Math.max(7, 15 - tier * 2) * (hard ? 1 : 1.4),
    reinforcements: Math.min(12, (hard ? 2 : 0) + tier * 2),
    reward: Math.round((300 + tier * 250) * (hard ? 1 : 0.6))
  };
}
