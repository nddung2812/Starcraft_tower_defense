// The corner stats card: selection, live health, build card previews, and staying clear of the dock.
// Serve the repo on port 8765, then: node tests/browser-unit-card.cjs [playwright-core dir]
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345');
    await page.waitForFunction(() => window.game?.stage);
    await page.locator('#introBtn').click();
    await page.evaluate(async () => {
      const { Marine, Zergling, Wall, Bunker } = await import('/src/entities.js');
      const g = game; g.paused = true; g.stage.render = () => {};
      const at = { x: Math.floor(g.core.x) - 6, y: Math.floor(g.core.z) };
      const trooper = n => { const m = new Marine('marine', at.x + n, at.y + 3, []); g.gunners.push(m); g.world.add(m.obj); return m; };
      const bug = new Zergling(at.x, at.y, 'zergling', 1, 1); g.zerglings.push(bug); g.world.add(bug.obj);
      const wall = new Wall(at.x + 1, at.y, 320); g.walls.push(wall); g.world.add(wall.obj);
      const bunker = new Bunker(at.x + 2, at.y, 300, 0); g.bunkers.push(bunker); g.world.add(bunker.obj);
      window.T = { a: trooper(0), b: trooper(1), bug, wall, bunker };
    });
    const card = page.locator('#unitCard');
    const pick = name => page.evaluate(n => game.emit('selectOnly', T[n]), name);
    const text = id => page.locator(id).textContent();

    // ---- nothing selected: nothing on the battlefield ----
    assert.equal(await card.isVisible(), false, 'The card shows with nothing selected');

    // ---- a selected unit, tucked into the corner, clear of the dock ----
    await pick('a');
    assert.equal(await card.isVisible(), true);
    assert.equal(await text('#cardName'), 'Trooper');
    const stats = await text('#cardStats');
    for (const label of ['Damage', 'Armour', 'Fire Rate', 'Range', 'Targets', 'Move Speed']) assert.ok(stats.includes(label), `${label} is missing`);
    assert.ok(!stats.includes('Hit Points'), 'Health belongs in the bar');
    const hp = await page.evaluate(() => `${Math.ceil(T.a.hp)} / ${Math.round(T.a.maxHp)}`);
    assert.equal(await text('#cardHealthText'), hp);

    // ---- it matches the unit panel exactly ----
    const panel = await page.evaluate(() => [...document.querySelectorAll('#stats .stat')].map(s => s.querySelector('.stat__v').textContent).slice(1));
    const shown = await page.evaluate(() => [...document.querySelectorAll('#cardStats b')].map(b => b.textContent));
    assert.deepEqual(shown, panel);

    // ---- health follows damage ----
    await page.evaluate(() => { T.a.hp = Math.ceil(T.a.maxHp / 2); game.emit('selectOnly', T.a); });
    assert.equal(await text('#cardHealthText'), await page.evaluate(() => `${T.a.hp} / ${Math.round(T.a.maxHp)}`));

    // ---- every kind of thing you can click ----
    await pick('bug'); assert.equal(await text('#cardName'), await page.evaluate(() => T.bug.breed.name));
    assert.ok((await text('#cardStats')).includes('Attack Rate'));
    await pick('wall'); assert.equal(await text('#cardName'), 'Barrier');
    await pick('bunker'); assert.equal(await text('#cardName'), 'Bunker');
    assert.match(await text('#cardRole'), /0 \/ 2 garrisoned/);

    // ---- several units: the first one's stats, with the count ----
    await page.keyboard.press('F2');
    assert.equal(await card.isVisible(), true);
    assert.match(await text('#cardRole'), /\d+ selected/);
    await page.evaluate(() => game.emit('selectOnly', null));
    assert.equal(await card.isVisible(), false, 'The card stays after deselecting');

    // ---- a build card previews its unit, then hands back the selection ----
    await pick('a');
    await page.locator('[data-build="goliath"]').hover();
    assert.equal(await card.isVisible(), true);
    assert.equal(await text('#cardName'), await page.evaluate(async () => (await import('/src/config.js')).UNITS.goliath.info.name));
    assert.match(await text('#cardRole'), /\d+ minerals/);
    assert.equal(await page.locator('#cardHealth').isVisible(), false, 'An unbuilt unit has no health bar');
    assert.equal(await page.evaluate(() => game.selection[0] === T.a), true, 'Hovering changed the selection');
    await page.mouse.move(700, 300);
    assert.equal(await text('#cardName'), 'Trooper');
    await page.evaluate(() => game.emit('selectOnly', null));
    await page.locator('[data-build="tank"]').hover();
    assert.equal(await card.isVisible(), true, 'A build card previews with nothing selected');
    await page.mouse.move(700, 300);
    assert.equal(await card.isVisible(), false);

    // ---- the unit being placed stays on the card ----
    await page.keyboard.press('t');
    assert.equal(await card.isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await card.isVisible(), false);

    // ---- the open panel replaces it ----
    await pick('a');
    await page.keyboard.press('i');
    assert.equal(await card.isVisible(), false, 'The card doubles up with the open panel');
    await page.keyboard.press('i');
    assert.equal(await card.isVisible(), true);

    // ---- it never lets a click stop at the card ----
    assert.equal(await card.evaluate(el => getComputedStyle(el).pointerEvents), 'none');

    // ---- no overlap with the dock, and every line fits, at each window size ----
    const fits = [];
    for (const [width, height] of [[800, 700], [1024, 768], [1100, 800], [1101, 800], [1280, 800], [1440, 900], [1920, 1080], [2560, 1440]]) {
      await page.setViewportSize({ width, height });
      for (const kind of ['marine', 'tank', 'mender', 'cruiser']) {
        const out = await page.evaluate(async k => {
          const { Marine } = await import('/src/entities.js');
          const u = new Marine(k, T.a.tx, T.a.ty, []); game.gunners.push(u); game.world.add(u.obj);
          game.emit('selectOnly', u);
          const c = document.getElementById('unitCard'), box = c.getBoundingClientRect(), dock = document.querySelector('.dock').getBoundingClientRect(), stage = document.querySelector('.stage').getBoundingClientRect();
          const apart = box.left >= dock.right || box.bottom <= dock.top;
          return { apart, right: box.right, bottom: box.bottom, stageRight: stage.right, stageBottom: stage.bottom, clipped: c.scrollHeight > c.clientHeight };
        }, kind);
        assert.ok(out.apart, `${width}px: the card overlaps the dock`);
        assert.ok(out.right <= out.stageRight && out.bottom <= out.stageBottom, `${width}px: the card leaves the battlefield`);
        assert.equal(out.clipped, false, `${width}px: ${kind}'s stats are cut off`);
      }
      fits.push(width);
    }

    // ---- phones keep the map and use the info button ----
    await page.setViewportSize({ width: 390, height: 800 });
    assert.equal(await card.isVisible(), false, 'The card covers a phone screen');

    assert.deepEqual(errors, []);
    console.log('PASS: selection, live health, every target, build previews, open panel, click-through, layout at', fits.join(', '));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
