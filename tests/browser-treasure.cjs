const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.game);
    await page.getByRole('button', { name: 'Build my own defense' }).click();
    const result = await page.evaluate(async () => {
      const { milestonePlan, TREASURE, MARINE_TIERS, ARMORY } = await import('/src/config.js');
      const check = (ok, msg) => { if (!ok) throw Error(msg); };
      const near = (a, b) => Math.abs(a - b) < 1e-8;
      const g = game, render = g.stage.render.bind(g.stage); g.stage.render = () => {};
      for (let level = 1; level <= 100; level++) {
        const p = milestonePlan(level);
        check(!!p === (level % 5 === 0), `Wrong cadence ${level}`);
        if (!p) continue;
        check(p.hard === (level % 10 === 0), `Wrong difficulty ${level}`);
        if (!p.hard) check(milestonePlan(level + 5).hp > p.hp, 'Hard boss too weak');
      }
      const results = [];
      for (const level of [5, 10, 15, 20, 25, 30]) {
        g.wipeUnits(); g.level = level; g.state = 'build'; g.loadLevel();
        g.startWave(); g.queue = []; g.state = 'wave';
        g.update(.05); check(g.assault.pending && g.level === level, 'Cleared before boss spawned');
        const a = g.assault; a.update(6);
        check(a.boss?.isBoss && a.boss.hp === a.plan.hp, 'Boss spawn failed');
        const before = g.treasureLoot.length;
        a.boss.takeDamage(a.boss.maxHp * 2, g, 0);
        const earned = g.treasureLoot.slice(before);
        check(a.cleared && earned.length >= a.plan.treasureMin && earned.length <= a.plan.treasureMax, 'Missing automatic loot');
        if (a.plan.hard) check(earned.some(r => r.boxType === 'gold'), 'Hard boss missing guaranteed gold');
        for (const r of earned) check(r.expiresAfterLevel === (r.boxType === 'silver' ? level + 3 : null), 'Wrong reward duration');
        a.defeated(a.boss); check(g.treasureLoot.length === before + earned.length, 'Duplicate loot');
        results.push({ level, boxes: earned.length, gold: earned.filter(r => r.boxType === 'gold').length });
      }
      g.reset(12345); g.level = 5; g.loadLevel(); g.minerals = 10000;
      const deploy = (kind = 'marine') => {
        const [x, y] = g.layout.open.find(([x, y]) => g.grid.buildable(x, y));
        check(g.placeGunner(kind, x, y), 'Deploy failed'); return g.gunners.at(-1);
      };
      const marine = deploy(), tank = deploy('tank'); marine.hp = marine.maxHp / 2;
      const base = { ...marine.stats }, tankDamage = tank.stats.damage;
      const grant = (boxType, index) => {
        const random = Math.random; let call = 0;
        try {
          Math.random = () => call++ === 0 ? (boxType === 'gold' ? 0 : .99) : (index + .5) / TREASURE.length;
          const [reward] = g.awardTreasureBoxes(1);
          check(reward.boxType === boxType && reward.id === TREASURE[index].id, 'Wrong box/reward');
          return reward;
        } finally { Math.random = random; }
      };
      for (let i = 0; i < TREASURE.length; i++) grant('silver', i);
      grant('gold', 0);
      check(near(marine.stats.damage, base.damage * 1.15 ** 2), 'Damage not applied/stacked immediately');
      check(marine.stats.range === base.range + .5 && near(marine.stats.attackSpeed, base.attackSpeed / 1.15), 'Range/fire bonus missing');
      check(near(marine.stats.moveSpeed, base.moveSpeed * 1.1) && marine.hp === marine.maxHp / 2, 'Speed/HP ratio wrong');
      check(tank.stats.damage === tankDamage, 'Marine reward changed tank');
      const end = g.layout.open.find(([x,y]) => g.grid.buildable(x,y) && Math.hypot(x-marine.tx,y-marine.ty) < 4 && g.grid.walkRoute(marine.tx,marine.ty,x,y)?.length > 1);
      check(end && marine.orderMove(...end,g), 'Missing movement route');
      const pos = [marine.x, marine.z]; marine.stepMove(.05,g);
      check(near(Math.hypot(marine.x-pos[0],marine.z-pos[1]),marine.stats.moveSpeed*.05), 'Movement boost unused');
      g.upgradeGunner(marine);
      check(near(marine.stats.damage, MARINE_TIERS[1].damage * 1.15 ** 2), 'Promotion erased upgrades');
      // Standard kill-based technology must remain after silver expires.
      const tech = ARMORY[0]; g.armory.push(tech);
      for (const unit of g.gunners) if (unit.spec.armory) unit.applyStats(g.marineUpgrades);
      for (const level of [6,7,8]) {
        g.completeWave(); check(g.level === level && g.treasureLoot.length === 5, `Silver expired too early at ${level}`);
        const m = deploy();
        const expected = { ...base }; tech.apply(expected); for (const reward of g.treasureLoot) reward.apply(expected);
        check(near(m.stats.damage, expected.damage) && near(m.stats.moveSpeed, base.moveSpeed * 1.1), `New Marine missing boosts at ${level}`);
      }
      g.completeWave(); check(g.level === 9 && g.treasureLoot.length === 1 && g.treasureLoot[0].boxType === 'gold', 'Silver did not expire / gold lost');
      const fresh = deploy();
      const expected = { ...base }; tech.apply(expected); g.treasureLoot[0].apply(expected);
      check(near(fresh.stats.damage, expected.damage) && near(fresh.stats.range, expected.range) && near(fresh.stats.attackSpeed, expected.attackSpeed) && near(fresh.stats.moveSpeed, base.moveSpeed), 'Expired bonuses still applied / normal armory lost');
      // Separate silver drops have separate lifetimes, and expiry recalculates living units.
      grant('silver', 1); g.level = 10; grant('silver', 1); check(fresh.stats.range === expected.range + 1, 'Range did not stack');
      g.level = 13; g.expireTreasureBoosts(); check(fresh.stats.range === expected.range + .5, 'Independent expiry failed');
      g.level = 14; g.expireTreasureBoosts(); check(fresh.stats.range === expected.range && near(fresh.stats.damage,expected.damage), 'Final expiry changed gold');
      g.level = 5; g.loadLevel(); grant('silver', 3); g.emit('change');
      g.stage.render = render; g.stage.updateCamera(); g.stage.render();
      return results;
    });
    console.log('Automatic boss rewards:', result);
    assert.equal(await page.locator('#btnTreasure').count(), 0);
    await page.locator('#treasureSummary').click();
    assert.match(await page.locator('#treasureNote').textContent(), /Gold.*Permanent this run/);
    assert.match(await page.locator('#treasureNote').textContent(), /Silver.*Active through Round 8/);
    for (const [width,height] of [[1440,1000],[390,844]]) {
      await page.setViewportSize({width,height}); await page.waitForTimeout(200);
      if (width < 761) {
        const more = page.getByRole('button', { name: 'Camera and settings' });
        if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
        await page.getByRole('button', { name: 'Unit info', exact: true }).click();
      }
      const layout = await page.evaluate(() => {
        const rail = document.getElementById('battleReadouts').getBoundingClientRect();
        const canvas = document.getElementById('game').getBoundingClientRect();
        const panel = document.getElementById('unitPanel').getBoundingClientRect();
        return {top:rail.top,bottom:rail.bottom,left:rail.left,right:rail.right,canvasRight:canvas.right,
          panelLeft:panel.left,panelRight:panel.right,panelTop:panel.top,panelBottom:panel.bottom};
      });
      assert.ok(layout.left >= layout.panelLeft && layout.right <= layout.panelRight && layout.top >= layout.panelTop && layout.bottom <= layout.panelBottom, 'Rewards overflow inspector');
      if (width >= 761) assert.ok(layout.left >= layout.canvasRight, 'Rewards overlap battlefield');
      await page.screenshot({path:`/tmp/td-auto-loot-${width}.png`});
      if (width < 761) {
        const more = page.getByRole('button', { name: 'Camera and settings' });
        if (await more.getAttribute('aria-expanded') !== 'true') await more.click();
        await page.getByRole('button', { name: 'Unit info', exact: true }).click();
        assert.equal(await page.locator('#battleReadouts').isVisible(), false);
      }
    }
    await page.evaluate(()=>{ game.reset(); if(game.treasureLoot.length || game.armory.length || game.marineUpgrades.length) throw Error('Reset kept upgrades'); });
    assert.equal(await page.locator('#treasure').isVisible(),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: automatic rewards, boss cadence, guaranteed gold, all four stat boosts, stacking, movement, promotion, next-round inheritance, three-round duration, independent expiry, permanent gold, normal armory preservation, no manual clicks, desktop/mobile readout layout, reset');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
