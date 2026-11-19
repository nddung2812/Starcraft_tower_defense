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

export const BUNKER_WEAPONS = { damageMultiplier: 1.5, rangeBonus: 2 };

export const BUILD = {
  wall: { id: 'wall', name: 'Barrier', cost: 25, hp: 320, icon: 'W', key: 'W', desc: 'Plasteel barricade. The swarm chews through it or goes around.' },
  marine: { id: 'marine', name: 'Trooper', cost: 60, icon: 'M', key: 'Q', desc: 'Trooper. Right-click the canyon to move him. Promote, engage Overdrive, or garrison a bunker.' },
  bunker: { id: 'bunker', name: 'Bunker', cost: 80, hp: 300, icon: 'B', key: 'B', desc: 'Two cannons, one per Trooper. Garrison up to two: +50% damage and +2 range. Troopers survive bunker destruction.' },
  goliath: { id: 'goliath', name: 'Atlas', cost: 160, icon: 'G', key: 'G', desc: 'Walker with twin rocket pods. Long reach. Too big for a bunker.' },
  falcon: { id: 'falcon', name: 'Vector', cost: 240, icon: 'V', key: 'V', desc: 'Flying gunship. Twin cannons attack ground and air. Flies over terrain; vulnerable to spines and flying hunters.' },
  tank: { id: 'tank', name: 'Hammer', cost: 280, icon: 'H', key: 'T', desc: 'Silver heavy tank. Twin cinder launchers. Right-click the canyon to drive it. Defend (D) locks it into siege mode.' },
  // Specialists join the build bar one round at a time (`unlock` is the first round they can be built).
  scorcher: { id: 'scorcher', name: 'Torch', cost: 110, icon: 'C', key: 'C', unlock: 2, desc: 'Flame trooper. Burns every ground bug in a short cone. Weak against armour.' },
  deadeye: { id: 'deadeye', name: 'Spectre', cost: 150, icon: 'D', key: 'X', unlock: 3, desc: 'Marksman. Very long range, ignores armour, picks the biggest target. Fragile.' },
  cruiser: { id: 'cruiser', name: 'Titan', cost: 900, maxActive: 3, icon: 'Y', key: 'Z', unlock: 5, desc: 'Maximum 3 active Titans. Armoured capital ship. Four batteries hit ground and air. Charges Yamato automatically against heavy targets; Shift+Z fires manually. Flies over terrain.' },
  mender: { id: 'mender', name: 'Medic', cost: 100, icon: '+', key: 'E', unlock: 4, desc: 'Field medic. Heals the most injured unit nearby and scatters 3 mines where it is placed. Carries no weapon.' }
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
  name: 'Trooper',
  faction: 'Breachline Compact',
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
  name: 'Atlas',
  faction: 'Breachline Compact',
  role: 'Combat Walker',
  armor: 2,
  accent: '#c6e07a',
  bio: 'A heavy mining walker refitted with paired rocket pods. Advances slowly with the army, providing durable, long-range fire against ground and air targets.',
  quote: '"Target locked. Both barrels."'
};

/* Siege mode: a Hammer set to Defend (D) locks in place. `deploy` and `pack` are seconds to change over,
 * during which it cannot fire or move. Deployed it reaches `range` tiles farther and hits `damage` times as hard. */
export const SIEGE_MODE = { damage: 1.5, range: 4.5, deploy: 1.6, pack: 1.2 };
export const TANK_TIERS = [
  { rank: 'Foundry I', hp: 340, damage: 38, attackSpeed: 2.4, range: 7.0, upgradeCost: null }
];

export const TANK_INFO = {
  id: 'tank',
  name: 'Hammer',
  faction: 'Breachline Compact',
  role: 'Heavy Armor',
  armor: 3,
  accent: '#e2a84a',
  bio: 'A tracked foundry hauler carrying twin cinder launchers. Slow volleys scatter hot slag through clustered ground targets; aircraft evade the blast. Its tracks climb mountains and ford lakes, so it takes the quickest way to wherever it is sent.',
  quote: '"Cinders loaded. Stand clear."'
};

export const FALCON_TIERS = [
  { rank: 'Flight I', hp: 140, damage: 10, attackSpeed: 0.85, range: 5.8, upgradeCost: 200 },
  { rank: 'Flight II', hp: 200, damage: 15, attackSpeed: 0.72, range: 6.2, upgradeCost: null }
];
export const FALCON_INFO = {
  id: 'falcon', name: 'Vector', faction: 'Compact Air Service', role: 'Air / Ground Assault',
  armor: 1, accent: '#71e7e0',
  bio: 'Twin-engine attack craft with tracking cannons for ground and air targets. Flies over mountains and walls without blocking ground troops. Enemy spines and flying hunters can shoot it down.',
  quote: '"Sky clear. Guns ready."'
};

export const SCORCHER_TIERS = [
  { rank: 'Kindler', hp: 130, damage: 7, attackSpeed: 0.35, range: 2.7, upgradeCost: 130 },
  { rank: 'Inferno', hp: 185, damage: 11, attackSpeed: 0.32, range: 3.1, upgradeCost: null }
];
export const SCORCHER_INFO = {
  id: 'scorcher', name: 'Torch', faction: 'Breachline Compact', role: 'Flame Trooper',
  armor: 2, accent: '#ff8a3c',
  bio: 'Slag-furnace crew in heat plating, carrying a pressurised burner. Every ground bug inside the short cone burns at once, so packs melt; plated strains shrug off most of the heat and aircraft stay out of reach.',
  quote: '"Stand behind me."'
};

