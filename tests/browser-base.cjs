const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto('http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await page.locator('#introBtn').click();
    const upgrades = await page.evaluate(async () => {
      const g = game;
      const { Marine } = await import('/src/entities.js');
      const { UNITS } = await import('/src/config.js');
      const { captureCheckpoint, validateCheckpoint, restoreCheckpoint } = await import('/src/checkpoints.js');
      g.paused = false;
      const m = g.gunners[0]; m.hp = m.maxHp / 2;
      g.minerals = 199;
      const rejected = !g.upgradeBase() && g.minerals === 199 && g.baseLevel === 0;
      g.minerals = 200;
      document.getElementById('btnBaseUpgrade').click();
      const first = { level: g.baseLevel, minerals: g.minerals, cost: g.baseUpgradeCost, damage: m.stats.damage, maxHp: m.maxHp, ratio: m.hp / m.maxHp, scv: g.scv.maxHp };
      const future = Object.keys(UNITS).map(kind => {
        const unit = new Marine(kind, 1, 1, g.marineUpgrades, g.baseLevel);
        const damage = unit.stats.damage, hp = unit.maxHp;
        unit.applyStats(g.marineUpgrades);
        return { kind, damage, hp, baseDamage: UNITS[kind].tiers[0].damage, baseHp: UNITS[kind].tiers[0].hp, stable: unit.stats.damage === damage && unit.maxHp === hp };
      });
      // A garrisoned and downed unit receives the same run upgrade without reviving.
      m.downed = true; m.hp = 0; g.minerals = 350;
      const second = g.upgradeBase();
      const downed = m.downed && m.hp === 0 && m.stats.damage === 8 * 1.3;
      m.downed = false; m.hp = m.maxHp;
      g.laserCharge = 47.5;
      const save = captureCheckpoint(g, { player: 'Tester', quickDeployment: true, guideDismissed: true });
      const valid = validateCheckpoint(save);
      const invalid = [-1, 91, '90'].every(laserCharge => !validateCheckpoint({ ...save, laserCharge }));
      restoreCheckpoint(g, save);
      const restored = { level: g.baseLevel, charge: g.laserCharge, damage: g.gunners[0].stats.damage, scvHp: g.scv.maxHp };
      // Old saves without either field remain compatible.
      g.reset(123); g.startWave();
      const legacy = captureCheckpoint(g, { player: 'Tester', quickDeployment: true, guideDismissed: true });
      delete legacy.baseLevel; delete legacy.laserCharge;
      const oldValid = validateCheckpoint(legacy);
      restoreCheckpoint(g, legacy);
      const oldDefaults = g.baseLevel === 0 && g.laserCharge === 0;
      return { rejected, first, future, second, downed, valid, invalid, restored, oldValid, oldDefaults };
    });
    assert.equal(upgrades.rejected, true);
    assert.deepEqual(upgrades.first, { level: 1, minerals: 0, cost: 350, damage: 9.2, maxHp: 81, ratio: 0.5, scv: 81 });
    for (const u of upgrades.future) {
      assert.equal(u.damage, u.baseDamage * 1.15, u.kind);
      assert.equal(u.hp, Math.round(u.baseHp * 1.15), u.kind);
      assert.equal(u.stable, true);
    }
    for (const key of ['second', 'downed', 'valid', 'invalid', 'oldValid', 'oldDefaults']) assert.equal(upgrades[key], true, key);
    assert.deepEqual(upgrades.restored, { level: 2, charge: 47.5, damage: 10.4, scvHp: 91 });

    const raid = await page.evaluate(async () => {
      const g = game;
      const { Zergling, Marine, Shell } = await import('/src/entities.js');
      g.reset(123); g.paused = false; g.state = 'wave';
      g.queue = [{ at: 999, breed: 'zergling' }];
      g.update(0.05);
      const waitsForQueue = g.state === 'wave';
      g.queue = [];
      const enemy = new Zergling(g.core.x - 5, g.core.z, 'zergling', 1, 1);
      g.zerglings.push(enemy); g.world.add(enemy.obj);
      g.update(0.05);
      const waitsForEnemy = g.state === 'wave';
      enemy.takeDamage(10000, g, 0); g.update(0.05);
      const start = { state: g.state, seconds: g.raidT, level: g.level };
      g.paused = true; g.update(100);
      const paused = g.raidT === 60;
      g.paused = false;
      const h = g.hives[0], money = g.minerals, kills = g.kills;
      const gun = new Marine('goliath', Math.floor(h.x + 2), Math.floor(h.z), [], 0);
      const acquired = gun.acquire(g) === h;
      const shell = new Shell({ x: h.x, y: 1, z: h.z }, h.x, h.z, 50, 2);
      shell.boom(g);
      const shellHit = h.hp === h.maxHp - 50;
      h.takeDamage(10000, g); h.takeDamage(10000, g);
      const rewarded = g.minerals - money;
      const noKills = g.kills === kills;
      g.update(59.9);
      const held = g.state === 'raid' && g.level === 1;
      g.laserCharge = 40;
      g.minerals = 1000; g.upgradeBase();
      g.update(0.1);
      const end = { state: g.state, level: g.level, baseLevel: g.baseLevel, charge: g.laserCharge, hives: g.hives.every(h => !h.dead && h.hp === h.maxHp) };
      // Missing the bounty still advances normally.
      g.state = 'wave'; g.queue = []; g.update(0.05); g.update(60);
      const timeout = g.state === 'brief' && g.level === 3;
      // Hives cannot be farmed during the peaceful countdown.
      const shielded = g.hives[0]; shielded.takeDamage(10000, g);
      return { waitsForQueue, waitsForEnemy, start, paused, acquired, shellHit, rewarded, reward: h.reward, noKills, held, end, timeout, shielded: !shielded.dead };
    });
    for (const key of ['waitsForQueue', 'waitsForEnemy', 'paused', 'acquired', 'shellHit', 'noKills', 'held', 'timeout', 'shielded']) assert.equal(raid[key], true, key);
    assert.deepEqual(raid.start, { state: 'raid', seconds: 60, level: 1 });
    assert.equal(raid.rewarded, raid.reward);
    assert.deepEqual(raid.end, { state: 'brief', level: 2, baseLevel: 1, charge: 40.1, hives: true });

    const laser = await page.evaluate(async () => {
      const g = game;
      const { Zergling } = await import('/src/entities.js');
      g.reset(123); g.paused = false;
      g.update(89);
      const charging = !g.laserReady && g.laserCharge === 89;
      g.paused = true; g.update(10);
      const paused = g.laserCharge === 89;
      g.paused = false; g.update(1);
      const full = g.laserReady && g.laserCharge === 90;
      g.update(10);
      const capped = g.laserCharge === 90;
      g.state = 'wave';
      const targets = [[-3, 0], [-6, 0], [-9, 0], [-5, 4], [2, 0]].map(([x, z]) => {
        const bug = new Zergling(g.core.x + x, g.core.z + z, 'warrior', 1, 1);
        g.zerglings.push(bug); g.world.add(bug.obj); return bug;
      });
      const invalidAim = !g.fireLaser(g.core.x, g.core.z) && g.laserReady;
      const fired = g.fireLaser(g.core.x - 10, g.core.z);
      const hit = targets.map(b => b.dead);
      const drained = g.laserCharge === 0;
      const single = !g.fireLaser(g.core.x - 10, g.core.z) && g.fx.beams.length === 1;
      const red = g.fx.beams[0].group.children[0].material.color.getHex() === 0xff3020;
      g.fx.update(0.5, g.camera, g.viewport);
      const cleanup = g.fx.beams.length === 0;
      // Preserve energy while rebuilding the map, then recharge to exactly one shot.
      g.state = 'build'; g.laserCharge = 35; g.completeWave();
      const carry = g.laserCharge === 35;
      g.state = 'build'; g.update(55);
      const recharged = g.laserReady;
      return { charging, paused, full, capped, invalidAim, fired, hit, drained, single, red, cleanup, carry, recharged };
    });
    for (const [key, value] of Object.entries(laser)) if (key !== 'hit') assert.equal(value, true, key);
    assert.deepEqual(laser.hit, [true, true, true, false, false]);

    // Real buttons, aiming/cancellation, and narrow layouts.
    await page.evaluate(() => { game.reset(123); game.paused = false; game.state = 'wave'; game.queue = [{ at: 999 }]; game.laserCharge = 90; game.emit('change'); });
    await page.locator('#btnLaser').click();
    assert.equal(await page.locator('#btnLaser').getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#btnLaser').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => game.laserCharge), 90);
    await page.evaluate(() => { game.queue = []; game.update(0.05); game.stage.updateCamera(); game.stage.render(); });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => { game.emit('change'); game.stage.updateCamera(); game.stage.render(); });
      for (const id of ['btnBaseUpgrade', 'btnLaser', 'raidObjective', 'btnLocateHive']) assert.equal(await page.locator('#' + id).isVisible(), true, id);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/td-base-${width}.png` });
    }
    await page.locator('#btnLocateHive').click();
    assert.equal(await page.evaluate(() => game.stage.focus.x === game.hives[0].x), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    // Right-clicking the real hive model issues an attack order to a selected unit.
    const hiveClick = await page.evaluate(async () => {
      const { Vector3 } = await import('three');
      const g = game, h = g.hives[0];
      document.getElementById('fieldGuide').hidden = true;
      document.getElementById('achievementNotice').hidden = true;
      const spot = g.grid.nearestOpen(Math.floor(h.x + 3), Math.floor(h.z), 5);
      g.minerals = 1000; g.placeGunner('marine', spot.x, spot.y);
      g.emit('selectOnly', g.gunners.at(-1));
      g.stage.focus.set(h.x, 0, h.z); g.stage.updateCamera(); g.stage.render();
      const p = new Vector3(h.x, 0, h.z).project(g.camera), r = document.getElementById('game').getBoundingClientRect();
      return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
    });
    await page.mouse.click(hiveClick.x, hiveClick.y, { button: 'right' });
    assert.equal(await page.evaluate(() => game.gunners.at(-1).order?.target === game.hives[0]), true);
    // Fire from the actual UI at a ground point. The single beam also damages hives.
    await page.locator('#btnLaser').click();
    await page.mouse.click(hiveClick.x, hiveClick.y);
    assert.equal(await page.evaluate(() => game.laserCharge === 0 && game.hives[0].dead && game.fx.beams.length === 1), true);
    await page.evaluate(() => { game.stage.render(); });
    await page.screenshot({ path: '/tmp/td-base-laser.png' });
    const edgeCases = await page.evaluate(() => {
      const g = game;
      g.reset(123); g.paused = false;
      for (let i = 0; i < 1800; i++) g.update(0.05);
      const exactCharge = g.laserReady && g.laserCharge === 90;
      g.level = 5; g.loadLevel(); g.state = 'build'; g.startWave(); g.state = 'wave'; g.queue = [];
      g.update(0.05);
      const bossPending = g.state === 'wave' && g.assault.pending;
      g.assault.spawnBoss(); g.assault.boss.takeDamage(100000, g, 0);
      g.chooseEvolution('siege'); g.update(0.05);
      const bossRaid = g.state === 'raid';
      g.wipeUnits(); g.level = 16; g.loadLevel(); g.state = 'raid'; g.raidT = 15;
      const money = g.minerals;
      for (const h of g.hives) { h.takeDamage(100000, g); h.takeDamage(100000, g); }
      const allRewards = g.hives.length === 4 && g.minerals - money === g.hives.reduce((sum, h) => sum + h.reward, 0);
      g.reset(123);
      const reset = g.baseLevel === 0 && g.laserCharge === 0 && g.raidT === 0 && !g.fx.beams.length;
      return { exactCharge, bossPending, bossRaid, allRewards, reset };
    });
    for (const [key, value] of Object.entries(edgeCases)) assert.equal(value, true, key);
    assert.deepEqual(errors, []);
    console.log('PASS: base research costs/stats, save compatibility, 60-second optional hive raid and one-time bounty, 90-second piercing laser/carryover, controls and responsive layout');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
