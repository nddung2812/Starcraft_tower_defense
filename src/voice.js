/*
 * Radio voices.
 *
 * Every unit type has its own speaker and its own lines for being built, selected, moved and sent
 * to attack; Ember Control is the outpost's dispatcher and calls out what is happening to the base.
 * The words below are the single source: `tools/voice/build.mjs` renders them to one audio sprite
 * per speaker in `assets/voice/`, and at run time each clip is played through a radio chain
 * (band-pass, drive, squelch, a little cockpit noise) so no two units sound alike.
 *
 * Without the clips (a missing folder, a failed download) the same lines fall back to the
 * browser's speech synthesis, which is how the game sounded before. Nothing here may touch
 * `window` at import time: the build tool imports this file from Node.
 */
import { audioGraph, sfx } from './audio.js';

/*
 * `model`/`speaker`/`length` are for the build tool (a Piper voice, a speaker inside it, speaking
 * rate). `rate`, `band`, `drive`, `bed` shape the radio at run time. `tts` is the fallback voice.
 */
export const SPEAKERS = {
  control: { name: 'Ember Control', model: 'en_GB-cori-high', length: 0.98, rate: 1, band: [240, 4200], drive: 1.6, gain: 1.05, wet: 0.1, tts: { pitch: 1.15, rate: 1.02, female: true } },
  trooper: { name: 'Trooper', model: 'en_US-norman-medium', length: 0.9, rate: 1, band: [330, 3300], drive: 3.2, tts: { pitch: 0.82, rate: 1.08 } },
  trooperB: { name: 'Trooper', model: 'en_US-bryce-medium', length: 0.9, rate: 0.97, band: [360, 3100], drive: 3.6, tts: { pitch: 0.95, rate: 1.1 } },
  atlas: { name: 'Atlas', model: 'en_US-joe-medium', length: 0.98, rate: 0.93, band: [260, 2700], drive: 4.2, bed: 'servo', tts: { pitch: 0.6, rate: 0.95 } },
  hammer: { name: 'Hammer', model: 'en_GB-vctk-medium', speaker: 'p326', length: 1.02, rate: 0.95, band: [220, 2500], drive: 4.6, bed: 'engine', tts: { pitch: 0.5, rate: 0.9 } },
  vector: { name: 'Vector', model: 'en_US-kristin-medium', length: 0.9, rate: 1.03, band: [420, 3600], drive: 2.8, bed: 'wind', tts: { pitch: 1.25, rate: 1.12, female: true } },
  torch: { name: 'Torch', model: 'en_GB-vctk-medium', speaker: 'p255', length: 0.86, rate: 1.04, band: [380, 3400], drive: 3.8, bed: 'hiss', tts: { pitch: 1.05, rate: 1.2 } },
  spectre: { name: 'Spectre', model: 'en_GB-vctk-medium', speaker: 'p262', length: 1.08, rate: 0.97, band: [300, 3900], drive: 1.8, gain: 0.9, wet: 0.2, tts: { pitch: 1.0, rate: 0.9, female: true } },
  medic: { name: 'Medic', model: 'en_GB-vctk-medium', speaker: 'p225', length: 0.95, rate: 1, band: [320, 3800], drive: 2.2, tts: { pitch: 1.3, rate: 1.05, female: true } },
  rig: { name: 'Patch Rig', model: 'en_GB-vctk-medium', speaker: 'p245', length: 0.94, rate: 1, band: [300, 3000], drive: 3.4, bed: 'engine', tts: { pitch: 0.9, rate: 1.05 } },
  titan: { name: 'Titan', model: 'en_US-john-medium', length: 1.1, rate: 0.92, band: [200, 3000], drive: 2.4, wet: 0.3, bed: 'bridge', tts: { pitch: 0.55, rate: 0.85 } }
};