export const DEADEYE_TIERS = [
  { rank: 'Spotter', hp: 60, damage: 64, attackSpeed: 2.5, range: 9.5, upgradeCost: 170 },
  { rank: 'Marksman', hp: 85, damage: 100, attackSpeed: 2.1, range: 10.5, upgradeCost: null }
];
export const DEADEYE_INFO = {
  id: 'deadeye', name: 'Spectre', faction: 'Breachline Compact', role: 'Marksman',
  armor: 0, accent: '#c9a8ff',
  bio: 'Survey scout with a long coil rifle. One slow, armour-ignoring round at the largest thing in sight, from further away than anything else on the ridge. Thin suit: keep bugs off them.',
  quote: '"Biggest one first."'
};

/* Medic mines: `count` are scattered once, on free tiles `near`–`far` tiles from where a Medic is
 * placed. A ground bug within `trigger` sets one off for `damage` to every ground enemy in `blast`. */
export const MINES = { count: 3, damage: 100, near: 1.2, far: 3.2, trigger: 0.5, blast: 1.2, arm: 0.5 };
export const MENDER_TIERS = [
  { rank: 'Field Medic', hp: 80, damage: 12, attackSpeed: 1.6, range: 4.2, upgradeCost: 120 },
  { rank: 'Chief Medic', hp: 115, damage: 20, attackSpeed: 1.4, range: 4.8, upgradeCost: null }
];
export const MENDER_INFO = {
  id: 'mender', name: 'Medic', faction: 'Breachline Compact', role: 'Field Medic',
  armor: 1, accent: '#7dffb0',
  bio: 'Outpost medic with healing gauntlets. Automatically patches the most injured soldier, walker, crawler or aircraft in reach. Throws three proximity mines onto the ground around the spot where it is first placed. Otherwise unarmed, and cannot raise the fallen; that is still Patch Rig work.',
  quote: '"Hold still. Almost done."'
};

// cooldown was 18 s; 26 s is about 30% fewer shots.
export const YAMATO = { damage: 1400, splashDamage: 260, radius: 2.6, range: 12, charge: 4, cooldown: 45 };
export const CRUISER_TIERS = [
  { rank: 'Dreadnought', hp: 1100, damage: 20, attackSpeed: 0.7, range: 8, upgradeCost: 700 },
  { rank: 'Flagship', hp: 1650, damage: 28, attackSpeed: 0.6, range: 8.8, upgradeCost: null }
];
export const CRUISER_INFO = {
  id: 'cruiser', name: 'Titan', faction: 'Compact Capital Fleet', role: 'Heavy Capital Ship',
  armor: 4, accent: '#ffbd69',
  bio: 'A flying fortress with four rapid-fire batteries, heavy armour and a charged Yamato cannon. Automatically targets bosses, hives and heavy enemies. Select it and press Shift+Z to strike the strongest enemy in range; an explicit attack target takes priority. Yamato scales with promotions and base research.',
  quote: '"Bring the full battery to bear."'
};

export const UNITS = {
  cruiser: {
    id: 'cruiser', shots: 4, tiers: CRUISER_TIERS, info: CRUISER_INFO, visualScale: 0.75,
    flying: true, targetsAir: true, shell: false, splash: 0, canBunker: false, canStim: false,
    armory: false, turret: true, mobile: true, speed: 2.1, accent: 0xffbd69
  },
  marine: {
    id: 'marine', shots: 1, tiers: MARINE_TIERS, info: MARINE_INFO, visualScale: 0.4032,
    shell: false, splash: 0, canBunker: true, canStim: true, armory: true, turret: false,
    mobile: true, speed: 2.15, accent: 0x5ad7ff
  },
  goliath: {
    id: 'goliath', shots: 2, tiers: GOLIATH_TIERS, info: GOLIATH_INFO, visualScale: 0.6460,
    shell: false, splash: 0, canBunker: false, canStim: false, armory: false, turret: false,
    mobile: true, speed: 1.5, accent: 0xc6e07a,
    rocket: true   // volleys fly as smoke-trailed rockets; damage and targeting are unchanged
  },
  falcon: {
    id: 'falcon', shots: 2, tiers: FALCON_TIERS, info: FALCON_INFO, visualScale: 0.72,
    flying: true, targetsAir: true, shell: false, splash: 0, canBunker: false, canStim: false, armory: false, turret: true,
    mobile: true, speed: 4.4, accent: 0x71e7e0
  },
  tank: {
    targetsAir: false,
    id: 'tank', shots: 2, tiers: TANK_TIERS, info: TANK_INFO, visualScale: 0.9, siegeMode: SIEGE_MODE,
    shell: true, splash: 1.65, canBunker: false, canStim: false, armory: false, turret: true,
    mobile: true, speed: 1.25, accent: 0xd21f28,
    // All-terrain tracks: the share of road speed kept on mountain rock and wading a lake, and the
    // extra time a climb costs per tile of height gained or lost. Routes are priced with the same numbers.
    offroad: { rock: 0.9, water: 0.65, climb: 0.08 }
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
    heals: true, mines: MINES, shell: false, splash: 0, canBunker: false, canStim: false,
    armory: false, turret: false, mobile: true, speed: 2.05, accent: 0x7dffb0
  }
};

