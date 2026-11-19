const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto('http://127.0.0.1:8765');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    const result = await page.evaluate(() => {
      const g = game; g.reset(12345); g.state = 'build';
      const h = g.hives[0];
      h.update(35, g); const peaceful = h.evolution === 0;
      g.state = 'wave'; h.update(15, g); h.update(14.9, g); const before = h.evolution === 0 && h.upgrades === 1;   // upgrades every 15 s, hatches every other
      h.update(.1, g); const first = g.zerglings.length;
      h.update(30, g); const second = g.zerglings.length - first;
      const timer = h.evolutionT; g.paused = true; g.update(31);
      const paused = h.evolutionT === timer;
      g.paused = false; g.state = 'raid'; g.raidT = 60;
      h.update(30, g); const raid = h.evolution === 3;
      h.takeDamage(h.hp, g); const count = g.zerglings.length;
      h.update(60, g);
      return { peaceful, before, first, second, paused, raid, stopped: g.zerglings.length === count, dead: h.dead, plates: h.obj.userData.plates.length };
    });
    assert.deepEqual(result, { peaceful: true, before: true, first: 4, second: 6, paused: true, raid: true, stopped: true, dead: true, plates: 17 });
    assert.deepEqual(errors, []);
    console.log('Hive evolution passed', result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
