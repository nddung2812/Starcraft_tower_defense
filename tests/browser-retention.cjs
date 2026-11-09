const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(15000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    const load = async () => { await page.goto('http://127.0.0.1:8765/'); await page.waitForFunction(() => window.game?.stage, null, { polling: 50 }); };
    await load();
    assert.equal(await page.locator('#savedRun').isVisible(), false);
    await page.locator('#playerName').fill('Rico');
    await page.locator('#introBtn').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('td.checkpoint.v1')).units.length), 3);
    // Exercise the real round-clear hook before constructing a richer planning state.
    await page.evaluate(() => game.completeWave());
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('td.commander.v1')).stats.cleared), 1);
    const before = await page.evaluate(async () => {
      const g = game;
      const { ARMORY, TREASURE } = await import('/src/config.js');
      const { captureCheckpoint, validateCheckpoint } = await import('/src/checkpoints.js');
      g.wipeUnits(); g.level = 6; g.state = 'build'; g.paused = true; g.loadLevel();
      g.minerals = 10000; g.armory = ARMORY.slice(); g.stimUnlocked = true;
      g.treasureLoot = [{ ...TREASURE[0], boxType: 'gold', earnedLevel: 5, expiresAfterLevel: null },
        { ...TREASURE[1], boxType: 'silver', earnedLevel: 5, expiresAfterLevel: 8 }];
      const spot = () => g.layout.open.find(([x,y]) => g.grid.buildable(x,y));
      g.placeBunker(...spot()); g.bunkers[0].hp = 147;
      g.placeWall(...spot()); g.walls[0].hp = 110;
      g.placeGunner('marine', ...spot()); const marine = g.gunners[0];
      g.upgradeGunner(marine); marine.hp = 42; g.garrison(marine, g.bunkers[0], true);
      g.placeGunner('falcon', ...spot());
      g.placeGunner('tank', ...spot());
      const tank = g.gunners.at(-1);
      const dest = g.layout.open.find(([x,y]) => g.grid.buildable(x,y) && g.grid.walkRoute(tank.tx,tank.ty,x,y)?.length > 2);
      g.commandMove([tank], ...dest);
      g.core.hp -= 55; g.airStrikeCd = 22; g.scv.hp = 39;
      g.kills = 91; g.score = 91; g.time = 123.5;
      g.startWave();
      const save = JSON.parse(localStorage.getItem('td.checkpoint.v1'));
      if (!validateCheckpoint(save)) throw Error('Valid snapshot rejected');
      // A malformed unit, overlap, or future format must fail before mutating the live game.
      for (const mutate of [s => s.version++, s => s.units[0].kind = 'unknown', s => s.units[0].tier = 99,
        s => s.units[1].x = -4, s => s.walls.push(s.walls[0]), s => s.treasure[1].expiresAfterLevel = 100]) {
        const bad = structuredClone(save); mutate(bad);
        if (validateCheckpoint(bad)) throw Error('Corrupt checkpoint accepted');
      }
      g.state = 'wave'; g.minerals += 500; g.onKill();
      const after = localStorage.getItem('td.checkpoint.v1');
      if (JSON.stringify(save) !== after) throw Error('Combat overwrote checkpoint');
      return save;
    });
    await page.locator('#btnPause').click(); // test set paused; resume
    await page.locator('#btnPause').click();
    assert.match(await page.locator('#pauseSaveInfo').textContent(), /combat will replay/);
    await page.locator('#btnSaveQuit').click();
    assert.equal(await page.locator('#intro').isVisible(), true);
    assert.match(await page.locator('#btnContinue').textContent(), /Round 6/);
    await load();
    await page.locator('#btnContinue').click();
    const restored = await page.evaluate(async () => {
      const { captureCheckpoint } = await import('/src/checkpoints.js');
      return { paused: game.paused, state: game.state, countdown: game.briefT,
        snapshot: captureCheckpoint(game, { player: 'Rico', quickDeployment: true, guideDismissed: false }),
        garrison: game.bunkers[0].garrison.length,
        occupied: game.gunners.map(m => m.isPlaced(game)),
        damage: game.gunners[0].stats.damage, range: game.gunners[0].stats.range,
        tankMoving: game.gunners[2].driving };
    });
    assert.equal(restored.paused, true); assert.equal(restored.state, 'brief'); assert.equal(restored.countdown, 3);
    for (const key of ['level','seed','minerals','kills','time','coreHp','airStrikeCd','armory','treasure','walls','bunkers','units','scv']) {
      assert.deepEqual(restored.snapshot[key], before[key], `Restore mismatch: ${key}`);
    }
    assert.equal(restored.garrison, 1); assert.deepEqual(restored.occupied, [false,false,false]);
    assert.ok(restored.damage > 11); assert.ok(restored.range > 5); assert.equal(restored.tankMoving, true);
    await page.evaluate(() => { const t = game.time; game.update(10); if (game.time !== t) throw Error('Resume ran before player was ready'); });
    // A new run needs an explicit choice, and cancel preserves the checkpoint.
    await page.locator('#btnSaveQuit').click();
    await page.locator('#introBtn').click();
    assert.equal(await page.locator('#replaceDialog').isVisible(), true);
    await page.locator('#cancelReplace').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('td.checkpoint.v1')).level), 6);
    // Career dialog blocks hotkeys, shows partial progress, and persists real cosmetic selection.
    await page.locator('#introCareer').click();
    assert.match(await page.locator('[data-achievement="kills"] small').textContent(), /92 \/ 250/);
    assert.equal(await page.locator('[data-value="#ffd36a"]').isDisabled(), true);
    await page.locator('[data-equip="badge"][data-value="Recruit"]').click();
    await page.locator('[data-value="#5ef08a"]').click();
    await page.locator('#closeCareer').click();
    await page.locator('#btnContinue').click();
    await page.locator('#btnResume').click();
    await page.locator('#btnCareer').click();
    await page.evaluate(() => document.getElementById('careerDialog').focus());
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => game.paused), true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !game.paused, null, { polling: 50, timeout: 3000 });
    assert.equal(await page.evaluate(() => game.paused), false);
    assert.equal(await page.locator('#commanderBadge').textContent(), 'Recruit');
    assert.equal(await page.evaluate(() => game.gunners[0].ring.material.color.getHexString()), '5ef08a');
    // Repeated/replayed events never duplicate permanent rewards.
    await page.evaluate(() => {
      game.onKill({ isBoss: false });
      game.emit('bossDown', { rewards: [] }); game.emit('bossDown', { rewards: [] });
      game.emit('roundCleared', { level: 20, perfect: false });
      game.kills = 250; game.emit('kill', 250);
    });
    await page.locator('#btnCareer').click();
    assert.equal(await page.locator('.achievement.is-earned').count(), 6);
    await page.locator('[data-value="#ffd36a"]').click();
    for (const [width,height] of [[1440,1000],[390,844]]) {
      await page.setViewportSize({width,height});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const bounds = await page.locator('#careerDialog').boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.height <= height);
      await page.screenshot({path:`/tmp/td-career-${width}.png`});
    }
    await page.locator('#closeCareer').click();
    // Defeat invalidates the live checkpoint but leaves the career and equipped reward intact.
    await page.evaluate(() => game.onCoreDestroyed());
    assert.equal(await page.evaluate(() => localStorage.getItem('td.checkpoint.v1')), null);
    await load();
    assert.equal(await page.locator('#savedRun').isVisible(), false);
    assert.equal(await page.locator('#commanderBadge').textContent(), 'Recruit');
    await page.locator('#introCareer').click();
    assert.equal(await page.locator('.achievement.is-earned').count(), 6);
    assert.equal(await page.locator('[data-value="#ffd36a"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#closeCareer').click();
    // Corrupt/unsupported saves and unavailable storage degrade without breaking play.
    await page.evaluate(() => localStorage.setItem('td.checkpoint.v1', '{broken'));
    await load();
    assert.match(await page.locator('#introSaveFeedback').textContent(), /could not be read/);
    await page.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) { if (key === 'td.checkpoint.v1') throw Error('QuotaExceeded'); return originalSetItem.call(this,key,value); };
    });
    await page.locator('#introBtn').click();
    await page.locator('#btnPause').click();
    await page.locator('#btnSaveQuit').click();
    assert.equal(await page.locator('#intro').isVisible(), false);
    assert.match(await page.locator('#saveFeedback').textContent(), /could not save/);
    await page.evaluate(() => { Storage.prototype.setItem = originalSetItem; });
    await page.locator('#btnSaveQuit').click();
    assert.equal(await page.locator('#intro').isVisible(), true);
    await page.waitForTimeout(350);
    await page.screenshot({path:'/tmp/td-continue-390.png'});
    await page.getByRole('button', { name: 'Build my own defense' }).click();
    await page.locator('#confirmReplace').click();
    assert.equal(await page.locator('#pausePlanBar').isVisible(), true);
    assert.equal(await page.locator('#pauseMenu').isVisible(), false);
    await page.evaluate(() => {
      const [x,y] = game.layout.open.find(([x,y]) => game.grid.buildable(x,y));
      const t = game.time;
      if (!game.placeGunner('marine',x,y)) throw Error('Paused planning blocked construction');
      game.update(1);
      if (game.time !== t || JSON.parse(localStorage.getItem('td.checkpoint.v1')).units.length !== 1) throw Error('Paused planning did not save/freeze');
    });
    await page.locator('#pausePlanBar').click();
    assert.equal(await page.locator('#pauseMenu').isVisible(), true);
    const fresh = await browser.newPage();
    fresh.on('pageerror', e => errors.push(e.message));
    await fresh.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await fresh.goto('http://127.0.0.1:8765/');
    await fresh.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await fresh.locator('#introBtn').click();
    const perfect = await fresh.evaluate(() => {
      game.core.takeDamage(1, game, 0); game.completeWave();
      const damaged = JSON.parse(localStorage.getItem('td.commander.v1')).stats.perfect;
      game.completeWave();
      const untouched = JSON.parse(localStorage.getItem('td.commander.v1')).stats.perfect;
      return { damaged, untouched };
    });
    assert.deepEqual(perfect, { damaged: 0, untouched: 1 });
    await fresh.close();
    const blocked = await browser.newPage();
    blocked.on('pageerror', e => errors.push(e.message));
    await blocked.addInitScript(() => {
      window.requestAnimationFrame = () => 1;
      Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
    });
    await blocked.goto('http://127.0.0.1:8765/');
    await blocked.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await blocked.locator('#introBtn').click();
    await blocked.locator('#btnPause').click();
    assert.match(await blocked.locator('#saveFeedback').textContent(), /could not save/);
    assert.equal(await blocked.evaluate(() => game.gunners.length), 3);
    await blocked.close();
    assert.deepEqual(errors, []);
    console.log('PASS: full checkpoint round trip, replay semantics, paused resume, army/grid/garrison/aircraft restoration, upgrades, expiry metadata, confirmation, achievements, cosmetic persistence, modal hotkeys, desktop/mobile layout, defeat cleanup, corruption, storage failure and retry');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
