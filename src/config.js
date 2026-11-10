export const TILE = 40;
export const COLS = 128;
export const ROWS = 128;

/** Real grid dimensions, growing every five levels and capped at 128×128. */
export function mapDimensions(level) {
  const size = Math.min(COLS, 56 + Math.floor(Math.max(0, level - 1) / 5) * 16);
  return { cols: size, rows: size, routeCount: level <= 6 ? 2 : level <= 15 ? 3 : 4 };
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
  wall: { id: 'wall', name: 'Ridge Wall', cost: 25, hp: 320, icon: 'W', key: 'W', desc: 'Plasteel barricade. The swarm chews through it or goes around.' },
  marine: { id: 'marine', name: 'Lineguard', cost: 60, icon: 'M', key: 'M', desc: 'Lineguard. Right-click the canyon to move him. Promote, engage Overdrive, or garrison a bunker.' },
  bunker: { id: 'bunker', name: 'Bunker', cost: 80, hp: 300, icon: 'B', key: 'B', desc: 'Holds two Lineguards. Extra armour, a firing slit, and a facing you set by where you build it.' },
  goliath: { id: 'goliath', name: 'Anchor Walker', cost: 160, icon: 'G', key: 'G', desc: 'Walker with twin autocannons. Long reach. Too big for a bunker.' },
  falcon: { id: 'falcon', name: 'Kestrel', cost: 240, icon: 'V', key: 'V', desc: 'Flying gunship. Twin cannons attack ground and air. Flies over terrain; vulnerable to spines and flying hunters.' },
  tank: { id: 'tank', name: 'Cinder Crawler', cost: 280, icon: 'H', key: 'T', desc: 'Silver heavy tank. Twin cinder launchers. Right-click the canyon to drive it.' },
  // Specialists join the build bar one round at a time (`unlock` is the first round they can be built).
  scorcher: { id: 'scorcher', name: 'Scorcher', cost: 110, icon: 'C', key: 'C', unlock: 2, desc: 'Flame trooper. Burns every ground bug in a short cone. Weak against armour.' },
  deadeye: { id: 'deadeye', name: 'Deadeye', cost: 150, icon: 'D', key: 'D', unlock: 3, desc: 'Marksman. Very long range, ignores armour, picks the biggest target. Fragile.' },
  mender: { id: 'mender', name: 'Mender', cost: 100, icon: '+', key: 'H', unlock: 4, desc: 'Field medic. Heals the most injured unit nearby. Carries no weapon.' }
};
export const unlockRound = id => BUILD[id]?.unlock || 1;

// Damage is per projectile; paired weapons fire two projectiles per volley.
export const MARINE_TIERS = [
  { rank: 'Recruit', hp: 70, damage: 8, attackSpeed: 0.80, range: 4.4, upgradeCost: 70 },
  { rank: 'Sentry', hp: 100, damage: 12, attackSpeed: 0.70, range: 4.8, upgradeCost: 120 },
  { rank: 'Warden', hp: 140, damage: 18, attackSpeed: 0.60, range: 5.2, upgradeCost: 190 },
  { rank: 'Pathkeeper', hp: 190, damage: 26, attackSpeed: 0.52, range: 5.6, upgradeCost: null }
];

export const MARINE_INFO = {
  id: 'marine',
  name: 'Lineguard',
  faction: 'Ridgewatch Compact',
  role: 'Rifle Infantry',
  armor: 1,
  accent: '#5ad7ff',
  bio: 'Volunteer ridge sentry with a pulse rifle and modular impact suit. Affordable mobile defense; promotions and field salvage improve its staying power.',
  quote: '"This ridge is our home."'
};

export const GOLIATH_TIERS = [
  { rank: 'Mk I', hp: 220, damage: 13, attackSpeed: 0.80, range: 6.2, upgradeCost: 140 },
  { rank: 'Mk II', hp: 290, damage: 19, attackSpeed: 0.72, range: 6.7, upgradeCost: 220 },
  { rank: 'Mk III', hp: 380, damage: 28, attackSpeed: 0.64, range: 7.2, upgradeCost: null }
];

