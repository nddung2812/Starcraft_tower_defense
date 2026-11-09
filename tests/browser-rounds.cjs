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
    await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    const result = await page.evaluate(async () => {
      const g = game;
      const { UNIT_SCALE } = await import('/src/config.js');
      const marine = g.gunners[0];
      const initialScale = marine.model.scale.x;
      g.update(0.5);
      const grownScale = marine.model.scale.x;
      marine.upgrade([]);
      const promotedScale = marine.model.scale.x;
      document.getElementById('btnPause').click();
      const frozen = { time: g.time, countdown: g.briefT, x: marine.x, cooldown: marine.cooldown };
      g.update(10);
      const after = { time: g.time, countdown: g.briefT, x: marine.x, cooldown: marine.cooldown };
      const resumeLabel = document.getElementById('btnPause').textContent;
      document.getElementById('btnPause').click();
      g.completeWave();
      const next = { level: g.level, state: g.state, countdown: g.briefT };
      g.update(2.99);
      const beforeContact = g.state;
      g.update(0.02);
      return { initialScale, grownScale, promotedScale, expectedScale: UNIT_SCALE * 0.56, frozen, after, resumeLabel, next, beforeContact, contact: g.state };
    });
    assert.equal(result.initialScale, result.expectedScale);
    assert.equal(result.grownScale, result.expectedScale);
    assert.equal(result.promotedScale, result.expectedScale);
    assert.deepEqual(result.frozen, result.after);
    assert.equal(result.resumeLabel, 'Resume');
    assert.deepEqual(result.next, { level: 2, state: 'brief', countdown: 3 });
    assert.equal(result.beforeContact, 'brief');
    assert.equal(result.contact, 'wave');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => game.paused), true);
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => game.paused), false);
    assert.equal(await page.locator('#status, #roundProgress, #btnWave').count(), 0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => { game.stage.updateCamera(); game.stage.render(); });
      assert.equal(await page.locator('#btnPause').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `/tmp/td-single-header-${width}.png` });
    }
    assert.deepEqual(errors, []);
    console.log('PASS: automatic 3-second rounds, pause/resume and Space, frozen simulation, smaller Marines including promotions, one header on desktop/mobile');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
