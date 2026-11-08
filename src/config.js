export const TILE = 40;
export const COLS = 26;
export const ROWS = 16;
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
export const CELL = { OPEN: 0, WALL: 1, TOWER: 2, CORE: 3, SPAWN: 4, ROCK: 5 };

/* A* cost for routing through something the swarm has to chew through. */
export const BREAK_COST = 9;

export const BUILD = {
  wall: { id: 'wall', name: 'Bunker Wall', cost: 25, hp: 320, icon: 'W', desc: 'Plasteel barricade. Redirects the swarm — or buys you seconds while they chew it.' },
  marine: { id: 'marine', name: 'Marine Post', cost: 100, icon: 'M', desc: 'Emplaced Terran Marine with a C-14 gauss rifle. Upgradeable three times.' }
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
  role: 'Emplaced Infantry',
  armor: 1,
  accent: '#5ad7ff',
  bio: 'Resocialised shock trooper sealed into CMC-300 powered combat armour. The C-14 "Impaler" gauss rifle fires 8mm spikes at hypersonic velocity.',
  quote: '"You wanna piece of me, boy?"'
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
  { kills: 20,  id: 'stim',   name: 'Stimpack',       effect: '+20% fire rate',        apply: (s) => { s.attackSpeed *= 0.8; } },
  { kills: 40,  id: 'shield', name: 'Combat Shield',  effect: '+40 hit points',        apply: (s) => { s.hp += 40; } },
  { kills: 70,  id: 'maggie', name: 'Mag-Rail Rounds',effect: '+35% damage',           apply: (s) => { s.damage = Math.round(s.damage * 1.35); } }
];

export const ECON = {
  startMinerals: 300,
  perKill: 9,
  waveClearBase: 40,
  waveClearPerWave: 15,
  refundRate: 0.6
};

export const CORE = { x: 22, y: 7, w: 2, h: 2, hp: 500 };
export const SPAWN = { x: 0, y: 7 };

/* Static rock clusters — unbuildable terrain that shapes the map. */
export const ROCKS = [
  [5, 2], [5, 3], [6, 2], [12, 1], [13, 1], [13, 2],
  [8, 13], [9, 13], [9, 14], [17, 14], [18, 14], [18, 13],
  [15, 6], [15, 7], [15, 8], [16, 7],
  [20, 2], [20, 3], [21, 2],
  [3, 10], [4, 10], [3, 11]
];

export function waveSpec(n) {
  const count = Math.min(40, 2 + Math.floor(n * 1.6));
  const hpScale = 1 + (n - 1) * 0.14;
  const speedScale = 1 + Math.min(0.5, (n - 1) * 0.035);
  const gap = Math.max(0.28, 0.95 - n * 0.045);
  return { count, hpScale, speedScale, gap };
}
