import { BUILD, BREEDS, wavePlan, milestonePlan, unlockRound } from './config.js';

// Advice follows actual weapon roles; scouting never changes wave generation or combat stats.
const COUNTERS = {
  zergling: { unit: 'scorcher', fallback: 'marine', threat: 'Swarm', why: 'Flames hit every ground enemy in a short cone. Keep the pack in front.', early: 'Overlap Lineguard firing ranges at the shared approach. Bunkers protect the firing line.' },
  warrior: { unit: 'deadeye', threat: 'Armour', why: 'Deadeye rounds ignore armour and prioritise large targets. Keep a frontline ahead of them.' },
  hopper: { unit: 'scorcher', threat: 'Wall vaulters', why: 'Vaultlings jump a single wall. Keep short-range flames behind your barricades to catch them.' },
  skyhunter: { unit: 'goliath', threat: 'Air attack', why: 'Anchor Walkers shoot ground and air. Walls, Scorchers and Cinder Crawlers cannot stop aircraft.' },
  needler: { unit: 'deadeye', threat: 'Ranged fire', why: 'Deadeyes outrange spine launchers. Screen the fragile marksmen with tougher units.' },
  tanker: { unit: 'deadeye', threat: 'Acid siege', why: 'Deadeyes prioritise large targets and outrange acid siege. Spread your frontline to limit splash damage.' }
};

/** Full planned column, not a misleading live count; boss reinforcements are separate. */
export function scoutRound(level) {
  const counts = new Map();
  for (const entry of wavePlan(level)) counts.set(entry.breed, (counts.get(entry.breed) || 0) + 1);
  const threats = [...counts].map(([id, count]) => {
    const advice = COUNTERS[id];
    const available = unlockRound(advice.unit) <= level;
    const unit = available ? advice.unit : advice.fallback;
    return { id, count, name: BREEDS[id].name, threat: advice.threat,
      unit, counter: BUILD[unit].name, cost: BUILD[unit].cost,
      why: available ? advice.why : advice.early };
  });
  // Put specialist threats before the familiar swarm.
  threats.sort((a, b) => (a.id === 'zergling') - (b.id === 'zergling'));
  return { threats, total: [...counts.values()].reduce((a, b) => a + b, 0), boss: milestonePlan(level) };
}

export function installScouting(game) {
  const button = document.getElementById('btnScout');
  const dialog = document.getElementById('scoutDialog');
  let resume = false;
  button.addEventListener('click', () => {
    if (dialog.open || game.pendingEvolution || game.state === 'defeat') return;
    const report = scoutRound(game.level);
    document.getElementById('scoutTitle').textContent = `Round ${game.level} · Scouting report`;
    document.getElementById('scoutSummary').textContent = `${report.total} planned enemies · ${game.grid.spawns.length} approaches. Full round composition, including enemies already spawned; destroying a hive prevents its remaining spawns.`;
    document.getElementById('scoutThreats').innerHTML = report.threats.map(t => {
      const owned = game.gunners.filter(u => u.kind === t.unit && !u.dead && !u.downed).length;
      return `<article class="scout-threat"><div class="scout-threat__heading"><strong>${t.threat}</strong><span>${t.count} × ${t.name}</span></div><p>${t.why}</p><button class="btn" type="button" data-counter="${t.unit}">Select ${t.counter} · ${t.cost} minerals</button><small>${owned} active in your army${game.minerals < t.cost ? ' · Save more minerals to build' : ''}</small></article>`;
    }).join('');
    const boss = document.getElementById('scoutBoss');
    boss.hidden = !report.boss;
    boss.textContent = report.boss ? `Boss: ${report.boss.name}. Additional reinforcements are not included above. Spread out and move away from marked attacks.` : '';
    resume = !game.paused;
    if (resume) game.togglePause();
    dialog.showModal();
  });
  document.getElementById('scoutClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (resume && game.paused && game.state !== 'defeat') game.togglePause();
    resume = false;
  });
  dialog.addEventListener('click', event => {
    const counter = event.target.closest('[data-counter]');
    if (!counter) return;
    dialog.close();
    game.emit('pick', counter.dataset.counter);
  });
  const sync = () => {
    button.disabled = !document.getElementById('intro').hidden || game.state === 'defeat' || !!game.pendingEvolution;
    button.title = `Scout round ${game.level}: enemy composition and counters (pauses battle)`;
  };
  game.on('change', sync);
  sync();
}
