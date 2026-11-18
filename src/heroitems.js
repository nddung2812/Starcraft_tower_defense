// The hero's sheet: levels, experience, item rolls and the save. No rendering, so node can test it.
// Tuning is `HERO` and `LOOT` in config.
import { HERO, HERO_INFO, HERO_TIERS, LOOT, UNITS, applyBaseUpgrade } from './config.js';

export const HERO_KEY = 'td.hero.v1';
export const SLOTS = Object.keys(LOOT.slots);
const RANKS = Object.keys(LOOT.rarity);

/** XP from one level to the next. */
export const xpToNext = level => Math.round(HERO.xp.first * level ** HERO.xp.curve);

export function newProfile() {
  return { v: 1, level: 1, xp: 0, found: 0, met: false, worn: Object.fromEntries(SLOTS.map(s => [s, null])), bag: [] };
}

/** Add experience and return how many levels that bought. The last level holds no XP. */
export function addXp(profile, amount) {
  let gained = 0;
  if (profile.level >= HERO.maxLevel) return 0;
  profile.xp += amount;
  while (profile.level < HERO.maxLevel && profile.xp >= xpToNext(profile.level)) {
    profile.xp -= xpToNext(profile.level);
    profile.level++;
    gained++;
  }
  if (profile.level >= HERO.maxLevel) profile.xp = 0;
  return gained;
}

const pick = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

function rollRarity(odds, rng) {
  let roll = rng() * Object.values(odds).reduce((a, b) => a + b, 0);
  for (const [rarity, weight] of Object.entries(odds)) if ((roll -= weight) < 0) return rarity;
  return 'magic';
}

/** One item from a boss on round `round`. `floor` is the lowest rarity it may be. */
export function rollItem(round, { hard = false, floor = null, rng = Math.random } = {}) {
  let rarity = rollRarity(hard ? LOOT.odds.hard : LOOT.odds.medium, rng);
  if (floor && RANKS.indexOf(rarity) < RANKS.indexOf(floor)) rarity = floor;
  const slot = pick(SLOTS, rng);
  const power = rarity === 'legendary' ? pick(Object.keys(LOOT.legendaries).filter(id => LOOT.legendaries[id].slot === slot), rng) : null;
  const pool = Object.keys(LOOT.affixes).filter(id => LOOT.affixes[id].slots.includes(slot));
  const mods = {};
  for (let i = 0; i < LOOT.rarity[rarity].mods && pool.length; i++) {
    const id = pool.splice(Math.floor(rng() * pool.length) % pool.length, 1)[0], a = LOOT.affixes[id], step = a.step || 1;
    const value = a.base * (1 + round * LOOT.growth) * (0.85 + rng() * 0.3);
    mods[id] = Math.min(a.cap, Math.max(step, Math.round(value / step) * step));
    mods[id] = Number(mods[id].toFixed(1));
  }
  const base = pick(LOOT.slots[slot].bases, rng);
  return {
    id: `i${Date.now().toString(36)}${Math.floor(rng() * 1e8).toString(36)}`,
    slot, rarity, power, round, mods,
    name: power ? LOOT.legendaries[power].name : `${pick(LOOT.prefixes[rarity], rng)} ${base}`
  };
}

/** What the worn items add up to, and which legendary powers they grant. */
export function gearTotals(worn) {
  const sum = Object.fromEntries(Object.keys(LOOT.affixes).map(id => [id, 0]));
  const powers = new Set();
  for (const item of Object.values(worn)) {
    if (!item) continue;
    for (const [id, value] of Object.entries(item.mods)) sum[id] += value;
    if (item.power) powers.add(item.power);
  }
  sum.crit = Math.min(LOOT.critCap, sum.crit);
  sum.leech = Math.min(LOOT.leechCap, sum.leech);
  return { ...sum, powers };
}

/** The hero's numbers for a level, gear and base research. Level 1 with no gear is the Trooper in HERO_TIERS. */
export function heroStats(profile, baseLevel = 0) {
  const base = HERO_TIERS[0], gained = profile.level - 1, gear = gearTotals(profile.worn), grow = HERO.perLevel;
  const stats = {
    hp: base.hp * (1 + gained * grow.hp) * (1 + gear.hp / 100),
    damage: base.damage * (1 + gained * grow.damage) * (1 + gear.damage / 100),
    attackSpeed: base.attackSpeed / (1 + gained * grow.haste) / (1 + gear.haste / 100),
    range: base.range + gear.range,
    armor: HERO_INFO.armor + Math.floor(profile.level / HERO.armorEvery) + gear.armor,
    moveSpeed: UNITS.hero.speed * (1 + gear.speed / 100)
  };
  applyBaseUpgrade(stats, baseLevel);
  return { stats, gear, melee: HERO.melee.multiplier * (1 + gear.melee / 100) };
}

