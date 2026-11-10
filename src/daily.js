/*
 * Daily challenge: one seed per UTC day, so everyone plays the same canyons and can
 * compare kills. Results stay in this browser; sharing uses the normal challenge link.
 */

const KEY = 'td.daily.v1';
const DAY = 864e5;
const EPOCH = Date.parse('2026-11-01');

export function dayKey(date = new Date()) { return date.toISOString().slice(0, 10); }

/** Day 1 is 1 November 2026. */
export function dailyNumber(key = dayKey()) { return Math.floor((Date.parse(key) - EPOCH) / DAY) + 1; }

export function dailySeed(key = dayKey()) {
  let h = 0x811c9dc5;
  for (const ch of `ridgewatch:${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return h >>> 0;
}

export function readDaily(storage) {
  try {
    const d = JSON.parse((storage || localStorage).getItem(KEY) || 'null');
    if (d && typeof d.day === 'string' && Number.isFinite(d.best) && Number.isFinite(d.level) && Number.isFinite(d.streak)) return d;
  } catch { /* storage unavailable or damaged: start fresh */ }
  return { day: '', best: 0, level: 0, streak: 0 };
}

/** Today's standing: best kills so far today, and how many days in a row were played. */
export function dailyStatus(now = new Date(), storage) {
  const today = dayKey(now), d = readDaily(storage);
  const yesterday = dayKey(new Date(now.getTime() - DAY));
  return {
    number: dailyNumber(today), seed: dailySeed(today),
    played: d.day === today, best: d.day === today ? d.best : 0, level: d.day === today ? d.level : 0,
    streak: d.day === today || d.day === yesterday ? d.streak : 0,
    hoursLeft: Math.max(1, Math.ceil((Date.parse(today) + DAY - now.getTime()) / 36e5))
  };
}

/** Record a finished run if it was played on today's seed. Returns the new standing, or null. */
export function recordDaily(run, now = new Date(), storage) {
  const before = dailyStatus(now, storage);
  if ((run.seed >>> 0) !== before.seed) return null;
  const improved = !before.played || run.score > before.best;
  const next = {
    day: dayKey(now),
    best: improved ? run.score : before.best,
    level: improved ? run.level : before.level,
    streak: before.played ? before.streak : before.streak + 1
  };
  try { (storage || localStorage).setItem(KEY, JSON.stringify(next)); } catch { /* keep playing without saving */ }
  return { ...dailyStatus(now, storage), ...next, number: before.number, improved, played: true };
}

export function dailyShareText(run, number) {
  return `Ridgewatch Daily #${number}: I stopped ${run.score.toLocaleString()} bugs and held to round ${run.level}. Same canyons for everyone today. Beat me:`;
}