/* Original lines. Keep them short: an acknowledgement should be over within about a second. */
const TROOPER = {
  ready: ['Trooper on the wall!', 'Locked, loaded, and scared stiff.', 'Point me at something!'],
  select: ['Talk to me, Commander!', 'Twenty-Nine, still standing.', 'Make it quick!', "Rifle's hot, sir.", 'Still breathing, sir.', "What's the order?", 'Yes, sir!'],
  move: ['Moving, moving!', 'On my way!', 'Shifting, cover me!', 'Double time, people!', 'On the move!', 'Got it, boss!'],
  attack: ['Light them up!', 'Open fire! Open fire!', 'Eat this, you ugly bastards!', 'Keep shooting!', 'Contact front!', "Don't let them through!"],
  garrison: ['Get inside! Get inside!', 'Bunker! Seal it behind me!'],
  stim: ['Oh, that is the good stuff!', 'My heart is pounding! Let us go!'],
  hit: ['Taking hits!', "It's got my leg!", 'Somebody help me!', 'Get it off me!'],
  down: ['Man down, man down!', "We're losing people!", 'They got him! They got him!'],
  kill: ['Got one!', 'Stay dead!', 'Scratch one bug!', "Who's next?", 'How do you like that?'],
  breach: ["They're through the wall! Fall back and shoot!", 'They broke the line! Close it up!', "They're everywhere!"],
  contact: ['Movement! Movement in the canyon!', 'Here they come!', 'Oh no. Look at them all.', 'Bugs! Hundreds of them!'],
  poke: ['Sir, there are bugs out there.', 'I signed up for the free boots.', "Keep tapping, I'll shoot the screen.", 'My mother said to be a dentist.']
};