export const GOLIATH_INFO = {
  id: 'goliath',
  name: 'Anchor Walker',
  faction: 'Ridgewatch Compact',
  role: 'Combat Walker',
  armor: 2,
  accent: '#c6e07a',
  bio: 'A heavy mining walker refitted with paired coil repeaters. Advances slowly with the army, providing durable, long-range fire against ground and air targets.',
  quote: '"Target locked. Both barrels."'
};

export const TANK_TIERS = [
  { rank: 'Foundry I', hp: 340, damage: 38, attackSpeed: 2.4, range: 7.0, upgradeCost: null }
];

export const TANK_INFO = {
  id: 'tank',
  name: 'Cinder Crawler',
  faction: 'Ridgewatch Compact',
  role: 'Heavy Armor',
  armor: 3,
  accent: '#e2a84a',
  bio: 'A tracked foundry hauler carrying twin cinder launchers. Slow volleys scatter hot slag through clustered ground targets; aircraft evade the blast.',
  quote: '"Cinders loaded. Stand clear."'
};

export const FALCON_TIERS = [
  { rank: 'Flight I', hp: 140, damage: 10, attackSpeed: 0.85, range: 5.8, upgradeCost: 200 },
  { rank: 'Flight II', hp: 200, damage: 15, attackSpeed: 0.72, range: 6.2, upgradeCost: null }
];
export const FALCON_INFO = {
  id: 'falcon', name: 'Kestrel', faction: 'Compact Air Service', role: 'Air / Ground Assault',
  armor: 1, accent: '#71e7e0',
  bio: 'Twin-engine attack craft with tracking cannons for ground and air targets. Flies over mountains and walls without blocking ground troops. Enemy spines and flying hunters can shoot it down.',
  quote: '"Sky clear. Guns ready."'
};

export const SCORCHER_TIERS = [
  { rank: 'Kindler', hp: 130, damage: 7, attackSpeed: 0.35, range: 2.7, upgradeCost: 130 },
  { rank: 'Inferno', hp: 185, damage: 11, attackSpeed: 0.32, range: 3.1, upgradeCost: null }
];
export const SCORCHER_INFO = {
  id: 'scorcher', name: 'Scorcher', faction: 'Ridgewatch Compact', role: 'Flame Trooper',
  armor: 2, accent: '#ff8a3c',
  bio: 'Slag-furnace crew in heat plating, carrying a pressurised burner. Every ground bug inside the short cone burns at once, so packs melt; plated strains shrug off most of the heat and aircraft stay out of reach.',
  quote: '"Stand behind me."'
};

export const DEADEYE_TIERS = [
  { rank: 'Spotter', hp: 60, damage: 64, attackSpeed: 2.5, range: 9.5, upgradeCost: 170 },
  { rank: 'Marksman', hp: 85, damage: 100, attackSpeed: 2.1, range: 10.5, upgradeCost: null }
];
export const DEADEYE_INFO = {
  id: 'deadeye', name: 'Deadeye', faction: 'Ridgewatch Compact', role: 'Marksman',
  armor: 0, accent: '#c9a8ff',
  bio: 'Survey scout with a long coil rifle. One slow, armour-ignoring round at the largest thing in sight, from further away than anything else on the ridge. Thin suit: keep bugs off them.',
  quote: '"Biggest one first."'
};

export const MENDER_TIERS = [
  { rank: 'Field Mender', hp: 80, damage: 12, attackSpeed: 0.8, range: 4.2, upgradeCost: 120 },
  { rank: 'Chief Mender', hp: 115, damage: 20, attackSpeed: 0.7, range: 4.8, upgradeCost: null }
];
export const MENDER_INFO = {
  id: 'mender', name: 'Mender', faction: 'Ridgewatch Compact', role: 'Field Medic',
  armor: 1, accent: '#7dffb0',
  bio: 'Outpost medic with a repair-foam projector. Automatically patches the most injured soldier, walker, crawler or aircraft in reach. Unarmed, and cannot raise the fallen; that is still Patch Rig work.',
  quote: '"Hold still. Almost done."'
};

