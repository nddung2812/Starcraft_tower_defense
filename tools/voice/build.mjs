/*
 * Renders every line in src/voice.js (and Ember Control's story lines from src/story.js) to one
 * audio sprite per speaker, and writes assets/voice/manifest.json with where each line sits.
 *
 *   PIPER_PYTHON=/path/to/venv/bin/python PIPER_MODELS=/path/to/models node tools/voice/build.mjs
 *
 * Optional: ESPEAK_DATA (see synth.py), VOICE_WORK (scratch folder for the WAV files),
 * and speaker ids as arguments to rebuild only those. Needs ffmpeg on the PATH. See README.md.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { SPEAKERS, LINES } from '../../src/voice.js';
import { radioLine } from '../../src/story.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = join(root, 'assets/voice');
const work = resolve(process.env.VOICE_WORK || join(tmpdir(), 'breachline-voice'));
const python = process.env.PIPER_PYTHON;
const models = process.env.PIPER_MODELS;
if (!python || !models) {
  console.error('Set PIPER_PYTHON (a Python with piper-tts installed) and PIPER_MODELS (folder of .onnx voices).');
  process.exit(1);
}

const RATE = 22050;
const GAP = 0.18;          // silence between clips in a sprite, so a decoder offset cannot bleed
const PAD = 0.03;          // kept either side of the trimmed speech
const only = process.argv.slice(2);
const manifestPath = join(outDir, 'manifest.json');
const manifest = only.length && existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { version: 1, sampleRate: RATE, speakers: {} };

/** Every line Ember Control can open a round with. The script repeats well inside 60 rounds. */
function radioLines() {
  const lines = new Set();
  for (let round = 1; round <= 60; round++) lines.add(radioLine(round));
  return [...lines];
}

function speakerMap(model) {
  return JSON.parse(readFileSync(join(models, `${model}.onnx.json`), 'utf8')).speaker_id_map || {};
}

function linesFor(id) {
  const out = [];
  for (const [key, list] of Object.entries(LINES[id] || {})) for (const text of list) out.push({ key, text });
  if (id === 'control') for (const text of radioLines()) out.push({ key: 'radio', text });
  return out;
}

function readWav(path) {
  const b = readFileSync(path);
  let at = 12, rate = RATE, data = null;
  while (at + 8 <= b.length) {
    const tag = b.toString('ascii', at, at + 4), size = b.readUInt32LE(at + 4);
    if (tag === 'fmt ') rate = b.readUInt32LE(at + 12);
    if (tag === 'data') { data = b.subarray(at + 8, Math.min(b.length, at + 8 + size)); break; }
    at += 8 + size + (size % 2);
  }
  if (!data) throw new Error(`no audio in ${path}`);
  if (rate !== RATE) throw new Error(`${path} is ${rate} Hz, expected ${RATE}`);
  const x = new Float32Array(data.length >> 1);
  for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  return x;
}

/** Cut the silence off both ends, bring every clip to the same loudness, and round off the peaks. */
function tidy(x) {
  const win = Math.round(RATE * 0.01), floor = 0.012;
  const loud = (i) => { let s = 0; for (let k = i; k < i + win && k < x.length; k++) s += x[k] * x[k]; return Math.sqrt(s / win) > floor; };
  let a = 0, b = x.length - win;
  while (a < b && !loud(a)) a += win;
  while (b > a && !loud(b)) b -= win;
  a = Math.max(0, a - Math.round(RATE * PAD));
  b = Math.min(x.length, b + win + Math.round(RATE * PAD));
  const y = x.slice(a, b);
  let sum = 0, n = 0;
  for (const v of y) if (Math.abs(v) > 0.02) { sum += v * v; n++; }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const gain = rms > 0 ? 0.2 / rms : 1;
  const fade = Math.round(RATE * 0.008);
  for (let i = 0; i < y.length; i++) {
    const edge = Math.min(1, i / fade, (y.length - 1 - i) / fade);
    y[i] = Math.tanh(y[i] * gain * 1.1) * 0.92 * edge;
  }
  return y;
}

function writeWav(path, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  writeFileSync(path, b);
}

mkdirSync(outDir, { recursive: true });
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

const ids = Object.keys(SPEAKERS).filter((id) => !only.length || only.includes(id));
const jobs = [], plan = {};
for (const id of ids) {
  const sp = SPEAKERS[id];
  const speaker = sp.speaker == null ? undefined : speakerMap(sp.model)[sp.speaker];
  if (sp.speaker != null && speaker == null) throw new Error(`${sp.model} has no speaker ${sp.speaker}`);
  plan[id] = linesFor(id).map((line, i) => ({ ...line, wav: join(work, id, `${i}.wav`) }));
  for (const line of plan[id]) {
    jobs.push({ model: sp.model, speaker, text: line.text, out: line.wav, length: sp.length || 1, noise: 0.667, noise_w: 0.8 });
  }
}
const jobFile = join(work, 'jobs.json');
writeFileSync(jobFile, JSON.stringify(jobs));
const args = [join(here, 'synth.py'), jobFile, models];
if (process.env.ESPEAK_DATA) args.push(process.env.ESPEAK_DATA);
execFileSync(python, args, { stdio: 'inherit' });

let seconds = 0, bytes = 0, count = 0;
for (const id of ids) {
  const gap = new Float32Array(Math.round(RATE * GAP));
  const parts = [gap], clips = {};
  let at = gap.length;
  for (const line of plan[id]) {
    const y = tidy(readWav(line.wav));
    const dur = y.length / RATE;
    if (dur < 0.2 || dur > 1.2 + line.text.length * 0.12) console.warn(`  check ${id} "${line.text}": ${dur.toFixed(2)} s`);
    (clips[line.key] ||= []).push([+(at / RATE).toFixed(3), +dur.toFixed(3), line.text]);
    parts.push(y, gap);
    at += y.length + gap.length;
    count++;
  }
  const all = new Float32Array(at);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  const wav = join(work, `${id}.wav`), file = `${id}.mp3`;
  writeWav(wav, all);
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-ac', '1', '-ar', String(RATE), '-codec:a', 'libmp3lame', '-b:a', '48k', join(outDir, file)]);
  const size = readFileSync(join(outDir, file)).length;
  manifest.speakers[id] = { file, model: SPEAKERS[id].model, voice: SPEAKERS[id].speaker ?? null, seconds: +(at / RATE).toFixed(2), clips };
  seconds += at / RATE; bytes += size;
  console.log(`${id.padEnd(9)} ${String(plan[id].length).padStart(3)} lines ${(at / RATE).toFixed(1).padStart(6)} s ${(size / 1024).toFixed(0).padStart(5)} KB`);
}
writeFileSync(manifestPath, JSON.stringify(manifest));
console.log(`${count} lines, ${seconds.toFixed(0)} s, ${(bytes / 1024).toFixed(0)} KB in ${outDir}`);
