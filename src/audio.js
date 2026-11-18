/*
 * Sound engine. Everything is synthesised with Web Audio; there are no sample files here.
 *
 * Signal path:  each sound -> its own gain and pan (placed from where it happened relative to
 * the camera) -> `sfxBus` -> compressor -> master -> limiter -> speakers, with a send into a
 * canyon reverb. Music and radio voices have their own buses (`audioGraph()`), and music ducks
 * while somebody is talking.
 *
 * Callers stay simple: `sfx.gauss()`. Where a sound comes from is whatever entity the game is
 * updating at that moment (`sfx.from(entity)`, set by the loops in `game.update`), or an explicit
 * `{ x, z }` passed as the last argument. With neither, the sound is played dry and centred, which
 * is right for interface sounds.
 */

const STORE = 'td.audio.v1';
const LEVEL = { master: 0.62, sfx: 0.85, music: 0.5, voice: 1 };
const MAX_LIVE = 44;            // sounds sounding at once; the quiet end of a firefight is dropped first

let ctx = null;
let enabled = true;
let musicOn = true;
let master, sfxBus, musicBus, musicDuck, voiceBus, reverbIn, analyser, meter;
const buffers = {};
const listener = { x: 0, z: 0, yaw: Math.PI / 2, dist: 18, set: false };
let emitter = null;
const lastAt = {};
let live = [];

try {
  const saved = JSON.parse(globalThis.localStorage?.getItem(STORE) || 'null');
  if (saved) { enabled = saved.sound !== false; musicOn = saved.music !== false; }
} catch { /* no storage: defaults */ }

function remember() {
  try { globalThis.localStorage?.setItem(STORE, JSON.stringify({ sound: enabled, music: musicOn })); } catch { /* ignore */ }
}

function noiseBuffer(seconds, brown) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  let acc = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) { acc = (acc + 0.02 * w) / 1.02; d[i] = acc * 3.5; } else d[i] = w;
  }
  return buf;
}

/** A canyon: two hard slaps off the far wall, then a long dark tail. */
function canyonImpulse() {
  const rate = ctx.sampleRate, len = Math.floor(rate * 2.4);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let low = 0;
    for (let i = 0; i < len; i++) {
      const t = i / rate;
      const w = (Math.random() * 2 - 1) * Math.exp(-t * 2.6);
      const k = 0.12 + 0.8 * Math.exp(-t * 3);      // the tail loses its top end as it dies
      low += k * (w - low);
      d[i] = low * 0.9;
    }
    for (const [at, amp] of ch ? [[0.097, 0.5], [0.213, 0.3]] : [[0.083, 0.5], [0.241, 0.3]]) {
      const i0 = Math.floor(at * rate);
      for (let i = 0; i < 260; i++) d[i0 + i] += (Math.random() * 2 - 1) * amp * (1 - i / 260);
    }
  }
  return buf;
}

function ensure() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try { ctx = new AC({ latencyHint: 'interactive' }); } catch { ctx = null; return null; }

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 16;
  limiter.attack.value = 0.002; limiter.release.value = 0.14;
  master = ctx.createGain();
  master.gain.value = enabled ? LEVEL.master : 0;
  master.connect(limiter).connect(ctx.destination);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  meter = new Float32Array(analyser.fftSize);
  limiter.connect(analyser);

  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -18; glue.knee.value = 10; glue.ratio.value = 4;
  glue.attack.value = 0.004; glue.release.value = 0.22;
  sfxBus = ctx.createGain();
  sfxBus.gain.value = LEVEL.sfx;
  sfxBus.connect(glue).connect(master);

  const reverb = ctx.createConvolver();
  reverb.buffer = canyonImpulse();
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  reverbIn = ctx.createGain();
  reverbIn.connect(reverb).connect(wet).connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? LEVEL.music : 0;
  musicDuck = ctx.createGain();
  musicBus.connect(musicDuck).connect(master);
  voiceBus = ctx.createGain();
  voiceBus.gain.value = LEVEL.voice;
  voiceBus.connect(master);

  buffers.white = noiseBuffer(1.5, false);
  buffers.brown = noiseBuffer(2.5, true);
  return ctx;
}

/**
 * The shared graph, for the music and voice modules. Null when the browser has no Web Audio.
 * `duck(seconds)` pulls the music down while a voice line plays.
 */