export const LINES = {
  trooper: TROOPER,
  trooperB: TROOPER,
  atlas: {
    ready: ['Atlas walker, online and angry.', 'Big guns have arrived.'],
    select: ['Atlas here. Talk fast.', 'Pods are loaded.', 'Reactor is running hot.', 'Pilot on the line.'],
    move: ['Walker moving!', 'Stomping through!', 'Clear the road, little guys!', 'Legs are cycling.'],
    attack: ['Rockets away!', 'Full salvo! Full salvo!', 'Special delivery, you freaks!', 'Pods hot! Fire!'],
    hit: ["They're climbing my legs!", 'Hull is cracking!'],
    poke: ['These legs cost more than your whole family.', 'Quit poking the walker, sir.']
  },
  hammer: {
    ready: ['Hammer on station. Heavy armor is here.', 'Tank crew reporting for the party.'],
    select: ['Hammer here.', 'Gun is loaded and level.', 'Give me a target.', 'Both barrels, sir.'],
    move: ['Rolling!', 'Treads turning!', 'Hammer moving up!', 'Over the ridge we go!'],
    attack: ['Drop the hammer!', 'Shot out! Reload!', 'On the way! Stand clear!', 'Flatten them!'],
    hit: ['Armor is holding. For now.', "They're chewing on the treads!"],
    poke: ['Easy on the paint, sir.', 'This is a tank, not a doorbell.']
  },
  vector: {
    ready: ['Vector airborne. Sky is ours.', 'Wheels up, guns hot.'],
    select: ['Vector on station.', 'Eyes in the sky.', 'Go for Vector.', "Talk to me, ground."],
    move: ['Banking hard!', 'Vector inbound!', 'Coming around!', 'Hold on to your stomach!'],
    attack: ['Guns! Guns! Guns!', 'Strafing run, keep your heads down!', 'Tally target! Firing!', 'Diving on them!'],
    hit: ["I'm taking hits up here!", 'Warning lights everywhere!'],
    poke: ["Fuel isn't free, Commander.", "Keep circling and I'll lose my lunch."]
  },
  torch: {
    ready: ['Torch is lit! Who ordered barbecue?', "Who's cold?"],
    select: ['Pilot light is on.', 'What needs burning?', 'Tank is full, sir.', 'Smells like victory. And hair.'],
    move: ['Bringing the heat!', 'Hot stuff coming through!', 'Walking the fire!'],
    attack: ['Burn them all!', 'Fry, you crawling horrors!', 'Light them up! Ha ha!', 'Cook them where they stand!'],
    hit: ["Watch the fuel line! Watch the fuel line!", "They're biting!"],
    poke: ["Don't stand so close, sir.", "I smell smoke. Oh. That's me."]
  },
  spectre: {
    ready: ['Spectre in position.', "They won't see me coming."],
    select: ['Watching.', 'Scope is clear.', 'Whisper it.', 'One breath.'],
    move: ['Relocating.', 'Finding a new perch.', 'Quietly now.'],
    attack: ['One shot.', 'Exhale. Fire.', 'Big one. Good.', 'Target down range.'],
    hit: ["They found me! They found me!", "I'm exposed!"],
    poke: ["You're giving away my position.", 'Shh.']
  },
  medic: {
    ready: ['Medic on the line! Who is bleeding?', "Kit's packed. Try not to need it."],
    select: ['Medic here!', 'Hands are steady.', 'Who needs me?', 'Stay with me, people!'],
    move: ['Coming to you! Hang on!', 'Medic moving up!', 'Keep pressure on it!'],
    attack: ["I don't carry a gun, sir!", 'I patch them, you shoot them!'],
    hit: ["Medic's hit!", "I can't treat myself!"],
    poke: ["That doesn't hurt. I checked.", 'Take two of these and stop clicking me.']
  },
  rig: {
    select: ['Patch Rig here.', 'Wrench is ready.', "What's broken now?", 'Go on, then.'],
    move: ['Rolling out!', 'On the way!', 'Hauling it!'],
    repair: ['Welding!', 'Hold still, wall.', 'Sealing it up!', 'Patching the line!'],
    revive: ['Up you get, soldier!', 'On your feet! Back to the wall!'],
    hit: ["Hey! I'm the one who fixes things!"],
    poke: ["I fix things. I don't fix that.", 'Overtime starts now.']
  },
  titan: {
    ready: ['Titan on station. All batteries standing by.'],
    select: ['Titan actual.', 'Bridge here.', 'All decks report ready.', 'Captain speaking.'],
    move: ['Helm, bring us about.', 'Ahead full.', 'New heading, aye.'],
    attack: ['All batteries, fire!', 'Bring the main gun to bear!', 'Broadside! Now!'],
    hit: ['Hull breach on the lower decks!', 'Damage control, report!'],
    poke: ['The bridge is not a toy, Commander.']
  },
  control: {
    welcome: ['Commander on deck. Outpost Twenty-Nine is yours. God help you.'],
    wave: ['Swarm inbound! All hands, stand to!', 'Here they come, Twenty-Nine! Man the walls!'],
    baseHit: ['The relay is taking hits!', "They've reached the relay! Get units back there, now!", 'Relay under attack! We cannot lose it!'],
    unitsHit: ['Your troops are under attack!', 'Contact on the line! Troops taking casualties!'],
    minerals: ['Minerals are short, Commander.', "We can't afford that yet.", 'Not enough in the stores, Commander.'],
    researchStart: ['Relay research underway.'],
    researchDone: ['Research finished. The relay is stronger.', 'Relay upgrade complete.'],
    armory: ['Armory upgrade unlocked.', 'New gear for the troops.'],
    unitUnlocked: ['New unit cleared for deployment.', 'Specialist available. Check your build bar.'],
    boss: ['Massive contact! Something huge is coming!', 'Seismic spike! Brace, Twenty-Nine, brace!'],
    bossDown: ['The big one is down! Beautiful work!', 'Target destroyed! They felt that one!'],
    cleared: ['Round held. The convoy is away.', 'Canyon is clear. Well done, Twenty-Nine.', "That's another convoy out. Reset the line."],
    raid: ['The hives are exposed! Push out and burn them!', 'The swarm is spent! Hit the hives, now!'],
    supply: ['Supply drop inbound.', 'Crate on the ground. Grab it.'],
    laser: ['Relay laser charged.', 'Laser is ready to fire.'],
    strike: ['Strike inbound! Danger close!', 'Bombers on approach! Heads down!'],
    strikeReady: ['Air strike available.'],
    maw: ['Tunnelling under your position! Keep your units moving!'],
    mawTook: ['The Maw took one of ours!', "We've lost a unit underground!"],
    mawFreed: ['Unit recovered from the Maw.'],
    behemoth: ['Behemoth on the field! Focus your fire!'],
    streak: ["They're breaking! Keep firing!", 'Superb shooting, Twenty-Nine!', "They can't get near you!"],
    evolved: ['Evolution installed.'],
    treasure: ['Salvage recovered. Upgrades applied.'],
    redeploy: ['Army redeployed.'],
    defeat: ['Outpost Twenty-Nine has fallen.', "We've lost the relay. God rest you, Twenty-Nine. Ember Control, out."]
  }
};

