// Specialists, roster unlocks, kill streaks, supply drops, army redeploy and the daily challenge.
// Serve the repo on port 8765, then: node tests/browser-specialists.cjs [playwright-core dir]
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });

    // ---- daily challenge: one seed per UTC day, stored best and day streak ----
    const daily = await page.evaluate(async () => {
      const d = await import('/src/daily.js');
      const store = { v: null, getItem() { return this.v; }, setItem(_, v) { this.v = v; } };
      const day1 = new Date('2026-11-11T09:00:00Z'), day2 = new Date('2026-11-12T23:30:00Z'), day4 = new Date('2026-11-14T01:00:00Z');
      const seed = d.dailySeed('2026-11-11');
      const out = { seed, again: d.dailySeed('2026-11-11'), other: d.dailySeed('2026-11-12'), number: d.dailyNumber('2026-11-11') };
      out.wrongSeed = d.recordDaily({ seed: seed + 1, score: 99, level: 3 }, day1, store);
      out.first = d.recordDaily({ seed, score: 120, level: 4 }, day1, store);
      out.worse = d.recordDaily({ seed, score: 80, level: 3 }, day1, store);
      out.next = d.recordDaily({ seed: d.dailySeed('2026-11-12'), score: 10, level: 1 }, day2, store);
      out.gap = d.dailyStatus(day4, store);
      out.text = d.dailyShareText({ score: 1234, level: 7 }, 11);
      out.today = d.dailyStatus();
      return out;
    });
    assert.equal(daily.seed, daily.again); assert.notEqual(daily.seed, daily.other); assert.equal(daily.number, 11);
    assert.equal(daily.wrongSeed, null);
    assert.deepEqual([daily.first.best, daily.first.improved, daily.first.streak], [120, true, 1]);
    assert.deepEqual([daily.worse.best, daily.worse.level, daily.worse.improved, daily.worse.streak], [120, 4, false, 1]);
    assert.deepEqual([daily.next.best, daily.next.streak], [10, 2]);
    assert.deepEqual([daily.gap.played, daily.gap.best, daily.gap.streak], [false, 0, 0]);
    assert.match(daily.text, /Daily #11.*1,234 bugs.*round 7/);
    assert.match(await page.locator('#btnDaily').textContent(), new RegExp(`Daily challenge #${daily.today.number}`));
    await page.locator('#btnDaily').click();
    assert.equal(await page.evaluate(() => game.mapSeed), daily.today.seed);
    assert.equal(await page.evaluate(() => game.gunners.length), 3, 'Daily uses Quick Deploy');

    // ---- roster: specialists stay off the build bar until their round ----
    const visible = () => page.evaluate(() => [...document.querySelectorAll('[data-build]')].filter(b => !b.hidden).map(b => b.dataset.build));
    assert.deepEqual(await visible(), ['wall', 'marine', 'bunker', 'goliath', 'falcon', 'tank']);
    await page.keyboard.press('c');
    assert.equal(await page.locator('.card--on').count(), 0, 'Locked hotkey must not arm placement');
    assert.match(await page.locator('#toasts').textContent(), /Scorcher is locked/);

    const result = await page.evaluate(async () => {
      const { UNITS, BUILD, STREAK, SUPPLY } = await import('/src/config.js');
      const { Zergling } = await import('/src/entities.js');
      const { captureCheckpoint, validateCheckpoint, restoreCheckpoint } = await import('/src/checkpoints.js');
      const g = game, out = {}, check = (ok, message) => { if (!ok) throw Error(message); };
      g.stage.render = () => {};
      const bug = (x, z, breed = 'zergling', hp = 10000) => {
        const b = new Zergling(x, z, breed, 1, 1);
        b.hp = b.maxHp = hp; b.speed = 0; b.update = () => {};
        g.zerglings.push(b); g.world.add(b.obj); return b;
      };
      const fresh = (level) => {
        g.reset(12345); g.level = level; g.loadLevel(); g.state = 'wave'; g.minerals = 10000; g.crateT = 1e9;
        const row = g.layout.open.filter(([x, y]) => g.grid.buildable(x, y)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        // a clear run of open tiles to stand on and shoot along
        for (const [x, y] of row) {
          if ([0, 1, 2, 3, 4].every(i => g.grid.buildable(x + i, y) && g.grid.buildable(x + i, y + 1) && g.grid.buildable(x + i, y - 1))) return [x, y];
        }
        throw Error('No open strip');
      };

      check(!g.isUnlocked('scorcher') && !g.placeGunner('scorcher', g.grid.core.x - 3, g.grid.core.y), 'Round 1 must not build specialists');
      out.unlock = ['scorcher', 'deadeye', 'mender'].map(id => BUILD[id].unlock);

      // Scorcher: every ground bug in the cone burns each tick; aircraft and bugs behind it do not.
      let [x, y] = fresh(2);
      check(g.placeGunner('scorcher', x, y) && !g.placeGunner('deadeye', x + 1, y), 'Round 2 unlocks only the Scorcher');
      const torch = g.gunners[0];
      const front = [bug(torch.x + 1.2, torch.z), bug(torch.x + 2, torch.z + 0.5), bug(torch.x + 2.2, torch.z - 0.6)];
      const behind = bug(torch.x - 1.6, torch.z), far = bug(torch.x + 4.5, torch.z), flyer = bug(torch.x + 1.5, torch.z, 'skyhunter');
      const plated = bug(torch.x + 1.6, torch.z + 0.2, 'warrior');
      torch.yaw = 0; torch.target = front[0]; torch.obj.updateMatrixWorld(true); torch.fire(g);
      check(front.every(b => 10000 - b.hp === torch.stats.damage), 'Cone must hit every ground bug in front');
      check(10000 - plated.hp === torch.stats.damage - plated.armor, 'Flames are reduced by armour');
      check(behind.hp === 10000 && far.hp === 10000 && flyer.hp === 10000, 'Cone must spare bugs behind, out of reach, or flying');
      check(!g.tracers.length && !g.shells.length, 'Scorcher fires no projectile');
      check(!torch.orderAttack(flyer, g), 'Scorcher cannot be ordered onto aircraft');
      out.scorcher = { damage: torch.stats.damage, range: torch.attackRange };

      // Deadeye: biggest target first, armour ignored, air included.
      [x, y] = fresh(3);
      check(g.placeGunner('deadeye', x, y) && !g.placeGunner('mender', x + 1, y), 'Round 3 unlocks the Deadeye, not the Mender');
      const eye = g.gunners[0];
      const small = bug(eye.x + 2, eye.z, 'zergling', 40), big = bug(eye.x + 6, eye.z, 'warrior', 900), sky = bug(eye.x + 4, eye.z + 1, 'skyhunter', 300);
      check(eye.acquire(g) === big, 'Deadeye must prefer the largest target');
      eye.target = big; eye.yaw = 0; eye.obj.updateMatrixWorld(true); eye.fire(g);
      check(g.tracers.length === 1 && g.tracers[0].pierce, 'Deadeye fires one piercing round');
      for (let i = 0; i < 200; i++) for (const t of g.tracers) if (!t.dead) t.update(0.02, g);
      check(900 - big.hp === eye.stats.damage, `Deadeye must ignore armour (dealt ${900 - big.hp})`);
      big.dead = true;
      check(eye.acquire(g) === sky && small.hp === 40, 'Deadeye can target aircraft');
      out.deadeye = { damage: eye.stats.damage, range: eye.attackRange };

      // Mender: heals the most injured ally in reach, never shoots, cannot overheal or raise the downed.
      [x, y] = fresh(4);
      check(g.placeGunner('mender', x, y) && g.placeGunner('marine', x + 1, y) && g.placeGunner('goliath', x + 2, y) && g.placeGunner('marine', x + 1, y + 1), 'Round 4 squad');
      const [medic, a, walker, c] = g.gunners;
      const enemy = bug(medic.x + 2, medic.z - 1);
      check(medic.acquire(g) === null && !medic.orderAttack(enemy, g), 'Mender never attacks');
      check(medic.seek(g) === null, 'Nothing to heal at full health');
      a.hp = a.maxHp - 5; walker.hp = walker.maxHp * 0.3; c.downed = true; c.hp = 0;
      check(medic.seek(g) === walker, 'Most injured ally first');
      medic.target = walker; medic.obj.updateMatrixWorld(true);
      const before = walker.hp; medic.fire(g);
      check(walker.hp - before === medic.stats.damage, 'Heal amount matches the inspector');
      walker.hp = walker.maxHp; medic.target = a; medic.fire(g);
      check(a.hp === a.maxHp, 'Healing stops at full health');
      check(medic.seek(g) === null && c.downed, 'Downed units still need the Patch Rig');
      a.hp = 1; g.zerglings.length = 0;
      for (let i = 0; i < 400 && a.hp < a.maxHp; i++) g.update(0.05);
      check(a.hp === a.maxHp, 'Mender heals on its own during play');
      out.mender = { heal: medic.stats.damage, range: medic.attackRange };
      // A promotion and base research scale the specialists like every other unit.
      g.upgradeBase(); check(g.upgradeGunner(medic) && medic.rank === 'Chief Mender' && medic.stats.damage === 20 * 1.15, 'Mender promotion and research');

      // Kill streaks: each tier pays once, and the streak lapses after the window.
      fresh(1); g.state = 'wave';
      const kill = () => { const b = bug(5, 5, 'zergling', 1); b.takeDamage(5, g, 0); };
      const tiers = []; g.on('streak', t => tiers.push(t));
      let start = g.minerals;
      for (let i = 0; i < 9; i++) kill();
      check(g.streak === 9 && !tiers.length && g.minerals - start === 9 * 8, 'No bonus before ten kills');
      kill();
      check(tiers.length === 1 && tiers[0].at === 10 && g.minerals - start === 10 * 8 + STREAK.tiers[0].bonus, 'Tenth kill pays the first tier');
      for (let i = 0; i < 15; i++) kill();
      check(tiers.length === 2 && g.streak === 25 && g.bestStreak === 25, 'Second tier at 25');
      g.zerglings.length = 0; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }];
      for (let i = 0; i < 60; i++) g.update(0.05);
      check(g.streak === 0 && g.bestStreak === 25, 'Streak lapses after the window; best is kept');
      kill(); check(g.streak === 1, 'A new streak starts from one');
      out.streak = tiers.map(t => `${t.name}:${t.bonus}`);

      // Supply drops: arrive mid-wave, pay on a click or a walk-over, and expire.
      fresh(3); g.state = 'wave'; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; g.zerglings.length = 0;
      g.crateT = 0.1; const drops = []; g.on('supply', c => drops.push(c));
      for (let i = 0; i < 10; i++) g.update(0.05);
      check(drops.length === 1 && g.crates.length === 1, 'A crate arrives during the wave');
      const crate = g.crates[0];
      check(crate.value === SUPPLY.minerals + 2 * SUPPLY.mineralsPerLevel && g.grid.buildable(crate.tx, crate.ty), 'Crate value and landing tile');
      start = g.minerals; g.airStrikeCd = 0;
      check(g.collectCrate(crate) && g.minerals - start === crate.value && !g.collectCrate(crate), 'A crate pays exactly once');
      g.update(0.05); check(!g.crates.length, 'Collected crate is removed');
      g.crateT = 0.01; g.update(0.05);
      const walked = g.crates[0]; start = g.minerals;
      for (let i = 0; i < 40; i++) g.update(0.05);   // let it land
      check(g.placeGunner('marine', walked.tx, walked.ty) || true, 'unit on the crate tile');
      const walkerUnit = g.gunners[g.gunners.length - 1];
      g.update(0.05);
      check(walked.dead && g.minerals - start === walked.value - BUILD.marine.cost && walkerUnit, 'A unit standing on the crate collects it');
      g.crateT = 0.01; g.update(0.05);
      const stale = g.crates[0]; start = g.minerals;
      // move every unit away so only the timer can end it
      for (const u of g.gunners.slice()) g.removeStructure(u);
      for (let i = 0; i < SUPPLY.life * 20 + 20; i++) g.update(0.05);
      check(stale.dead && !g.crates.includes(stale) && g.minerals === start, 'Uncollected crates expire without paying');
      out.crate = crate.value;

      // Redeploy: clearing a round remembers the army; one call rebuilds it with promotions on the new map.
      [x, y] = fresh(4); g.state = 'build'; g.minerals = 3000;
      check(g.placeGunner('marine', x, y) && g.placeGunner('scorcher', x + 1, y) && g.placeGunner('falcon', x + 2, y) && g.placeGunner('goliath', x + 3, y), 'Army for redeploy');
      g.upgradeGunner(g.gunners[0]); g.upgradeGunner(g.gunners[0]); g.upgradeGunner(g.gunners[3]);
      const armyBefore = g.gunners.map(u => `${u.kind}:${u.tier}`).sort();
      const invested = g.gunners.reduce((n, u) => n + u.invested, 0);
      g.state = 'wave'; g.queue = []; g.zerglings.length = 0; for (const h of g.hives) h.dead = true;
      const unlocked = []; g.on('unitUnlocked', b => unlocked.push(b.id));
      g.update(0.05);
      check(g.level === 5 && g.state === 'brief' && !g.gunners.length, 'Round cleared, hardware refunded');
      check(g.lastArmy.length === 4 && g.lastArmy.reduce((n, u) => n + u.invested, 0) === invested, 'Army remembered with its investment');
      const save = captureCheckpoint(g, { player: 'Test', quickDeployment: true, guideDismissed: true });
      check(validateCheckpoint(save) && save.lastArmy.length === 4, 'Checkpoint keeps the waiting army');
      check(!validateCheckpoint({ ...save, lastArmy: [{ kind: 'nope', tier: 0, invested: 1 }] }) &&
        !validateCheckpoint({ ...save, lastArmy: [{ kind: 'mender', tier: 9, invested: 1 }] }), 'Damaged army lists are rejected');
      const old = { ...save }; delete old.lastArmy; check(validateCheckpoint(old), 'Older saves without an army still load');
      restoreCheckpoint(g, save); g.paused = false;
      check(g.lastArmy.length === 4, 'Restored army is still waiting');
      start = g.minerals;
      check(g.redeployArmy() === 4, 'All four units return');
      check(JSON.stringify(g.gunners.map(u => `${u.kind}:${u.tier}`).sort()) === JSON.stringify(armyBefore), 'Kinds and ranks match');
      check(start - g.minerals === invested && g.lastArmy === null && g.redeployArmy() === 0, 'Costs the refunded amount, once');
      const tiles = new Set(g.gunners.map(u => `${u.tx},${u.ty}`));
      check(tiles.size === 4 && g.gunners.filter(u => !u.flying).every(u => u.isPlaced(g)), 'Each unit has its own tile');
      // A tight budget keeps the dearest units and leaves the rest waiting.
      for (const u of g.gunners.slice()) g.removeStructure(u);
      g.lastArmy = [{ kind: 'marine', tier: 0, invested: 60 }, { kind: 'goliath', tier: 0, invested: 160 }, { kind: 'marine', tier: 0, invested: 60 }];
      g.minerals = 230;
      check(g.redeployArmy() === 2 && g.lastArmy.length === 1 && g.minerals === 10, 'Partial redeploy leaves the remainder waiting');
      out.redeploy = armyBefore;

      // Unlock announcements fire on the round a specialist arrives.
      g.reset(12345); const seen = []; g.on('unitUnlocked', b => seen.push(`${b.id}@${g.level}`));
      for (let round = 1; round <= 3; round++) {
        g.state = 'wave'; g.paused = false; g.queue = []; g.zerglings.length = 0; for (const h of g.hives) h.dead = true;
        g.update(0.05);
      }
      out.announced = seen;
      return out;
    });
    assert.deepEqual(result.unlock, [2, 3, 4]);
    assert.deepEqual(result.announced, ['scorcher@2', 'deadeye@3', 'mender@4']);
    assert.deepEqual(result.streak, ['LINE HOLDING:20', 'MEAT GRINDER:50']);
    console.log(result);

    // ---- live UI: unlocked cards appear, hotkeys arm them, redeploy button and Z work ----
    assert.deepEqual(await visible(), ['wall', 'marine', 'bunker', 'goliath', 'falcon', 'tank', 'scorcher', 'deadeye', 'mender']);
    assert.equal(await page.locator('#callout').isVisible(), true, 'Unlock callout is shown');
    assert.match(await page.locator('#calloutTitle').textContent(), /New unit unlocked/i);
    await page.keyboard.press('h');
    assert.equal(await page.locator('.card--on').getAttribute('data-build'), 'mender');
    await page.keyboard.press('Escape');
    for (const tab of ['scorcher', 'deadeye', 'mender']) {
      await page.locator(`.tab[data-unit="${tab}"]`).click();
      assert.equal(await page.locator('#pName').textContent(), tab[0].toUpperCase() + tab.slice(1));
    }
    assert.match(await page.locator('#stats').textContent(), /Heal\s*12/);
    await page.evaluate(() => { game.minerals = 2000; game.lastArmy = [{ kind: 'marine', tier: 2, invested: 250 }, { kind: 'deadeye', tier: 1, invested: 320 }]; game.emit('change'); });
    assert.match(await page.locator('#btnRedeploy').textContent(), /Redeploy army \(Z\) · 2 units/);
    await page.keyboard.press('z');
    assert.deepEqual(await page.evaluate(() => game.gunners.map(u => `${u.kind}:${u.rank}`).sort()), ['deadeye:Marksman', 'marine:Warden']);
    assert.equal(await page.locator('#redeployBox').isHidden(), true);
    assert.equal(await page.evaluate(() => game.selection.length), 2, 'Redeployed army is selected, ready to move');

    // ---- a supply drop can be clicked on the battlefield ----
    const point = await page.evaluate(() => {
      const g = game; g.state = 'wave'; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }];
      for (const u of g.gunners.slice()) g.removeStructure(u);
      g.crateT = 0.01; g.update(0.05);
      const crate = g.crates[0];
      for (let i = 0; i < 40; i++) g.update(0.05);
      g.stage.focus.set(crate.x, 0, crate.z); g.stage.updateCamera();
      const v = crate.obj.position.clone(); v.y = 0; v.project(g.camera);
      const r = document.getElementById('game').getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, minerals: g.minerals, value: crate.value };
    });
    await page.mouse.click(point.x, point.y);
    assert.equal(await page.evaluate(() => game.minerals), point.minerals + point.value, 'Clicking the crate collects it');
    assert.match(await page.locator('#toasts').textContent(), /Supplies recovered/);

    // ---- phone layout: nine build cards still fit inside the dock ----
    await page.setViewportSize({ width: 390, height: 760 });
    const fit = await page.evaluate(() => {
      const dock = document.querySelector('.dock').getBoundingClientRect();
      return [...document.querySelectorAll('[data-build]')].every(b => {
        const r = b.getBoundingClientRect();
        return r.width >= 24 && r.height >= 24 && r.left >= dock.left - 1 && r.right <= dock.right + 1 && r.top >= dock.top - 1 && r.bottom <= dock.bottom + 1;
      }) && document.documentElement.scrollWidth <= window.innerWidth;
    });
    assert.ok(fit, 'Build cards must stay inside the dock on a phone');
    assert.deepEqual(errors, []);
    console.log('Specialists, streaks, supply drops, redeploy and daily challenge: ok');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
