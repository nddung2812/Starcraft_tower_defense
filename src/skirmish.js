/*
 * Skirmish: a match you set up and can win.
 *
 * The endless stand resets the map every round and only ever ends in defeat. A Skirmish is one
 * continuous battle on one map: the hives send a bigger wave on a timer, nothing is refunded or
 * rebuilt for you, and the match ends the moment every hive is destroyed (or the relay falls).
 * Holding lets your army grow; so do the waves and the hives. When to push is the decision.
 *
 * The player chooses the battle on the setup screen: how many hives (1-7), how hard the swarm
 * presses, the map size, the starting minerals, and whether to open with the squad or plan first.
 * `rulesFor(setup)` turns that into numbers; `SKIRMISH` in config holds the tuning.
 *
 * `Match` is the director the core calls through `game.match` (`update`, `wave`, `hiveHit`,
 * `finish`); it is null outside a Skirmish, so the endless stand is untouched. The wave number
 * is `game.level`, which is why unlocks, scouting, bosses, the Maw and the sky all follow the
 * match without knowing about it. The battlefield is `game.matchMap`. Matches are never
 * checkpointed and never reach the kills leaderboard: the result is the time to win, kept per
 * setup and per browser in `td.skirmish.v1`.
 *
 * This file is an optional layer (`layer('skirmish')` in main.js, which starts a match through
 * `launchNewRun(..., 'skirmish')`): without it the Skirmish button simply stays hidden. `ui.js`
 * draws the readout, callouts and result from the events emitted here.
 */
import { SKIRMISH, HIVE_RAID, ECON, BUILD, SKYMOTHER, wavePlan } from './config.js';
import { Zergling } from './entities.js';

const RECORD_KEY = 'td.skirmish.v1';
const SETUP_KEY = 'td.skirmish.setup.v1';
const SWARM_CAP = 180;   // the same ceiling boss reinforcements respect

export const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** A complete, valid setup from anything: stored data, a partial change, or nothing at all. */
export function normalizeSetup(raw) {
  const d = SKIRMISH.defaults, r = raw && typeof raw === 'object' ? raw : {};
  const hives = Number.isInteger(r.hives) && r.hives >= 1 && r.hives <= SKIRMISH.maxHives ? r.hives : d.hives;
  const size = SKIRMISH.sizes.includes(r.size) && r.size >= SKIRMISH.minSize[hives] ? r.size : 0;
  return {
    hives, size,
    mood: Object.hasOwn(SKIRMISH.moods, r.mood) ? r.mood : d.mood,
    minerals: SKIRMISH.minerals.includes(r.minerals) ? r.minerals : d.minerals,
    quick: typeof r.quick === 'boolean' ? r.quick : d.quick
  };
}

/** The map side actually played: the chosen one, or the smallest that fits the hive count. */
export const sizeFor = (setup) => setup.size || SKIRMISH.minSize[setup.hives];

/** What a setup means in numbers. Two hives on Standard is the baseline every factor is 1 at. */
export function rulesFor(setup) {
  const mood = SKIRMISH.moods[setup.mood];
  return {
    waveGap: mood.waveGap,
    swarm: mood.swarm * (SKIRMISH.swarmBase + SKIRMISH.swarmPerHive * setup.hives),
    hiveHp: Math.round(SKIRMISH.hiveHp * mood.hive),
    // Hives upgrade on their own clock, at the pace of `hiveHpPerWave` for every wave gap.
    hiveHpPerUpgrade: Math.round(SKIRMISH.hiveHpPerWave * mood.hive * HIVE_RAID.evolutionInterval / mood.waveGap)
  };
}

/** Records are kept per battle: the opening (squad or planning) is the player's business. */
export const setupKey = (setup) => `${setup.hives}h-${setup.mood}-${sizeFor(setup)}-${setup.minerals}`;
const LEGACY_KEY = setupKey(normalizeSetup(null));   // the first release stored its one setup under "2"