export const ZERG_INFO = {
  id: 'zergling',
  name: 'Ripper',
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

export const ULTRALISK = { firstRound: 8, cleaveRadius: 2.2, cleaveArc: 1.05, structureMultiplier: 1.6 };
/*
 * Tunnel Maw: every `interval` seconds of a wave it marks an exposed ground unit, erupts under
 * the mark after `telegraph`, and swallows the nearest one still inside `radius`. It stays up
 * for `hold` seconds (`empty` if it missed); killing it in time frees the unit.
 */
export const MAW = {
  firstRound: 9, pairRound: 18, first: 16, interval: 24, intervalStep: 0.6, minInterval: 12,
  telegraph: 2.4, radius: 1.25, hold: 7, empty: 3.5, digest: 0.06, rise: 0.45, dive: 0.7
};
/*
 * Skymother: the swarm's answer to the Titan, from round `firstRound` but never alongside a boss.
 * Her bile cannon fires every `boltGap` seconds and bursts for `boltSplash` of its damage within `boltRadius`.
 * She carries `brood` Talons, launches one every `launchGap` seconds, and grows a lost one back every
 * `regrow` seconds. Talons and bolts do `structureShare` of their damage to buildings
 * and Talons do `titanBonus` extra to a Titan, so they can bite through its plate without shredding infantry.
 * A Survival match sends a wave every 40 seconds, so there she joins at `matchFirstWave`, `matchAlive` at a time.
 */
export const SKYMOTHER = {
  firstRound: 11, roundsPerExtra: 10, maxPerWave: 3, maxAlive: 3, arrive: 9, spacing: 8,
  brood: 10, launchGap: 0.3, regrow: 10, altitude: 3.6, structureShare: 0.4, titanBonus: 6,
  boltGap: 2.6, boltSpeed: 9, boltSplash: 0.5, boltRadius: 1.5,
  matchFirstWave: 16, matchAlive: 1
};
export const BREEDS = {
  skymother: { id: 'skymother', name: 'Skymother', role: 'Armoured Brood Carrier', flying: true, targetsAir: true, hp: 1400, armor: 5, damage: 32, attackSpeed: 2.6, range: 7.5, speed: 1.1, scale: 1.75, bounty: 40, ranged: true,
    bio: 'A slow living carrier in heavy plate. Her bile cannon bursts across tight formations while she launches up to ten Talons at anything in reach, hunts Titans first, and grows a lost Talon back every 10 seconds. Kill her and the whole brood falls with her. Rifles barely scratch the armour, so use Yamato, armour-piercing Spectres and Atlas mechs.' },
  talon: { id: 'talon', name: 'Talon', role: 'Skymother Brood', flying: true, targetsAir: true, hp: 40, armor: 0, damage: 6, attackSpeed: 1.3, range: 2.8, speed: 5.4, scale: 0.62, bounty: 0, ranged: true, projectile: 'spine',
    bio: 'A fast dart of chitin launched from a Skymother. It strikes ground and air alike. She grows more for as long as she lives, so shooting them earns nothing: go for the mother.' },
  maw: { id: 'maw', name: 'Tunnel Maw', role: 'Burrowing Ambusher', hp: 240, armor: 2, damage: 0, attackSpeed: 1, range: 1.25, speed: 0, scale: 1.0, bounty: 6, melee: true, aggro: 0 },
  ultralisk: { id: 'ultralisk', name: 'Behemoth', role: 'Armoured Siege Beast', hp: 1300, armor: 7, damage: 48, attackSpeed: 1.15, range: 1.65, speed: 1.6, scale: 1.5, bounty: 18, melee: true, aggro: 3.8 },
  zergling: { id: 'zergling', name: 'Ripper', role: 'Melee Swarm', hp: 37, armor: 0, damage: 6, attackSpeed: 0.55, range: 0.95, speed: 2.4, scale: 1, bounty: 1, melee: true, aggro: 2.6 },
  warrior:  { id: 'warrior', name: 'Brute', role: 'Armored Strain', hp: 150, armor: 3, damage: 12, attackSpeed: 0.9, range: 1.05, speed: 1.35, scale: 1.32, bounty: 3, melee: true, aggro: 2.2 },
  hopper:   { id: 'hopper', name: 'Leaper', role: 'Wall Vaulter', hp: 55, armor: 0, damage: 7, attackSpeed: 0.65, range: 0.9, speed: 2.7, scale: 0.82, bounty: 2, melee: true, jump: true, aggro: 3 },
  broodray: { id: 'broodray', name: 'Brood Ray', role: 'Armoured Acid Flyer', flying: true, targetsAir: true, hp: 220, armor: 3, damage: 18, attackSpeed: 1.65, range: 5.8, speed: 2.1, scale: 1.35, bounty: 7, ranged: true, projectile: 'acid', muzzle: [0.65, 0.2] },
  skyhunter: { id: 'skyhunter', name: 'Wraith', role: 'Flying Assault', flying: true, targetsAir: true, hp: 100, armor: 1, damage: 10, attackSpeed: 1.15, range: 5.0, speed: 3.1, scale: 1.1, bounty: 4, ranged: true, projectile: 'spine', muzzle: [0.5, 0.3] },
  needler:  { targetsAir: true, id: 'needler', name: 'Needler', role: 'Spine Launcher', hp: 76, armor: 1, damage: 10, attackSpeed: 1.1, range: 5.2, speed: 1.85, scale: 1, bounty: 3, ranged: true, projectile: 'spine', muzzle: [0.5, 0.36] },
  tanker:   { id: 'tanker', name: 'Corroder', role: 'Acid Siege', hp: 276, armor: 1, damage: 18, attackSpeed: 1.7, range: 6.0, speed: 1.05, scale: 1.7, bounty: 5, ranged: true }
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
 *   muzzles     several barrels, as a list of [x, y, z]
 *   tint        { MaterialName: 0xrrggbb } repaints the file's materials for this unit
 *   hide        pattern of part names to leave out; seat: parts used to centre the unit
 *   turret      { parts, pivot } patterns for parts that swivel to aim, or 'all' for aircraft
 *   tierTint    { nodes, colors } repaints matching parts per promotion tier (null = unchanged)
 */
/* The infantry share one soldier file: each role keeps one of its guns and wears its own colours. */
const SOLDIER = 'assets/models/soldier.glb';
const SOLDIER_GUNS = ['AK', 'Sniper', 'ShortCannon'];
const soldier = (gun, uniform, trousers, extra = {}) => ({
  file: SOLDIER, fit: 'height', size: 1.25, seat: '^(Body|Head)$', yaw: Math.PI / 2 + 0.37,   // the aim pose holds the gun off-centre
  hide: `^(${SOLDIER_GUNS.filter((g) => g !== gun).join('|')})$`,
  tint: { Character_Main: uniform, Pants: trousers },
  tierTint: { nodes: '^ShoulderPad', colors: [null, 0x9fd8ff, 0xffc24a, 0xff5a4a] },
  clips: { walk: gun ? 'Run_Gun' : 'Run', shoot: gun ? 'Idle_Shoot' : 'Idle' },
  ...extra
});

export const MODEL_FILES = {
  marine:   soldier('AK', 0x2f6fb5, 0x23364d, { muzzle: [1.3, 1.0, 0] }),
  scorcher: soldier('ShortCannon', 0xc8571f, 0x3d2a20, { muzzle: [1.15, 1.12, 0] }),
  deadeye:  soldier('Sniper', 0x6a4bb0, 0x2b2540, { muzzle: [1.55, 1.22, 0] }),
  mender:   soldier(null, 0xe8eef2, 0x4d8f6a),
  goliath:  {
    file: 'assets/models/goliath.glb', fit: 'height', size: 1.65,
    clips: { idle: 'Idle', walk: 'Walk', shoot: 'Shoot_Big', death: 'Death' },
    muzzles: [[0.58, 1.04, 0.51], [0.58, 1.04, -0.51]],
    tierTint: { nodes: '^RankPlate', colors: [null, 0x9fd8ff, 0xff5a4a] }
  },
  falcon:   {
    file: 'assets/models/falcon.glb', fit: 'length', size: 1.9, turret: 'all',
    tint: { White: 0xc9d3dc, Orange: 0x2f7fd0 },
    muzzles: [[0.6, 0.1, 0.3], [0.6, 0.1, -0.3]]
  },
  scv:      { file: 'assets/models/scv.glb',      fit: 'length', size: 0.7 },
  bunker:   { file: 'assets/models/bunker.glb',   fit: 'length', size: 1.0 },
  zergling: { file: 'assets/models/zergling.glb', fit: 'length', size: 1.0 },
  warrior:  { file: 'assets/models/warrior.glb',  fit: 'length', size: 1.0, fallback: 'zergling' },
  hopper:   { file: 'assets/models/hopper.glb',   fit: 'length', size: 1.0, fallback: 'zergling' },
  tanker:   { file: 'assets/models/tanker.glb',   fit: 'length', size: 1.0, fallback: 'zergling' },
  /*
   * Swarm beasts from files (sources in assets/CREDITS.md). `tint` repaints a material by name and
   * `glow` lights one from within. One file can dress several kinds: the Hollow Queen is the
   * Needler's spider in bone white, the Breacher and the World Eater share a body.
   */
  needler:  {
    file: 'assets/models/needler.glb', fit: 'length', size: 1.5,
    tint: { Material: 0x3a1f55, 'Material.001': 0xffa030 }, glow: { 'Material.001': 0xff8a1e }
  },
  ultralisk: {
    file: 'assets/models/behemoth.glb', fit: 'length', size: 2.3,
    tint: { Purple: 0x35204a, LightBrown: 0x7d4f8f, Brown: 0xe6d8b8 }
  },
  // Milestone bosses (`milestonePlan().model`); without the file a boss is an oversized Brute.
  warden:   {
    file: 'assets/models/warden.glb', fit: 'length', size: 1.5,
    tint: { DarkBrown: 0x2a2f4a, LightBrown: 0x5a4a7a, Brown: 0x7a34e0 }, glow: { Brown: 0x7a2cff }, glowPower: 0.8
  },
  breacher: {
    file: 'assets/models/tyrant.glb', fit: 'length', size: 1.6,
    tint: { Green: 0x4a1a22, LightGreen: 0x8a5a4a, LightYellow: 0xf0e6c8, Black: 0x1a1014, Red: 0xff5a1e }, glow: { Red: 0xff5a1e }
  },
  queen:    {
    file: 'assets/models/needler.glb', fit: 'length', size: 1.7,
    tint: { Material: 0x9c8f7c, 'Material.001': 0xff2040 }, glow: { 'Material.001': 0xff2040 }
  },
  eater:    {
    file: 'assets/models/tyrant.glb', fit: 'length', size: 1.6,
    tint: { Green: 0x16141c, LightGreen: 0xff7a2a, LightYellow: 0xf0e6c8, Black: 0xff7a2a, Red: 0xffaa30 },
    glow: { LightGreen: 0xff5a10, Black: 0xff5a10, Red: 0xffaa30 }
  }
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
// Research is paid up front and lands after a short build: firstTime seconds, a little longer each level.
/* Every `levels` research levels the base earns a tier. Tier 1 mines `minerals` every `interval` seconds and
 * sends one free Trooper every `troopEvery` seconds. Each further tier adds that many minerals again and a Trooper.
 * At most `maxFree` free Troopers stand at once. */
export const BASE_INCOME = { levels: 3, minerals: 1, interval: 0.5, troopEvery: 30, maxFree: 40 };
export const incomeTier = level => Math.floor(level / BASE_INCOME.levels);
export const incomeMinerals = tier => BASE_INCOME.minerals * tier;
export const BASE_UPGRADE = { firstCost: 200, costStep: 150, bonus: 0.15, firstTime: 6, timeStep: 1, maxTime: 12 };
export const baseUpgradeTime = level => Math.min(BASE_UPGRADE.maxTime, BASE_UPGRADE.firstTime + level * BASE_UPGRADE.timeStep);
export const baseUpgradeCost = level => BASE_UPGRADE.firstCost + level * BASE_UPGRADE.costStep;
export function applyBaseUpgrade(stats, level) {
  const factor = 1 + level * BASE_UPGRADE.bonus;
  stats.hp = Math.round(stats.hp * factor);
  if (stats.damage != null) stats.damage *= factor;
}
/* The plasma shield over the base: one tier every `every` research levels. Each tier is wider and holds
 * more. It only recharges once nothing under it has been hit for `regenDelay` seconds, at `regen` of its
 * total per second. Broken, it stays down until that slow recharge reaches `restart` of its total. */
export const PLASMA_SHIELD = { every: 3, radius: 5, radiusStep: 1.5, maxRadius: 14, pool: 300, poolStep: 150, regenDelay: 8, regen: 0.02, restart: 0.3 };
export const plasmaTier = level => Math.floor(level / PLASMA_SHIELD.every);
export const plasmaRadius = tier => Math.min(PLASMA_SHIELD.maxRadius, PLASMA_SHIELD.radius + (tier - 1) * PLASMA_SHIELD.radiusStep);
export const plasmaPool = tier => PLASMA_SHIELD.pool + (tier - 1) * PLASMA_SHIELD.poolStep;
/* From research level `twinLevel` each rail of the cannon is its own laser with its own charge. */
export const BASE_LASER = { chargeTime: 90, damage: 600, halfWidth: 0.8, duration: 1.1, twinLevel: 5 };
export const HIVE_RAID = { duration: 60, evolutionInterval: 30, broodBase: 2, broodPerEvolution: 2, broodCap: 12, hp: 300, hpPerLevel: 45, reward: 100, rewardPerLevel: 25, upgradeHp: 0.2 };
/*
 * Every `evolutionInterval` seconds of battle a hive upgrades for free: `upgradeHp` of its starting
 * health is added to its maximum and its current health, so damage already dealt stays dealt.
 * After `awake` seconds it strikes the nearest ground unit within `range`: a ring marks the spot and
 * thorns burst up `telegraph` seconds later, hitting ground units within `radius`.
 */
export const HIVE_THORNS = { awake: 60, interval: 4.5, range: 9, telegraph: 0.9, radius: 0.9, damage: 20, damagePerUpgrade: 1.5, maxDamage: 40, growth: 0.05, growthCap: 10, growTime: 1.4 };
export const thornDamage = upgrades => Math.min(HIVE_THORNS.maxDamage, Math.round(HIVE_THORNS.damage + upgrades * HIVE_THORNS.damagePerUpgrade));
/*
 * Skirmish: one continuous match on one map. A bigger wave leaves the hives every `waveGap`
 * seconds; destroying every hive wins. Hives are tougher than in the endless stand and hatch guards (at most once per `guardGap` seconds) when they are hit.
 */
export const SKIRMISH = {
  waveGap: 40,
  hiveHp: 2600, hiveHpPerWave: 200, hiveReward: 250,
  guardGap: 6, guardBase: 3, guardPerWave: 0.5, guardCap: 10,
  /* The setup screen. A map must be at least `minSize[hives]` across so every march is a real one. */
  maxHives: 7,
  sizes: [56, 72, 88, 104, 120],
  minSize: { 1: 56, 2: 56, 3: 72, 4: 72, 5: 88, 6: 88, 7: 104 },
  minMarch: 28,
  /* The whole swarm grows with the number of hives sending it: 2 hives is the baseline. */
  swarmBase: 0.6, swarmPerHive: 0.2,
  /* How hard the swarm presses: seconds between waves, swarm size, hive health and growth. */
  moods: {
    calm: { name: 'Calm', note: 'a wave every 50 s, smaller swarms, softer hives', waveGap: 50, swarm: 0.8, hive: 0.85 },
    standard: { name: 'Standard', note: 'a wave every 40 s', waveGap: 40, swarm: 1, hive: 1 },
    fierce: { name: 'Fierce', note: 'a wave every 32 s, bigger swarms, tougher hives', waveGap: 32, swarm: 1.25, hive: 1.2 }
  },
  minerals: [300, 480, 800, 1200],
  defaults: { hives: 2, mood: 'standard', size: 0, minerals: 480, quick: true }   // size 0 = smallest that fits
};
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
  key: 'R',
  fire: { seconds: 5, dps: 10, radius: 1.75 }   // the flames each bomb leaves; overlapping patches do not stack
};

/* One canyon per level. Waypoints are world-space tile centers. Radius is how far the dirt lane reaches — everything past it is locked mountain. */
export const LEVELS = [
  { name: 'Ember Reach Cut', radius: 1.55, path: [[1.5, 8.5], [8.5, 8.5], [14.5, 4.5], [20.5, 11.5], [24.5, 8.5]], blurb: 'A straight cut through the ridge. Hold the bends. The mountains do not move.' },
  { name: 'Switchback', radius: 1.52, path: [[1.5, 12.5], [12.5, 12.5], [12.5, 3.5], [22.5, 3.5], [22.5, 8.5]], blurb: 'They come along the high shelf, then drop. A wall on the corner catches the whole file.' },
  { name: 'South Hook', radius: 1.5, path: [[1.5, 3.5], [18.5, 3.5], [18.5, 12.5], [8.5, 12.5], [8.5, 8.5]], blurb: 'The lane hooks south and doubles back. Do not fortify the first stretch and forget the return.' },
  { name: 'The Stairs', radius: 1.48, path: [[1.5, 13.5], [7.5, 13.5], [7.5, 9.5], [14.5, 9.5], [14.5, 5.5], [21.5, 5.5], [21.5, 2.5]], blurb: 'Brutes in the file. Plated bugs. Rifle fire skips off the carapace unless you focus them.' },
  { name: 'Serpent', radius: 1.48, path: [[2.5, 8.5], [6.5, 3.5], [11.5, 3.5], [11.5, 12.5], [17.5, 12.5], [17.5, 4.5], [23.5, 8.5]], blurb: 'The cut snakes the whole sector. Overlap the straight sections.' },
  { name: 'High Road', radius: 1.46, path: [[1.5, 2.5], [20.5, 2.5], [20.5, 13.5], [10.5, 13.5], [10.5, 8.5]], blurb: 'Leapers in the swarm. They vault a single wall. One thin line will not hold.' },
  { name: 'Double Bend', radius: 1.46, path: [[1.5, 6.5], [8.5, 6.5], [8.5, 2.5], [16.5, 2.5], [16.5, 13.5], [23.5, 13.5]], blurb: 'Two long bends. The second one faces the ridge relay — put the heavy gun there.' },
  { name: 'Box Canyon', radius: 1.44, path: [[2.5, 2.5], [8.5, 2.5], [8.5, 8.5], [16.5, 8.5], [16.5, 3.5], [22.5, 3.5], [22.5, 11.5]], blurb: 'A Corroder is with them. It will not close. It sits off the breach and melts whatever you built.' },
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
  if (n >= 5) add(Math.min(16, 3 + Math.floor((n - 5) / 1.5)), 3.5, 1.15, 'skyhunter');
  if (n >= 7) add(Math.min(8, 1 + Math.floor((n - 7) / 2)), 5.5, 2.2, 'broodray');
  if (n >= 3) add(Math.min(14, 1 + Math.floor((n - 3) / 1.5)), 1.8, 1.3, 'needler');    // ranged spine launchers
  if (n >= 4) add(Math.min(14, 1 + Math.floor((n - 4) / 1.5)), 1, 1.5, 'warrior');      // armoured
  if (n >= 6) add(Math.min(14, 2 + Math.floor((n - 6) / 1.5)), 1.4, 0.85, 'hopper');    // wall vaulters
  if (n >= 8) add(Math.min(10, 1 + Math.floor((n - 8) / 2.5)), 2.4, 1.7, 'tanker');         // acid siege
  if (n >= ULTRALISK.firstRound) add(Math.min(4, 1 + Math.floor((n - ULTRALISK.firstRound) / 4)), 6, 4, 'ultralisk');
  if (n >= SKYMOTHER.firstRound && n % 5) add(Math.min(SKYMOTHER.maxPerWave, 1 + Math.floor((n - SKYMOTHER.firstRound) / SKYMOTHER.roundsPerExtra)), SKYMOTHER.arrive, SKYMOTHER.spacing, 'skymother');
  out.sort((a, b) => a.at - b.at);
  return out;
}

// Silver lasts through the next three full rounds; gold lasts for the run.
export const TREASURE_RULES = { silverRounds: 3, goldChance: 0.35 };
// Boss evolutions last for one run; repeat picks improve a branch with diminishing returns.
export const EVOLUTIONS = [
  { id: 'siege', name: 'Walking Fortress', unit: 'Hammers', icon: '⌖', color: '#f0b23c',
    flavor: 'Plant your treads. Own the canyon.' },
  { id: 'chain', name: 'Chain Lightning', unit: 'Atlas mechs', icon: 'ϟ', color: '#71e7e0',
    flavor: 'One target becomes an entire swarm.' },
  { id: 'stand', name: 'Last Stand', unit: 'Garrisoned Troopers', icon: '▰', color: '#ff8066',
    flavor: 'When the walls crack, the guns roar.' }
];
export const EVOLUTION_RULES = {
  deployTime: 1.2, siegeRange: 5, siegeRangeStep: 0.75, siegeSplash: 0.6,
  chainHops: 2, chainRadius: 3.5, chainDamage: 0.5, chainDamageStep: 0.1,
  standThreshold: 0.3, standDuration: 6, standDurationStep: 1, standCooldown: 20, standFireRate: 3
};
export function evolutionPower(rank) { return Math.log2(Math.max(1, rank)); }
// Treasure bonuses stack for all current and future Troopers.
export const TREASURE = [
  { id: 'gun', name: 'Pulse Rifle Kit', effect: '+15% Trooper gun damage', apply: s => { s.damage *= 1.15; } },
  { id: 'range', name: 'Targeting Scope', effect: '+0.5 Trooper range', apply: s => { s.range += 0.5; } },
  { id: 'fire', name: 'Rapid-fire Loader', effect: '+15% Trooper firing speed', apply: s => { s.attackSpeed /= 1.15; } },
  { id: 'speed', name: 'Servo Boosters', effect: '+10% Trooper movement speed', apply: s => { s.moveSpeed *= 1.1; } }
];

/*
 * Boss siege magic: a boss takes turns calling a Firestorm and an Earthquake down on your buildings.
 * Damage per boss is in `milestonePlan()`. `troops` is the share of it a ground unit takes and
 * `coreShare` the share the Ridge Relay takes. Quake pulses widen, so the centre is hit by all of them.
 */
export const BOSS_MAGIC = {
  order: ['fire', 'quake'], firstDelay: 0.6, enraged: 0.75, bunkerWeight: 3, coreShare: 0.25,
  fire: { telegraph: 2.4, fall: 0.55, radius: 2.2, seconds: 6, tick: 0.5, troops: 0.5 },
  quake: { telegraph: 2.6, radius: 4.5, pulses: 3, gap: 0.45, troops: 0.3, scar: 9 }
};

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
    model: hard ? ['breacher', 'queen', 'eater'][Math.min(tier - 1, 2)] : 'warden',   // a kind in MODEL_FILES
    hp: Math.round((1800 + (tier - 1) * 2800) * (hard ? 1 : 0.5)),
    armor: (hard ? 3 : 1) + tier, damage: Math.round((22 + tier * 8) * (hard ? 1 : 0.65)),
    scale: 2.1 + Math.min(tier, 5) * 0.25,
    speed: 1.15 + Math.min(tier, 5) * 0.1,
    spellInterval: hard ? 10 : 14, spellTelegraph: 2,
    blindDuration: 5, silenceDuration: 3, spellRadius: 2.8,
    broodCount: Math.min(10, 3 + tier * 2),
    magicInterval: hard ? 12 : 17,
    fireImpact: Math.round((50 + tier * 20) * (hard ? 1 : 0.7)),
    fireDps: Math.round((14 + tier * 4) * (hard ? 1 : 0.7)),
    quakeDamage: Math.round((40 + tier * 15) * (hard ? 1 : 0.7)),
    strikeInterval: Math.max(5, 11 - tier) * (hard ? 1 : 1.4),
    strikeDamage: Math.round((30 + tier * 15) * (hard ? 1 : 0.6)),
    strikeRadius: 2.3 + Math.min(tier, 5) * 0.3,
    telegraph: Math.max(1.8, 3.2 - tier * 0.25),
    reinforcementInterval: Math.max(7, 15 - tier * 2) * (hard ? 1 : 1.4),
    reinforcements: Math.min(12, (hard ? 2 : 0) + tier * 2),
    reward: Math.round((300 + tier * 250) * (hard ? 1 : 0.6))
  };
}

