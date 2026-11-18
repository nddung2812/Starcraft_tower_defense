/*
 * Optional layer. The soundtrack: an original war march in E minor at 104 bpm that follows the
 * battle. A military orchestra (field snare, timpani, low strings, horns, trumpets, choir) with a
 * frontier rock band (overdriven guitar, twanging lead) that joins as the swarm thickens.
 *
 *   menu      a lone horn plays the outpost's theme over a low drone and a timpani heartbeat
 *   calm      planning: a quiet snare, plucked strings, a twanging guitar with a long echo
 *   tension   the countdown: a snare roll that climbs, timpani, a brass swell
 *   fight1-3  the march. Horns, then trumpets and guitars, then choir, anvils and everything
 *   boss      its own darker changes over a tritone, low brass and choir
 *   push      the hives are open, or the match is won: the theme turns major
 *   dirge     the relay has fallen: a slow horn, a choir and a funeral drum
 *
 * Nothing is recorded: every note is an oscillator scheduled a fraction of a second ahead on the
 * audio clock. All moods share tempo and key, so moving between them is only a matter of which
 * instruments play the next beat. Loaded through `layer()`; if this file is missing the game is
 * simply silent between the guns.
 */
import { audioGraph, sfx } from './audio.js';

const BPM = 104;
const STEP = 60 / BPM / 4;          // a sixteenth note
const AHEAD = 0.24;                 // seconds of music scheduled in advance
const E2 = 82.41, E3 = 164.81, E4 = 329.63;
const st = (semitones, base) => base * 2 ** (semitones / 12);

/* Eight-bar changes, as [semitones above E, quality]. */
const CHANGES = {
  hold: [[0, 'm'], [5, 'm'], [8, 'M'], [0, 'm'], [0, 'm'], [10, 'M'], [3, 'M'], [7, 'm']],     // Em Am C Em | Em D G Bm
  boss: [[0, '5'], [1, '5'], [0, '5'], [6, '5'], [0, '5'], [1, '5'], [3, '5'], [1, '5']],      // E F E Bb | E F G F
  push: [[3, 'M'], [8, 'M'], [0, 'm'], [10, 'M'], [3, 'M'], [8, 'M'], [10, 'M'], [10, 'M']],   // G C Em D | G C D D
  dirge: [[0, 'm'], [0, 'm'], [8, 'M'], [8, 'M'], [5, 'm'], [5, 'm'], [0, 'm'], [0, 'm']]      // Em C Am Em
};

/* Melodies, two bars each, as [step, semitones above E4, length in steps]. One per pair of bars. */
const THEME = [
  [[0, 0, 6], [6, 0, 2], [8, 7, 8], [16, 5, 4], [20, 3, 4], [24, 5, 8]],
  [[0, 3, 6], [6, 2, 2], [8, 0, 4], [12, -2, 4], [16, 0, 12], [28, -5, 4]],
  [[0, 0, 6], [6, 0, 2], [8, 7, 6], [14, 8, 2], [16, 10, 8], [24, 12, 8]],
  [[0, 15, 6], [6, 14, 2], [8, 12, 4], [12, 10, 4], [16, 7, 12], [28, 10, 4]]
];
const PUSH = [
  [[0, 3, 6], [6, 3, 2], [8, 10, 8], [16, 8, 4], [20, 7, 4], [24, 8, 8]],
  [[0, 7, 6], [6, 5, 2], [8, 3, 8], [16, 2, 4], [20, 5, 4], [24, 10, 8]],
  [[0, 3, 6], [6, 3, 2], [8, 10, 6], [14, 12, 2], [16, 15, 8], [24, 12, 8]],
  [[0, 14, 8], [8, 10, 8], [16, 14, 4], [20, 15, 4], [24, 17, 8]]
];
const WATCH = [
  [[0, 7, 10], [12, 5, 2], [14, 3, 2], [16, 0, 14]],
  [[0, 3, 8], [8, 7, 8], [16, 7, 4], [20, 5, 4], [24, 3, 8]],
  [[0, 0, 4], [4, 3, 4], [8, 7, 8], [16, 10, 12]],
  [[0, 7, 8], [8, 3, 8], [16, 2, 16]]
];
const DIRGE = [
  [[0, 7, 12], [12, 5, 4], [16, 3, 16]],
  [[0, 8, 12], [12, 7, 4], [16, 3, 16]],
  [[0, 5, 12], [12, 3, 4], [16, 0, 16]],
  [[0, -5, 8], [8, -2, 8], [16, 0, 16]]
];
const BOSS = [[0, -12, 4], [4, -11, 4], [8, -12, 2], [10, -6, 6]];

