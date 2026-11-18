import { YAMATO, CRUISER_TIERS } from './config.js';

const valid = (u, t, g) => g.isEnemy(t) && Math.hypot(t.x - u.x, t.z - u.z) <= YAMATO.range;
export function yamatoTarget(u, g, manual = false) {
  const preferred = u.order?.target || g.focus;
  if (valid(u, preferred, g) && (manual || preferred.isBoss || preferred.kind === 'hive' || preferred.maxHp >= 300)) return preferred;
  return g.combatTargets.filter(t => valid(u, t, g) && (manual || t.isBoss || t.kind === 'hive' || t.maxHp >= 300))
    .sort((a, b) => (Number(!!b.isBoss) - Number(!!a.isBoss)) || b.hp - a.hp)[0];
}

export function startYamato(u, g, manual = false) {
  if (u.kind !== 'cruiser' || u.dead || u.downed || u.silenceT > 0 || g.paused || g.pendingEvolution ||
    !['wave', 'raid'].includes(g.state) || u.yamatoCd > 0 || u.yamatoLock) return false;
  const target = yamatoTarget(u, g, manual);
  if (!target) return false;
  u.yamatoLock = target; u.yamatoCharge = YAMATO.charge; u.yamatoCd = YAMATO.cooldown;
  g.fx.label({ x: u.x, y: u.altitude + 1.4, z: u.z }, 'YAMATO CHARGING', 'evolution');
  g.sfx.yamatoCharge();
  return true;
}

export function updateBattlecruiser(u, dt, g) {
  u.yamatoCd = Math.max(0, (u.yamatoCd || 0) - dt);
  const glow = u.model.userData.yamato;
  if (glow) glow.scale.setScalar(u.yamatoLock ? 1.3 + (1 - u.yamatoCharge / YAMATO.charge) * 2 : 0.65);
  if (!u.yamatoLock) { startYamato(u, g); return; }
  const target = u.yamatoLock;
  if (!valid(u, target, g) || u.silenceT > 0) {
    u.yamatoLock = null; u.yamatoCharge = 0; u.yamatoCd = Math.min(u.yamatoCd, 2); return;
  }
  u.yamatoCharge = Math.max(0, u.yamatoCharge - dt);
  if (u.yamatoCharge > 0) return;
  u.yamatoLock = null;
  const from = { x: u.x + Math.cos(u.yaw) * 2.4, y: u.altitude + 0.2, z: u.z + Math.sin(u.yaw) * 2.4 };
  const impact = { x: target.x, y: (target.altitude || 0) + 0.5, z: target.z };
  // A violet corona surrounds an opaque dark core, keeping the shot ominous even in bloom.
  g.fx.link(from, impact, 0x5427b8, 0.65, 0.24);
  g.fx.link(from, impact, 0xa66bff, 0.45, 0.14);
  g.fx.link(from, impact, 0x100a24, 0.55, 0.085, false);
  g.fx.sparks(impact, u.yaw, 60, [0.48, 0.22, 0.9], 16, 6.28);
  g.fx.smoke(impact, 28, [0.12, 0.08, 0.2]);
  g.fx.ring(impact, YAMATO.radius, 0x9360e8);
  const multiplier = u.stats.damage / CRUISER_TIERS[0].damage;
  for (const enemy of g.combatTargets.slice()) {
    if (enemy.dead || (enemy !== target && Math.hypot(enemy.x - impact.x, enemy.z - impact.z) > YAMATO.radius)) continue;
    const damage = (enemy === target ? YAMATO.damage : YAMATO.splashDamage) * multiplier;
    enemy.takeDamage(damage + (enemy.armor || 0), g, u.yaw);
  }
  g.fx.label({ ...impact, y: impact.y + 1 }, `YAMATO · ${Math.round(YAMATO.damage * multiplier)}`, 'evolution');
  g.sfx.yamatoFire(); g.stage.kick(5); g.emit('change');
}