/** Which speaker answers for a unit kind. Troopers alternate between two voices. */
const KIND_SPEAKER = {
  marine: 'trooper', goliath: 'atlas', tank: 'hammer', falcon: 'vector', cruiser: 'titan',
  scorcher: 'torch', deadeye: 'spectre', mender: 'medic', scv: 'rig'
};
/** Ids the game has always used with `voice.say()`, and the line they mean now. */
const LEGACY = { acquired: 'attack' };
const RIG_LINES = new Set(['repair', 'revive']);
const ALERTS = new Set(['hit', 'down', 'kill', 'breach', 'contact', 'revive', 'stim']);
const PRIORITY = { ack: 1, alert: 2, control: 3 };
/** Least seconds between two lines of the same kind from the same speaker. */
const GAP = {
  hit: 7, kill: 9, down: 5, stim: 3, breach: 2, contact: 2, revive: 2,
  baseHit: 14, unitsHit: 30, minerals: 4, supply: 45, laser: 30, strikeReady: 60, streak: 20, mawTook: 8
};
const MANIFEST = 'assets/voice/manifest.json';
const POKE = { taps: 4, window: 5 };

const trooperVoice = new WeakMap();
let trooperTurn = 0;
let unlocked = false;
let voiceOn = true;
let manifest = null;
let manifestState = 'idle';      // idle | loading | ready | missing
const sprites = {};              // speaker -> { state: 'loading' | 'ready' | 'failed', buffer }
let current = null;
const queue = [];
const lastSaid = {};
const lastIndex = {};
const history = [];
let poke = { unit: null, n: 0, t: 0 };
let curveCache = {};

const clock = () => performance.now() / 1000;

function speakerFor(who) {
  if (!who) return null;
  if (typeof who === 'string') return SPEAKERS[who] ? who : KIND_SPEAKER[who] || null;
  const base = KIND_SPEAKER[who.kind];
  if (base !== 'trooper') return base || null;
  if (!trooperVoice.has(who)) trooperVoice.set(who, trooperTurn++ % 2 ? 'trooperB' : 'trooper');
  return trooperVoice.get(who);
}

/* ---------- loading ---------- */

function loadManifest() {
  if (manifestState !== 'idle' || typeof fetch !== 'function') return;
  manifestState = 'loading';
  fetch(MANIFEST).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`voice manifest ${r.status}`))))
    .then((data) => {
      if (!data?.speakers) throw new Error('voice manifest has no speakers');
      manifest = data;
      manifestState = 'ready';
      // Dispatcher and infantry first, then the rest in the background.
      const order = ['control', 'trooper', 'trooperB', 'rig', ...Object.keys(data.speakers)];
      [...new Set(order)].reduce((p, id) => p.then(() => loadSprite(id)), Promise.resolve());
    })
    .catch(() => { manifestState = 'missing'; });
}

function loadSprite(id) {
  const entry = manifest?.speakers?.[id];
  if (!entry) return Promise.resolve(null);
  if (sprites[id]) return sprites[id].promise;
  const graph = audioGraph();
  if (!graph) return Promise.resolve(null);
  const sprite = sprites[id] = { state: 'loading', buffer: null, promise: null };
  sprite.promise = fetch(`assets/voice/${entry.file}`)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`voice sprite ${r.status}`))))
    .then((bytes) => new Promise((ok, fail) => graph.ctx.decodeAudioData(bytes, ok, fail)))
    .then((buffer) => { sprite.buffer = buffer; sprite.state = 'ready'; return sprite; })
    .catch(() => { sprite.state = 'failed'; return null; });
  return sprite.promise;
}

/* ---------- choosing a line ---------- */

