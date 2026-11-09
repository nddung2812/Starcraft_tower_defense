/*
 * High scores. When the game is hosted with its API, scores go to SCORE_API on the same
 * site and everyone shares one leaderboard. Opened from disk or a plain static server
 * (no API), it quietly keeps a local board in this browser instead.
 */

const SCORE_API = '/api/scores';
const LOCAL_KEY = 'td.scores';
const NAME_KEY = 'td.name';

let online = null; // null = not tried yet, true/false once we know

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}

function writeLocal(list) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 50))); } catch { /* storage unavailable */ }
}

function rankLocal(list) {
  return list.sort((a, b) => b.score - a.score || b.level - a.level);
}

/** Letters, digits, spaces and a little punctuation; 2–16 characters. */
export function cleanName(raw) {
  return String(raw || '').replace(/[^\p{L}\p{N} _.\-']/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

export function savedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function rememberName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* storage unavailable */ }
}

async function api(path, init) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(SCORE_API + path, { ...init, signal: ctrl.signal, headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) throw new Error(`${res.status}`);
    online = true;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Top scores, best first: [{ name, score, level, kills }]. */
export async function topScores(limit = 10) {
  if (online !== false) {
    try {
      const data = await api(`?limit=${limit}`);
      return { online: true, scores: data.scores || [] };
    } catch {
      online = false;
    }
  }
  return { online: false, scores: rankLocal(readLocal()).slice(0, limit) };
}

/** Record a finished run. Returns { rank, online } (rank is 1-based, or null if unknown). */
export async function submitScore(entry) {
  const run = {
    name: cleanName(entry.name) || 'Anonymous',
    score: Math.max(0, Math.round(entry.score)),
    level: entry.level | 0,
    kills: entry.kills | 0,
    seconds: Math.round(entry.seconds || 0)
  };
  // always keep a local copy so "your best" works offline too
  const local = rankLocal([...readLocal(), { ...run, at: Date.now() }]);
  writeLocal(local);
  if (online !== false) {
    try {
      const data = await api('', { method: 'POST', body: JSON.stringify(run) });
      return { online: true, rank: data.rank ?? null };
    } catch {
      online = false;
    }
  }
  return { online: false, rank: local.findIndex((r) => r.score === run.score && r.name === run.name) + 1 };
}

/** This browser's best run, for the HUD. */
export function localBest() {
  return readLocal().reduce((m, r) => Math.max(m, r.score), 0);
}