/** One line per affix, for the item card. */
export const modLine = (id, value) => `${value > 0 ? '+' : ''}${value}${LOOT.affixes[id].label}`;

/** Whatever storage holds is untrusted: anything that is not a well-formed item is dropped. */
function cleanItem(raw, slot = raw?.slot) {
  if (!raw || typeof raw !== 'object' || raw.slot !== slot || !SLOTS.includes(slot) || !RANKS.includes(raw.rarity)) return null;
  if (typeof raw.id !== 'string' || raw.id.length > 40 || typeof raw.name !== 'string' || !raw.name || raw.name.length > 40) return null;
  if (!Number.isInteger(raw.round) || raw.round < 0 || !raw.mods || typeof raw.mods !== 'object' || Array.isArray(raw.mods)) return null;
  const power = raw.power ?? null;
  if ((raw.rarity === 'legendary') !== !!power || (power && LOOT.legendaries[power]?.slot !== slot)) return null;
  const mods = {};
  for (const [id, value] of Object.entries(raw.mods)) {
    const a = Object.hasOwn(LOOT.affixes, id) ? LOOT.affixes[id] : null;
    if (!a || !a.slots.includes(slot) || !Number.isFinite(value) || value <= 0 || value > a.cap) return null;
    mods[id] = value;
  }
  return { id: raw.id, slot, rarity: raw.rarity, power, round: raw.round, name: raw.name, mods };
}

export function readProfile(storage = localStorage) {
  const fresh = newProfile();
  try {
    const raw = JSON.parse(storage.getItem(HERO_KEY) || 'null');
    if (!raw || raw.v !== 1 || !Number.isInteger(raw.level) || raw.level < 1 || raw.level > HERO.maxLevel) return fresh;
    fresh.level = raw.level;
    fresh.xp = Number.isFinite(raw.xp) && raw.xp >= 0 && raw.xp < xpToNext(raw.level) ? raw.xp : 0;
    fresh.found = Number.isInteger(raw.found) && raw.found >= 0 ? raw.found : 0;
    fresh.met = raw.met === true;
    for (const slot of SLOTS) fresh.worn[slot] = cleanItem(raw.worn?.[slot], slot);
    fresh.bag = (Array.isArray(raw.bag) ? raw.bag : []).map(item => cleanItem(item)).filter(Boolean).slice(0, HERO.bag);
  } catch { /* unreadable: start over rather than stop the game */ }
  return fresh;
}

export function writeProfile(profile, storage = localStorage) {
  try { storage.setItem(HERO_KEY, JSON.stringify(profile)); return true; } catch { return false; }
}

/** Into an empty slot if there is one, otherwise the bag. A full bag scraps its weakest item for XP. */
export function stash(profile, item) {
  profile.found++;
  if (!profile.worn[item.slot]) { profile.worn[item.slot] = item; return { equipped: true, scrapped: null }; }
  let scrapped = null;
  if (profile.bag.length >= HERO.bag) {
    const rank = i => RANKS.indexOf(i.rarity) * 1000 + i.round;
    scrapped = [...profile.bag, item].reduce((low, i) => rank(i) < rank(low) ? i : low);
    if (scrapped !== item) profile.bag = profile.bag.filter(i => i !== scrapped);
  }
  if (scrapped !== item) profile.bag.push(item);
  return { equipped: false, scrapped };
}

/** Wear a bag item; whatever it replaces goes back in the bag. */
export function equip(profile, id) {
  const item = profile.bag.find(i => i.id === id);
  if (!item) return false;
  const old = profile.worn[item.slot];
  profile.bag = profile.bag.filter(i => i !== item);
  if (old) profile.bag.push(old);
  profile.worn[item.slot] = item;
  return true;
}

/** Break a bag item down for experience. Returns the XP it was worth. */
export function scrap(profile, id) {
  const item = profile.bag.find(i => i.id === id);
  if (!item) return 0;
  profile.bag = profile.bag.filter(i => i !== item);
  return LOOT.rarity[item.rarity].scrapXp;
}