/* The field snare's cadences: step -> how hard. */
const CADENCE = {
  1: { 0: 1, 3: 0.4, 4: 0.7, 6: 0.4, 8: 0.9, 11: 0.4, 12: 0.7, 14: 0.4 },
  2: { 0: 1, 2: 0.35, 3: 0.5, 4: 1, 6: 0.5, 8: 0.9, 10: 0.35, 11: 0.5, 12: 1, 14: 0.5, 15: 0.4 },
  3: { 0: 1, 1: 0.28, 2: 0.4, 3: 0.65, 4: 1, 5: 0.28, 6: 0.65, 7: 0.28, 8: 0.95, 9: 0.28, 10: 0.4, 11: 0.65, 12: 1, 13: 0.28, 14: 0.65, 15: 0.4 }
};
const KICK = { 1: [0, 8], 2: [0, 6, 8], 3: [0, 3, 6, 8, 11, 14], boss: [0, 4, 8, 10, 12, 14, 15] };
const CHUG = { 2: [0, 3, 6, 8, 11, 14], 3: [0, 2, 3, 6, 8, 10, 11, 14], boss: [0, 3, 6, 8, 11, 14] };
/** The low strings' figure: semitones above the root of the bar, one per sixteenth. */
const OSTINATO = [0, 0, 7, 0, 12, 0, 7, 0, 0, 0, 7, 0, 12, 7, 0, 7];
const STAB = [8, 11, 12, 14];