export const UNITS = {
  marine: {
    id: 'marine', shots: 1, tiers: MARINE_TIERS, info: MARINE_INFO, visualScale: 0.56,
    shell: false, splash: 0, canBunker: true, canStim: true, armory: true, turret: false,
    mobile: true, speed: 2.15, accent: 0x5ad7ff
  },
  goliath: {
    id: 'goliath', shots: 2, tiers: GOLIATH_TIERS, info: GOLIATH_INFO, visualScale: 0.8,
    shell: false, splash: 0, canBunker: false, canStim: false, armory: false, turret: false,
    mobile: true, speed: 1.5, accent: 0xc6e07a
  },
  falcon: {
    id: 'falcon', shots: 2, tiers: FALCON_TIERS, info: FALCON_INFO, visualScale: 0.8,
    flying: true, targetsAir: true, shell: false, splash: 0, canBunker: false, canStim: false, armory: false, turret: true,
    mobile: true, speed: 4.4, accent: 0x71e7e0
  },
  tank: {
    targetsAir: false,
    id: 'tank', shots: 2, tiers: TANK_TIERS, info: TANK_INFO,
    shell: true, splash: 1.65, canBunker: false, canStim: false, armory: false, turret: true,
    mobile: true, speed: 1.25, accent: 0xd21f28
  },
  scorcher: {
    id: 'scorcher', shots: 1, tiers: SCORCHER_TIERS, info: SCORCHER_INFO, visualScale: 0.6,
    flame: { arc: 0.55 }, targetsAir: false, shell: false, splash: 0, canBunker: false, canStim: false,
    armory: false, turret: false, mobile: true, speed: 2.0, accent: 0xff8a3c
  },
  deadeye: {
    id: 'deadeye', shots: 1, tiers: DEADEYE_TIERS, info: DEADEYE_INFO, visualScale: 0.56,
    pierce: true, prefersBig: true, shell: false, splash: 0, canBunker: false, canStim: false,
    armory: false, turret: false, mobile: true, speed: 2.0, accent: 0xc9a8ff
  },
  mender: {
    id: 'mender', shots: 1, tiers: MENDER_TIERS, info: MENDER_INFO, visualScale: 0.56,
    heals: true, shell: false, splash: 0, canBunker: false, canStim: false,
    armory: false, turret: false, mobile: true, speed: 2.05, accent: 0x7dffb0
  }
};

export const ZERG_INFO = {
  id: 'zergling',
  name: 'Rift Skitter',
  faction: 'The Rift Brood',
  role: 'Melee Swarm Breeder',
  hp: 37,
  armor: 0,
  damage: 6,
  attackSpeed: 0.55,
  range: 0.95,
  speed: 2.4,
  accent: '#c06bff',
  bio: 'Canyon scavengers changed by the deep rifts. Their mineral shells and hooked limbs let the brood grind through outpost defenses in relentless packs.',
  quote: '"Skree-aa!"'
};

export const OVERDRIVE = { duration: 4, hpCost: 12, fireRate: 1.6, moveSpeed: 1.25 };