export function audioGraph() {
  if (!ensure()) return null;
  return {
    ctx, sfxBus, musicBus, voiceBus, reverb: reverbIn, noise: buffers.white, brown: buffers.brown,
    duck(seconds) {
      const now = ctx.currentTime;
      musicDuck.gain.cancelScheduledValues(now);
      musicDuck.gain.setTargetAtTime(0.38, now, 0.06);
      musicDuck.gain.setTargetAtTime(1, now + seconds, 0.35);
    }
  };
}

/* ---------- placing a sound ---------- */

const vary = (amount) => 1 + (Math.random() * 2 - 1) * amount;

/** A gain (and pan) for one sound, from where it is relative to what the camera looks at. */
function place(at, level, wet) {
  let gain = level, pan = 0, far = 0;
  const ax = at ? at.x ?? at.tx : NaN, az = at ? at.z ?? at.tz : NaN;   // bombs only know where they land
  if (listener.set && Number.isFinite(ax) && Number.isFinite(az)) {
    const dx = ax - listener.x, dz = az - listener.z;
    const range = 9 + listener.dist * 0.75;
    const d = Math.hypot(dx, dz);
    far = Math.min(1, d / (range * 2.5));
    gain *= Math.max(0.07, 1 / (1 + (d / range) ** 2));
    pan = Math.max(-1, Math.min(1, (dx * Math.sin(listener.yaw) - dz * Math.cos(listener.yaw)) / range)) * 0.8;
  }
  const g = ctx.createGain();
  g.gain.value = gain;
  let tail = g;
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    tail = p;
  }
  tail.connect(sfxBus);
  const send = ctx.createGain();
  send.gain.value = wet + far * 0.3;    // far-off fights are mostly echo
  tail.connect(send).connect(reverbIn);
  return g;
}

/**
 * Run a recipe. `gap` is the least time between two of the same sound (a squad firing together is
 * one burst, not twenty); `spam` marks sounds that may be dropped when the mix is already full.
 */
function play(name, at, recipe, { gap = 0, level = 1, wet = 0.16, spam = false, length = 0.6 } = {}) {
  if (!enabled || !ensure() || ctx.state !== 'running') return false;
  const now = ctx.currentTime;
  if (gap && now - (lastAt[name] ?? -9) < gap) return false;
  if (live.length >= MAX_LIVE) live = live.filter((end) => end > now);
  if (spam && live.length >= MAX_LIVE) return false;
  lastAt[name] = now;
  live.push(now + length);
  recipe(place(at === undefined ? emitter : at, level, wet), now + 0.004);
  return true;
}

/* ---------- building blocks ---------- */

function envelope(param, t, peak, attack, dur, hold = 0) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  if (hold) param.setValueAtTime(peak, t + attack + hold);
  param.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + hold + 0.01, dur));
}

function sweep(param, t, from, to, dur, mid) {
  param.setValueAtTime(Math.max(20, from), t);
  if (mid) {
    param.exponentialRampToValueAtTime(Math.max(20, mid[1]), t + dur * mid[0]);
    param.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
  } else if (to !== from) param.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
}

/** Filtered noise. `mid` is `[fraction of dur, frequency]` for a rise-then-fall filter sweep. */
function noise(out, t, { dur, type = 'bandpass', f = 1000, to = f, mid, q = 1, gain = 0.3, attack = 0.003, hold = 0, color = 'white' }) {
  const src = ctx.createBufferSource();
  src.buffer = buffers[color];
  src.loop = true;
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.Q.value = q;
  sweep(flt.frequency, t, f, to, dur, mid);
  const g = ctx.createGain();
  envelope(g.gain, t, gain, attack, dur, hold);
  src.connect(flt).connect(g).connect(out);
  src.start(t, Math.random() * (src.buffer.duration - 0.1));
  src.stop(t + dur + 0.05);
}

