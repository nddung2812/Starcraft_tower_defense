/*
 * Skirmish: a match you can win.
 *
 * The endless stand resets the map every round and only ever ends in defeat. A Skirmish is one
 * continuous battle on one map: the hives send a bigger wave every `SKIRMISH.waveGap` seconds,
 * nothing is refunded or rebuilt for you, and the match ends the moment every hive is destroyed
 * (or the relay falls). Holding lets your army grow; so do the waves and the hives. When to push
 * is the decision.
 *
 * `Match` is the director the core calls through `game.match` (`update`, `hiveHit`, `finish`);
 * it is null outside a Skirmish, so the endless stand is untouched. The wave number is
 * `game.level`, which is why unlocks, scouting, bosses, the Maw and the sky all follow the match
 * without knowing about it. The battlefield stays on `game.mapLevel`. Matches are never
 * checkpointed and never reach the kills leaderboard: the result is the time to win, kept per
 * browser in `td.skirmish.v1`.
 *
 * This file is an optional layer (`layer('skirmish')` in main.js, which starts a match through
 * `launchNewRun(..., 'skirmish')`): without it the Skirmish button simply stays hidden. `ui.js`
 * draws the readout, callouts and result from the events emitted here.
 */
import { SKIRMISH, ECON, BUILD, wavePlan } from './config.js';
import { Zergling } from './entities.js';

const RECORD_KEY = 'td.skirmish.v1';
const SWARM_CAP = 180;   // the same ceiling boss reinforcements respect

export const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export class Match {
  constructor(game, player = 'Commander') {
    this.game = game;
    this.player = player;
    this.elapsed = 0;                  // seconds of battle so far: the result of a win
    this.nextT = SKIRMISH.waveGap;     // until the next wave leaves the hives
    this.result = null;
    for (const hive of game.hives) {
      hive.maxHp = hive.hp = SKIRMISH.hiveHp;
      hive.reward = SKIRMISH.hiveReward;
      hive.guardAt = -99;
    }
    this.seen = this.hivesLeft;
  }

  get wave() { return this.game.level; }
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
    this.nextT += SKIRMISH.waveGap;
    this.launchWave();
  }

  /** The next wave: pay for the one just held, grow the hives, queue the swarm on top of what is left. */
  launchWave() {
    const g = this.game;
    const bonus = ECON.waveClearBase + g.level * ECON.waveClearPerWave;
    g.minerals += bonus;
    g.level++;
    g.expireTreasureBoosts();
    for (const hive of g.hives) {
      if (hive.dead) continue;
      hive.maxHp += SKIRMISH.hiveHpPerWave;
      hive.hp += SKIRMISH.hiveHpPerWave;
      hive.evolution = Math.min(5, g.level - 1);
      hive.hatchT = 2;
      g.fx.ring(hive, 2.5, 0xe8b840);
    }
    // A destroyed hive's share of every later wave is simply gone.
    const plan = wavePlan(g.level);
    plan.forEach((s, i) => { s.at += g.spawnTimer; s.lane = i % g.hives.length; });
    const marching = plan.filter(s => !g.hives[s.lane].dead);
    g.queue.push(...marching);
    g.queue.sort((a, b) => a.at - b.at);
    // Milestone waves bring their boss, unless the last one is still on the field.
    const assault = g.assault;
    if (!assault.pending && (!assault.boss || assault.boss.dead)) { assault.reset(); assault.start(); }
    g.sfx.alarm();
    g.emit('wave', { wave: g.level, hostiles: marching.length, bonus, boss: assault.pending ? assault.plan : null });
    for (const b of Object.values(BUILD)) if (b.unlock === g.level) g.emit('unitUnlocked', b);
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
    const { before, after, improved } = saveResult(hives, won, this.elapsed);
    this.result = {
      name: this.player, won, seconds: this.elapsed, wave: g.level, kills: g.kills, hives, destroyed: hives - this.hivesLeft,
      corePct: Math.max(0, Math.ceil(100 * g.core.hp / g.core.maxHp)), seed: g.mapSeed,
      best: after.best, previousBest: before.best, improved
    };
    g.emit('matchOver', this.result);
    return this.result;
  }
}

function readRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORD_KEY));
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* storage unavailable or damaged: start clean */ }
  return {};
}

/** Best winning time, wins and matches played for a setup (today there is one: the hive count). */
export function recordFor(hives) {
  const r = readRecords()[hives];
  const ok = (v) => Number.isFinite(v) && v >= 0;
  return { best: ok(r?.best) && r.best > 0 ? r.best : null, wins: ok(r?.wins) ? r.wins : 0, played: ok(r?.played) ? r.played : 0 };
}

function saveResult(hives, won, seconds) {
  const before = recordFor(hives);
  const improved = won && (before.best == null || seconds < before.best);
  const after = { best: improved ? seconds : before.best, wins: before.wins + (won ? 1 : 0), played: before.played + 1 };
  try { localStorage.setItem(RECORD_KEY, JSON.stringify({ ...readRecords(), [hives]: after })); } catch { /* shown, just not kept */ }
  return { before, after, improved };
}

export function installSkirmish({ game, getPlayer }) {
  const $ = (id) => document.getElementById(id);
  const describe = () => {
    const record = recordFor(2);
    $('skirmishInfo').textContent = `Two hives, one canyon, a bigger wave every ${SKIRMISH.waveGap} seconds. Destroy both hives to win.`
      + (record.best != null ? ` Your best: ${clock(record.best)}.` : '');
  };
  game.on('matchOver', describe);
  $('btnSkirmish').hidden = false;
  $('skirmishInfo').hidden = false;
  describe();
  return {
    /** Passed to `game.reset(seed, options)` so the battlefield is carved for the match. */
    options: () => ({ mapLevel: SKIRMISH.mapLevel }),
    /** Call straight after that reset, with the start screen closed and before the first wave is launched. */
    begin() {
      game.match = new Match(game, getPlayer());
      game.emit('matchStart', { hives: game.match.hives, waveGap: SKIRMISH.waveGap });
      return game.match;
    },
    record: recordFor
  };
}