/* Armory unlocks, earned purely by body count. */
export const ARMORY = [
  { kills: 8,   id: 'u238',   name: 'Dense-Core Slugs',   effect: '+2 damage, +0.4 range', apply: (s) => { s.damage += 2; s.range += 0.4; } },
  { kills: 20,  id: 'stim',   name: 'Overdrive',       effect: 'F: +60% fire rate, +25% speed for 4s; costs 12 HP', apply: () => {} },
  { kills: 40,  id: 'shield', name: 'Impact Mesh',  effect: '+30 hit points',        apply: (s) => { s.hp += 30; } },
  { kills: 70,  id: 'maggie', name: 'Coil Amplifier',effect: '+25% damage',           apply: (s) => { s.damage = Math.round(s.damage * 1.25); } }
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
  zergling: { id: 'zergling', name: 'Rift Skitter', role: 'Melee Swarm', hp: 37, armor: 0, damage: 6, attackSpeed: 0.55, range: 0.95, speed: 2.4, scale: 1, bounty: 1, melee: true, aggro: 2.6 },
  warrior:  { id: 'warrior', name: 'Ironback', role: 'Armored Strain', hp: 150, armor: 3, damage: 12, attackSpeed: 0.9, range: 1.05, speed: 1.35, scale: 1.32, bounty: 3, melee: true, aggro: 2.2 },
  hopper:   { id: 'hopper', name: 'Vaultling', role: 'Wall Vaulter', hp: 55, armor: 0, damage: 7, attackSpeed: 0.65, range: 0.9, speed: 2.7, scale: 0.82, bounty: 2, melee: true, jump: true, aggro: 3 },
  skyhunter: { id: 'skyhunter', name: 'Duskwing', role: 'Flying Assault', flying: true, targetsAir: true, hp: 100, armor: 1, damage: 10, attackSpeed: 1.15, range: 4.2, speed: 3.1, scale: 1.1, bounty: 4, ranged: true, projectile: 'spine', muzzle: [0.5, 0.3] },
  needler:  { targetsAir: true, id: 'needler', name: 'Thornspitter', role: 'Spine Launcher', hp: 76, armor: 1, damage: 10, attackSpeed: 1.1, range: 4.0, speed: 1.85, scale: 1, bounty: 3, ranged: true, projectile: 'spine', muzzle: [0.42, 0.62] },
  tanker:   { id: 'tanker', name: 'Mirebelly', role: 'Acid Siege', hp: 276, armor: 1, damage: 18, attackSpeed: 1.7, range: 3.6, speed: 1.05, scale: 1.7, bounty: 5, ranged: true }
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

/*
 * Scenery art (see assets/CREDITS.md). Optional, like MODEL_FILES: a missing file keeps the
 * built-in rock or painted texture. `tiles` is how many tiles one repeat of a texture covers.
 */
export const SCENERY_FILES = {
  boulders: [1, 2, 3, 4].map((n) => `assets/models/rocks/boulder-${n}.glb`),
  spires: [1, 2].map((n) => `assets/models/rocks/spire-${n}.glb`),
  ground: { file: 'assets/textures/ground.jpg', tiles: 7 },
  cliff: { file: 'assets/textures/cliff.jpg', tiles: 5 },
  slope: { file: 'assets/textures/slope.jpg', tiles: 6 }
};

/* Units and bugs are drawn a bit larger than one tile so they read against the rock. */
export const UNIT_SCALE = 1.45;
export const BUG_SCALE = 1.12;

export const CORE_HP = 500;
// Run-wide base research; bonuses are additive per level, then multiply unit stats.
export const BASE_UPGRADE = { firstCost: 200, costStep: 150, bonus: 0.15 };
export const baseUpgradeCost = level => BASE_UPGRADE.firstCost + level * BASE_UPGRADE.costStep;
export function applyBaseUpgrade(stats, level) {
  const factor = 1 + level * BASE_UPGRADE.bonus;
  stats.hp = Math.round(stats.hp * factor);
  if (stats.damage != null) stats.damage *= factor;
}
export const BASE_LASER = { chargeTime: 90, damage: 600, halfWidth: 0.8, duration: 0.45 };
export const HIVE_RAID = { duration: 60, hp: 300, hpPerLevel: 45, reward: 100, rewardPerLevel: 25 };
/* Kills landed within `window` seconds of each other build a streak; each tier pays once per streak. */
export const STREAK = {
  window: 2.5,
  tiers: [
    { at: 10, name: 'LINE HOLDING', bonus: 20 },
    { at: 25, name: 'MEAT GRINDER', bonus: 50 },
    { at: 50, name: 'CANYON CLEANER', bonus: 100 },
    { at: 100, name: 'RIFT BREAKER', bonus: 250 }
  ]
};
/* Supply drops land near the base mid-wave. Click one, or walk a unit onto it, before it expires. */
export const SUPPLY = { first: 14, interval: 26, life: 18, minerals: 30, mineralsPerLevel: 6, pickup: 0.9, strikeChance: 0.2 };
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
  { name: 'Ember Reach Cut', radius: 1.55, path: [[1.5, 8.5], [8.5, 8.5], [14.5, 4.5], [20.5, 11.5], [24.5, 8.5]], blurb: 'A straight cut through the ridge. Hold the bends. The mountains do not move.' },
  { name: 'Switchback', radius: 1.52, path: [[1.5, 12.5], [12.5, 12.5], [12.5, 3.5], [22.5, 3.5], [22.5, 8.5]], blurb: 'They come along the high shelf, then drop. A wall on the corner catches the whole file.' },
  { name: 'South Hook', radius: 1.5, path: [[1.5, 3.5], [18.5, 3.5], [18.5, 12.5], [8.5, 12.5], [8.5, 8.5]], blurb: 'The lane hooks south and doubles back. Do not fortify the first stretch and forget the return.' },
  { name: 'The Stairs', radius: 1.48, path: [[1.5, 13.5], [7.5, 13.5], [7.5, 9.5], [14.5, 9.5], [14.5, 5.5], [21.5, 5.5], [21.5, 2.5]], blurb: 'Ironbacks in the file. Plated bugs. Rifle fire skips off the carapace unless you focus them.' },
  { name: 'Serpent', radius: 1.48, path: [[2.5, 8.5], [6.5, 3.5], [11.5, 3.5], [11.5, 12.5], [17.5, 12.5], [17.5, 4.5], [23.5, 8.5]], blurb: 'The cut snakes the whole sector. Overlap the straight sections.' },
  { name: 'High Road', radius: 1.46, path: [[1.5, 2.5], [20.5, 2.5], [20.5, 13.5], [10.5, 13.5], [10.5, 8.5]], blurb: 'Vaultlings in the swarm. They vault a single wall. One thin line will not hold.' },
  { name: 'Double Bend', radius: 1.46, path: [[1.5, 6.5], [8.5, 6.5], [8.5, 2.5], [16.5, 2.5], [16.5, 13.5], [23.5, 13.5]], blurb: 'Two long bends. The second one faces the ridge relay — put the heavy gun there.' },
  { name: 'Box Canyon', radius: 1.44, path: [[2.5, 2.5], [8.5, 2.5], [8.5, 8.5], [16.5, 8.5], [16.5, 3.5], [22.5, 3.5], [22.5, 11.5]], blurb: 'A Mirebelly is with them. It will not close. It sits off the breach and melts whatever you built.' },
  { name: 'The Weave', radius: 1.4, path: [[1.5, 10.5], [5.5, 10.5], [5.5, 5.5], [10.5, 5.5], [10.5, 12.5], [15.5, 12.5], [15.5, 4.5], [20.5, 4.5], [20.5, 10.5], [24.5, 8.5]], blurb: 'The narrowest cut so far. Random rock in the lane. Leave yourself a firing step.' },
  { name: 'Final Gauntlet', radius: 1.4, path: [[1.5, 8.5], [6.5, 4.5], [6.5, 12.5], [12.5, 12.5], [12.5, 3.5], [18.5, 3.5], [18.5, 12.5], [24.5, 9.5]], blurb: 'Last canyon. Every strain is in the column. The ridge relay is at the end of the weave.' }
];