function choose(speaker, id, text) {
  const lines = LINES[speaker]?.[id];
  if (text == null && !lines?.length) return null;
  let index = -1;
  if (text == null) {
    const key = `${speaker}:${id}`;
    index = (Math.random() * lines.length) | 0;
    if (lines.length > 1 && index === lastIndex[key]) index = (index + 1) % lines.length;
    lastIndex[key] = index;
    text = lines[index];
  }
  const clips = manifest?.speakers?.[speaker]?.clips?.[id];
  const clip = clips?.find((c) => c[2] === text) || null;
  return { speaker, id, text, clip };
}

/* ---------- the radio ---------- */

function driveCurve(amount) {
  if (curveCache[amount]) return curveCache[amount];
  const n = 1024, curve = new Float32Array(n);
  const norm = Math.tanh(amount);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh(((i / (n - 1)) * 2 - 1) * amount) / norm;
  return (curveCache[amount] = curve);
}

function hiss(graph, t, dur, freq, q, gain, out, stops) {
  const c = graph.ctx;
  const src = c.createBufferSource();
  src.buffer = graph.noise;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.setValueAtTime(gain, t + Math.max(0.01, dur - 0.02));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.4);
  src.stop(t + dur + 0.03);
  stops.push(src);
}

/** The battle behind a shout: muffled rifle bursts and the odd blast, picked up by the open mic. */
function firefight(graph, t, dur, out, stops) {
  let at = t + Math.random() * 0.08;
  while (at < t + dur - 0.06) {
    const rounds = 2 + ((Math.random() * 3) | 0), level = 0.05 + Math.random() * 0.07;
    for (let i = 0; i < rounds && at < t + dur - 0.06; i++) {
      hiss(graph, at, 0.045, 850 + Math.random() * 500, 0.8, level, out, stops);
      at += 0.07 + Math.random() * 0.02;
    }
    at += 0.1 + Math.random() * 0.28;
  }
  if (Math.random() < 0.45) hiss(graph, t + Math.random() * dur * 0.6, 0.22, 240, 0.7, 0.2, out, stops);
}

/** What the speaker is sitting in: an idling engine, a walker's servos, wind over a canopy. */
function bed(graph, kind, t, dur, out, stops) {
  const c = graph.ctx;
  if (kind === 'wind') return hiss(graph, t, dur, 900, 0.4, 0.05, out, stops);
  if (kind === 'hiss') return hiss(graph, t, dur, 5200, 0.8, 0.03, out, stops);
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = kind === 'servo' ? 'square' : 'sawtooth';
  o.frequency.value = kind === 'servo' ? 118 : kind === 'bridge' ? 48 : 62;
  f.type = 'lowpass'; f.frequency.value = kind === 'servo' ? 700 : 320;
  const level = kind === 'bridge' ? 0.05 : 0.035;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 0.05);
  g.gain.setValueAtTime(level, t + Math.max(0.06, dur - 0.05));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.03);
  stops.push(o);
}

