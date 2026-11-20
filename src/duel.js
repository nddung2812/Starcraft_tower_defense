/*
 * Duel: two players, one mirrored battle each.
 *
 * Both players hold the same canyon (one seed) against the same waves on their own screen, with
 * the same minerals and no saved hero, so nothing separates them but their decisions. Before the
 * match each drafts `DUEL.picks` units to field beside the Trooper, Barrier and Bunker; the picks
 * stay hidden until the match starts. In the match a player can pay to send bug packs at the
 * rival (`DUEL.packs`): the pack arrives through the rival's hives a few seconds later and every
 * pack sent raises the sender's income for the rest of the match. Each player sees the other's
 * relay, hives, wave, army and income live. First to destroy every hive wins; a fallen relay,
 * a concession, a dropped connection or a battle that stands still loses.
 *
 * `Duel` extends Survival mode's `Match`, so it is the director behind `game.match` and the core
 * needs only a few flags from it: `roster` (the drafted army, `game.isUnlocked`), `realtime` (no
 * pause, no speed change), `noHero` (hero.js keeps the hero home), `roll()` (seeded boss treasure,
 * so both players are dealt the same boxes), `readout()` (the objective line) and `sendKey(n)`
 * (Alt+N). Each browser runs its own battle: only small messages cross the line (`duelnet.js`),
 * so the simulation never has to be synchronised.
 *
 * Messages: hello, terms, ready, start/go (which carry the picks), status (once a second),
 * send, over, again, leave, ping. Everything a rival sends is treated as untrusted and is
 * validated here before it is used.
 *
 * This file is an optional layer (`layer('duel')` in main.js). Without it, or without
 * skirmish.js, the Duel button stays hidden and nothing else changes.
 */
import { DUEL, BUILD, BREEDS, UNITS, SKIRMISH, wavePlan } from './config.js';
import { Zergling } from './entities.js';
import { Match, normalizeSetup, clock } from './skirmish.js';
import { openLine, randomCode, cleanCode, carrier, CODE_LENGTH } from './duelnet.js';

const VERSION = 1;
const PREFS_KEY = 'td.duel.v1';
const SWARM_CAP = 180;
const PACKS = new Map(DUEL.packs.map(p => [p.id, p]));

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const hivesText = (n) => (n === 1 ? 'the hive' : n === 2 ? 'both hives' : `all ${n} hives`);
const cleanName = (raw) => String(raw || '').replace(/[^\p{L}\p{N} _.\-']/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Rival';
const whole = (v, lo, hi, fallback = lo) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : fallback);

/** The two things a host decides. Anything else about the battle is fixed, so every duel is the same game. */
export function normalizeTerms(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    hives: DUEL.hives.includes(r.hives) ? r.hives : DUEL.defaults.hives,
    minerals: DUEL.minerals.includes(r.minerals) ? r.minerals : DUEL.defaults.minerals
  };
}