/**
 * The column for level n. Levels never end: every strain keeps growing in number and
 * toughness, new strains join as you go, and the column gets longer.
 */
export function wavePlan(n) {
  const hpScale = 1 + (n - 1) * 0.10;
  const speedScale = 1 + Math.min(0.3, (n - 1) * 0.015);
  const out = [];
  const add = (count, start, gap, breed) => {
    for (let i = 0; i < count; i++) out.push({ at: start + i * gap, breed, hpScale, speedScale });
  };
  let t = 0.2;
  // Add a few enemies each round instead of doubling the opening wave at level 2.
  const count = Math.min(192, 4 + 2 * (n - 1) + Math.floor(0.08 * (n - 1) ** 2));
  const groupSize = Math.min(12, 4 + Math.floor((n - 1) / 4));
  for (let sent = 0; sent < count; sent += groupSize) {
    const size = Math.min(groupSize, count - sent);
    add(size, t, 0.1, 'zergling');
    t += 1.05 + size * 0.1;
  }
  if (n >= 5) add(Math.min(12, 2 + Math.floor((n - 5) / 2)), 3.5, 1.15, 'skyhunter');
  if (n >= 3) add(Math.min(14, 1 + Math.floor((n - 3) / 1.5)), 1.8, 1.3, 'needler');    // ranged spine launchers
  if (n >= 4) add(Math.min(14, 1 + Math.floor((n - 4) / 1.5)), 1, 1.5, 'warrior');      // armoured
  if (n >= 6) add(Math.min(14, 2 + Math.floor((n - 6) / 1.5)), 1.4, 0.85, 'hopper');    // wall vaulters
  if (n >= 8) add(Math.min(10, 1 + Math.floor((n - 8) / 2.5)), 2.4, 1.7, 'tanker');         // acid siege
  out.sort((a, b) => a.at - b.at);
  return out;
}

