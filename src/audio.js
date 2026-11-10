let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

function noise(dur, type, freq, q, gain, curve = 4) {
  const c = ensure();
  if (!c || !enabled) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain();
  const now = c.currentTime;
  g.gain.setValueAtTime(gain, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, freq / curve), now + dur);
  src.connect(f).connect(g).connect(master);
  src.start(now);
  src.stop(now + dur);
}

function tone(type, f0, f1, dur, gain, delay = 0) {
  const c = ensure();
  if (!c || !enabled) return;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  const now = c.currentTime + delay;
  o.frequency.setValueAtTime(f0, now);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  o.connect(g).connect(master);
  o.start(now);
  o.stop(now + dur + 0.02);
}

export const sfx = {
  resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
  setEnabled(v) { enabled = v; },
  isEnabled: () => enabled,

  gauss() { noise(0.1, 'bandpass', 2600, 1.1, 0.55, 6); tone('square', 320, 90, 0.08, 0.1); },
  cannon() { noise(0.16, 'lowpass', 420, 0.55, 0.5, 3); tone('sawtooth', 96, 38, 0.2, 0.14); },
  cannonHit() { noise(0.26, 'lowpass', 300, 0.45, 0.55, 2); tone('triangle', 68, 28, 0.28, 0.1); },
  airstrike() {
    tone('sawtooth', 220, 90, 0.35, 0.12);
    tone('square', 640, 180, 0.28, 0.08, 0.08);
    noise(0.4, 'bandpass', 900, 0.7, 0.35, 2);
  },
  airstrikeDrop() { tone('triangle', 420, 90, 0.22, 0.08); noise(0.18, 'highpass', 1200, 0.5, 0.18, 2); },
  flame() { noise(0.3, 'bandpass', 520, 0.5, 0.26, 1.6); },
  snipe() { noise(0.07, 'highpass', 3200, 0.8, 0.5, 3); tone('square', 1500, 120, 0.16, 0.11); tone('sine', 90, 40, 0.3, 0.12); },
  heal() { tone('sine', 660, 990, 0.16, 0.05); },
  streak(step = 0) { [0, 4, 7].forEach((n, i) => tone('square', 440 * 2 ** ((n + step * 2) / 12), 440 * 2 ** ((n + step * 2) / 12), 0.12, 0.08, i * 0.06)); },
  drop() { tone('triangle', 1200, 300, 0.4, 0.09); tone('square', 880, 880, 0.08, 0.06, 0.42); },
  pickup() { [784, 1046, 1318].forEach((f, i) => tone('triangle', f, f, 0.1, 0.1, i * 0.05)); },
  spine() { noise(0.08, 'highpass', 2400, 0.9, 0.22, 4); tone('triangle', 900, 280, 0.07, 0.05); },
  impact() { noise(0.09, 'lowpass', 1400, 0.7, 0.3, 3); },
  hitFlesh() { noise(0.14, 'lowpass', 700, 0.9, 0.42, 2.5); tone('triangle', 180, 70, 0.1, 0.09); },
  screech() {
    tone('sawtooth', 900, 180, 0.42, 0.14);
    tone('sawtooth', 1340, 260, 0.38, 0.09, 0.03);
    noise(0.35, 'highpass', 1500, 0.8, 0.2, 1.4);
  },
  marineDown() { noise(0.5, 'lowpass', 900, 0.6, 0.5, 5); tone('sawtooth', 160, 40, 0.45, 0.12); },
  place() { tone('square', 620, 880, 0.07, 0.09); tone('square', 880, 1240, 0.07, 0.07, 0.06); },
  ui() { tone('square', 440, 560, 0.05, 0.06); },
  upgrade() { [523, 698, 880].forEach((f, i) => tone('triangle', f, f * 1.5, 0.2, 0.1, i * 0.07)); },
  unlock() { [392, 523, 659, 880].forEach((f, i) => tone('square', f, f, 0.22, 0.07, i * 0.09)); },
  deny() { tone('sawtooth', 180, 110, 0.14, 0.09); },
  alarm() { tone('sawtooth', 300, 520, 0.22, 0.1); tone('sawtooth', 300, 520, 0.22, 0.1, 0.3); },
  victory() { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.28, 0.11, i * 0.11)); },
  defeat() { [392, 330, 262, 196].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.4, 0.1, i * 0.16)); }
};