export class Match {
  constructor(game, player = 'Commander', setup = normalizeSetup(null)) {
    this.game = game;
    this.player = player;
    this.setup = setup;
    this.rules = rulesFor(setup);
    this.elapsed = 0;                  // seconds of battle so far: the result of a win
    this.nextT = this.rules.waveGap;   // until the next wave leaves the hives
    this.result = null;
    game.minerals = setup.minerals;
    for (const hive of game.hives) {
      hive.maxHp = hive.hp = this.rules.hiveHp;
      hive.upgradeHp = this.rules.hiveHpPerUpgrade;
      hive.reward = SKIRMISH.hiveReward;
      hive.guardAt = -99;
    }
    this.seen = this.hivesLeft;
  }

  get hives() { return this.game.hives.length; }
  get hivesLeft() { return this.game.hives.filter(h => !h.dead).length; }

  /** Called by the core every tick of battle. */
  update(dt) {
    const g = this.game;
    this.elapsed += dt;
    const left = this.hivesLeft;
    if (left < this.seen && left > 0) g.emit('hiveDown', { left });
    this.seen = left;
    this.nextT -= dt;
    if (this.nextT > 0) return;
    this.nextT += this.rules.waveGap;
    this.launchWave();
  }

  /**
   * Wave `level` for this setup: the stand's round-`level` swarm, thinned or thickened to the
   * setup's size and dealt out to the hives in turn. The core uses it for wave 1 as well.
   */
  wave(level) {
    const size = this.rules.swarm, out = [];
    wavePlan(level).filter((s) => s.breed !== 'skymother' || level >= SKYMOTHER.matchFirstWave).forEach((s, i) => {
      const copies = Math.floor((i + 1) * size + 1e-9) - Math.floor(i * size + 1e-9);
      for (let c = 0; c < copies; c++) out.push({ ...s, at: s.at + c * 0.15 });
    });
    out.sort((a, b) => a.at - b.at);
    out.forEach((s, i) => { s.lane = i % this.hives; });
    return out;
  }

  /** The next wave: pay for the one just held, queue the swarm on top of what is left. */
  launchWave() {
    const g = this.game;
    const bonus = ECON.waveClearBase + g.level * ECON.waveClearPerWave;
    g.minerals += bonus;
    g.level++;
    g.expireTreasureBoosts();
    for (const hive of g.hives) {
      if (hive.dead) continue;
      hive.evolution = Math.min(5, g.level - 1);
      hive.hatchT = 2;
      g.fx.ring(hive, 2.5, 0xe8b840);
    }
    // A destroyed hive's share of every later wave is simply gone.
    const marching = this.wave(g.level).filter(s => !g.hives[s.lane].dead);
    for (const s of marching) s.at += g.spawnTimer;
    g.queue.push(...marching);
    g.queue.sort((a, b) => a.at - b.at);
    // Milestone waves bring their boss, unless the last one is still on the field.
    const assault = g.assault;
    if (!assault.pending && (!assault.boss || assault.boss.dead)) { assault.reset(); assault.start(); }
    g.sfx.alarm();
    g.emit('wave', { wave: g.level, hostiles: marching.length, bonus, boss: assault.pending ? assault.plan : null });
    if (!this.roster) for (const b of Object.values(BUILD)) if (b.unlock === g.level) g.emit('unitUnlocked', b);   // a drafted army has nothing to unlock
    g.emit('change');
  }

