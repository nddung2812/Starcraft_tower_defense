import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const SCORES_KEY = 'td:scores';
const MAX_BOARD = 100;
const RUN_TTL_SEC = 60 * 60 * 8;
const USED_TTL_SEC = 60 * 60 * 24;
const POST_LIMIT = 8;
const RUN_LIMIT = 20;
const WINDOW_SEC = 60;

export function json(res, status, body, extraHeaders = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extraHeaders)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim().slice(0, 64);
  return String(req.socket?.remoteAddress || 'unknown').slice(0, 64);
}

export function cleanName(raw) {
  return String(raw || '').replace(/[^\p{L}\p{N} _.\-']/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

function secret() {
  const s = process.env.SCORE_HMAC_SECRET;
  if (!s || s.length < 16) throw new Error('SCORE_HMAC_SECRET missing');
  return s;
}

export async function redis(cmd) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('redis env missing');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `redis ${res.status}`);
  return data.result;
}

export async function rateLimit(bucket, ip, limit) {
  const key = `td:rl:${bucket}:${ip}`;
  const count = Number(await redis(['INCR', key]));
  if (count === 1) await redis(['EXPIRE', key, String(WINDOW_SEC)]);
  return count <= limit;
}

export function signRun(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyRun(token) {
  if (typeof token !== 'string' || token.length > 512) return null;
  const i = token.lastIndexOf('.');
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expect = createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (typeof payload.n !== 'string' || typeof payload.iat !== 'number') return null;
    return payload;
  } catch {
    return null;
  }
}

export function mintRunToken() {
  return signRun({ v: 1, n: randomBytes(16).toString('hex'), iat: Date.now() });
}

/** Generous but rejects absurd forged kills/level/time combos. */
export function validateRun(entry) {
  const score = Math.round(Number(entry.score));
  const kills = Math.round(Number(entry.kills));
  const level = Math.round(Number(entry.level));
  const seconds = Math.round(Number(entry.seconds));
  if (!Number.isFinite(score) || !Number.isFinite(kills) || !Number.isFinite(level) || !Number.isFinite(seconds)) {
    return { ok: false, error: 'invalid numbers' };
  }
  if (score !== kills) return { ok: false, error: 'score mismatch' };
  if (score < 0 || kills < 0 || level < 1 || level > 200) return { ok: false, error: 'out of range' };
  if (seconds < 8 || seconds > 60 * 60 * 12) return { ok: false, error: 'time out of range' };
  // Sustained kill rate above ~4/s is not reachable in normal play.
  if (kills > seconds * 4 + 20) return { ok: false, error: 'implausible kill rate' };
  // Rough cumulative spawn budget across cleared rounds, plus boss/reinforcement slack.
  const maxForLevel = Math.min(25000, 40 + level * 140 + Math.floor(level * level * 1.2));
  if (kills > maxForLevel) return { ok: false, error: 'implausible kills for level' };
  // Reaching high levels requires some playtime.
  if (level >= 5 && seconds < level * 12) return { ok: false, error: 'implausible time for level' };
  const name = cleanName(entry.name) || 'Anonymous';
  if (name.length < 1) return { ok: false, error: 'bad name' };
  return { ok: true, run: { name, score, level, kills, seconds } };
}

export async function consumeRunToken(token, payload) {
  const ageMs = Date.now() - payload.iat;
  if (ageMs < 8_000) return { ok: false, error: 'run too short' };
  if (ageMs > RUN_TTL_SEC * 1000) return { ok: false, error: 'run expired' };
  const key = `td:used:${payload.n}`;
  const created = await redis(['SET', key, '1', 'NX', 'EX', String(USED_TTL_SEC)]);
  if (created !== 'OK') return { ok: false, error: 'token reused' };
  return { ok: true };
}

export async function saveScore(run) {
  const at = Date.now();
  const member = JSON.stringify({ ...run, at });
  await redis(['ZADD', SCORES_KEY, String(run.score), member]);
  await redis(['ZREMRANGEBYRANK', SCORES_KEY, '0', String(-(MAX_BOARD + 1))]);
  const better = Number(await redis(['ZCOUNT', SCORES_KEY, String(run.score + 1), '+inf']));
  return { rank: better + 1, at };
}

export async function topScores(limit = 10) {
  const n = Math.max(1, Math.min(50, limit | 0));
  const rows = await redis(['ZREVRANGE', SCORES_KEY, '0', String(n - 1)]);
  const scores = [];
  for (const row of rows || []) {
    try {
      const parsed = typeof row === 'string' ? JSON.parse(row) : row;
      if (!parsed || typeof parsed !== 'object') continue;
      scores.push({
        name: cleanName(parsed.name) || 'Anonymous',
        score: Math.max(0, Math.round(Number(parsed.score) || 0)),
        level: Math.max(1, Math.round(Number(parsed.level) || 1)),
        kills: Math.max(0, Math.round(Number(parsed.kills) || 0))
      });
    } catch { /* skip bad row */ }
  }
  return scores;
}

export { POST_LIMIT, RUN_LIMIT, SCORES_KEY };
