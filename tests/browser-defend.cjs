const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/src/hero.js', route => route.abort());   // this suite counts the army, so it runs without the hero (tests/browser-hero.cjs covers the hero)
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await page.locator('#introBtn').click();
    await page.evaluate(() => {
      const g = game; g.reset(12345); g.state = 'wave'; g.paused = false; g.stage.render = () => {};
      g.queue = [{ at: 9999, breed: 'zergling', lane: 0 }]; g.minerals = 10000;
      const near = () => g.layout.open.find(([x, y]) => g.grid.buildable(x, y) && Math.hypot(x - g.core.x, y - g.core.z) < 8);
      for (const kind of ['marine', 'goliath', 'tank', 'marine', 'marine']) {
        const cell = near();
        if (!cell || !g.placeGunner(kind, ...cell)) throw Error('Cannot place army fixture');
      }
      g.placeBunker(...near()); g.garrison(g.gunners.at(-1), g.bunkers[0], true);
      g.emit('selectOnly', null); g.emit('change');
    });
    const defend = page.locator('[data-cmd="defend"]');
    assert.equal(await defend.isDisabled(), true, 'Defend needs a selection');
    assert.match(await defend.textContent(), /Defend\s*D/);

    // One click on the card puts the selected unit on Defend and marks it.
    await page.evaluate(() => game.emit('selectOnly', game.gunners[0]));
    assert.equal(await defend.isEnabled(), true);
    await defend.click();
    assert.deepEqual(await page.evaluate(() => { const u = game.gunners[0]; u.update(0.05, game); return [u.defend, u.guardMark.visible, game.gunners[1].defend]; }), [true, true, false]);
    assert.match(await defend.textContent(), /Defending/);
    assert.equal(await defend.evaluate(el => el.classList.contains('cmd--on')), true);
    assert.match(await page.locator('#pRole').textContent(), /DEFENDING/);

    // Attack sends everyone else; the defender and the defending bunker troop stay home.
    const sent = await page.evaluate(() => {
      const g = game, guard = g.gunners[0], inside = g.gunners.at(-1);
      g.commandDefend([inside]);
      const start = { x: guard.x, z: guard.z };
      g.emit('cmd', 'attack');
      const orders = g.gunners.map(u => u.order?.type || null);
      for (let i = 0; i < 60; i++) g.update(0.05);
      return { orders, moved: Math.hypot(guard.x - start.x, guard.z - start.z), placed: guard.isPlaced(g),
        garrisoned: inside.bunker === g.bunkers[0], selected: g.selection.includes(guard) || g.selection.includes(inside),
        others: g.gunners.slice(1, 4).every(u => u.order?.type === 'advance'), picked: g.selection.length };
    });
    assert.deepEqual(sent.orders, [null, 'advance', 'advance', 'advance', null]);
    assert.ok(sent.moved < 0.01 && sent.placed, 'Defender left its post');
    assert.equal(sent.garrisoned, true, 'Defending bunker troop was ejected');
    assert.equal(sent.others, true); assert.equal(sent.selected, false); assert.equal(sent.picked, 3);

    // Defenders still fight what comes to them, and still obey a direct order.
    const fights = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const g = game, guard = g.gunners[0];
      const bug = new Zergling(guard.x + 1.5, guard.z, 'zergling', 1, 1); bug.update = () => {};
      g.zerglings.push(bug); g.world.add(bug.obj);
      const shoots = guard.acquire(g) === bug, ordered = g.commandAttack([guard], bug) === 1 && guard.order?.type === 'attack';
      bug.dead = true; g.zerglings.splice(g.zerglings.indexOf(bug), 1); g.world.remove(bug.obj); guard.stop(g);
      return shoots && ordered && guard.defend;
    });
    assert.equal(fights, true, 'Defender ignored an enemy in range or a direct order');

    // K recalls a unit that is already advancing, and toggles back off.
    await page.evaluate(() => game.emit('selectOnly', game.gunners[1]));
    await page.keyboard.press('d');
    assert.deepEqual(await page.evaluate(() => [game.gunners[1].defend, game.gunners[1].order]), [true, null]);
    await page.keyboard.press('d');
    assert.equal(await page.evaluate(() => game.gunners[1].defend), false);
    assert.match(await defend.textContent(), /^\s*Defend\s*D/);

    // With everyone on Defend, Attack sends nobody.
    assert.equal(await page.evaluate(() => { const g = game; g.commandStop(g.gunners); g.commandDefend(g.gunners, true); return g.commandAdvanceArmy(); }), 0);

    // The flag survives a checkpoint and Redeploy; saves from before it still load.
    const saved = await page.evaluate(async () => {
      const { captureCheckpoint, validateCheckpoint, restoreCheckpoint } = await import('/src/checkpoints.js');
      const g = game; g.state = 'build'; g.commandDefend(g.gunners, false); g.commandDefend([g.gunners[0], g.gunners[2]], true);
      const save = captureCheckpoint(g, { player: 'Defend', quickDeployment: true, guideDismissed: true });
      const old = structuredClone(save); for (const u of old.units) delete u.defend;
      const bad = structuredClone(save); bad.units[0].defend = 'yes';
      const checks = [validateCheckpoint(save), validateCheckpoint(old), validateCheckpoint(bad)];
      restoreCheckpoint(g, save);
      const flags = g.gunners.map(u => u.defend);
      restoreCheckpoint(g, old);
      const oldFlags = g.gunners.some(u => u.defend);
      g.paused = false; g.state = 'build'; g.wipeUnits(); g.loadLevel(); g.minerals = 10000;
      g.lastArmy = [{ kind: 'goliath', tier: 0, invested: 160, defend: true }, { kind: 'marine', tier: 0, invested: 60, defend: false }];
      const placed = g.redeployArmy();
      return { checks, flags, oldFlags, placed, redeployed: g.gunners.map(u => [u.kind, u.defend]) };
    });
    assert.deepEqual(saved.checks, [true, true, false]);
    assert.deepEqual(saved.flags, [true, false, true, false, false]);
    assert.equal(saved.oldFlags, false);
    assert.equal(saved.placed, 2);
    assert.deepEqual(saved.redeployed, [['goliath', true], ['marine', false]]);

    await page.setViewportSize({ width: 390, height: 844 });
    const fits = await defend.evaluate(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; });
    assert.ok(fits, 'Mobile Defend button outside viewport');
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'ridgewatch-defend-390.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: Defend toggle, marker, army Attack exclusion, bunker troops, direct orders, recall, all-defend, checkpoint, old saves, redeploy and mobile card');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