  /** A hive under fire hatches guards beside itself, at most once per `guardGap` seconds. */
  hiveHit(hive) {
    const g = this.game;
    if (g.time - hive.guardAt < SKIRMISH.guardGap) return;
    hive.guardAt = g.time;
    const want = Math.min(SKIRMISH.guardCap, Math.round(SKIRMISH.guardBase + (g.level - 1) * SKIRMISH.guardPerWave));
    const count = Math.min(want, Math.max(0, SWARM_CAP - g.zerglings.filter(z => !z.dead).length));
    for (let i = 0; i < count; i++) {
      const breed = g.level >= 4 && i % 4 === 3 ? 'warrior' : 'zergling';
      const bug = new Zergling(hive.x + (Math.random() - 0.5) * 0.7, hive.z + (Math.random() - 0.5) * 0.4,
        breed, 1 + (g.level - 1) * 0.1, 1);
      bug.isGuard = true;
      g.zerglings.push(bug);
      g.world.add(bug.obj);
    }
    if (!count) return;
    hive.hatchT = 2;
    g.fx.label({ x: hive.x, y: 2.8, z: hive.z }, `HIVE GUARDS · +${count}`, 'boss-spell');
  }

  /** The core calls this once, when the last hive dies or the relay falls. */
  finish(won) {
    if (this.result) return this.result;
    const g = this.game, hives = this.hives;
    const { before, after, improved } = saveResult(this.setup, won, this.elapsed);
    this.result = {
      name: this.player, won, seconds: this.elapsed, wave: g.level, kills: g.kills, hives, destroyed: hives - this.hivesLeft,
      corePct: Math.max(0, Math.ceil(100 * g.core.hp / g.core.maxHp)), seed: g.mapSeed, setup: { ...this.setup },
      best: after.best, previousBest: before.best, improved
    };
    g.emit('matchOver', this.result);
    return this.result;
  }
}

function readJson(key) {
  try {
    const data = JSON.parse(localStorage.getItem(key));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* storage unavailable or damaged: start clean */ }
  return {};
}

/** Best winning time, wins and matches played for a setup. */
export function recordFor(setup) {
  const all = readJson(RECORD_KEY), key = setupKey(setup);
  const r = all[key] ?? (key === LEGACY_KEY ? all[2] : undefined);
  const ok = (v) => Number.isFinite(v) && v >= 0;
  return { best: ok(r?.best) && r.best > 0 ? r.best : null, wins: ok(r?.wins) ? r.wins : 0, played: ok(r?.played) ? r.played : 0 };
}

