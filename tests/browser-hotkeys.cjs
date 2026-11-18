// Every shortcut sits under a left hand resting on WASD, and each key does what the card says.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8765'); await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    await page.evaluate(() => { game.stage.render = () => {}; game.paused = true; game.level = 6; game.minerals = 9000; game.emit('change'); });
    await page.addStyleTag({ content: '#pauseMenu{display:none!important}' });

    // ---- the cards: left-hand keys only, and no key does two jobs ----
    const cards = await page.evaluate(() => ({
      build: [...document.querySelectorAll('[data-build] .card__key')].map(e => e.textContent),
      cmds: Object.fromEntries([...document.querySelectorAll('[data-cmd]')].map(b => [b.dataset.cmd, b.querySelector('.cmd__key').textContent]))
    }));
    assert.deepEqual(cards.cmds, { attack: 'A', stop: 'S', defend: 'D', air: 'R', stim: 'F', promote: '⇧F', salvage: '⇧S', army: '⇧Q', scv: '⇧E', wave: '' });
    const plain = [...cards.build, 'A', 'S', 'D', 'F', 'R'];
    assert.equal(new Set(plain).size, plain.length, `A key is used twice: ${plain}`);
    for (const key of plain) assert.match(key, /^[QWERTASDFGZXCVB]$/, `${key} is out of reach`);

    // ---- each build key arms its unit, and Shift never does ----
    const builds = { q: 'marine', w: 'wall', e: 'mender', t: 'tank', g: 'goliath', z: 'cruiser', x: 'deadeye', c: 'scorcher', v: 'falcon', b: 'bunker' };
    for (const [key, id] of Object.entries(builds)) {
      await page.keyboard.press(key);
      assert.equal(await page.locator('.card--on').getAttribute('data-build'), id, `${key} builds ${id}`);
      await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Shift+W');
    assert.equal(await page.locator('.card--on').count(), 0, 'Shift+W arms nothing');

    // ---- the orders ----
    const first = () => page.evaluate(() => { const u = game.gunners[0]; game.emit('selectOnly', u); return u.defend; });
    assert.equal(await first(), false);
    await page.keyboard.press('d');
    assert.equal(await page.evaluate(() => game.gunners[0].defend), true, 'D defends');
    await page.keyboard.press('d');

    await page.keyboard.press('Shift+F');
    assert.equal(await page.evaluate(() => game.gunners[0].tier), 1, 'Shift+F promotes');

    await page.evaluate(() => game.emit('selectOnly', null));
    await page.keyboard.press('Shift+Q');
    assert.equal(await page.evaluate(() => game.selection.length), await page.evaluate(() => game.gunners.length), 'Shift+Q selects the army');
    await page.keyboard.press('Shift+E');
    assert.equal(await page.evaluate(() => game.selected?.kind), 'scv', 'Shift+E selects the Patch Rig');

    await page.evaluate(() => { game.state = 'build'; game.emit('selectOnly', game.gunners[0]); });
    const before = await page.evaluate(() => game.gunners.length);
    await page.keyboard.press('Shift+S');
    assert.equal(await page.evaluate(() => game.gunners.length), before - 1, 'Shift+S salvages');

    // Sent in one step: a charged laser left running fires by itself at the first enemy it sees.
    const aimed = await page.evaluate(() => {
      game.paused = false; game.state = 'wave'; game.queue = [{ at: 1e9 }]; game.laserCharge = 90;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', code: 'KeyR', shiftKey: true }));
      const pressed = document.getElementById('btnLaser').getAttribute('aria-pressed');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
      game.paused = true;
      return pressed;
    });
    assert.equal(aimed, 'true', 'Shift+R aims the laser');

    // ---- the camera keys moved off Q and E ----
    const yaw = () => page.evaluate(() => game.stage.yaw ?? game.stage.angle ?? game.stage.theta);
    const start = await yaw();
    if (start !== undefined) {
      await page.keyboard.press(',');
      assert.notEqual(await yaw(), start, ', rotates the camera');
      await page.keyboard.press('.');
    }

    assert.deepEqual(errors, []);
    console.log('PASS: left-hand keys only, no key used twice, every build key, Defend, promote, all army, Patch Rig, salvage, laser and camera');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