/*
 * The hero: one soldier who carries the commander's name and keeps levels and gear between runs.
 * Level 1 is a Recruit Trooper with `extraHp`, `extraArmor` and a quicker trigger (`attackSpeed` seconds a shot). Each level adds `perLevel` of those
 * starting numbers; `armorEvery` levels add a point of armour. Anything within `melee.reach` of the
 * hero takes the blade for `melee.multiplier` times the gun's damage.
 * XP: a kill pays `perHp` per point of the bug's health, `far` of that when the hero is over `near` tiles away.
 */
export const HERO = {
  maxLevel: 30, extraHp: 40, extraArmor: 1, attackSpeed: 0.65, visualScale: 0.56,
  perLevel: { hp: 0.12, damage: 0.1, haste: 0.01 }, armorEvery: 10,
  melee: { multiplier: 2, reach: 1.5 }, critMultiplier: 2, respawn: 15, introDelay: 10,
  xp: { perHp: 0.04, near: 9, far: 0.4, bossPerRound: 60, first: 40, curve: 1.6 },
  bag: 12,
  /* Passive skills fire on their own in a fight. `cooldown` counts from the moment the effect ends. */
  skills: {
    blast: { name: 'Blade Blast', base: 100, perLevel: 10, cooldown: 15, range: DEADEYE_TIERS[0].range, radius: 2.4, speed: 17, shock: 0.6 },
    shield: { name: 'Plasma Shield', seconds: 7, cooldown: 30, radius: 5, hurt: 0.8 },
    robot: { name: 'War Robot', seconds: 30, cooldown: 60, speed: 1.5, haste: 1.5, damage: 1.5, range: 1.5, sight: 7, crowd: 3 }
  }
};
export const HERO_TIERS = [{ ...MARINE_TIERS[0], rank: 'Hero', hp: MARINE_TIERS[0].hp + HERO.extraHp, attackSpeed: HERO.attackSpeed, upgradeCost: null }];
export const HERO_INFO = {
  id: 'hero', name: 'Hero', faction: 'Breachline Compact', role: 'Hero', armor: MARINE_INFO.armor + HERO.extraArmor, accent: '#ffc24a',
  bio: 'Your own soldier on the line. Shoots like a Trooper, and anything that gets close takes the blade for double damage. Right-click a bug to charge it. Levels and gear stay with the hero from run to run.',
  quote: '"Not one step back."'
};
UNITS.hero = {
  id: 'hero', shots: 1, tiers: HERO_TIERS, info: HERO_INFO, visualScale: HERO.visualScale,
  shell: false, splash: 0, canBunker: false, canStim: false, armory: false, turret: false,
  mobile: true, speed: UNITS.marine.speed, accent: 0xffc24a
};
/* The hero's own suit (sources in assets/CREDITS.md): obsidian plate, gold trim and a lit visor. `speeds` plays a clip faster. */
MODEL_FILES.hero = {
  file: 'assets/models/hero.glb', fit: 'height', size: 1.25, seat: '^SpaceSuit_(Legs|Feet)',
  clips: { idle: 'Idle_Gun', walk: 'Run_Shoot', shoot: 'Idle_Gun_Shoot', attack: 'Sword_Slash', death: 'Death' }, speeds: { attack: 1.8 },
  tint: { SciFi_Main: 0x161a23, SciFi_MainDark: 0x0a0c11, SciFi_Light: 0xe9ae35, SciFi_Light_Accent: 0xa8101c, Grey: 0x0d3f58 },
  glow: { Grey: 0x12a8d8 }, glowPower: 0.75
};