/** A legal draft from anything: known units only, no repeats, at most `DUEL.picks`. */
export function normalizePicks(raw) {
  const out = [];
  for (const id of Array.isArray(raw) ? raw : []) if (DUEL.draft.includes(id) && !out.includes(id) && out.length < DUEL.picks) out.push(id);
  return out;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Duel extends Match {
  constructor(game, player, terms, picks, { seed = 0, rival = 'Rival', wire = () => {} } = {}) {
    super(game, player, normalizeSetup({ hives: terms.hives, mood: DUEL.mood, size: 0, minerals: terms.minerals, quick: true }));
    this.duel = true;
    this.realtime = true;
    this.noHero = true;
    this.roster = new Set([...DUEL.core, ...normalizePicks(picks)]);
    this.rival = { name: rival, picks: [], status: null };
    this.wire = wire;
    this.roll = seeded(seed ^ 0x5bd1e995);
    this.income = 0;
    this.incomeT = 0;
    this.sent = 0;
    this.received = 0;
    this.cool = {};          // pack id -> seconds until it can be sent again
    this.inbound = [];       // bugs a rival paid for, each due at an `elapsed` time
    this.heardPack = {};     // pack id -> when the rival last sent it, to refuse a flood
  }

  get prepping() { return this.game.state === 'brief'; }

  /** The objective line at the top of the battlefield (`ui.syncMatch`). */
  readout() {
    const g = this.game;
    const when = this.prepping ? `FIRST WAVE ${clock(Math.ceil(Math.max(0, g.briefT)))}` : `WAVE ${g.level} · NEXT ${clock(Math.ceil(this.nextT))}`;
    return `DUEL · HIVES ${this.hivesLeft}/${this.hives} · ${when}`;
  }

  update(dt) {
    super.update(dt);
    const g = this.game;
    for (const id of Object.keys(this.cool)) this.cool[id] = Math.max(0, this.cool[id] - dt);
    if (this.income > 0) {
      this.incomeT += dt;
      if (this.incomeT + 1e-9 >= DUEL.incomeEvery) {
        this.incomeT -= DUEL.incomeEvery;
        g.minerals += this.income;
        g.fx.label({ x: g.core.x, y: 2.6, z: g.core.z }, `+${this.income}`, 'cash');
        g.emit('change');
      }
    }
    this.land();
  }

  /* ---------------- sending ---------------- */

  /** Why a pack cannot be sent right now, or '' when it can. */
  blocked(pack) {
    const g = this.game;
    if (!pack) return 'unknown';
    if (this.result || g.ended) return 'over';
    if (g.state !== 'wave') return 'The first wave has not started';
    const from = Math.max(pack.from, DUEL.sendFromWave);
    if (g.level < from) return `Opens at wave ${from}`;
    if (this.cool[pack.id] > 0) return `Ready in ${Math.ceil(this.cool[pack.id])}s`;
    if (g.minerals < pack.cost) return `Needs ${pack.cost} minerals`;
    return '';
  }

  send(id) {
    const g = this.game, pack = PACKS.get(id);
    if (this.blocked(pack)) { g.sfx.deny?.(); return false; }
    g.minerals -= pack.cost;
    this.income += pack.income;
    this.cool[pack.id] = DUEL.sendCooldown;
    this.sent++;
    this.wire({ t: 'send', pack: pack.id });
    g.sfx.ui?.();
    g.emit('duelSent', { pack, income: this.income });
    g.emit('change');
    return true;
  }

  /** Alt+N on the keyboard: the Nth pack. */
  sendKey(n) { return this.send(DUEL.packs[n - 1]?.id); }

  /** The rival paid for a pack: queue it to climb out of our living hives. */
  receive(id) {
    const g = this.game, pack = PACKS.get(id);
    if (!pack || this.result || g.ended || g.state !== 'wave') return false;
    // The sender's own client enforces cost and cooldown; refuse what it could never have sent honestly.
    const now = performance.now();
    if (g.level < Math.max(pack.from, DUEL.sendFromWave) - 1) return false;
    if (now - (this.heardPack[id] ?? -Infinity) < DUEL.sendCooldown * 500) return false;
    this.heardPack[id] = now;
    const scale = wavePlan(g.level)[0];
    for (let i = 0; i < pack.count; i++) {
      this.inbound.push({ at: this.elapsed + DUEL.sendDelay + i * 0.18, breed: pack.breed, hpScale: scale.hpScale, speedScale: scale.speedScale });
    }
    this.inbound.sort((a, b) => a.at - b.at);
    this.received++;
    g.sfx.alarm?.();
    g.emit('duelIncoming', { pack, from: this.rival.name, seconds: DUEL.sendDelay });
    return true;
  }

  /** Bring due bugs onto the field, through the hives still standing, never past the swarm ceiling. */
  land() {
    const g = this.game;
    if (!this.inbound.length || this.inbound[0].at > this.elapsed) return;
    const mouths = g.grid.spawns.filter((_, i) => g.hives[i] && !g.hives[i].dead);
    if (!mouths.length) { this.inbound.length = 0; return; }
    let alive = g.zerglings.filter(z => !z.dead).length;
    while (this.inbound.length && this.inbound[0].at <= this.elapsed && alive < SWARM_CAP) {
      const s = this.inbound.shift();
      const sp = mouths[(this.landed = (this.landed || 0) + 1) % mouths.length];
      const bug = new Zergling(sp.x + 0.5 + (Math.random() - 0.5) * 0.28, sp.y + 0.85 + (Math.random() - 0.5) * 0.28, s.breed, s.hpScale, s.speedScale);
      bug.sent = true;
      bug.bountyScale = DUEL.sendBounty;
      g.zerglings.push(bug);
      g.world.add(bug.obj);
      g.fx.sparks({ x: bug.x, y: 0.3, z: bug.z }, 0, 8, [1, 0.35, 0.3], 3, 6.28);
      alive++;
    }
  }

  /* ---------------- what the rival sees ---------------- */

  report() {
    const g = this.game, army = {};
    for (const u of g.gunners) if (!u.dead && !u.isHero && BUILD[u.kind]) army[u.kind] = (army[u.kind] || 0) + 1;
    return {
      t: 'status', clock: g.time, state: g.state, wave: g.level,
      relay: Math.max(0, Math.ceil(100 * g.core.hp / g.core.maxHp)),
      hives: this.hivesLeft, total: this.hives, army, income: this.income, kills: g.kills
    };
  }

  /* ---------------- the result ---------------- */

  /**
   * The core calls this when our own hives or relay settle the match (`tell` the rival); `end()`
   * calls it when the rival's side did. `reason`: hives, relay, rival-hives, rival-relay, forfeit,
   * rival-forfeit, left, stalled (the rival's battle stood still), idle (ours did), draw.
   */
  finish(won, reason = won ? 'hives' : 'relay', tell = true) {
    if (this.result) return this.result;
    const g = this.game, hives = this.hives;
    this.inbound.length = 0;
    this.result = {
      duel: true, name: this.player, rival: this.rival.name, won, draw: false, reason, seconds: this.elapsed, wave: g.level,
      kills: g.kills, hives, destroyed: hives - this.hivesLeft, sent: this.sent, received: this.received, income: this.income,
      corePct: Math.max(0, Math.ceil(100 * g.core.hp / g.core.maxHp)), seed: g.mapSeed
    };
    if (tell) this.wire({ t: 'over', won, reason, seconds: this.elapsed });
    g.emit('duelOver', this.result);
    return this.result;
  }

  /** Stop our battle because of something that happened on the other side (or a concession here). */
  end(won, reason, tell = false) {
    const g = this.game;
    if (this.result || g.ended) return this.result;
    g.state = won ? 'victory' : 'defeat';
    g.pendingEvolution = null;
    g.assault.clearMarks();
    g.drama = 1;
    g.focus = null;
    if (won) g.sfx.victory?.(); else g.sfx.defeat?.();
    g.emit('change');
    return this.finish(won, reason, tell);
  }

  /** The rival's battle is over. Usually that decides ours; if both ended in the same instant, the clocks do. */
  rivalOver({ won, reason, seconds }) {
    const theirs = Number.isFinite(seconds) ? seconds : Infinity;
    const map = { hives: 'rival-hives', relay: 'rival-relay', forfeit: 'rival-forfeit', stalled: 'idle' };
    if (!this.result) return this.end(!won, map[reason] || (won ? 'rival-hives' : 'rival-relay'));
    const r = this.result;
    if (r.won !== !!won || r.draw) return r;   // one won, one lost: both sides already agree
    // Both destroyed their hives, or both lost their relay, before hearing from the other.
    const mine = r.seconds, close = Math.abs(mine - theirs) < 0.05;
    const iWin = won ? mine < theirs : mine > theirs;
    this.result = { ...r, draw: close, won: !close && iWin, reason: close ? 'draw' : iWin ? (won ? 'hives' : 'rival-relay') : (won ? 'rival-hives' : 'relay') };
    this.game.state = this.result.won ? 'victory' : 'defeat';
    this.game.emit('change');
    this.game.emit('duelOver', this.result);
    return this.result;
  }
}

/* ------------------------------------------------------------------ */
/*  THE LAYER                                                          */
/* ------------------------------------------------------------------ */

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'hidden') node.hidden = !!v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function readPrefs() {
  try {
    const data = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (data && typeof data === 'object') return { picks: normalizePicks(data.picks), terms: normalizeTerms(data.terms) };
  } catch { /* storage unavailable or damaged: start clean */ }
  return { picks: [], terms: normalizeTerms(null) };
}

