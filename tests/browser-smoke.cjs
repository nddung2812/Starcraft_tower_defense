const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/?seed=12345&vs=Rico&kills=8');
  await page.waitForFunction(() => window.game);
  await page.screenshot({ path: path.join(os.tmpdir(), 'td-intro.png') });
  assert.match(await page.locator('#challengeIntro').textContent(), /Rico/);
  await page.locator('#introBtn').click();
  const opening = await page.evaluate(() => {
    const g = window.game;
    const render = g.stage.render.bind(g.stage);
    g.stage.render = () => {};
    const start = g.time;
    let contact = null;
    for (let i = 0; i < 4800; i++) {
      g.update(0.05);
      if (g.kills || g.gunners.some(u => u.hp < u.maxHp) || g.zerglings.some(z => z.hp < z.maxHp)) { contact = g.time - start; break; }
    }
    g.stage.render = render;
    return { contact, seed: g.mapSeed, soldiers: g.gunners.length, minerals: g.minerals, state: g.state };
  });
  assert.equal(opening.seed, 12345); assert.equal(opening.soldiers, 3);
  assert.ok(opening.contact && opening.contact < 40, JSON.stringify(opening));
  console.log('Opening:', opening);
  const maps = await page.evaluate(async () => {
    const { carveLevel } = await import('/src/levels.js');
    const { Grid } = await import('/src/grid.js');
    const results = [];
    for (const seed of [0, 12345, 4294967295]) {
      for (const level of [...Array.from({length: 15}, (_, i) => i + 1), 20, 30, 40]) {
        const map = carveLevel(level, seed), grid = new Grid(); grid.load(map);
        const lengths = map.spawns.map(s => grid.findPath(s.x, s.y, map.core.x, map.core.y)?.length || 0);
        if (lengths.some(n => !n)) throw Error(`Unreachable level ${level}, seed ${seed}`);
        if (map.spawn.x > 6 || map.core.x < map.cols - 6 || map.spawns.length !== (level <= 5 ? 1 : level <= 15 ? 2 : 3)) throw Error('Bases or difficulty-based route count incorrect');
        if (JSON.stringify(map) !== JSON.stringify(carveLevel(level, seed))) throw Error('Map seed mismatch');
        results.push({ level, seed, lengths });
      }
    }
    return results;
  });
  console.log('Reachability and reproducibility:', maps.length, 'maps');
  await page.evaluate(() => { game.kills = game.score = 9; game.onCoreDestroyed(); });
  await page.locator('#banner').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#runCard').isVisible(), true);
  await page.locator('#btnCopyChallenge').click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /seed=12345/); assert.match(copied, /kills=9/);
  await page.screenshot({ path: path.join(os.tmpdir(), 'td-result.png') });
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#btnSaveCard').click();
  const download = await downloadEvent;
  await download.saveAs(path.join(os.tmpdir(), 'td-card.png'));
  await page.locator('#bannerBtn').click();
  assert.equal(await page.locator('#banner').isVisible(), false);
  assert.deepEqual(await page.evaluate(() => ({ seed: game.mapSeed, score: game.score, squad: game.gunners.length })), { seed: 12345, score: 0, squad: 3 });
  await page.waitForTimeout(500);
  assert.equal(await page.locator('#banner').isVisible(), false, 'Old score request reopened game over');
  await page.goto(copied);
  await page.waitForFunction(() => window.game);
  assert.match(await page.locator('#challengeIntro').textContent(), /9 kills/);
  await page.getByRole('button', { name: 'Build my own defense' }).click();
  assert.deepEqual(await page.evaluate(() => ({ state: game.state, paused: game.paused, squad: game.gunners.length })), { state: 'brief', paused: true, squad: 0 });
  const milestones = await page.evaluate(async () => {
    const { milestonePlan } = await import('/src/config.js');
    const g = game;
    g.paused = false;
    const results = [];
    for (const level of [10, 20, 30]) {
      g.wipeUnits(); g.level = level; g.state = 'build'; g.minerals = 5000; g.loadLevel();
      const cells = [];
      for (const [x, y] of g.layout.open) {
        if (g.grid.buildable(x, y)) cells.push([x, y]);
      }
      const [x, y] = cells.find(([x, y]) => Math.hypot(x - g.core.x, y - g.core.z) > 10);
      g.placeGunner('marine', x, y);
      const unit = g.gunners[0];
      for (const [tx, ty] of cells.filter(([tx,ty]) => Math.hypot(tx - x, ty - y) > 8).slice(0, 2)) g.placeGunner('marine', tx, ty);
      g.startWave(); g.queue = []; g.state = 'wave';
      g.update(0.05);
      if (g.level !== level || !g.assault.pending) throw Error('Wave completed before boss arrived');
      const a = g.assault, plan = milestonePlan(level);
      a.update(6);
      if (!a.boss?.isBoss || a.boss.hp !== plan.hp) throw Error('Boss did not spawn');
      if (g.grid.occupant(x, y) !== unit) throw Error('Lost occupancy');
      a.strikeT = 100; a.reinforceT = 100;
      a.telegraph();
      const circles = a.marks.length;
      if (circles !== plan.tier) throw Error(`Wrong target count at ${level}`);
      const beforeHp = unit.hp;
      for (let i = 0; i < Math.ceil(plan.telegraph / 0.05) + 1; i++) a.update(0.05);
      if (unit.hp >= beforeHp) throw Error('Bombardment did not hurt a stationary soldier');
      a.boss.hp = a.boss.maxHp * 0.49;
      a.update(0.05);
      if (!a.enraged || a.boss.speed <= plan.speed) throw Error('No enrage');
      const queued = g.queue.length;
      a.reinforce();
      if (g.queue.length !== queued + plan.reinforcements) throw Error('Missing reinforcements');
      a.telegraph();
      const beforeReward = g.minerals; g.airStrikeCd = 20;
      a.boss.takeDamage(a.boss.maxHp * 2, g, 0);
      if (!a.cleared || a.marks.length || g.airStrikeCd !== 0) throw Error('Boss death failed cleanup/recharge');
      const rewarded = g.minerals;
      a.defeated(a.boss);
      if (g.minerals !== rewarded || rewarded - beforeReward < plan.reward) throw Error('Boss reward was duplicated or missing');
      results.push({ level, hp: plan.hp, circles, damage: beforeHp - unit.hp, reward: plan.reward });
    }
    // A live movement order can escape the telegraphed blast before it lands.
    g.wipeUnits(); g.level = 10; g.state = 'build'; g.minerals = 5000; g.loadLevel();
    let chosen;
    for (const [x,y] of g.layout.open) {
      if (!g.grid.buildable(x,y)) continue;
      const end = g.layout.open.find(([tx,ty]) => g.grid.buildable(tx,ty) && Math.hypot(tx-x,ty-y) > 4 && Math.hypot(tx-x,ty-y) < 5 && g.grid.findPath(x,y,tx,ty,true)?.length <= 6);
      if (end) { chosen = [x,y,...end]; break; }
    }
    if (!chosen) throw Error('No dodge test lane');
    const [x,y,tx,ty] = chosen;
    g.placeGunner('marine',x,y); const u = g.gunners[0];
    g.state = 'wave'; const a = g.assault; a.start(); a.spawnBoss(); a.strikeT = 100; a.reinforceT = 100;
    a.telegraph();
    if (!g.commandMove([u],tx,ty)) throw Error('Dodge order failed');
    const hp = u.hp;
    for(let i=0;i<65;i++) { u.update(0.05,g); a.update(0.05); }
    if(u.hp !== hp) throw Error('Moving soldier failed to dodge');
    return results;
  });
  console.log('Milestones:', milestones, 'Live movement dodge: PASS');
  await page.evaluate(() => { game.assault.boss.update(0.4, game); game.stage.focus.set(game.assault.boss.x, 0, game.assault.boss.z); game.stage.updateCamera(); game.assault.telegraph(); game.stage.render(); });
  await page.screenshot({ path: path.join(os.tmpdir(), 'td-boss.png') });
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: full-map first contact, seeded maps, result card, clipboard, download, rematch, build mode, zero page errors');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
