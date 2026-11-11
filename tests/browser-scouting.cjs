// Serve the repo on port 8765; pass a playwright-core directory if needed.
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
    assert.equal(await page.locator('#btnScout').isDisabled(), true);
    await page.locator('#btnDaily').click();
    await page.locator('#btnScout').click();
    assert.equal(await page.evaluate(() => game.paused), true);
    assert.match(await page.locator('#scoutThreats').textContent(), /Lineguard/);
    const before = await page.evaluate(() => { const before = game.time; game.update(3); return [before, game.time]; });
    assert.equal(before[0], before[1], 'Scouting freezes simulation');
    await page.locator('[data-counter="marine"]').click();
    await page.waitForFunction(() => !game.paused, null, { polling: 50 });
    assert.equal(await page.locator('.card--on').getAttribute('data-build'), 'marine');
    assert.equal(await page.locator('#scoutDialog').evaluate(el => el.open), false);
    await page.evaluate(() => game.togglePause());
    // Programmatic click: pause overlay intentionally blocks the underlying toolbar.
    await page.evaluate(() => document.getElementById('btnScout').click());
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('scoutDialog').open, null, { polling: 50 });
    assert.equal(await page.evaluate(() => game.paused), true, 'Already paused stays paused');
    await page.evaluate(() => game.togglePause());
    const reports = await page.evaluate(async () => {
      const { scoutRound } = await import('/src/scouting.js');
      const { wavePlan, unlockRound } = await import('/src/config.js');
      for (let level = 1; level <= 100; level++) {
        const r = scoutRound(level);
        if (r.total !== wavePlan(level).length) throw Error('Wrong wave total');
        for (const t of r.threats) {
          if (t.count !== wavePlan(level).filter(e => e.breed === t.id).length) throw Error('Wrong breed count');
          if (unlockRound(t.unit) > level) throw Error('Locked counter');
        }
      }
      return [scoutRound(2), scoutRound(4), scoutRound(5), scoutRound(8)];
    });
    assert.equal(reports[0].threats.find(t => t.id === 'zergling').unit, 'scorcher');
    assert.equal(reports[1].threats.find(t => t.id === 'warrior').unit, 'deadeye');
    assert.equal(reports[2].threats.find(t => t.id === 'skyhunter').unit, 'goliath');
    assert.ok(reports[2].boss);
    assert.ok(reports[3].threats.find(t => t.id === 'tanker'));
    await page.evaluate(() => { game.level = 10; game.loadLevel(); game.state = 'build'; game.emit('change'); });
    await page.locator('#btnScout').click();
    assert.match(await page.locator('#scoutTitle').textContent(), /Round 10/);
    assert.equal(await page.locator('.scout-threat').count(), 6);
    assert.equal(await page.locator('#scoutBoss').isVisible(), true);
    await page.screenshot({ path: '/tmp/ridgewatch-scouting-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await page.locator('#scoutDialog').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844, 'Mobile dialog fits');
    assert.equal(await page.locator('#scoutDialog').evaluate(el => el.scrollWidth <= el.clientWidth), true, 'No horizontal overflow');
    await page.screenshot({ path: '/tmp/ridgewatch-scouting-mobile.png' });
    await page.locator('#scoutClose').click();
    await page.waitForFunction(() => !game.paused, null, { polling: 50 });
    assert.deepEqual(errors, []);
    console.log('Scouting: 100 rounds, counters, pause/resume, selection, boss warning and responsive layout passed.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
