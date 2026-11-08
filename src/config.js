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
export const CELL = { OPEN: 0, WALL: 1, TOWER: 2, CORE: 3, SPAWN: 4, ROCK: 5, BUNKER: 6 };

/* A* cost for routing through something the swarm has to chew through. */
export const BREAK_COST = 9;

export const BUILD = {
  wall: { id: 'wall', name: 'Bunker Wall', cost: 25, hp: 320, icon: 'W', key: '1', desc: 'Plasteel barricade. The swarm chews through it or goes around.' },
  marine: { id: 'marine', name: 'Marine Post', cost: 100, icon: 'M', key: '2', desc: 'Emplaced Terran Marine. Promote him, stim him, or garrison a bunker.' },
  bunker: { id: 'bunker', name: 'Bunker', cost: 80, hp: 560, icon: 'B', key: '3', desc: 'Holds two Marines. Extra armour, a firing slit, and a facing you set by where you build it.' }
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
  { kills: 20,  id: 'stim',   name: 'Stimpack',       effect: 'Press F — double fire rate, bleeds HP', apply: () => {} },
  { kills: 40,  id: 'shield', name: 'Combat Shield',  effect: '+40 hit points',        apply: (s) => { s.hp += 40; } },
  { kills: 70,  id: 'maggie', name: 'Mag-Rail Rounds',effect: '+35% damage',           apply: (s) => { s.damage = Math.round(s.damage * 1.35); } }
];

export const ECON = {
  startMinerals: 340,
  perKill: 8,
  waveClearBase: 40,
  waveClearPerWave: 15,
  refundRate: 0.6,
  scvCost: 60
};

export const BREEDS = {
  zergling: { id: 'zergling', name: 'Zergling', role: 'Melee Swarm', hp: 32, armor: 0, damage: 5, attackSpeed: 0.55, range: 0.95, speed: 2.4, scale: 1, bounty: 1, melee: true },
  warrior:  { id: 'warrior', name: 'Warrior', role: 'Armored Strain', hp: 130, armor: 3, damage: 10, attackSpeed: 0.8, range: 1.05, speed: 1.35, scale: 1.32, bounty: 3, melee: true },
  hopper:   { id: 'hopper', name: 'Hopper', role: 'Wall Vaulter', hp: 48, armor: 0, damage: 7, attackSpeed: 0.5, range: 0.9, speed: 2.7, scale: 0.82, bounty: 2, melee: true, jump: true },
  tanker:   { id: 'tanker', name: 'Tanker', role: 'Acid Siege', hp: 240, armor: 1, damage: 16, attackSpeed: 1.7, range: 3.6, speed: 1.05, scale: 1.7, bounty: 5, ranged: true }
};

export const BRIEFINGS = {
  4: { kicker: 'Federation Intelligence', title: 'Warrior strain', body: 'Plated bugs. Gauss fire skips off the carapace. Focus them, or they walk through the wall.' },
  6: { kicker: 'Federation Intelligence', title: 'Hoppers inbound', body: 'They vault a single wall. A flat line will not hold. Overlap your fields of fire.' },
  8: { kicker: 'Federation Intelligence', title: 'Tanker spotted', body: 'It will not close. It sits off the breach and melts whatever you built to stop the others.' }
};

export const CORE = { x: 22, y: 7, w: 2, h: 2, hp: 500 };
export const SPAWN = { x: 0, y: 7 };

/* Static rock clusters — unbuildable terrain that shapes the map. */
function ridge(x, y0, y1) {
  const cells = [];
  for (let y = y0; y <= y1; y++) cells.push([x, y]);
  return cells;
}

/* Two rock gates. The swarm has to file through the gaps, so a wall there actually matters. */
export const ROCKS = [
  ...ridge(9, 0, 4),
  ...ridge(9, 11, 15),
  ...ridge(18, 0, 5),
  ...ridge(18, 10, 15)
];

export function wavePlan(n) {
  const hpScale = 1 + (n - 1) * 0.1;
  const speedScale = 1 + Math.min(0.35, (n - 1) * 0.025);
  const out = [];
  let t = 0.2;
  const clumps = Math.min(6, 1 + Math.floor(n * 0.55));
  for (let c = 0; c < clumps; c++) {
    const size = Math.min(8, 4 + Math.floor(n / 3));
    for (let i = 0; i < size; i++) out.push({ at: t + i * 0.1, breed: 'zergling', hpScale, speedScale });
    t += 1.05 + size * 0.1;
  }
  if (n >= 4) {
    const nw = Math.min(4, 1 + Math.floor((n - 4) / 2));
    for (let i = 0; i < nw; i++) out.push({ at: 1 + i * 1.5, breed: 'warrior', hpScale, speedScale });
  }
  if (n >= 6) {
    const nh = Math.min(5, 2 + Math.floor((n - 6) / 2));
    for (let i = 0; i < nh; i++) out.push({ at: 1.4 + i * 0.85, breed: 'hopper', hpScale, speedScale });
  }
  if (n >= 8 && n % 2 === 0) out.push({ at: 2.4, breed: 'tanker', hpScale, speedScale });
  out.sort((a, b) => a.at - b.at);
  return out;
}
