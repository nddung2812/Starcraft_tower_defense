export const PROFILE_KEY = 'td.commander.v1';
export const ACHIEVEMENTS = [
  { id: 'first-clear', name: 'First Stand', detail: 'Clear your first round.', stat: 'cleared', target: 1, reward: 'Recruit badge', badge: 'Recruit' },
  { id: 'perfect', name: 'Untouchable', detail: 'Clear a round without base damage.', stat: 'perfect', target: 1, reward: 'Emerald army rings', colour: '#5ef08a' },
  { id: 'boss', name: 'Giant Slayer', detail: 'Defeat your first boss.', stat: 'boss', target: 1, reward: 'Gold army rings', colour: '#ffd36a' },
  { id: 'kills', name: 'Swarm Breaker', detail: 'Reach 250 kills in one run.', stat: 'kills', target: 250, reward: 'Swarm Breaker badge', badge: 'Swarm Breaker' },
  { id: 'ten', name: 'Canyon Veteran', detail: 'Clear Round 10.', stat: 'cleared', target: 10, reward: 'Violet army rings', colour: '#c69aff' },
  { id: 'twenty', name: 'Unbroken', detail: 'Clear Round 20.', stat: 'cleared', target: 20, reward: 'Canyon Legend badge', badge: 'Canyon Legend' }
];

export class Progression {
  constructor() {
    this.stats = { cleared: 0, kills: 0, perfect: 0, boss: 0 };
    this.unlocked = {};
    this.badge = 'Commander'; this.colour = 'default'; this.storageOK = true;
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.version !== 1 || !p.stats || !p.unlocked) throw Error();
        for (const key of Object.keys(this.stats)) {
          if (!Number.isInteger(p.stats[key]) || p.stats[key] < 0 || p.stats[key] > 1e9) throw Error();
        }
        this.stats = { ...this.stats, ...Object.fromEntries(Object.keys(this.stats).map(k => [k, p.stats[k]])) };
        for (const a of ACHIEVEMENTS) if (this.stats[a.stat] >= a.target) {
          this.unlocked[a.id] = Number.isFinite(p.unlocked[a.id]) ? p.unlocked[a.id] : Date.now();
        }
        if (p.badge === 'Commander' || ACHIEVEMENTS.some(a => this.unlocked[a.id] && a.badge === p.badge)) this.badge = p.badge;
        if (p.colour === 'default' || ACHIEVEMENTS.some(a => this.unlocked[a.id] && a.colour === p.colour)) this.colour = p.colour;
      }
    } catch { this.storageOK = false; }
  }

  persist() {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ version: 1, stats: this.stats,
        unlocked: this.unlocked, badge: this.badge, colour: this.colour }));
      this.storageOK = true;
    } catch { this.storageOK = false; }
  }

  record(values) {
    let changed = false;
    for (const key of Object.keys(this.stats)) if (Number.isInteger(values[key]) && values[key] > this.stats[key]) {
      this.stats[key] = values[key]; changed = true;
    }
    const earned = ACHIEVEMENTS.filter(a => !this.unlocked[a.id] && this.stats[a.stat] >= a.target);
    for (const a of earned) this.unlocked[a.id] = Date.now();
    if (changed || earned.length) this.persist();
    return earned;
  }

  equip(type, value) {
    if (!['badge', 'colour'].includes(type)) return false;
    const base = type === 'badge' ? 'Commander' : 'default';
    if (value !== base && !ACHIEVEMENTS.some(a => this.unlocked[a.id] && a[type] === value)) return false;
    this[type] = value; this.persist(); return true;
  }

  get next() {
    return ACHIEVEMENTS.filter(a => !this.unlocked[a.id])
      .sort((a, b) => this.stats[b.stat] / b.target - this.stats[a.stat] / a.target)[0] || null;
  }
}
