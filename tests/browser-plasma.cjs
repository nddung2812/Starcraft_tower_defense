// The plasma shield: appears at base level 3, grows every third level, and takes the damage meant for what is inside.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345'); await page.waitForFunction(() => window.game?.plasma);
    await page.locator('#introBtn').click();
    const r = await page.evaluate(async () => {
      const { PLASMA_SHIELD: S, plasmaRadius, plasmaPool } = await import('/src/config.js');
      const g = game, p = g.plasma, out = {};
      g.stage.render = () => {}; g.paused = false; g.state = 'wave'; g.zerglings.length = 0;
      g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }];
      const research = () => { g.minerals = 1e6; g.upgradeBase(); g.completeBaseUpgrade(); g.update(0.05); };

      // ---- nothing until level 3 ----
      research(); research();
      out.level2 = { up: p.up, visible: p.obj.visible, hit: p.absorb(g.core, 10) };
      research();
      out.level3 = { up: p.up, visible: p.obj.visible, radius: p.radius, pool: p.pool, callout: document.getElementById('calloutTitle').textContent };
      research();
      out.level4Radius = p.radius;
      research(); research();
      out.level6 = { radius: p.radius, pool: p.pool, callout: document.getElementById('calloutTitle').textContent };
      out.bigger = plasmaRadius(2) > plasmaRadius(1) && plasmaPool(2) > plasmaPool(1);
      out.cap = plasmaRadius(50) === S.maxRadius;

      // ---- inside is protected, outside is not ----
      const inside = g.gunners[0]; inside.x = g.core.x + 2; inside.z = g.core.z;
      const hp = inside.hp, coreHp = g.core.hp, pool = p.pool;
      inside.takeDamage(40, g, 0); g.core.takeDamage(25, g, 0);
      out.inside = { unit: inside.hp === hp, core: g.core.hp === coreHp, drained: pool - p.pool };
      const outside = g.gunners[1]; outside.x = g.core.x + p.radius + 1; outside.z = g.core.z;
      const far = outside.hp; outside.takeDamage(40, g, 0);
      out.outside = outside.hp < far;
      out.covers = [p.covers(inside), p.covers(outside)];

      // ---- it waits for quiet, then recharges slowly ----
      const keep = () => { g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; g.zerglings.length = 0; };
      const run = seconds => { for (let i = 0; i < Math.round(seconds / 0.05); i++) { keep(); g.update(0.05); } };
      p.pool = 100; p.sinceHit = 0;
      const low = p.pool; run(S.regenDelay - 1);
      out.quiet = p.pool === low;
      run(1); const start = p.pool; run(10);
      out.regenPerSecond = (p.pool - start) / 10 / p.maxPool;

      // ---- broken: hits land, it stays down while the base is under attack, and returns weak ----
      g.core.takeDamage(p.pool + 1, g, 0);
      out.broken = { up: p.up, visible: p.obj.visible, pool: p.pool, toast: document.getElementById('toasts').textContent };
      const before = g.core.hp; g.core.takeDamage(30, g, 0);
      out.exposed = g.core.hp === before - 30;
      for (let i = 0; i < 6; i++) { run(5); g.core.hp = g.core.maxHp; g.core.takeDamage(1, g, 0); }
      out.underAttack = { up: p.up, pool: p.pool };
      run(S.regenDelay + S.restart / S.regen - 1);
      out.stillDown = p.up;
      run(2);
      out.rebooted = { up: p.up, visible: p.obj.visible, weak: p.pool < p.maxPool * (S.restart + 0.05) };

      // ---- a new map does not refill it, and it moves with the base ----
      p.pool = 50; g.loadLevel(); g.update(0.05);
      out.newMap = { same: p.core === g.core, kept: Math.abs(p.pool - 50) < 1, x: p.obj.position.x === g.core.x };
      out.panel = p.summary();
      g.reset(12345); g.update(0.05);
      out.reset = { tier: p.tier, visible: p.obj.visible };
      return out;
    });
    assert.deepEqual(r.level2, { up: false, visible: false, hit: false }, 'No shield before level 3');
    assert.deepEqual(r.level3, { up: true, visible: true, radius: 5, pool: 300, callout: 'Plasma shield online' });
    assert.equal(r.level4Radius, 5, 'Grows every third level');
    assert.deepEqual(r.level6, { radius: 6.5, pool: 450, callout: 'Plasma shield expanded' });
    assert.equal(r.bigger, true); assert.equal(r.cap, true);
    assert.deepEqual(r.inside, { unit: true, core: true, drained: 65 }, 'Inside takes no damage and the shield pays');
    assert.equal(r.outside, true, 'Outside the globe still takes damage');
    assert.deepEqual(r.covers, [true, false]);
    assert.equal(r.quiet, true, 'No recharge straight after a hit');
    assert.ok(Math.abs(r.regenPerSecond - 0.02) < 0.002, `Slow recharge, got ${r.regenPerSecond}`);
    assert.equal(r.broken.up, false); assert.equal(r.broken.visible, false); assert.equal(r.broken.pool, 0);
    assert.match(r.broken.toast, /Plasma shield down/);
    assert.equal(r.exposed, true, 'A broken shield protects nothing');
    assert.deepEqual(r.underAttack, { up: false, pool: 0 }, 'No recharge while the base is under attack');
    assert.equal(r.stillDown, false, 'Still down until the slow recharge reaches the restart level');
    assert.deepEqual(r.rebooted, { up: true, visible: true, weak: true }, 'Comes back weak');
    assert.deepEqual(r.newMap, { same: true, kept: true, x: true }, 'A new round is not a free refill');
    assert.match(r.panel, /^Shield 6\.5 tiles · 11%$/);
    assert.deepEqual(r.reset, { tier: 0, visible: false });

    // ---- a missing file costs the shield and nothing else ----
    const bare = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const bareErrors = []; bare.on('pageerror', e => bareErrors.push(e.message));
    await bare.route('**/src/plasma.js', route => route.abort());
    await bare.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345'); await bare.waitForFunction(() => window.game);
    await bare.locator('#introBtn').click();
    const missing = await bare.evaluate(() => { const g = game; g.paused = false; g.state = 'wave'; const hp = g.core.hp; g.core.takeDamage(10, g, 0); g.update(0.05); return { plasma: g.plasma ?? null, hurt: g.core.hp === hp - 10 }; });
    assert.deepEqual(missing, { plasma: null, hurt: true });
    assert.deepEqual(bareErrors, []);
    assert.deepEqual(errors, []);
    console.log('PASS: level 3 unlock, growth every third level, inside protected, outside exposed, slow recharge only when quiet, break, weak return, no refill on a new map, reset, missing layer');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