const REASONS = {
  hives: (r) => `You destroyed ${hivesText(r.hives)} before ${r.rival} did`,
  'rival-relay': (r) => `${r.rival}'s relay fell`,
  'rival-forfeit': (r) => `${r.rival} conceded`,
  left: (r) => `${r.rival} left the duel`,
  stalled: (r) => `${r.rival}'s battle stood still for ${DUEL.stall} seconds`,
  relay: () => 'Your relay fell',
  'rival-hives': (r) => `${r.rival} destroyed ${hivesText(r.hives)} first`,
  forfeit: () => 'You conceded',
  idle: () => `Your battle stood still for ${DUEL.stall} seconds`,
  draw: () => 'Both battles ended in the same instant'
};

export function installDuel({ game, ui, getName, launch, quit }) {
  const $ = (id) => document.getElementById(id);
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'src/duel.css';
  document.head.append(style);

  const prefs = readPrefs();
  /* phase: door (no room) · opening (connecting) · room (lobby) · starting · playing · over */
  const S = { phase: 'door', code: '', host: false, line: null, note: '', terms: prefs.terms, picks: prefs.picks, ready: false, rival: null, seed: 0, duel: null };
  let askedAt = -Infinity, stallClock = null, stallSince = 0, lastStatus = 0, lastPing = 0, finalSent = false;

  /* ---------------- the lobby dialog ---------------- */

  const dialog = el('dialog', { id: 'duelDialog', class: 'career-dialog duel-dialog', 'aria-labelledby': 'duelTitle' },
    el('div', { class: 'career-heading' },
      el('div', {}, el('span', { class: 'intro__eyebrow', text: 'DUEL MODE' }), el('h2', { id: 'duelTitle', text: 'Duel a friend' })),
      el('button', { id: 'closeDuel', class: 'btn', type: 'button', 'aria-label': 'Close duel', text: '×' })),
    el('p', { class: 'career-help', text: 'Same canyon, same waves, your own army. Destroy every hive before your rival does, or outlast their relay. Your browsers connect directly to each other.' }),
    el('section', { id: 'duelDoor', class: 'duel-door' },
      el('button', { id: 'duelHost', class: 'btn btn--primary', type: 'button', text: 'Host a duel' }),
      el('span', { class: 'duel-or', text: 'or join one' }),
      el('div', { class: 'duel-join' },
        el('input', { id: 'duelCode', class: 'intro__input', maxlength: String(CODE_LENGTH + 2), placeholder: 'CODE', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'characters', 'aria-label': 'Room code' }),
        el('button', { id: 'duelJoin', class: 'btn', type: 'button', text: 'Join' }))),
    el('section', { id: 'duelRoom', class: 'duel-room', hidden: true },
      el('div', { class: 'duel-code' },
        el('span', { text: 'Room code' }), el('strong', { id: 'duelRoomCode' }),
        el('button', { id: 'duelCopy', class: 'btn', type: 'button', text: 'Copy invite link' }),
        el('label', { class: 'duel-name' }, el('span', { text: 'Your name' }),
          el('input', { id: 'duelName', class: 'intro__input', maxlength: '16', placeholder: 'Commander', spellcheck: 'false', autocomplete: 'off' }))),
      el('div', { id: 'duelPlayers', class: 'duel-players' }),
      el('fieldset', { id: 'duelTerms', class: 'duel-set' }, el('legend', { text: 'Battle' }), el('div', { id: 'duelTermRows', class: 'duel-terms' })),
      el('fieldset', { class: 'duel-set' },
        el('legend', { id: 'duelDraftLegend' }),
        el('div', { id: 'duelDraft', class: 'duel-draft' }),
        el('small', { text: 'Every army also has the Trooper, Barrier and Bunker. Your rival sees your picks only when the match starts.' })),
      el('div', { class: 'share-actions' },
        el('button', { id: 'duelReady', class: 'btn btn--primary', type: 'button' }),
        el('button', { id: 'duelLeave', class: 'btn', type: 'button', text: 'Leave duel' }))),
    el('p', { id: 'duelStatus', class: 'duel-status', role: 'status' }));
  document.body.append(dialog);

  /* ---------------- the battlefield readouts ---------------- */

  const rivalHud = el('div', { id: 'duelRival', class: 'duel-rival', role: 'status', hidden: true });
  const sendBar = el('section', { id: 'duelSends', class: 'duel-sends', 'aria-label': 'Send bugs at your rival', hidden: true },
    el('span', { id: 'duelIncome', class: 'duel-sends__income', title: 'Each pack you send raises your income for the rest of the match' }));
  DUEL.packs.forEach((pack, i) => {
    sendBar.append(el('button', { class: 'duel-send', type: 'button', 'data-pack': pack.id },
      el('kbd', { text: String(i + 1) }), el('b', { text: pack.count > 1 ? `${pack.count} ${pack.name}` : pack.name }), el('span', { text: String(pack.cost) })));
  });
  const stage = document.querySelector('.stage');
  stage.append(rivalHud, sendBar);

  /* ---------------- the line ---------------- */

  const say = (message) => S.line?.send(message);
  const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ picks: S.picks, terms: S.terms })); } catch { /* kept for this session */ } };

  function inviteLink() {
    const url = new URL(location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('duel', S.code);
    if (carrier() === 'local') url.searchParams.set('duelnet', 'local');
    return url.toString();
  }

  function attach(line) {
    S.line = line;
    line.onopen = () => {
      if (S.line !== line) return;
      S.rival = { name: 'Rival', ready: false, picks: [], status: null, heard: performance.now() };
      S.note = '';
      say({ t: 'hello', v: VERSION, name: getName() });
      if (S.host) say({ t: 'terms', ...S.terms });
      say({ t: 'ready', ready: S.ready });
      render();
    };
    line.onmessage = (message) => { if (S.line === line) hear(message); };
    line.onclose = () => { if (S.line === line) rivalGone(); };
    line.onerror = (error) => { if (S.line === line) { drop(); S.note = error.message; render(); } };
  }

  /** Forget the room without telling anyone (the line is already gone, or about to be). */
  function drop() {
    const line = S.line;
    S.line = null;
    try { line?.close(); } catch { /* already closed */ }
    Object.assign(S, { phase: 'door', code: '', host: false, ready: false, rival: null });
  }

  async function host() {
    if (S.phase !== 'door') return;
    S.phase = 'opening'; S.note = 'Opening a room…'; render();
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = randomCode();
      try {
        const line = await openLine(code, true);
        if (S.phase !== 'opening') { line.close(); return; }
        Object.assign(S, { phase: 'room', code, host: true, ready: false, rival: null, note: '' });
        attach(line);
        render();
        return;
      } catch (error) {
        if (error.code === 'taken') continue;
        S.phase = 'door'; S.note = error.message || 'Could not open a room.'; render();
        return;
      }
    }
    S.phase = 'door'; S.note = 'Could not find a free room code. Try again.'; render();
  }

  async function join(raw) {
    if (S.phase !== 'door') return;
    const code = cleanCode(raw);
    if (!code) { S.note = `A room code is ${CODE_LENGTH} letters and numbers.`; render(); return; }
    S.phase = 'opening'; S.note = `Joining ${code}…`; render();
    try {
      const line = await openLine(code, false);
      if (S.phase !== 'opening') { line.close(); return; }
      Object.assign(S, { phase: 'room', code, host: false, ready: false, rival: null, note: 'Connecting to the host…' });
      attach(line);
      render();
    } catch (error) {
      S.phase = 'door'; S.note = error.message || 'Could not join that duel.'; render();
    }
  }

  /** Leave on purpose: tell the rival, close the room, and return to the start screen if a duel is on the board. */
  function leave() {
    const onBoard = !!game.match?.duel;
    if (S.duel && !S.duel.result) S.duel.end(false, 'forfeit', true);
    say({ t: 'leave' });
    drop();
    S.note = '';
    if (dialog.open) dialog.close();
    render();
    if (onBoard && $('intro').hidden) quit();
    syncHud();   // the start screen is back: drop the duel's readouts and its locks on Pause and speed
  }

  function rivalGone() {
    const name = S.rival?.name || 'Your rival';
    if (S.duel && !S.duel.result) S.duel.end(true, 'left');
    if (S.host && S.line && !S.line.closed) {
      // The room is still ours: wait in it for them, or for someone else, with the same code.
      S.rival = null; S.ready = false;
      if (S.phase !== 'playing' && S.phase !== 'over') S.phase = 'room';
      S.note = `${name} left. The room is still open.`;
    } else {
      drop();
      S.note = `${name} left the duel.`;
    }
    render();
  }

  function hear(message) {
    if (!message || typeof message !== 'object' || typeof message.t !== 'string') return;
    if (message.t === 'full') { drop(); S.note = 'That duel already has two players.'; render(); return; }
    const rival = S.rival;
    if (!rival) return;
    rival.heard = performance.now();
    switch (message.t) {
      case 'hello':
        rival.name = cleanName(message.name);
        if (message.v !== VERSION) S.note = `${rival.name} is on a different version of the game. Both of you reload the page, then try again.`;
        break;
      case 'terms':
        if (S.host || S.phase !== 'room') return;
        S.terms = normalizeTerms(message);
        if (S.ready) { S.ready = false; say({ t: 'ready', ready: false }); }   // agreed to something else
        break;
      case 'ready':
        rival.ready = !!message.ready;
        tryStart();
        break;
      case 'start':
        if (S.host || S.phase !== 'room' || !S.ready || S.picks.length !== DUEL.picks) return;
        if (!Number.isInteger(message.seed)) return;
        S.terms = normalizeTerms(message.terms);
        rival.picks = normalizePicks(message.picks);
        say({ t: 'go', picks: S.picks });
        begin(message.seed >>> 0);
        return;
      case 'go':
        if (!S.host || S.phase !== 'starting') return;
        rival.picks = normalizePicks(message.picks);
        begin(S.seed);
        return;
      case 'status':
        rival.status = {
          clock: Number.isFinite(message.clock) ? message.clock : 0,
          state: String(message.state || '').slice(0, 12),
          wave: whole(message.wave, 1, 999), relay: whole(message.relay, 0, 100),
          hives: whole(message.hives, 0, 9), total: whole(message.total, 1, 9),
          income: whole(message.income, 0, 99999), kills: whole(message.kills, 0, 9999999),
          army: Object.fromEntries(Object.keys(BUILD).filter(k => UNITS[k] && message.army?.[k] > 0).map(k => [k, whole(message.army[k], 0, 999)]))
        };
        if (S.duel) S.duel.rival.status = rival.status;
        // The rival's last report lands just after the result: put their final numbers on the result screen.
        if (S.phase === 'over' && S.duel?.result && !$('banner').hidden && !dialog.open) showResult(S.duel.result);
        syncHud();
        return;
      case 'send':
        if (S.phase === 'playing') S.duel?.receive(message.pack);
        return;
      case 'over':
        if (S.duel && (S.phase === 'playing' || S.phase === 'over')) S.duel.rivalOver({ won: !!message.won, reason: String(message.reason || ''), seconds: message.seconds });
        return;
      case 'again':
        rival.ready = false;
        if (S.phase === 'over' && !dialog.open) ui.toast(`${rival.name} wants a rematch`, 'Open the lobby from the result screen to draft again.', 'radio');
        break;
      case 'leave':
        rivalGone();
        return;
      default:
        return;   // ping and anything unknown
    }
    render();
  }

  /** Both ready with full drafts: the host deals the seed and the match starts on both screens. */
  function tryStart() {
    if (!S.host || S.phase !== 'room' || !S.ready || !S.rival?.ready || S.picks.length !== DUEL.picks) return;
    S.phase = 'starting';
    S.seed = (Math.random() * 0x7fffffff) >>> 0;
    say({ t: 'start', seed: S.seed, terms: S.terms, picks: S.picks });
    setTimeout(() => {
      if (S.phase !== 'starting') return;
      S.phase = 'room'; S.note = 'Your rival did not answer. Ready up again.';
      S.ready = false; say({ t: 'ready', ready: false });
      render();
    }, 6000);
    render();
  }

  function begin(seed) {
    S.seed = seed;
    S.phase = 'playing';
    S.ready = false;
    if (S.rival) S.rival.ready = false;
    S.note = '';
    stallClock = null;
    if (dialog.open) dialog.close();
    launch(seed);   // main.js resets the game on this seed and calls options(), begin() and open() below
  }

  /* ---------------- drawing the lobby ---------------- */

  function option(group, value, text, pressed, disabled) {
    const b = el('button', { class: 'btn skirmish-option', type: 'button', 'data-term': group, 'data-value': String(value), 'aria-pressed': String(pressed), text });
    b.disabled = disabled;
    return b;
  }

  function render() {
    const inRoom = ['room', 'starting', 'over', 'playing'].includes(S.phase) && !!S.line;
    $('duelDoor').hidden = inRoom;
    $('duelRoom').hidden = !inRoom;
    $('duelHost').disabled = $('duelJoin').disabled = S.phase === 'opening';
    $('duelStatus').textContent = S.note;
    if (inRoom) {
      $('duelRoomCode').textContent = S.code;
      $('duelCopy').hidden = !S.host;
      const rival = S.rival;
      const card = (who, name, status, cls) => el('div', { class: `duel-player ${cls}` }, el('span', { text: who }), el('strong', { text: name }), el('em', { text: status }));
      const mine = S.picks.length < DUEL.picks ? `Picking · ${S.picks.length}/${DUEL.picks}` : S.ready ? 'Ready' : 'Army chosen';
      $('duelPlayers').replaceChildren(
        card('You', getName(), mine, S.ready ? 'is-ready' : ''),
        card('Rival', rival ? rival.name : 'Waiting…', rival ? (rival.ready ? 'Ready' : 'Choosing an army') : S.host ? 'Share the code or the link' : 'Connecting…', rival?.ready ? 'is-ready' : rival ? '' : 'is-empty'));
      const locked = !S.host || S.ready || S.phase !== 'room';
      $('duelTermRows').replaceChildren(
        el('div', { class: 'duel-term' }, el('span', { text: 'Hives' }), ...DUEL.hives.map(n => option('hives', n, String(n), S.terms.hives === n, locked))),
        el('div', { class: 'duel-term' }, el('span', { text: 'Minerals' }), ...DUEL.minerals.map(n => option('minerals', n, String(n), S.terms.minerals === n, locked))),
        el('small', { text: S.host ? `A wave every ${SKIRMISH.moods[DUEL.mood].waveGap} seconds after ${DUEL.prep} seconds to build. Sending bugs opens at wave ${DUEL.sendFromWave}.` : 'The host sets the battle.' }));
      $('duelDraftLegend').textContent = `Your army · pick ${DUEL.picks} (${S.picks.length}/${DUEL.picks})`;
      $('duelDraft').replaceChildren(...DUEL.draft.map((id) => {
        const chosen = S.picks.includes(id);
        const b = el('button', { class: 'duel-unit', type: 'button', 'data-unit': id, 'aria-pressed': String(chosen), title: BUILD[id].desc },
          el('strong', { text: BUILD[id].name }), el('span', { text: UNITS[id]?.info?.role || '' }), el('em', { text: `${BUILD[id].cost} minerals` }));
        b.disabled = S.ready || S.phase !== 'room' || (!chosen && S.picks.length >= DUEL.picks);
        return b;
      }));
      const ready = $('duelReady');
      ready.textContent = S.phase === 'starting' ? 'Starting…' : S.ready ? 'Not ready' : 'Ready';
      ready.disabled = S.phase !== 'room' || S.picks.length !== DUEL.picks || !S.rival;
      if (!S.note) {
        $('duelStatus').textContent = !S.rival ? (S.host ? 'Waiting for your rival to join.' : 'Connecting to the host…')
          : S.picks.length !== DUEL.picks ? `Pick ${plural(DUEL.picks - S.picks.length, 'more unit')}.`
          : !S.ready ? 'Press Ready when your army is set.'
          : S.rival.ready ? 'Starting…' : `Waiting for ${S.rival.name}.`;
      }
    }
    syncHud();
  }

  dialog.addEventListener('click', (ev) => {
    const term = ev.target.closest('[data-term]');
    if (term && !term.disabled && S.host && S.phase === 'room') {
      S.terms = normalizeTerms({ ...S.terms, [term.dataset.term]: Number(term.dataset.value) });
      savePrefs();
      say({ t: 'terms', ...S.terms });
      render();
      return;
    }
    const unit = ev.target.closest('[data-unit]');
    if (unit && !unit.disabled && S.phase === 'room' && !S.ready) {
      const id = unit.dataset.unit;
      S.picks = S.picks.includes(id) ? S.picks.filter(p => p !== id) : normalizePicks([...S.picks, id]);
      savePrefs();
      render();
      dialog.querySelector(`[data-unit="${id}"]`)?.focus();
    }
  });
  $('duelHost').addEventListener('click', host);
  $('duelJoin').addEventListener('click', () => join($('duelCode').value));
  $('duelCode').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); join($('duelCode').value); } });
  $('duelReady').addEventListener('click', () => {
    if (S.phase !== 'room' || S.picks.length !== DUEL.picks || !S.rival) return;
    S.ready = !S.ready;
    say({ t: 'ready', ready: S.ready });
    render();
    tryStart();
  });
  $('duelLeave').addEventListener('click', leave);
  $('duelCopy').addEventListener('click', async () => {
    const link = inviteLink();
    try { await navigator.clipboard.writeText(link); S.note = 'Invite link copied. Send it to your rival.'; }
    catch { S.note = `Send your rival this link: ${link}`; }
    render();
  });
  // Someone who arrived by invite link never saw the start screen's name field, so the lobby has one too.
  $('duelName').addEventListener('change', () => {
    $('playerName').value = $('duelName').value;
    $('duelName').value = getName() === 'Commander' ? '' : getName();
    say({ t: 'hello', v: VERSION, name: getName() });
    render();
  });
  // A room is easy to lose by accident: Escape does nothing in one. × leaves it, like the Leave button.
  dialog.addEventListener('cancel', (ev) => { if (S.line) ev.preventDefault(); });
  $('closeDuel').addEventListener('click', () => { if (S.line) leave(); else { if (S.phase === 'opening') S.phase = 'door'; dialog.close(); } });

  function openLobby() {
    if (S.phase === 'door') S.note = '';
    $('duelName').value = getName() === 'Commander' ? '' : getName();
    render();
    if (!dialog.open) dialog.showModal();
    (S.line ? $('duelReady') : $('duelHost')).focus();
  }
  $('btnDuel').addEventListener('click', openLobby);

  /* ---------------- the battlefield ---------------- */

  const ARMY_ORDER = Object.keys(BUILD).filter(k => UNITS[k]);
  function armyText(army) {
    const parts = ARMY_ORDER.filter(k => army?.[k] > 0).map(k => `${army[k]} ${BUILD[k].name}`);
    return parts.length ? parts.join(' · ') : 'no army';
  }

  function syncHud() {
    const d = game.match?.duel ? game.match : null;
    const onBoard = !!d && $('intro').hidden;
    const live = onBoard && !game.ended;
    document.body.classList.toggle('is-duel', onBoard);
    rivalHud.hidden = sendBar.hidden = !live;
    const again = $('bannerBtn');
    if (again.dataset.duel && !(onBoard && game.ended)) { again.textContent = 'Play Again'; delete again.dataset.duel; }
    if (!live) return;
    const r = d.rival.status;
    const text = r ? `${d.rival.name} · RELAY ${r.relay}% · HIVES ${r.hives}/${r.total} · WAVE ${r.wave} · ${armyText(r.army)} · INCOME +${r.income}`
      : `${d.rival.name} · waiting for their first report`;
    if (rivalHud.textContent !== text) rivalHud.textContent = text;
    rivalHud.classList.toggle('is-hurt', !!r && r.relay <= 35);
    // The strip grows with the match: a pack appears at the wave that opens it, so early on it is one line.
    const open = game.state === 'wave' && game.level >= DUEL.sendFromWave;
    const income = open ? `SEND BUGS · +${d.income}/${DUEL.incomeEvery}s` : `SEND BUGS · FROM WAVE ${DUEL.sendFromWave}`;
    if ($('duelIncome').textContent !== income) $('duelIncome').textContent = income;
    for (const b of sendBar.querySelectorAll('[data-pack]')) {
      const pack = PACKS.get(b.dataset.pack), why = d.blocked(pack);
      b.hidden = !open || game.level < pack.from;
      b.disabled = !!why;
      const title = `Send ${plural(pack.count, BREEDS[pack.breed].name)} at ${d.rival.name} (Alt+${DUEL.packs.indexOf(pack) + 1}) · ${pack.cost} minerals · +${pack.income} income every ${DUEL.incomeEvery}s${why ? ` · ${why}` : ''}`;
      if (b.title !== title) b.title = title;
    }
  }

  sendBar.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pack]');
    if (b) game.match?.duel && game.match.send(b.dataset.pack);
  });

  function showResult(r) {
    S.phase = 'over';
    const line = (REASONS[r.reason] || (() => (r.won ? 'You won' : 'You lost')))(r);
    const them = S.duel?.rival.status;
    $('banner').classList.add('is-match');
    $('bannerTitle').textContent = r.draw ? 'Duel Drawn' : r.won ? 'Duel Won' : 'Duel Lost';
    $('bannerTitle').classList.toggle('is-win', r.won);
    $('bannerText').textContent = `${line}. ${clock(r.seconds)} on wave ${r.wave}: you killed ${r.kills.toLocaleString()} bugs, sent ${plural(r.sent, 'pack')} and took ${r.received}, `
      + `with ${r.destroyed} of ${plural(r.hives, 'hive')} destroyed and your relay at ${r.corePct}%.`
      + (them ? ` ${r.rival}: relay ${them.relay}%, ${them.total - them.hives} of ${plural(them.total, 'hive')} destroyed, ${them.kills.toLocaleString()} kills.` : '');
    $('shareStatus').textContent = S.line ? 'Go back to the lobby to draft again and play a new canyon.' : 'The connection is closed. Host or join a new duel from the start screen.';
    const again = $('bannerBtn');
    again.textContent = S.line ? 'Back to the lobby' : 'Leave duel';
    again.dataset.duel = '1';
    $('banner').hidden = false;
    ui.syncMatch();
    syncHud();
  }

  game.on('duelOver', showResult);
  game.on('duelIncoming', ({ pack, from, seconds }) => ui.callout(`INCOMING · ${plural(pack.count, BREEDS[pack.breed].name).toUpperCase()}`, `Sent by ${from} · they reach your hives in ${seconds} seconds`, 'duel'));
  game.on('duelSent', ({ pack, income }) => ui.toast(`${pack.count > 1 ? `${pack.count} ${pack.name}` : pack.name} sent`, `Income is now +${income} every ${DUEL.incomeEvery} seconds.`));
  game.on('pauseRefused', () => { if (game.match?.duel) ui.toast('No pausing in a duel', 'Both battles run on the same clock.', 'warn'); });
  game.on('change', syncHud);

  /* Twice a second: tell the rival how we stand, and notice a rival who has gone quiet or stopped playing. */
  setInterval(() => {
    syncHud();   // cooldowns and the first-wave clock move without any game event
    const now = performance.now(), rival = S.rival, d = S.duel;
    if (!S.line?.open || !rival) return;
    const playing = S.phase === 'playing' && !!d && !d.result;
    if (d && (playing || (S.phase === 'over' && !finalSent))) {
      if (now - lastStatus > 900) { lastStatus = now; say(d.report()); finalSent = !playing; }
    } else if (now - lastPing > 2000) { lastPing = now; say({ t: 'ping' }); }
    if (now - rival.heard > DUEL.silence * 1000) { rivalGone(); return; }
    if (!playing || !rival.status) return;
    if (stallClock !== rival.status.clock) { stallClock = rival.status.clock; stallSince = now; }
    else if (now - stallSince > DUEL.stall * 1000) { say({ t: 'over', won: true, reason: 'stalled', seconds: d.elapsed }); d.end(true, 'stalled'); }
  }, 500);

  $('btnDuel').hidden = false;
  $('duelInfo').hidden = false;
  render();

  // An invite link opens the lobby and joins on its own.
  const invited = cleanCode(new URLSearchParams(location.search).get('duel'));
  if (invited) { $('duelCode').value = invited; openLobby(); join(invited); }

  return {
    /** Passed to `game.reset(seed, options)`: the canyon both players get. */
    options: () => ({ map: { hives: S.terms.hives, size: SKIRMISH.minSize[S.terms.hives] } }),
    /** Straight after that reset: install the director. */
    begin() {
      const rival = S.rival;
      S.duel = game.match = new Duel(game, getName(), S.terms, S.picks, { seed: S.seed, rival: rival?.name || 'Rival', wire: say });
      S.duel.rival.picks = rival?.picks || [];
      finalSent = false;
      syncHud();
      return S.duel;
    },
    /** In place of the opening squad: the first wave is called with time to build, the same for both. */
    open() {
      game.startWave();
      game.briefT = DUEL.prep;
      // After the round's own opening message has had its moment: who you face and what they brought.
      const duel = S.duel, theirs = duel.rival.picks.map(id => BUILD[id].name).join(', ');
      setTimeout(() => {
        if (game.match !== duel || game.ended) return;
        ui.toast(`Duel against ${duel.rival.name}`, `Destroy ${hivesText(S.terms.hives)} first.${theirs ? ` They drafted ${theirs}.` : ''}`, 'radio', 6000);
      }, 3200);
    },
    /** The Restart and result buttons: back to the lobby after a match, a concession (asked twice) during one. */
    restart() {
      if (game.ended || !S.duel || S.duel.result) {
        if (!S.line) { leave(); return; }
        S.phase = 'room'; S.ready = false; S.note = '';
        say({ t: 'again' }); say({ t: 'ready', ready: false });
        openLobby();
        return;
      }
      if (performance.now() - askedAt > 4000) {
        askedAt = performance.now();
        ui.toast('Concede this duel?', 'Press Restart again to give your rival the win.', 'warn');
        return;
      }
      S.duel.end(false, 'forfeit', true);
    },
    openLobby, host, join, leave,
    get state() { return { phase: S.phase, code: S.code, host: S.host, ready: S.ready, picks: [...S.picks], terms: { ...S.terms }, rival: S.rival ? { name: S.rival.name, ready: S.rival.ready, picks: [...S.rival.picks] } : null, note: S.note, link: S.line ? inviteLink() : '' }; },
    pick(ids) { if (S.phase === 'room' && !S.ready) { S.picks = normalizePicks(ids); savePrefs(); render(); } return [...S.picks]; }
  };
}
