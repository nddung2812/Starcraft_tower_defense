/*
 * Hive upgrades and thorns. Serve the repo on port 8765, then
 *   node tests/browser-thorns.cjs [absolute path to playwright-core]
 * Checks the free upgrade every 15 s (health added, never refilled), the growing model, the thorns
 * waking at 15 s, the warning and dodge, who can be hit, Survival mode's pace, and a missing layer.
 */
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
const URL = process.env.TEST_URL || 'http://127.0.0.1:8765/';

const open = async (browser, block) => {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (block) await page.route('**/src/thorns.js', route => route.abort());
  await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
  await page.goto(URL);
  await page.waitForFunction(() => window.game?.extras?.skirmish, null, { polling: 50 });
  await page.evaluate(() => { game.stage.render = () => {}; document.getElementById('intro').hidden = true; });
  return { page, errors };
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const { page, errors } = await open(browser);
    const upgrades = await page.evaluate(() => {
      const g = game; g.reset(12345); g.state = 'wave';
      const h = g.hives[0], start = h.maxHp, step = h.upgradeHp;
      h.takeDamage(100, g);
      h.update(14.9, g);
      const early = [h.upgrades, h.hp, h.maxHp];
      const parts = h.obj.userData.egg.children.length;
      h.update(0.1, g);
      const once = [h.upgrades, h.hp, h.maxHp];
      const grew = h.obj.userData.egg.children.length > parts;
      const size = [];
      for (let i = 0; i < 21; i++) { size.push(+h.obj.scale.x.toFixed(3)); h.update(15, g); }
      return { start, step, early, once, grew, size, missing: h.maxHp - h.hp };
    });
    assert.equal(upgrades.step, 30, 'a round-one hive gains 10% of its starting health');
    assert.deepEqual(upgrades.early, [0, 200, 300]);
    assert.deepEqual(upgrades.once, [1, 230, 330], 'health is added on top: the damage stays');
    assert.equal(upgrades.missing, 100, 'upgrades never refill the bar');
    assert.ok(upgrades.grew, 'each upgrade adds to the model');
    assert.ok(upgrades.size.every((s, i) => !i || s >= upgrades.size[i - 1]) && upgrades.size.at(-1) === 1.6, `the hive swells to a cap (${upgrades.size})`);

    const thorns = await page.evaluate(() => {
      const g = game; g.reset(12345); g.state = 'wave';
      g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }];
      g.hives.slice(1).forEach(h => { h.dead = true; });
      const h = g.hives[0], t = g.thorns, spot = g.openNear(g.grid.core.x, g.grid.core.y);
      g.minerals = 1000; g.placeGunner('marine', spot.x, spot.y);
      const u = g.gunners.at(-1);
      u.update = () => {}; u.maxHp = u.hp = 5000; u.stats.armor = 0;
      const put = (e, x, z) => { e.x = x; e.z = z; e.obj.position.set(x, 0, z); };
      const run = (s) => { for (let i = 0; i < s / 0.05; i++) { t.update(0.05); } };
      const live = () => t.slots.filter(s => s.live).length;
      put(u, h.x + 4, h.z);
      h.battleT = 14; h.thornT = 0; run(0.9);
      const asleep = live() === 0 && u.hp === 5000;
      h.battleT = 15; h.upgrades = 4; run(0.05);
      const marked = live() === 1 && u.hp === 5000 && t.slots.find(s => s.live).mark.visible;
      run(1.0);
      const hit = 5000 - u.hp;
      run(1); const cleaned = live() === 0;
      u.hp = 5000; h.thornT = 0; run(0.05); put(u, h.x + 7, h.z); run(1.2);
      const dodged = u.hp === 5000;
      run(4); h.thornT = 1e9; run(2);
      put(u, h.x + 12, h.z); u.hp = 5000; h.thornT = 0; run(1.5);
      const outOfRange = u.hp === 5000 && live() === 0;
      put(u, h.x + 4, h.z); u.flying = true; h.thornT = 0; run(1.5);
      const aircraft = u.hp === 5000; u.flying = false;
      u.bunker = {}; h.thornT = 0; run(1.5);
      const crew = u.hp === 5000; u.bunker = null;
      h.thornT = 0; run(0.2); g.state = 'brief'; t.update(0.05);
      return { asleep, marked, hit, cleaned, dodged, outOfRange, aircraft, crew, cleared: live() === 0 };
    });
    assert.deepEqual(thorns, { asleep: true, marked: true, hit: 23, cleaned: true, dodged: true, outOfRange: true, aircraft: true, crew: true, cleared: true });

    const match = await page.evaluate(async () => {
      const { Match, rulesFor, normalizeSetup } = await import('/src/skirmish.js');
      const g = game; g.reset(12345); g.state = 'wave';
      const paces = ['calm', 'standard', 'fierce'].map(mood => rulesFor(normalizeSetup({ mood })).hiveHpPerUpgrade);
      g.match = new Match(g, 'T', normalizeSetup(null));
      const h = g.hives[0], bugs = g.zerglings.length;
      h.update(15, g);
      const after = [h.hp, h.maxHp, g.zerglings.length - bugs];
      g.match.launchWave();
      const wave = h.maxHp;
      g.match = null;
      return { paces, after, wave };
    });
    assert.deepEqual(match, { paces: [51, 75, 113], after: [2675, 2675, 0], wave: 2675 });
    assert.deepEqual(errors, []);
    await page.close();

    const missing = await open(browser, true);
    const bare = await missing.page.evaluate(() => {
      const g = game; g.reset(12345); g.state = 'wave';
      const h = g.hives[0], max = h.maxHp; h.update(45, g); g.update(0.05);
      return { layer: g.thorns, gained: h.maxHp - max };
    });
    assert.deepEqual(bare, { layer: null, gained: 90 });
    assert.deepEqual(missing.errors, []);
    console.log('PASS: free upgrades add health without refilling, the hive grows, thorns wake at 15 s, warn, can be dodged, spare aircraft and bunker crews, Survival pace, missing layer');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