function saveResult(setup, won, seconds) {
  const before = recordFor(setup);
  const improved = won && (before.best == null || seconds < before.best);
  const after = { best: improved ? seconds : before.best, wins: before.wins + (won ? 1 : 0), played: before.played + 1 };
  try { localStorage.setItem(RECORD_KEY, JSON.stringify({ ...readJson(RECORD_KEY), [setupKey(setup)]: after })); } catch { /* shown, just not kept */ }
  return { before, after, improved };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One line for a setup: what you are about to fight. */
export function describeSetup(setup) {
  const size = sizeFor(setup), mood = SKIRMISH.moods[setup.mood];
  return `${plural(setup.hives, 'hive')} · ${mood.name} swarm · ${size}×${size} map · ${setup.minerals} minerals`;
}

/**
 * `launch(quick)` is main.js's way to start a run in Skirmish mode; it calls back into
 * `options()` and `begin()` below.
 */
export function installSkirmish({ game, getPlayer, launch }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $('skirmishDialog');
  let setup = normalizeSetup(readJson(SETUP_KEY));

  const groups = [
    { key: 'hives', label: 'Hives', help: 'Each one sends its share of every wave and must be destroyed.',
      options: () => Array.from({ length: SKIRMISH.maxHives }, (_, i) => ({ value: i + 1, text: String(i + 1) })) },
    { key: 'mood', label: 'Swarm', help: 'How fast the waves come and how big they are.',
      options: () => Object.entries(SKIRMISH.moods).map(([value, m]) => ({ value, text: m.name, title: m.note })) },
    { key: 'size', label: 'Map', help: 'A bigger map is a longer march, for them and for you.',
      options: () => [{ value: 0, text: 'Auto' }, ...SKIRMISH.sizes.map(s => ({ value: s, text: `${s}×${s}`,
        disabled: s < SKIRMISH.minSize[setup.hives], title: s < SKIRMISH.minSize[setup.hives] ? `Too small for ${plural(setup.hives, 'hive')}` : '' }))] },
    { key: 'minerals', label: 'Starting minerals', help: 'The opening squad costs 180 of these.',
      options: () => SKIRMISH.minerals.map(value => ({ value, text: String(value) })) },
    { key: 'quick', label: 'Opening', help: 'Planning starts paused on the first countdown; resume when your defense is built.',
      options: () => [{ value: true, text: 'Start with 3 Troopers' }, { value: false, text: 'Plan my own defense' }] }
  ];

  function render() {
    const box = $('skirmishSetup');
    box.replaceChildren();
    for (const group of groups) {
      const set = document.createElement('fieldset');
      const legend = document.createElement('legend'); legend.textContent = group.label;
      const row = document.createElement('div'); row.className = 'skirmish-options';
      for (const option of group.options()) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn skirmish-option'; b.textContent = option.text;
        b.dataset.setup = group.key; b.dataset.value = JSON.stringify(option.value);
        b.disabled = !!option.disabled;
        if (option.title) b.title = option.title;
        b.setAttribute('aria-pressed', String(setup[group.key] === option.value));
        row.append(b);
      }
      const help = document.createElement('small'); help.textContent = group.help;
      set.append(legend, row, help);
      box.append(set);
    }
    const rules = rulesFor(setup), record = recordFor(setup);
    const bigger = Math.round(rules.swarm * 100);
    $('skirmishSummary').textContent = `${describeSetup(setup)}. A wave every ${rules.waveGap} seconds at ${bigger}% of the standard swarm; hives start at ${rules.hiveHp.toLocaleString()} health. `
      + (record.best != null ? `Your best on this setup: ${clock(record.best)} (${plural(record.wins, 'win')} in ${plural(record.played, 'match')}).`
        : record.played ? `No win on this setup yet (${plural(record.played, 'match')} played).` : 'Not played yet.');
  }

  function describe() {
    const record = recordFor(setup);
    $('skirmishInfo').textContent = `Choose the hives, the swarm, the map and your minerals. Destroy every hive to win. Last setup: ${describeSetup(setup)}`
      + (record.best != null ? `, best ${clock(record.best)}.` : '.');
  }

  function configure(change) {
    setup = normalizeSetup({ ...setup, ...change });
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)); } catch { /* used for this session only */ }
    describe();
    if (dialog.open) render();
    return { ...setup };
  }

  $('skirmishSetup').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-setup]');
    if (!b || b.disabled) return;
    configure({ [b.dataset.setup]: JSON.parse(b.dataset.value) });
    $('skirmishSetup').querySelector(`[data-setup="${b.dataset.setup}"][aria-pressed="true"]`)?.focus();
  });
  $('btnSkirmish').addEventListener('click', () => { render(); dialog.showModal(); $('startSkirmish').focus(); });
  $('closeSkirmish').addEventListener('click', () => dialog.close());
  $('startSkirmish').addEventListener('click', () => { dialog.close(); launch(setup.quick); });
  game.on('matchOver', describe);
  $('btnSkirmish').hidden = false;
  $('skirmishInfo').hidden = false;
  describe();

  return {
    /** Passed to `game.reset(seed, options)` so the battlefield is carved for the chosen setup. */
    options: () => ({ map: { hives: setup.hives, size: sizeFor(setup) } }),
    /** Call straight after that reset, with the start screen closed and before the first wave is launched. */
    begin() {
      game.match = new Match(game, getPlayer(), { ...setup });
      game.emit('matchStart', { hives: game.match.hives, waveGap: game.match.rules.waveGap });
      return game.match;
    },
    /** Whether a match opens with the squad (true) or paused in planning (false). */
    get quick() { return setup.quick; },
    get setup() { return { ...setup }; },
    configure,
    record: recordFor
  };
}