function playClip(item, graph) {
  const c = graph.ctx, sp = SPEAKERS[item.speaker];
  const rate = sp.rate || 1;
  const [start, length] = item.clip;
  const dur = length / rate;
  const lead = item.cls === 'control' ? 0.1 : 0.05;
  const t = c.currentTime + 0.02;
  const stops = [];

  const out = c.createGain();
  out.gain.value = (sp.gain || 1) * (item.cls === 'ack' ? 0.9 : 1);
  out.connect(graph.voiceBus);
  if (sp.wet) {
    const send = c.createGain();
    send.gain.value = sp.wet;
    out.connect(send).connect(graph.reverb);
  }

  const src = c.createBufferSource();
  src.buffer = sprites[item.speaker].buffer;
  src.playbackRate.value = rate;
  const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = sp.band[0]; hp.Q.value = 0.8;
  const honk = c.createBiquadFilter(); honk.type = 'peaking'; honk.frequency.value = 1700; honk.Q.value = 0.9; honk.gain.value = 5;
  const shaper = c.createWaveShaper(); shaper.curve = driveCurve(sp.drive || 2); shaper.oversample = '2x';
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = sp.band[1]; lp.Q.value = 0.9;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t + lead);
  env.gain.exponentialRampToValueAtTime(0.9, t + lead + 0.012);
  env.gain.setValueAtTime(0.9, t + lead + dur);
  env.gain.exponentialRampToValueAtTime(0.0001, t + lead + dur + 0.04);
  src.connect(hp).connect(honk).connect(shaper).connect(lp).connect(env).connect(out);
  src.start(t + lead, Math.max(0, start - 0.01), length + 0.05);
  stops.push(src);

  // Key-up click, carrier static under the words, and the squelch tail when the key is released.
  hiss(graph, t, lead + 0.02, 2600, 0.7, 0.16, out, stops);
  hiss(graph, t + lead, dur, 2100, 0.5, 0.016, out, stops);
  hiss(graph, t + lead + dur, 0.09, 3000, 0.6, 0.2, out, stops);
  if (item.cls === 'control') {
    const beep = c.createOscillator(), bg = c.createGain();
    beep.frequency.value = 1320;
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.07, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    beep.connect(bg).connect(out);
    beep.start(t); beep.stop(t + 0.1);
    stops.push(beep);
  }
  if (sp.bed) bed(graph, sp.bed, t, lead + dur + 0.08, out, stops);
  if (item.cls === 'alert' || item.id === 'attack') firefight(graph, t, lead + dur + 0.08, out, stops);

  const total = lead + dur + 0.12;
  graph.duck(total + 0.15);
  return {
    total,
    stop() {
      const now = c.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setTargetAtTime(0.0001, now, 0.012);
      for (const s of stops) { try { s.stop(now + 0.06); } catch { /* already stopped */ } }
    }
  };
}

function pickSystemVoice(female) {
  const list = globalThis.speechSynthesis?.getVoices?.() || [];
  const english = list.filter((v) => /^en/i.test(v.lang));
  const want = female ? /female|samantha|karen|moira|tessa|serena|zira|susan/i : /\bmale|daniel|alex|david|fred|george|oliver|aaron|rishi/i;
  return english.find((v) => want.test(v.name)) || english[0] || null;
}

function playSpeech(item) {
  const synth = globalThis.speechSynthesis;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return null;
  const profile = SPEAKERS[item.speaker].tts || {};
  const u = new SpeechSynthesisUtterance(item.text);
  u.rate = profile.rate || 1.05;
  u.pitch = profile.pitch || 0.82;
  u.volume = 0.9;
  const v = pickSystemVoice(profile.female);
  if (v) u.voice = v;
  synth.cancel();
  synth.speak(u);
  return { total: 0.45 + item.text.length * 0.062, stop() { synth.cancel(); } };
}

/* ---------- who gets to talk ---------- */

function start(item) {
  const graph = audioGraph();
  let playing = null, mode = 'none';
  if (item.clip && sprites[item.speaker]?.state === 'ready' && graph && graph.ctx.state === 'running') {
    playing = playClip(item, graph); mode = 'clip';
  } else if (manifestState === 'missing' || sprites[item.speaker]?.state === 'failed' || (manifestState === 'ready' && !item.clip)) {
    playing = playSpeech(item); mode = 'tts';
  } else if (manifestState === 'ready') {
    loadSprite(item.speaker);   // still downloading: stay quiet rather than switch voices mid-game
  }
  history.push({ speaker: item.speaker, id: item.id, text: item.text, cls: item.cls, mode });
  if (history.length > 40) history.shift();
  if (!playing) return;
  const mine = current = { ...item, until: clock() + playing.total, stop: playing.stop };
  setTimeout(() => { if (current === mine) { current = null; drain(); } }, playing.total * 1000 + 30);
}

function drain() {
  const now = clock();
  while (queue.length) {
    const next = queue.shift();
    if (now - next.at < 7) { start(next); return; }
  }
}