export function installMusic(game) {
  let ctx = null, bus = null;
  let step = 0, nextTime = 0, current = 'menu', notes = 0, wasIdle = true, tensionFrom = 0;
  let heldLevel = 1, heldUntil = 0;
  const intro = document.getElementById('intro');

  /* ---------- the orchestra ---------- */

  function setup(graph) {
    ctx = graph.ctx;
    const out = graph.musicBus;
    const strip = (level, wet = 0) => {
      const g = ctx.createGain();
      g.gain.value = level;
      g.connect(out);
      if (wet) { const s = ctx.createGain(); s.gain.value = wet; g.connect(s).connect(graph.reverb); }
      return g;
    };
    const drums = strip(0.8, 0.12);
    const timpani = strip(0.8, 0.3);
    const strings = strip(0.3, 0.14);
    const brass = strip(0.32, 0.4);
    const choir = strip(0.2, 0.6);

    // Rhythm guitar: every note goes through one overdriven amp and its cabinet.
    const amp = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) curve[i] = Math.tanh(((i / 1023) * 2 - 1) * 7);
    amp.curve = curve;
    amp.oversample = '2x';
    const cabLow = ctx.createBiquadFilter(); cabLow.type = 'highpass'; cabLow.frequency.value = 95;
    const cabHigh = ctx.createBiquadFilter(); cabHigh.type = 'lowpass'; cabHigh.frequency.value = 3100; cabHigh.Q.value = 0.8;
    amp.connect(cabLow).connect(cabHigh).connect(strip(0.11, 0.1));

    // Lead guitar: a clean twang into a dotted-eighth echo.
    const lead = strip(0.27, 0.35);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = STEP * 3;
    const feedback = ctx.createGain(); feedback.gain.value = 0.36;
    const echoTone = ctx.createBiquadFilter(); echoTone.type = 'lowpass'; echoTone.frequency.value = 2200;
    const leadIn = ctx.createGain();
    leadIn.connect(lead);
    leadIn.connect(echo).connect(echoTone).connect(feedback).connect(echo);
    echoTone.connect(lead);

    bus = { drums, timpani, strings, brass, choir, guitar: amp, lead: leadIn, noise: graph.noise };

    // Wind in the canyon, under everything. It belongs to the world, so it rides the effects bus.
    const wind = ctx.createBufferSource();
    wind.buffer = graph.brown;
    wind.loop = true;
    const windTone = ctx.createBiquadFilter(); windTone.type = 'bandpass'; windTone.frequency.value = 420; windTone.Q.value = 0.5;
    const windLevel = ctx.createGain(); windLevel.gain.value = 0.05;
    const gust = ctx.createOscillator(), gustDepth = ctx.createGain();
    gust.frequency.value = 0.11; gustDepth.gain.value = 0.03;
    gust.connect(gustDepth).connect(windLevel.gain);
    wind.connect(windTone).connect(windLevel).connect(graph.sfxBus);
    wind.start(); gust.start();
  }

  function env(param, t, peak, attack, dur, hold = 0) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + attack);
    if (hold) param.setValueAtTime(peak, t + attack + hold);
    param.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + hold + 0.01, dur));
  }

  function hit(t, dur, type, freq, gain, to, out = bus.drums) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = bus.noise; src.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g.gain, t, gain, 0.002, dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random()); src.stop(t + dur + 0.03);
    notes++;
  }

  function drop(t, from, to, dur, gain, out = bus.drums, type = 'sine') {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g.gain, t, gain, 0.003, dur);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.03);
    notes++;
  }

  /* Percussion. */
  const bassDrum = (t, v) => { drop(t, 120, 40, 0.3, 0.95 * v); hit(t, 0.03, 'lowpass', 1200, 0.3 * v); };
  /** A field snare: the drumhead, then the rattle of the wires. */
  const snare = (t, v) => {
    hit(t, 0.12, 'bandpass', 2300, 0.42 * v, 1500);
    hit(t, 0.07, 'highpass', 5200, 0.2 * v);
    drop(t, 240, 150, 0.06, 0.24 * v);
  };
  const roll = (t, v) => { snare(t, v); snare(t + STEP / 2, v * 0.75); };
  function timp(t, freq, v) {
    drop(t, freq * 1.06, freq, 0.75, 0.85 * v, bus.timpani);
    drop(t, freq * 1.5 * 1.04, freq * 1.5, 0.3, 0.2 * v, bus.timpani);
    hit(t, 0.04, 'lowpass', 500, 0.35 * v, 0, bus.timpani);
  }
  const crash = (t, v) => { hit(t, 1.9, 'highpass', 4800, 0.26 * v, 7000); hit(t, 0.5, 'bandpass', 3000, 0.16 * v); };
  /** Struck steel: partials that do not line up, so it rings like metal rather than a note. */
  function anvil(t, v) {
    for (const [mul, level, dur] of [[1, 0.2, 0.5], [2.76, 0.14, 0.32], [5.4, 0.09, 0.2], [8.93, 0.05, 0.12]]) {
      drop(t, 640 * mul, 636 * mul, dur, level * v);
    }
  }

  /* Strings. */
  function spiccato(t, freq, v) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 1;
    f.frequency.setValueAtTime(1700, t);
    f.frequency.exponentialRampToValueAtTime(500, t + 0.12);
    env(g.gain, t, 0.5 * v, 0.006, 0.14);
    for (const cents of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = cents;
      o.connect(f);
      o.start(t); o.stop(t + 0.17);
    }
    f.connect(g).connect(bus.strings);
    notes++;
  }
  /** A held string section, for the quiet moods. */
  function drone(t, root, quality, dur, v) {
    const base = st(root > 5 ? root - 12 : root, E3);
    const tones = quality === '5' ? [-12, 0, 7] : [-12, 0, 7, quality === 'M' ? 16 : 15];
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(420, t);
    f.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(480, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.6);
    g.gain.setValueAtTime(v, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.7);
    for (const tone of tones) for (const cents of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = st(tone, base); o.detune.value = cents;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.8);
    }
    f.connect(g).connect(bus.strings);
    notes++;
  }

  /* Brass. */
  /** One voice of the melody. Bright is a trumpet; otherwise a horn. */
  function horn(t, freq, dur, v, bright) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(freq * 1.4, t);
    f.frequency.exponentialRampToValueAtTime(freq * (bright ? 7.5 : 4.2), t + 0.07);
    f.frequency.exponentialRampToValueAtTime(freq * (bright ? 4.5 : 2.5), t + Math.max(0.1, dur));
    env(g.gain, t, v, 0.035, dur + 0.14, dur * 0.6);
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.2;
    depth.gain.setValueAtTime(0, t);
    depth.gain.setValueAtTime(0, t + Math.min(dur, 0.3));
    depth.gain.linearRampToValueAtTime(freq * 0.006, t + Math.min(dur, 0.3) + 0.25);
    lfo.connect(depth);
    for (const cents of [-7, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = cents;
      depth.connect(o.frequency);
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.2);
    }
    lfo.start(t); lfo.stop(t + dur + 0.2);
    f.connect(g).connect(bus.brass);
    notes++;
  }
  /** The whole section on one chord. */
  function brassChord(t, root, quality, dur, v) {
    const base = st(root > 5 ? root - 12 : root, E3);
    const tones = quality === '5' ? [-12, 0, 7, 12] : [-12, 0, 7, quality === 'M' ? 16 : 15];
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 1.1;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(2100, t + Math.min(0.12, dur * 0.5));
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    env(g.gain, t, v, 0.03, dur + 0.1, dur * 0.45);
    for (const tone of tones) for (const cents of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = st(tone, base); o.detune.value = cents;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.16);
    }
    f.connect(g).connect(bus.brass);
    notes++;
  }

  /** Voices on an open "ah": saws through the two formants of the vowel. */
  function choir(t, root, quality, dur, v) {
    const base = st(root > 5 ? root - 12 : root, E3);
    const tones = quality === '5' ? [0, 7, 12] : [0, 7, quality === 'M' ? 16 : 15];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.45);
    g.gain.setValueAtTime(v, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    for (const [freq, q, level] of [[720, 6, 1], [1180, 7, 0.65]]) {
      const f = ctx.createBiquadFilter(), m = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      m.gain.value = level;
      for (const tone of tones) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = st(tone, base); o.detune.value = (Math.random() - 0.5) * 16;
        o.connect(f);
        o.start(t); o.stop(t + dur + 0.6);
      }
      f.connect(m).connect(g);
    }
    g.connect(bus.choir);
    notes++;
  }

  /* The band. */
  /** A power chord through the amp. Muted is the short choked chug; open rings. */
  function chug(t, root, open, v) {
    const dur = open ? STEP * 5 : 0.085;
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = open ? 3400 : 900; f.Q.value = 0.7;
    env(g.gain, t, 0.5 * v, 0.004, dur, open ? dur * 0.5 : 0.03);
    for (const mul of [1, 1.4983, 2]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = root * mul; o.detune.value = (Math.random() - 0.5) * 10;
      o.connect(f);
      o.start(t); o.stop(t + dur + 0.03);
    }
    f.connect(g).connect(bus.guitar);
    notes++;
  }

  /** The twanging lead: slides into each note from below and starts to shake once it is held. */
  function twang(t, freq, dur, v) {
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(1300, t + Math.max(0.05, dur));
    env(g.gain, t, v, 0.012, dur + 0.12, dur * 0.35);
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = 5.4;
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(freq * 0.007, t + Math.min(dur, 0.4));
    lfo.connect(depth);
    for (const [type, level] of [['sawtooth', 0.55], ['triangle', 0.8]]) {
      const o = ctx.createOscillator(), mix = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * 0.944, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      depth.connect(o.frequency);
      mix.gain.value = level;
      o.connect(mix).connect(f);
      o.start(t); o.stop(t + dur + 0.2);
    }
    lfo.start(t); lfo.stop(t + dur + 0.2);
    f.connect(g).connect(bus.lead);
    notes++;
  }

  /* ---------- what to play ---------- */

  /** How thick the swarm is. It climbs at once and only eases off after a few quiet seconds. */
  function swarmLevel() {
    let alive = 0;
    for (const z of game.zerglings) if (!z.dead) alive++;
    const level = alive >= 28 ? 3 : alive >= 9 ? 2 : 1;
    const now = performance.now();
    if (level >= heldLevel) { heldLevel = level; heldUntil = now + 7000; }
    else if (now > heldUntil) { heldLevel = level; heldUntil = now + 7000; }
    return heldLevel;
  }

  /** The mood the game is in right now. */
  function mood() {
    const s = game.state;
    if (s === 'defeat') return 'dirge';
    if (s === 'victory') return 'push';
    if (intro && !intro.hidden) return 'menu';
    if (game.paused || game.pendingEvolution) return 'calm';
    if (s === 'brief') return 'tension';
    if (s === 'raid') return 'push';
    if (s === 'wave') {
      const boss = game.assault?.boss;
      if (boss && !boss.dead) return 'boss';
      return `fight${swarmLevel()}`;
    }
    return 'calm';
  }

  function phrase(list, at, t, play) {
    for (const [when, semis, len] of list) if (when === at) play(t, st(semis, E4), len * STEP * 0.94);
  }

  /** A new section announces itself. */
  function arrive(m, t, low) {
    if (m === 'boss') { crash(t, 1); anvil(t, 1); timp(t, low, 1); bassDrum(t, 1); }
    else if (m.startsWith('fight') || m === 'push') { crash(t, 0.8); timp(t, low, 1); }
    else if (m === 'dirge') timp(t, low, 0.9);
  }

  function schedule(n, t) {
    const s = n % 16, bar = Math.floor(n / 16);
    let arrived = false;
    if (s % 4 === 0) {
      const next = mood();
      // The march only changes gear on the bar line; anything else changes on the next beat.
      const gearChange = next.startsWith('fight') && current.startsWith('fight');
      if (next !== current && (!gearChange || s === 0)) {
        if (next === 'tension') tensionFrom = n;
        arrived = next !== 'calm' && !gearChange;
        current = next;
      }
    }
    const m = current;
    const changes = CHANGES[m === 'boss' ? 'boss' : m === 'push' ? 'push' : m === 'dirge' ? 'dirge' : 'hold'];
    const [root, quality] = changes[bar % 8];
    const low = st(root > 5 ? root - 12 : root, E2);
    const pair = Math.floor(bar / 2) % 4, inPair = (bar % 2) * 16 + s;
    if (arrived) arrive(m, t, low);

    if (m === 'menu') {
      if (s === 0) drone(t, root, quality, STEP * 16, 0.5);
      if (s === 0 || s === 3) timp(t, E2, s ? 0.3 : 0.5);
      phrase(THEME[pair], inPair, t, (at, freq, len) => horn(at, freq / 2, len, 0.42, false));
      return;
    }

    if (m === 'calm') {
      if (s === 0) drone(t, root, quality, STEP * 16, 0.55);
      if (s === 0 || s === 8) spiccato(t, low, 0.55);
      if (s === 6 || s === 14) spiccato(t, low * 1.4983, 0.4);
      if (s === 0 || s === 4 || s === 8 || s === 11 || s === 12) snare(t, s % 8 === 0 ? 0.2 : 0.11);
      if (s === 0 && bar % 2 === 0) timp(t, low, 0.4);
      phrase(WATCH[pair], inPair, t, (at, freq, len) => twang(at, freq, len, 0.4));
      return;
    }

    if (m === 'dirge') {
      if (s === 0) { drone(t, root, quality, STEP * 16, 0.5); choir(t, root, quality, STEP * 16, 0.7); }
      if (s === 0 && bar % 2 === 0) { timp(t, E2, 0.9); bassDrum(t, 0.5); }
      if (bar % 2 === 1 && (s === 12 || s === 14)) snare(t, 0.14);
      phrase(DIRGE[pair], inPair, t, (at, freq, len) => horn(at, freq / 2, len, 0.46, false));
      return;
    }

    if (m === 'tension') {
      const rise = Math.min(1, 0.35 + (n - tensionFrom) / 40);
      roll(t, 0.5 * rise);
      if (s % 2 === 0) timp(t, s % 8 < 4 ? E2 : E2 * 1.4983, 0.5 * rise);
      if (s % 4 === 0) bassDrum(t, 0.7 * rise);
      if (s === 0) brassChord(t, root, quality, STEP * 15, 0.5 * rise);
      spiccato(t, low, 0.5 * rise);
      return;
    }

    // The march: fight1-3, push and boss.
    const energy = m === 'boss' || m === 'push' ? (m === 'boss' ? 3 : 2) : +m[5];
    const fill = bar % 4 === 3 && s >= 12;

    const cadence = CADENCE[energy];
    if (fill && energy >= 2) roll(t, 0.55 + (s - 12) * 0.14);
    else if (cadence[s]) snare(t, cadence[s]);

    if ((m === 'boss' ? KICK.boss : KICK[energy]).includes(s)) bassDrum(t, 1);
    if (s === 0) timp(t, low, 1);
    else if (s === 8) timp(t, low * 1.4983 > 130 ? low * 0.749 : low * 1.4983, 0.75);
    else if (energy >= 2 && (s === 14 || s === 15)) timp(t, low, 0.5);
    if (energy >= 3 && s === 0 && bar % 4 === 0) crash(t, 0.8);
    if (energy >= 3 && bar % 2 === 1 && s === 12) anvil(t, 0.8);

    // Strings: eighths at first, the full figure once the swarm is thick.
    if (energy >= 2 || s % 2 === 0) spiccato(t, st(OSTINATO[s], low * 2), s % 4 === 0 ? 0.85 : 0.6);

    const chugs = m === 'boss' ? CHUG.boss : CHUG[energy];
    if (chugs?.includes(s)) {
      const open = m === 'boss' ? s === 0 : energy >= 3 && s === 0;
      chug(t, low, open, open ? 0.9 : 0.75);
    }

    if (energy >= 2 && s === 0) brassChord(t, root, quality, STEP * 7, m === 'boss' ? 0.75 : 0.42);
    if (energy >= 3 && bar % 2 === 1 && STAB.includes(s)) brassChord(t, root, quality, STEP * 1.5, 0.55);
    if ((energy >= 3 || m === 'push') && s === 0) choir(t, root, quality, STEP * 16, m === 'boss' ? 0.95 : 0.65);

    if (m === 'boss') {
      for (const [when, semis, len] of BOSS) if (when === s) horn(t, st(semis, E4) / 2, len * STEP * 0.9, 0.6, false);
      return;
    }
    const melody = m === 'push' ? PUSH : THEME;
    phrase(melody[pair], inPair, t, (at, freq, len) => {
      horn(at, freq / 2, len, 0.44, false);
      if (energy >= 2) horn(at, freq, len, 0.34, true);
    });
  }

  function tick() {
    const graph = audioGraph();
    if (!graph || graph.ctx.state !== 'running' || document.hidden || !sfx.isEnabled() || !sfx.musicEnabled()) { wasIdle = true; return; }
    if (!bus) setup(graph);
    const now = ctx.currentTime;
    if (wasIdle || nextTime < now) {
      // Starting, or back from a hidden tab: pick up on the next bar rather than rush to catch up.
      nextTime = now + 0.08;
      step = Math.ceil(step / 16) * 16;
      wasIdle = false;
    }
    while (nextTime < now + AHEAD) {
      schedule(step, nextTime);
      nextTime += STEP;
      step++;
    }
  }

  const timer = setInterval(tick, 60);
  // The start screen is silent until the browser is allowed to play: any first touch does it.
  const wake = () => sfx.resume();
  window.addEventListener('pointerdown', wake, { capture: true, passive: true });
  window.addEventListener('keydown', wake, { capture: true, passive: true });

  return {
    mood: () => current,
    /** What the game state asks for right now, before the next beat picks it up. */
    wanted: mood,
    step: () => step,
    notes: () => notes,
    stop() { clearInterval(timer); }
  };
}