/** An oscillator with a pitch sweep, optional vibrato (`vib` Hz deep at `vibRate`) and filter. */
function tone(out, t, { type = 'sine', f = 440, to = f, mid, dur = 0.2, gain = 0.2, attack = 0.005, hold = 0, vib = 0, vibRate = 6, filter }) {
  const o = ctx.createOscillator();
  o.type = type;
  sweep(o.frequency, t, f, to, dur, mid);
  if (vib) {
    const lfo = ctx.createOscillator(), depth = ctx.createGain();
    lfo.frequency.value = vibRate;
    depth.gain.value = vib;
    lfo.connect(depth).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  const g = ctx.createGain();
  envelope(g.gain, t, gain, attack, dur, hold);
  let node = o;
  if (filter) {
    const flt = ctx.createBiquadFilter();
    flt.type = filter.type || 'lowpass';
    flt.Q.value = filter.q ?? 1;
    sweep(flt.frequency, t, filter.f, filter.to ?? filter.f, dur, filter.mid);
    node = o.connect(flt);
  }
  node.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** The low end of anything heavy: a sine that drops fast. */
const thump = (out, t, f, dur, gain) => tone(out, t, { f, to: f * 0.3, dur, gain, attack: 0.003 });

/** Falling debris after a blast: a few random ticks. */
function crackle(out, t, count, span, gain) {
  for (let i = 0; i < count; i++) {
    noise(out, t + 0.05 + Math.random() * span, { dur: 0.03 + Math.random() * 0.05, type: 'highpass', f: 1800 + Math.random() * 3000, gain: gain * (0.4 + Math.random() * 0.6) });
  }
}

/** Notes for jingles: a soft brass, saw through a closing filter. */
function brass(out, t, freq, dur, gain) {
  for (const d of [-5, 6]) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = d;
    f.type = 'lowpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(freq * 1.5, t);
    f.frequency.exponentialRampToValueAtTime(freq * 5, t + 0.05);
    f.frequency.exponentialRampToValueAtTime(freq * 2, t + dur);
    envelope(g.gain, t, gain, 0.02, dur, dur * 0.45);
    o.connect(f).connect(g).connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }
}

const hz = (semitones, base = 220) => base * 2 ** (semitones / 12);

/* ---------- the sounds ---------- */

export const sfx = {
  resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); },
  setEnabled(v) {
    enabled = !!v;
    remember();
    if (ctx) master.gain.setTargetAtTime(enabled ? LEVEL.master : 0, ctx.currentTime, 0.03);
    if (!enabled) globalThis.speechSynthesis?.cancel?.();
  },
  isEnabled: () => enabled,
  setMusic(v) {
    musicOn = !!v;
    remember();
    if (ctx) musicBus.gain.setTargetAtTime(musicOn ? LEVEL.music : 0, ctx.currentTime, 0.25);
  },
  musicEnabled: () => musicOn,

  /** Where the camera is looking. Call a few times a second. */
  listen(x, z, yaw, dist) { listener.x = x; listener.z = z; listener.yaw = yaw; listener.dist = dist; listener.set = true; },
  /** The entity whose update is running; sounds without a position come from it. */
  from(entity) { emitter = entity || null; },
  emitter: () => emitter,
  /** Peak level at the output right now (0 to 1), and how many sounds are in flight. For tests. */
  level() {
    if (!ctx) return 0;
    analyser.getFloatTimeDomainData(meter);
    let peak = 0;
    for (let i = 0; i < meter.length; i++) peak = Math.max(peak, Math.abs(meter[i]));
    return peak;
  },
  state: () => (ctx ? ctx.state : 'none'),

  /* ----- weapons ----- */

  /** Trooper rifle: a short burst, each round a crack, a body and a punch. */
  gauss(at) {
    play('gauss', at, (o, t) => {
      const p = vary(0.09), rounds = live.length > 18 ? 2 : 3;
      for (let i = 0; i < rounds; i++) {
        const s = t + i * 0.056;
        noise(o, s, { dur: 0.04, type: 'highpass', f: 2600 * p, gain: 0.3 });
        noise(o, s, { dur: 0.085, f: 1150 * p, to: 480, q: 0.9, gain: 0.34 });
        tone(o, s, { type: 'triangle', f: 215 * p, to: 68, dur: 0.07, gain: 0.3, attack: 0.002 });
      }
      noise(o, t + 0.14, { dur: 0.24, f: 700, to: 260, q: 0.5, gain: 0.05, attack: 0.02 });
    }, { gap: 0.07, spam: true, level: 0.8, wet: 0.2, length: 0.3 });
  },
  /** Hammer main guns. */
  cannon(at) {
    play('cannon', at, (o, t) => {
      const p = vary(0.06);
      noise(o, t, { dur: 0.05, type: 'highpass', f: 1700, gain: 0.5 });
      thump(o, t, 128 * p, 0.6, 0.9);
      noise(o, t, { dur: 0.5, type: 'lowpass', f: 1100, to: 110, q: 0.6, gain: 0.7, color: 'brown' });
      noise(o, t + 0.05, { dur: 1.1, type: 'lowpass', f: 480, to: 90, gain: 0.16, attack: 0.05 });
    }, { gap: 0.09, level: 1, wet: 0.42, length: 1.1 });
  },
  /** Atlas rocket pods: ignition, then the whoosh away. */
  rocket(at) {
    play('rocket', at, (o, t) => {
      const p = vary(0.1);
      noise(o, t, { dur: 0.05, type: 'lowpass', f: 900, gain: 0.4 });
      for (const s of [0, 0.07]) {
        noise(o, t + s, { dur: 0.42, f: 520 * p, to: 900, mid: [0.45, 2700 * p], q: 0.9, gain: 0.3, attack: 0.07 });
      }
      tone(o, t, { type: 'sawtooth', f: 150, to: 70, mid: [0.3, 320], dur: 0.4, gain: 0.07, filter: { f: 900 } });
    }, { gap: 0.09, spam: true, level: 0.8, wet: 0.25, length: 0.5 });
  },
  /** Spectre: one very loud crack with a long way to travel. */
  snipe(at) {
    play('snipe', at, (o, t) => {
      noise(o, t, { dur: 0.035, type: 'highpass', f: 3000, gain: 0.8 });
      tone(o, t, { type: 'square', f: 1100, to: 110, dur: 0.11, gain: 0.2, filter: { f: 3000, to: 500 } });
      thump(o, t, 120, 0.3, 0.5);
      noise(o, t + 0.04, { dur: 1.0, type: 'lowpass', f: 1700, to: 260, gain: 0.12, attack: 0.03 });
    }, { gap: 0.06, level: 0.9, wet: 0.6, length: 1 });
  },
  /** Torch: called repeatedly while it burns; the calls overlap into one roar. */
  flame(at) {
    play('flame', at, (o, t) => {
      noise(o, t, { dur: 0.55, f: 520 * vary(0.2), to: 380, q: 0.6, gain: 0.4, attack: 0.08, hold: 0.2, color: 'brown' });
      noise(o, t, { dur: 0.5, type: 'highpass', f: 2800, gain: 0.06, attack: 0.1, hold: 0.15 });
      noise(o, t, { dur: 0.3, f: 1400, to: 700, q: 2, gain: 0.07 * Math.random(), attack: 0.05 });
    }, { gap: 0.2, level: 0.8, wet: 0.1, length: 0.5 });
  },
  heal(at) {
    play('heal', at, (o, t) => {
      tone(o, t, { f: 880, dur: 0.4, gain: 0.05, attack: 0.05 });
      tone(o, t + 0.06, { f: 1320, dur: 0.4, gain: 0.04, attack: 0.05 });
      noise(o, t, { dur: 0.25, type: 'highpass', f: 6000, gain: 0.012, attack: 0.08 });
    }, { gap: 0.3, level: 0.9, wet: 0.3, length: 0.4 });
  },
  /** Relay laser: a long charged beam. */
  laser(at) {
    play('laser', at, (o, t) => {
      tone(o, t, { type: 'sawtooth', f: 2400, to: 140, dur: 0.7, gain: 0.3, filter: { type: 'bandpass', f: 3000, to: 400, q: 2 } });
      tone(o, t, { type: 'square', f: 98, dur: 0.8, gain: 0.25, vib: 14, vibRate: 31, filter: { f: 1200, to: 300 } });
      noise(o, t, { dur: 0.6, type: 'highpass', f: 2500, to: 900, gain: 0.25 });
      thump(o, t, 90, 0.7, 0.8);
    }, { level: 1, wet: 0.5, length: 1 });
  },
  /** Titan main gun. */
  yamatoCharge(at) {
    play('yamatoCharge', at, (o, t) => {
      tone(o, t, { f: 70, to: 1000, dur: 1.45, gain: 0.2, attack: 0.4, vib: 9, vibRate: 22 });
      tone(o, t, { type: 'triangle', f: 105, to: 1500, dur: 1.4, gain: 0.09, attack: 0.5 });
      noise(o, t, { dur: 1.45, type: 'highpass', f: 800, to: 6000, gain: 0.09, attack: 1.2 });
    }, { level: 1, wet: 0.3, length: 1.5 });
  },
  yamatoFire(at) {
    play('yamatoFire', at, (o, t) => {
      noise(o, t, { dur: 0.06, type: 'highpass', f: 1500, gain: 0.7 });
      thump(o, t, 95, 1.1, 1);
      noise(o, t, { dur: 0.9, type: 'lowpass', f: 3200, to: 90, gain: 0.8, color: 'brown' });
      tone(o, t, { type: 'sawtooth', f: 330, to: 38, dur: 0.7, gain: 0.25, filter: { f: 2400, to: 200 } });
      crackle(o, t + 0.1, 6, 0.5, 0.15);
    }, { level: 1, wet: 0.6, length: 1.4 });
  },
  /** Air strike: the bombers go over. */
  airstrike(at) {
    play('airstrike', at, (o, t) => {
      noise(o, t, { dur: 1.7, f: 380, to: 260, mid: [0.5, 1900], q: 1.4, gain: 0.5, attack: 0.7 });
      tone(o, t, { type: 'sawtooth', f: 520, to: 170, mid: [0.5, 610], dur: 1.6, gain: 0.08, attack: 0.6, filter: { f: 1800 } });
      noise(o, t, { dur: 1.7, type: 'lowpass', f: 200, gain: 0.25, attack: 0.8, color: 'brown' });
    }, { level: 1, wet: 0.4, length: 1.7 });
  },
  airstrikeDrop(at) {
    play('airstrikeDrop', at, (o, t) => {
      tone(o, t, { f: 1900 * vary(0.08), to: 520, dur: 0.5, gain: 0.07, attack: 0.05, vib: 20, vibRate: 9 });
    }, { gap: 0.08, level: 0.8, wet: 0.3, length: 0.5 });
  },

  /* ----- things getting hit ----- */

  /** Round on armour or plasteel. */
  impact(at) {
    play('impact', at, (o, t) => {
      const p = vary(0.2);
      noise(o, t, { dur: 0.035, f: 3300 * p, q: 3.5, gain: 0.3 });
      tone(o, t, { type: 'triangle', f: 950 * p, to: 380, dur: 0.05, gain: 0.08, attack: 0.002 });
    }, { gap: 0.06, spam: true, level: 0.7, length: 0.1 });
  },
  /** Something soft and alien getting hit. */
  hitFlesh(at) {
    play('hitFlesh', at, (o, t) => {
      const p = vary(0.2);
      noise(o, t, { dur: 0.13, type: 'lowpass', f: 950 * p, to: 180, q: 3, gain: 0.42 });
      tone(o, t, { f: 230 * p, to: 75, dur: 0.11, gain: 0.14 });
    }, { gap: 0.07, spam: true, level: 0.75, length: 0.15 });
  },
  /** Shell or bomb going off. */
  cannonHit(at) {
    play('cannonHit', at, (o, t) => {
      const p = vary(0.12);
      thump(o, t, 105 * p, 0.5, 0.9);
      noise(o, t, { dur: 0.65, type: 'lowpass', f: 2400 * p, to: 130, q: 0.5, gain: 0.7, color: 'brown' });
      noise(o, t, { dur: 0.12, f: 1400, to: 500, gain: 0.3 });
      crackle(o, t, 4, 0.35, 0.12);
    }, { gap: 0.07, level: 1, wet: 0.4, length: 0.8 });
  },
  /** A unit of ours goes down: armour hits the ground, the radio cuts to static. */
  marineDown(at) {
    play('marineDown', at, (o, t) => {
      thump(o, t, 150, 0.32, 0.6);
      noise(o, t, { dur: 0.1, f: 2400, q: 2.5, gain: 0.25 });
      tone(o, t + 0.03, { type: 'triangle', f: 640, to: 420, dur: 0.12, gain: 0.07 });
      for (let i = 0; i < 4; i++) noise(o, t + 0.12 + i * 0.07 * vary(0.3), { dur: 0.05, f: 2200, q: 1.5, gain: 0.14 });
    }, { gap: 0.1, level: 0.9, wet: 0.25, length: 0.5 });
  },

  /* ----- the swarm ----- */

  /** A bug's attack shriek: two rough voices through a mouth that closes. */
  screech(at) {
    play('screech', at, (o, t) => {
      const p = vary(0.22), dur = 0.34 * vary(0.2);
      const mouth = { type: 'bandpass', f: 1300 * p, to: 800 * p, mid: [0.3, 2300 * p], q: 3 };
      tone(o, t, { type: 'sawtooth', f: 620 * p, to: 260 * p, mid: [0.22, 1180 * p], dur, gain: 0.3, vib: 70, vibRate: 34, filter: mouth });
      tone(o, t + 0.015, { type: 'sawtooth', f: 930 * p, to: 330 * p, mid: [0.25, 1700 * p], dur: dur * 0.9, gain: 0.18, vib: 110, vibRate: 47, filter: mouth });
      noise(o, t, { dur: dur * 0.8, type: 'highpass', f: 2600, gain: 0.09, attack: 0.03 });
    }, { gap: 0.11, spam: true, level: 0.75, wet: 0.3, length: 0.4 });
  },
  /** Skittering: the sound of a lot of legs. The ambience layer plays it near the camera. */
  chitter(at) {
    play('chitter', at, (o, t) => {
      const p = vary(0.3), n = 3 + ((Math.random() * 4) | 0);
      let s = t;
      for (let i = 0; i < n; i++) {
        noise(o, s, { dur: 0.018, f: 2600 * p * vary(0.2), q: 6, gain: 0.25 });
        s += 0.028 + Math.random() * 0.03;
      }
    }, { gap: 0.12, spam: true, level: 0.45, wet: 0.25, length: 0.3 });
  },
  /** Needler spine leaving. */
  spine(at) {
    play('spine', at, (o, t) => {
      const p = vary(0.15);
      noise(o, t, { dur: 0.07, f: 2800 * p, to: 6500, q: 2, gain: 0.25 });
      tone(o, t, { type: 'triangle', f: 1700 * p, to: 480, dur: 0.06, gain: 0.06 });
    }, { gap: 0.07, spam: true, level: 0.7, length: 0.1 });
  },
  /** Behemoth blade. */
  ultraliskSlash(at) {
    play('slash', at, (o, t) => {
      noise(o, t, { dur: 0.2, f: 700, to: 500, mid: [0.5, 3200], q: 1.4, gain: 0.5, attack: 0.04 });
      thump(o, t + 0.12, 120, 0.4, 0.8);
      tone(o, t, { type: 'sawtooth', f: 95, to: 48, dur: 0.5, gain: 0.25, vib: 12, vibRate: 26, filter: { f: 700 } });
    }, { gap: 0.1, level: 1, wet: 0.35, length: 0.6 });
  },
  /** The ground moving before a Tunnel Maw. */
  rumble(at) {
    play('rumble', at, (o, t) => {
      noise(o, t, { dur: 1.4, type: 'lowpass', f: 130, to: 60, q: 1.2, gain: 0.9, attack: 0.25, hold: 0.5, color: 'brown' });
      tone(o, t, { f: 44, to: 33, dur: 1.4, gain: 0.3, attack: 0.3, vib: 4, vibRate: 11 });
      crackle(o, t + 0.2, 5, 0.9, 0.06);
    }, { gap: 0.3, level: 1, wet: 0.2, length: 1.4 });
  },
  mawErupt(at) {
    play('mawErupt', at, (o, t) => {
      thump(o, t, 110, 0.6, 1);
      noise(o, t, { dur: 0.6, type: 'lowpass', f: 1800, to: 140, gain: 0.8, color: 'brown' });
      tone(o, t + 0.05, { type: 'sawtooth', f: 70, to: 58, mid: [0.35, 190], dur: 0.7, gain: 0.3, vib: 18, vibRate: 21, filter: { type: 'bandpass', f: 500, to: 300, mid: [0.3, 1100], q: 2 } });
      crackle(o, t + 0.1, 7, 0.6, 0.14);
    }, { level: 1, wet: 0.4, length: 1 });
  },
  gulp(at) {
    play('gulp', at, (o, t) => {
      tone(o, t, { f: 270, to: 62, dur: 0.24, gain: 0.3 });
      tone(o, t + 0.16, { f: 150, to: 44, dur: 0.3, gain: 0.3 });
      noise(o, t, { dur: 0.3, type: 'lowpass', f: 420, to: 120, q: 4, gain: 0.3 });
    }, { level: 1, wet: 0.2, length: 0.5 });
  },
  /** Something very large announcing itself. */
  horn(at) {
    play('horn', at, (o, t) => {
      for (const f of [55, 82.4, 110.6]) {
        tone(o, t, { type: 'sawtooth', f, to: f * 0.94, dur: 2.4, gain: 0.22, attack: 0.35, hold: 1.2, vib: 1.5, vibRate: 5, filter: { f: 320, to: 260, mid: [0.4, 900], q: 2 } });
      }
      noise(o, t, { dur: 2.2, type: 'lowpass', f: 180, gain: 0.25, attack: 0.5, hold: 0.8, color: 'brown' });
    }, { gap: 2, level: 1, wet: 0.6, length: 2.4 });
  },

  /* ----- building, orders, interface ----- */

  /** Hardware dropping into place: clunk, servo, confirm. */
  place(at) {
    play('place', at, (o, t) => {
      thump(o, t, 170, 0.12, 0.45);
      noise(o, t, { dur: 0.05, f: 1900, q: 2, gain: 0.2 });
      tone(o, t + 0.04, { type: 'sawtooth', f: 280, to: 720, dur: 0.1, gain: 0.05, filter: { f: 1600 } });
      tone(o, t + 0.13, { type: 'triangle', f: 1180, dur: 0.07, gain: 0.07 });
    }, { gap: 0.04, level: 0.9, wet: 0.12, length: 0.25 });
  },
  ui() {
    play('ui', null, (o, t) => {
      noise(o, t, { dur: 0.012, type: 'highpass', f: 4200, gain: 0.1 });
      tone(o, t, { f: 1080, to: 1480, dur: 0.04, gain: 0.07, attack: 0.002 });
    }, { gap: 0.03, wet: 0.04, length: 0.05 });
  },
  /** A unit picked. */
  select() {
    play('select', null, (o, t) => {
      tone(o, t, { type: 'triangle', f: 760, to: 940, dur: 0.05, gain: 0.07, attack: 0.002 });
      noise(o, t, { dur: 0.01, type: 'highpass', f: 5000, gain: 0.05 });
    }, { gap: 0.05, wet: 0.04, length: 0.06 });
  },
  /** An order given: `attack` is the sharper of the two. */
  order(kind) {
    play('order', null, (o, t) => {
      const [a, b] = kind === 'attack' ? [660, 520] : [880, 1320];
      tone(o, t, { type: 'square', f: a, dur: 0.045, gain: 0.05, filter: { f: 2400 } });
      tone(o, t + 0.055, { type: 'square', f: b, dur: 0.06, gain: 0.05, filter: { f: 2400 } });
    }, { gap: 0.05, wet: 0.05, length: 0.12 });
  },
  deny() {
    play('deny', null, (o, t) => {
      for (const s of [0, 0.1]) tone(o, t + s, { type: 'square', f: 150, to: 128, dur: 0.075, gain: 0.14, filter: { f: 900 } });
    }, { gap: 0.12, wet: 0.04, length: 0.2 });
  },
  /** Research or a promotion landing: power coming up, then a chord. */
  upgrade(at) {
    play('upgrade', at, (o, t) => {
      tone(o, t, { type: 'sawtooth', f: 110, to: 660, dur: 0.5, gain: 0.1, attack: 0.1, filter: { f: 300, to: 2600 } });
      [0, 4, 7, 12].forEach((n, i) => brass(o, t + 0.3 + i * 0.05, hz(n, 392), 0.5, 0.06));
      noise(o, t + 0.3, { dur: 0.5, type: 'highpass', f: 5000, gain: 0.03, attack: 0.05 });
    }, { gap: 0.2, level: 1, wet: 0.3, length: 0.9 });
  },
  /** Something new is available: four rising notes. */
  unlock() {
    play('unlock', null, (o, t) => {
      [0, 5, 7, 12].forEach((n, i) => {
        brass(o, t + i * 0.1, hz(n, 330), i === 3 ? 0.6 : 0.16, 0.08);
        if (i === 3) brass(o, t + i * 0.1, hz(7, 330), 0.6, 0.05);
      });
    }, { gap: 0.3, wet: 0.3, length: 0.9 });
  },
  /** Kill streak tiers: a hit and a climbing figure, higher each tier. */
  streak(step = 0) {
    play('streak', null, (o, t) => {
      const base = hz(step * 2, 440);
      noise(o, t, { dur: 0.1, f: 1800, q: 0.8, gain: 0.2 });
      thump(o, t, 140, 0.15, 0.4);
      [0, 7, 12].forEach((n, i) => {
        tone(o, t + i * 0.06, { type: 'square', f: hz(n, base), dur: 0.14, gain: 0.07, filter: { f: 3200 } });
        tone(o, t + i * 0.06, { type: 'triangle', f: hz(n + 12, base), dur: 0.12, gain: 0.04 });
      });
    }, { gap: 0.2, wet: 0.25, length: 0.4 });
  },
  /** Supply crate coming down and landing. */
  drop(at) {
    play('drop', at, (o, t) => {
      tone(o, t, { type: 'triangle', f: 1400, to: 320, dur: 0.42, gain: 0.08, attack: 0.03 });
      thump(o, t + 0.42, 130, 0.2, 0.5);
      noise(o, t + 0.42, { dur: 0.1, f: 900, gain: 0.2 });
      tone(o, t + 0.6, { type: 'square', f: 880, dur: 0.07, gain: 0.05, filter: { f: 2600 } });
      tone(o, t + 0.72, { type: 'square', f: 880, dur: 0.07, gain: 0.05, filter: { f: 2600 } });
    }, { level: 1, wet: 0.3, length: 0.8 });
  },
  pickup(at) {
    play('pickup', at, (o, t) => {
      [784, 1046, 1318, 1568].forEach((f, i) => tone(o, t + i * 0.045, { type: 'triangle', f, dur: 0.14, gain: 0.09, attack: 0.003 }));
      noise(o, t + 0.1, { dur: 0.2, type: 'highpass', f: 6500, gain: 0.03 });
    }, { level: 1, wet: 0.2, length: 0.4 });
  },
  /** Klaxon: the swarm is coming. */
  alarm() {
    play('alarm', null, (o, t) => {
      for (let i = 0; i < 2; i++) {
        tone(o, t + i * 0.42, { type: 'sawtooth', f: 330, to: 330, mid: [0.5, 520], dur: 0.36, gain: 0.13, attack: 0.03, hold: 0.2, filter: { type: 'bandpass', f: 1100, q: 1.2 } });
        tone(o, t + i * 0.42, { type: 'square', f: 165, to: 165, mid: [0.5, 260], dur: 0.36, gain: 0.05, attack: 0.03, hold: 0.2, filter: { f: 800 } });
      }
    }, { gap: 0.5, wet: 0.45, length: 0.9 });
  },
  /** Countdown to the wave: three ticks and a long one. */
  countdown(n) {
    play('countdown', null, (o, t) => {
      if (n > 0) tone(o, t, { type: 'square', f: 660, dur: 0.09, gain: 0.07, filter: { f: 2200 } });
      else {
        tone(o, t, { type: 'square', f: 990, dur: 0.4, gain: 0.08, hold: 0.2, filter: { f: 2600 } });
        thump(o, t, 110, 0.4, 0.5);
      }
    }, { gap: 0.2, wet: 0.2, length: 0.4 });
  },
  /** Round held: a short fanfare over a drum. */
  victory() {
    play('victory', null, (o, t) => {
      [[0, 0], [0.14, 3], [0.28, 7], [0.5, 12]].forEach(([s, n], i) => brass(o, t + s, hz(n, 329.6), i === 3 ? 0.9 : 0.2, 0.09));
      brass(o, t + 0.5, hz(7, 329.6), 0.9, 0.06);
      brass(o, t + 0.5, hz(3, 329.6), 0.9, 0.05);
      thump(o, t, 100, 0.3, 0.5);
      thump(o, t + 0.5, 82, 0.5, 0.6);
      noise(o, t + 0.5, { dur: 0.7, type: 'highpass', f: 5000, gain: 0.04 });
    }, { gap: 0.5, wet: 0.4, length: 1.5 });
  },
  /** The relay is gone: the brass falls, and the ground with it. */
  defeat() {
    play('defeat', null, (o, t) => {
      [[0, 12], [0.4, 8], [0.8, 7], [1.3, 0]].forEach(([s, n], i) => brass(o, t + s, hz(n, 164.8), i === 3 ? 2 : 0.5, 0.1));
      brass(o, t + 1.3, hz(-12, 164.8), 2, 0.1);
      thump(o, t, 80, 1.2, 0.9);
      noise(o, t, { dur: 2.2, type: 'lowpass', f: 2500, to: 80, gain: 0.5, color: 'brown' });
      crackle(o, t + 0.2, 8, 1.2, 0.12);
    }, { wet: 0.6, length: 3.3 });
  }
};