/*
 * Boss loot. Every boss drops `drops` items, rolled on `odds`. The first item a hero ever finds is at
 * least rare, and so is one item from the boss on each of the `rareRounds`.
 * An affix is worth `base` × (1 + boss round × `growth`), give or take 15%, up to its `cap`.
 */
export const LOOT = {
  drops: { medium: 2, hard: 3 }, rareRounds: [10, 20, 30, 40, 50], growth: 0.03, critCap: 60, leechCap: 20,
  odds: { medium: { magic: 55, rare: 35, legendary: 10 }, hard: { magic: 20, rare: 50, legendary: 30 } },
  rarity: {
    magic: { name: 'Magic', color: '#5aa8ff', mods: 1, scrapXp: 30 },
    rare: { name: 'Rare', color: '#ffd24a', mods: 2, scrapXp: 80 },
    legendary: { name: 'Legendary', color: '#ff8a2a', mods: 2, scrapXp: 200 }
  },
  slots: {
    weapon: { name: 'Rifle', bases: ['Pulse Carbine', 'Rail Repeater', 'Ridge Rifle'] },
    blade: { name: 'Blade', bases: ['Shock Cutlass', 'Chitin Cleaver', 'Mono Sabre'] },
    armor: { name: 'Armor', bases: ['Impact Plate', 'Ridge Harness', 'Carapace Vest'] },
    relic: { name: 'Relic', bases: ['Field Beacon', 'Brood Shard', 'Signal Charm'] }
  },
  prefixes: { magic: ['Tempered', 'Honed', 'Sturdy'], rare: ['Veteran', 'Outpost', 'Warforged'] },
  affixes: {
    damage: { label: '% damage', base: 12, cap: 45, slots: ['weapon', 'blade', 'relic'] },
    haste: { label: '% attack speed', base: 8, cap: 30, slots: ['weapon', 'relic'] },
    crit: { label: '% critical chance', base: 5, cap: 20, slots: ['weapon', 'blade', 'relic'] },
    melee: { label: '% melee damage', base: 20, cap: 80, slots: ['blade'] },
    range: { label: ' range', base: 0.4, cap: 1.5, step: 0.1, slots: ['weapon'] },
    hp: { label: '% health', base: 14, cap: 50, slots: ['armor', 'relic'] },
    armor: { label: ' armor', base: 1, cap: 4, slots: ['armor'] },
    speed: { label: '% move speed', base: 6, cap: 20, slots: ['armor', 'relic'] },
    leech: { label: '% life on melee hit', base: 3, cap: 10, slots: ['blade', 'relic'] },
    regen: { label: ' health per second', base: 2, cap: 12, slots: ['armor'] }
  },
  legendaries: {
    storm: { slot: 'weapon', name: 'Stormcaller', text: 'Every 4th shot arcs lightning through 4 more enemies.', every: 4, hops: 4, radius: 4, damage: 1 },
    cinder: { slot: 'weapon', name: 'Cinder Repeater', text: 'Every 3rd shot is an explosive round.', every: 3, radius: 1.5, damage: 1.5 },
    reaper: { slot: 'blade', name: "Reaper's Arc", text: 'Melee strikes hit every ground enemy around you.', radius: 2 },
    ember: { slot: 'blade', name: 'Emberfang', text: 'Melee strikes throw a wave of fire.', reach: 3.5, arc: 0.6, damage: 0.6 },
    aegis: { slot: 'armor', name: 'Aegis of the Last Ridge', text: 'Near death: a shockwave and 3 seconds of invulnerability. Ready every 40 seconds.', below: 0.3, seconds: 3, cooldown: 40, radius: 3, damage: 3 },
    static: { slot: 'armor', name: 'Static Mantle', text: 'Shocks nearby enemies every 5 seconds.', every: 5, radius: 2.6, damage: 1.5 },
    drone: { slot: 'relic', name: 'Ninth Watch Drone', text: 'A drone orbits you and fires at nearby enemies.', every: 0.7, range: 6, damage: 0.6 },
    skyfall: { slot: 'relic', name: 'Skyfall Sigil', text: 'Every 20 kills nearby calls down an orbital strike.', kills: 20, bombs: 3, radius: 2.5, damage: 4 }
  }
};
