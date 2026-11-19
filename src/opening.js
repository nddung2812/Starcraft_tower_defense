import * as THREE from 'three';
import { BREEDS } from './config.js';

/*
 * The first half-minute of a round.
 *
 * The swarm marches the whole map, so a round opens with a wait. This puts the wait to use:
 *  - on a new commander's first waves the camera sweeps out to the lead hive as it opens and
 *    back down the canyon, so they have seen the enemy and the ground before the fight;
 *  - every round opens with one line: which sides the swarm is coming from and when it arrives;
 *  - round one walks through the three things worth doing while waiting.
 * Nothing here changes spawning, routing or balance.
 */
const SWEEP = { out: 1.7, hold: 2.2, back: 1.5 };   // seconds: to the hive, watching it open, home
const SWEEPS_SHOWN = 3;                              // new commanders only; after that it is noise
const SEEN_KEY = 'td.opening.v1';
const ease = (k) => k * k * (3 - 2 * k);

/** "the west", "the west and north", "all four sides". */
export function sidesText(sides) {
  const named = [...new Set(sides || [])];
  if (named.length >= 4) return 'all four sides';
  if (named.length <= 1) return `the ${named[0] || 'west'}`;
  return `the ${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
}

/** Seconds until the first of the swarm reaches rifle range of the base, to the nearest second. */
export function contactEta(game) {
  const field = game.grid.field();
  const pace = BREEDS.zergling.speed * (game.queue[0]?.speedScale || 1);
  let tiles = Infinity;
  for (const s of game.grid.spawns) {
    const d = field.dist[game.grid.idx(s.x, s.y)];
    if (Number.isFinite(d)) tiles = Math.min(tiles, d);
  }
  if (!Number.isFinite(tiles)) return null;
  return Math.max(1, Math.round(Math.max(0, tiles - 6) / pace + (game.queue[0]?.at || 0)));
}

function sweepsSeen() {
  try { return Number(localStorage.getItem(SEEN_KEY)) || 0; } catch { return 0; }
}
function countSweep() {
  try { localStorage.setItem(SEEN_KEY, String(sweepsSeen() + 1)); } catch { /* storage unavailable */ }
}

export function installOpening({ game, stage, ui, canvas, intro, isTouch = () => false }) {
  /* ---------------- the reveal sweep ---------------- */
  const sweep = { active: false, t: 0, from: new THREE.Vector3(), hive: new THREE.Vector3(), expected: new THREE.Vector3(), beat: '' };

  function eligible() {
    return game.level === 1 && game.kills === 0 && !game.paused && (!intro || intro.hidden) && !document.hidden &&
      sweepsSeen() < SWEEPS_SHOWN && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  sweep.start = () => {
    const lead = game.grid.spawn;
    sweep.from.copy(stage.focus);
    sweep.hive.set(lead.x + 0.5, 0, lead.y + 0.9);
    sweep.expected.copy(stage.focus);
    sweep.t = 0; sweep.beat = 'start'; sweep.active = true;
    countSweep();
    game.emit('openingSweep', 'start');
    let last = performance.now();
    const tick = (now) => {
      if (!sweep.active) return;
      sweep.update(Math.min(0.1, (now - last) / 1000));
      last = now;
      if (sweep.active) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /** Advance the sweep. It gives way the moment anything else moves the camera. */
  const finish = () => { sweep.active = false; game.emit('openingSweep', 'end'); };
  sweep.update = (dt) => {
    if (!sweep.active) return;
    if (stage.focus.distanceToSquared(sweep.expected) > 1e-6) { finish(); return; }
    sweep.t += dt;
    const { out, hold, back } = SWEEP;
    if (sweep.t < out) stage.focus.lerpVectors(sweep.from, sweep.hive, ease(sweep.t / out));
    else if (sweep.t < out + hold) {
      stage.focus.copy(sweep.hive);
      if (sweep.beat !== 'hive') { sweep.beat = 'hive'; game.emit('openingSweep', 'hive'); }
    } else if (sweep.t < out + hold + back) stage.focus.lerpVectors(sweep.hive, sweep.from, ease((sweep.t - out - hold) / back));
    else { stage.focus.copy(sweep.from); finish(); }
    sweep.expected.copy(stage.focus);
  };

  /** Any deliberate input skips it and puts the camera back on the base. */
  sweep.cancel = () => {
    if (!sweep.active) return;
    stage.focus.copy(sweep.from);
    finish();
  };
  canvas.addEventListener('pointerdown', sweep.cancel, { capture: true });
  canvas.addEventListener('wheel', sweep.cancel, { capture: true, passive: true });
  window.addEventListener('keydown', sweep.cancel, { capture: true });

  /* ---------------- where from, and when ---------------- */
  game.on('brief', () => {
    // Round one has no round callout of its own; later rounds already show their name.
    if (game.level === 1) ui.callout('Round 1', `Swarm inbound from ${sidesText(game.layout.sides)}`, 'unit');
  });
  // One centre-screen line as the wave opens. Toasts are kept for things that must not be pushed out.
  let pending = null;
  const announce = () => {
    if (!pending) return;
    const left = pending.eta == null ? null : Math.round(pending.eta - (game.time - pending.at));
    pending = null;
    if (game.state !== 'wave' || (left != null && left < 4)) return;      // too late to be news
    ui.callout(`Inbound from ${sidesText(game.layout.sides)}`,
      left == null ? 'They are on their way' : `First contact in about ${left} seconds`, 'unit');
  };
  game.on('count', (n) => {
    if (n === 2 && eligible()) sweep.start();
    if (n !== 0) return;
    pending = { eta: contactEta(game), at: game.time };
    if (!sweep.active) announce();          // the sweep has captions of its own; speak when it is done
  });
  game.on('openingSweep', (beat) => { if (beat === 'end') announce(); });

  /* ---------------- round one field manual ---------------- */
  const progress = { moved: false, run: -1 };

  /** What to show a first-round commander right now, or null when the manual has nothing to add. */
  function guide() {
    if (game.level !== 1) return null;
    if (progress.run !== game.mapSeed) { progress.run = game.mapSeed; progress.moved = false; }
    if (game.gunners.some((u) => u.driving)) progress.moved = true;
    const touch = isTouch();
    const squad = game.gunners.length > 0;
    const fighting = game.state === 'brief' || game.state === 'wave';
    if (!squad) return { step: 1, title: 'Build your first line.',
      text: touch ? 'Tap the Trooper card, then tap open ground near your base.'
        : 'Press Q, then click open ground near your base to place a Trooper.' };
    if (!fighting) return { step: 1, title: 'Ready? Launch the swarm.',
      text: touch ? 'Add Barriers from the build cards. Tap Launch when your line is set.'
        : 'Add Barriers with W. Press Space when your line is set.' };
    if (game.kills > 0) return { step: 3, title: 'Kills pay minerals.',
      text: touch ? 'Spend them as you earn them: tap a card to build more. Strike calls an air strike on a packed swarm.'
        : 'Spend them as you earn them: Q Trooper · B Bunker · R air strike on a packed swarm.' };
    if (!game.walls.length) return { step: 1, title: `They are coming from ${sidesText(game.layout.sides)}.`,
      text: touch ? 'Your squad fires on its own. Use the wait: tap the Barrier card, then tap the canyon floor in their path.'
        : 'Your squad fires on its own. Use the wait: press W, then click the canyon floor in their path to drop a Barrier.' };
    if (!progress.moved) return { step: 2, title: 'Now place your squad.',
      text: touch ? 'Tap a Trooper, then tap the ground where it should stand.'
        : 'Shift-drag a box around your Troopers, then right-click where they should stand.' };
    return { step: 3, title: 'Hold the line.',
      text: touch ? 'Drag to look around. Pinch to zoom. Kills pay for more Troopers.'
        : 'Drag to pan · scroll to zoom · middle-drag to rotate. Kills pay for more Troopers.' };
  }

  return { sweep, guide, eta: () => contactEta(game) };
}
