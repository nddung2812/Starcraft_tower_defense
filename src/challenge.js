import { cleanName } from './scores.js';

/** A challenge promises matching terrain, not a deterministic combat replay. */
export function readChallenge(search = location.search) {
  const params = new URLSearchParams(search);
  const rawSeed = params.get('seed');
  if (!/^\d{1,10}$/.test(rawSeed || '')) return null;
  const seed = Number(rawSeed);
  if (seed > 0xffffffff) return null;
  const rawKills = params.get('kills') || '';
  const kills = /^\d{1,8}$/.test(rawKills) ? Number(rawKills) : 0;
  return { seed, name: cleanName(params.get('vs')) || 'a commander', kills };
}

export function challengeUrl(run, base = location.href) {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('seed', String(run.seed >>> 0));
  url.searchParams.set('vs', cleanName(run.name));
  url.searchParams.set('kills', String(run.score));
  return url.href;
}

/** Capture immediately after a render: WebGL's drawing buffer is transient. */
export function makeRunCard(canvas, run) {
  const card = document.createElement('canvas');
  card.width = 1200;
  card.height = 900;
  const ctx = card.getContext('2d');
  ctx.fillStyle = '#070e18';
  ctx.fillRect(0, 0, 1200, 900);
  const scale = Math.max(1200 / canvas.width, 530 / canvas.height);
  const w = canvas.width * scale, h = canvas.height * scale;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, 1200, 530); ctx.clip();
  ctx.drawImage(canvas, (1200 - w) / 2, (530 - h) / 2, w, h);
  ctx.restore();
  const fade = ctx.createLinearGradient(0, 280, 0, 560);
  fade.addColorStop(0, 'rgba(7,14,24,0)'); fade.addColorStop(1, '#070e18');
  ctx.fillStyle = fade; ctx.fillRect(0, 280, 1200, 280);
  ctx.fillStyle = '#5ad7ff'; ctx.font = 'bold 24px monospace';
  ctx.fillText('LAST STAND / TERRAN DEFENSE', 64, 76);
  ctx.fillStyle = '#f0b23c'; ctx.font = 'bold 126px monospace';
  ctx.fillText(run.score.toLocaleString(), 64, 605);
  ctx.fillStyle = '#d9e7f2'; ctx.font = 'bold 30px monospace';
  ctx.fillText('BUGS STOPPED', 64, 652);
  ctx.font = '24px monospace'; ctx.fillStyle = '#8ca5bb';
  ctx.fillText(`${run.name}  /  LEVEL ${run.level}  /  ${Math.floor(run.seconds / 60)}m ${Math.floor(run.seconds % 60)}s`, 64, 722);
  ctx.fillStyle = '#5ad7ff'; ctx.fillRect(64, 774, 1072, 2);
  ctx.fillStyle = '#d9e7f2'; ctx.font = 'bold 28px monospace';
  ctx.fillText('SAME CANYON. CAN YOU HOLD LONGER?', 64, 836);
  return card.toDataURL('image/png');
}