function request(speaker, id, cls, text) {
  if (!unlocked || !voiceOn || !sfx.isEnabled() || !speaker) return false;
  const now = clock();
  const key = cls === 'ack' ? 'ack' : `${speaker}:${text ?? id}`;
  const gap = cls === 'ack' ? 0.15 : GAP[id] ?? (cls === 'control' ? 6 : 3);
  if (now - (lastSaid[key] ?? -1e9) < gap) return false;
  const line = choose(speaker, id, text);
  if (!line) return false;
  const item = { ...line, cls, pri: PRIORITY[cls], at: now };
  if (current && now < current.until) {
    if (item.pri < current.pri) return false;
    // The dispatcher waits its turn behind itself and behind a soldier's shout; chatter is cut off.
    if (cls === 'control' && current.cls !== 'ack') {
      lastSaid[key] = now;
      if (queue.length >= 2) queue.shift();
      queue.push(item);
      return true;
    }
    if (item.pri === current.pri && cls !== 'ack') return false;
    current.stop();
    current = null;
  }
  lastSaid[key] = now;
  start(item);
  return true;
}

export const voice = {
  /** Call from a user gesture: speech and audio may start, and the clips begin to download. */
  unlock() {
    unlocked = true;
    globalThis.speechSynthesis?.getVoices?.();
    loadManifest();
  },
  setEnabled(v) { voiceOn = !!v; if (!v) this.hush(); },
  isEnabled: () => voiceOn,
  hush() {
    queue.length = 0;
    if (current) { current.stop(); current = null; }
    globalThis.speechSynthesis?.cancel?.();
  },

  /**
   * A unit answers an order. `who` is a unit, a list of units (one of them answers) or a unit kind;
   * `event` is `ready`, `select`, `move`, `attack`, `garrison` or `repair`. Selecting the same unit
   * over and over gets a different sort of answer.
   */
  ack(who, event) {
    const unit = Array.isArray(who) ? who[(Math.random() * who.length) | 0] : who;
    const speaker = speakerFor(unit);
    if (!speaker) return false;
    let id = event;
    if (event === 'select' && unit && typeof unit === 'object' && !(Array.isArray(who) && who.length > 1)) {
      const now = clock();
      poke = poke.unit === unit && now - poke.t < POKE.window ? { unit, n: poke.n + 1, t: now } : { unit, n: 1, t: now };
      if (poke.n >= POKE.taps && LINES[speaker].poke) { id = 'poke'; poke.n = 0; }
    }
    if (!LINES[speaker][id]) id = LINES[speaker].move && event === 'garrison' ? 'move' : 'select';
    return request(speaker, id, 'ack');
  },

  /** Battlefield shouts by id (`hit`, `down`, `kill`, `breach`, `contact`, `stim`, `repair`, `revive`, `acquired`). */
  say(id, unit = sfx.emitter()) {
    id = LEGACY[id] || id;
    let speaker = RIG_LINES.has(id) ? 'rig' : speakerFor(unit) || 'trooper';
    if (!LINES[speaker]?.[id]) speaker = 'trooper';
    if (!LINES[speaker][id]) return false;
    return request(speaker, id, ALERTS.has(id) ? 'alert' : 'ack');
  },

  /** Ember Control, by line id (see `LINES.control`). */
  control(id) { return request('control', id, 'control'); },

  /** Ember Control reads a line of the story. Uses its recording when there is one. */
  radio(text) { return text ? request('control', 'radio', 'control', text) : false; },

  /** Arbitrary text through speech synthesis; kept for callers that have no recorded line. */
  sayRaw(text) {
    if (!unlocked || !voiceOn || !sfx.isEnabled() || (current && clock() < current.until)) return;
    start({ speaker: 'trooper', id: 'raw', text, clip: null, cls: 'ack', pri: 1, at: clock() });
  },

  /** For tests and the sound menu: what is loaded and what was said last. */
  status() {
    return {
      manifest: manifestState,
      sprites: Object.fromEntries(Object.entries(sprites).map(([id, s]) => [id, s.state])),
      speaking: current && clock() < current.until ? { speaker: current.speaker, id: current.id, cls: current.cls } : null,
      queued: queue.length,
      history: history.slice()
    };
  },
  /** Forget what was said when, so a test can ask for the same line twice. */
  resetTimers() { for (const k of Object.keys(lastSaid)) delete lastSaid[k]; poke = { unit: null, n: 0, t: 0 }; }
};