// Silver lasts through the next three full rounds; gold lasts for the run.
export const TREASURE_RULES = { silverRounds: 3, goldChance: 0.35 };
// Boss evolutions last for one run; repeat picks improve a branch with diminishing returns.
export const EVOLUTIONS = [
  { id: 'siege', name: 'Walking Fortress', unit: 'Cinder Crawlers', icon: '⌖', color: '#f0b23c',
    flavor: 'Plant your treads. Own the canyon.' },
  { id: 'chain', name: 'Chain Lightning', unit: 'Anchor Walkers', icon: 'ϟ', color: '#71e7e0',
    flavor: 'One target becomes an entire swarm.' },
  { id: 'stand', name: 'Last Stand', unit: 'Garrisoned Lineguards', icon: '▰', color: '#ff8066',
    flavor: 'When the walls crack, the guns roar.' }
];
export const EVOLUTION_RULES = {
  deployTime: 1.2, siegeRange: 5, siegeRangeStep: 0.75, siegeSplash: 0.6,
  chainHops: 2, chainRadius: 3.5, chainDamage: 0.5, chainDamageStep: 0.1,
  standThreshold: 0.3, standDuration: 6, standDurationStep: 1, standCooldown: 20, standFireRate: 3
};
export function evolutionPower(rank) { return Math.log2(Math.max(1, rank)); }
// Treasure bonuses stack for all current and future Lineguards.
export const TREASURE = [
  { id: 'gun', name: 'Pulse Rifle Kit', effect: '+15% Lineguard gun damage', apply: s => { s.damage *= 1.15; } },
  { id: 'range', name: 'Targeting Scope', effect: '+0.5 Lineguard range', apply: s => { s.range += 0.5; } },
  { id: 'fire', name: 'Rapid-fire Loader', effect: '+15% Lineguard firing speed', apply: s => { s.attackSpeed /= 1.15; } },
  { id: 'speed', name: 'Servo Boosters', effect: '+10% Lineguard movement speed', apply: s => { s.moveSpeed *= 1.1; } }
];

/* Bosses every five levels; decade bosses are the harder encounters. */
export function milestonePlan(level) {
  if (level < 5 || level % 5 !== 0) return null;
  const hard = level % 10 === 0;
  const tier = Math.ceil(level / 10);
  const names = ['THE BREACHER', 'THE HOLLOW QUEEN', 'THE WORLD EATER'];
  return {
    tier, difficulty: hard ? 'HARD' : 'MEDIUM', hard,
    treasureMin: hard ? 2 : 1, treasureMax: hard ? 3 : 2,
    name: hard ? names[Math.min(tier - 1, 2)] : 'RIFT WARDEN',
    hp: Math.round((1800 + (tier - 1) * 2800) * (hard ? 1 : 0.5)),
    armor: (hard ? 3 : 1) + tier, damage: Math.round((22 + tier * 8) * (hard ? 1 : 0.65)),
    scale: 2.1 + Math.min(tier, 5) * 0.25,
    speed: 1.15 + Math.min(tier, 5) * 0.1,
    spellInterval: hard ? 10 : 14, spellTelegraph: 2,
    blindDuration: 5, silenceDuration: 3, spellRadius: 2.8,
    broodCount: Math.min(10, 3 + tier * 2),
    strikeInterval: Math.max(5, 11 - tier) * (hard ? 1 : 1.4),
    strikeDamage: Math.round((30 + tier * 15) * (hard ? 1 : 0.6)),
    strikeRadius: 2.3 + Math.min(tier, 5) * 0.3,
    telegraph: Math.max(1.8, 3.2 - tier * 0.25),
    reinforcementInterval: Math.max(7, 15 - tier * 2) * (hard ? 1 : 1.4),
    reinforcements: Math.min(12, (hard ? 2 : 0) + tier * 2),
    reward: Math.round((300 + tier * 250) * (hard ? 1 : 0.6))
  };
}
