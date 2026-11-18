// A Hammer on Defend locks into siege mode: it stops, deploys, reaches farther and hits 50% harder.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345'); await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    await page.addStyleTag({ content: '#pauseMenu{display:none!important}' });
    await page.evaluate(() => {
      const g = game; g.stage.render = () => {}; g.paused = false; g.minerals = 99999; g.state = 'wave';
      g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; g.zerglings.length = 0;
      const cell = g.layout.open.find(([x, y]) => g.grid.buildable(x, y) && Math.hypot(x - g.core.x, y - g.core.z) > 3 && Math.hypot(x - g.core.x, y - g.core.z) < 9);
      g.placeGunner('tank', cell[0], cell[1]);
      window.T = g.gunners.at(-1); T.spawnT = 1;
      window.hold = () => { g.state = 'wave'; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; };
      window.run = (s, keep = true) => { for (let i = 0; i < Math.round(s / 0.05); i++) { hold(); if (keep) g.zerglings.length = 0; g.update(0.05); } };
      g.emit('selectOnly', T); g.paused = true;
    });

    // ---- the D key switches it on, and a moving tank stops to do it ----
    const before = await page.evaluate(async () => {
      const { CELL } = await import('/src/config.js');
      const g = game; g.paused = false;
      const open = g.layout.open.filter(([x, y]) => g.grid.get(x, y) === CELL.OPEN).sort((a, b) => Math.hypot(b[0] - T.x, b[1] - T.z) - Math.hypot(a[0] - T.x, a[1] - T.z))[0];
      const out = { range: T.attackRange, damage: T.attackDamage, ordered: g.commandMove([T], open[0], open[1], 'move') > 0 };
      run(0.5); out.moving = T.driving; g.paused = true;
      return out;
    });
    assert.deepEqual(before, { range: 7, damage: 38, ordered: true, moving: true });
    await page.keyboard.press('d');
    const r = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const g = game, out = { sieged: T.sieged }; g.paused = false;
      for (let i = 0; i < 200 && T.driving; i++) run(0.05);
      out.parked = !T.driving;
      const spot = [T.x, T.z];

      // ---- no shots while the legs go down ----
      const bug = (d) => { const a = T.yaw, b = new Zergling(T.x + Math.cos(a) * d, T.z + Math.sin(a) * d, 'zergling', 1, 0.001); b.hp = b.maxHp = 1e6; b.speed = 0; b.damage = 0; return b; };
      const shells = () => g.shells.length; let fired = 0; const spawn = g.spawnShell.bind(g); const hits = [];
      g.spawnShell = (m, x, z, damage, splash) => { fired++; hits.push(damage); return spawn(m, x, z, damage, splash); };
      T.siegeAmount = 0; const near = bug(4); T.cooldown = 0;
      for (let i = 0; i < 24; i++) { hold(); g.zerglings.length = 0; g.zerglings.push(near); g.update(0.05); }
      out.deploying = { amount: T.siegeAmount > 0 && T.siegeAmount < 1, fired, ready: T.siegeReady, range: T.attackRange };
      run(1);
      out.deployed = { ready: T.siegeReady, range: T.attackRange, damage: T.attackDamage, barrel: +T.model.userData.weapon.scale.x.toFixed(2), legs: !!T.siegeRig?.visible };

      // ---- deployed it hits a far target for 50% more ----
      const far = bug(10.5); T.cooldown = 0; T.target = null;
      for (let i = 0; i < 40 && !fired; i++) { hold(); g.zerglings.length = 0; g.zerglings.push(far); g.update(0.05); }
      out.farShot = { fired: fired > 0, damage: hits[0] };
      g.zerglings.length = 0;

      // ---- it ignores move orders, never chases, and stays home on Attack ----
      out.moveRefused = g.commandMove([T], Math.floor(g.core.x), Math.floor(g.core.z), 'move');
      const distant = bug(16); g.zerglings.length = 0; g.zerglings.push(distant); out.attackAccepted = T.orderAttack(distant, g);
      for (let i = 0; i < 40; i++) { hold(); g.zerglings.length = 0; g.zerglings.push(distant); g.update(0.05); }
      out.held = Math.hypot(T.x - spot[0], T.z - spot[1]) < 0.01 && !T.driving;
      T.order = null; g.zerglings.length = 0;
      g.commandAdvanceArmy(); out.advance = T.order?.type ?? null;
      for (const u of g.gunners) if (u !== T) u.stop(g);
      g.paused = true; g.emit('selectOnly', T); g.emit('change');
      return out;
    });
    assert.equal(r.sieged, true); assert.equal(r.parked, true);
    assert.deepEqual(r.deploying, { amount: true, fired: 0, ready: false, range: 7 }, 'No fire and no bonus while deploying');
    assert.deepEqual(r.deployed, { ready: true, range: 11.5, damage: 57, barrel: 1.55, legs: true });
    assert.deepEqual(r.farShot, { fired: true, damage: 57 }, 'A target beyond normal range takes +50%');
    assert.equal(r.moveRefused, 0); assert.equal(r.attackAccepted, true); assert.equal(r.held, true, 'It never leaves its spot');
    assert.equal(r.advance, null, 'Army Attack leaves it in place');

    // ---- the panel shows the siege numbers ----
    await page.keyboard.press('i');
    await page.waitForTimeout(150);
    assert.match(await page.locator('#pRole').textContent(), /SIEGE MODE/);
    const stats = await page.locator('#stats').textContent();
    assert.match(stats, /57 ×2/); assert.match(stats, /11\.5 tiles/); assert.match(stats, /Locked/);
    await page.keyboard.press('i');

    // ---- D again: it packs up first, then drives ----
    await page.keyboard.press('d');
    const out = await page.evaluate(async () => {
      const { CELL } = await import('/src/config.js');
      const g = game, o = { sieged: T.sieged, range: T.attackRange, damage: T.attackDamage }; g.paused = false;
      const spot = [T.x, T.z];
      const open = g.layout.open.filter(([x, y]) => g.grid.get(x, y) === CELL.OPEN).sort((a, b) => Math.hypot(b[0] - T.x, b[1] - T.z) - Math.hypot(a[0] - T.x, a[1] - T.z))[0];
      o.ordered = g.commandMove([T], open[0], open[1], 'move') > 0;
      run(0.6); o.packing = Math.hypot(T.x - spot[0], T.z - spot[1]) < 0.01 && T.siegeAmount > 0;
      run(2.5); o.moved = Math.hypot(T.x - spot[0], T.z - spot[1]) > 0.5; o.amount = T.siegeAmount;
      o.barrel = +T.model.userData.weapon.scale.x.toFixed(2); o.legs = T.siegeRig.visible;
      return o;
    });
    assert.deepEqual(out, { sieged: false, range: 7, damage: 38, ordered: true, packing: true, moved: true, amount: 0, barrel: 1, legs: false });
    assert.deepEqual(errors, []);
    console.log('PASS: D key, parks then deploys, no fire while deploying, +4.5 range, +50% damage, locked in place, inspector, packs up and drives');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
