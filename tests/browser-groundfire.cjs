// Air strike ground fire: 5 seconds, 10 damage a second, no stacking, ground enemies only, optional layer.
// Serve the repo on port 8765, then: node tests/browser-groundfire.cjs [playwright-core dir]
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345');
    await page.waitForFunction(() => window.game?.stage && window.game.extras.groundfire, null, { polling: 50 });

    const out = await page.evaluate(async () => {
      const { AIR_STRIKE } = await import('/src/config.js');
      const { Zergling, Marine } = await import('/src/entities.js');
      const g = game, fire = g.groundFire, out = {}, check = (ok, message) => { if (!ok) throw Error(message); };
      g.stage.render = () => {};
      check(AIR_STRIKE.fire.seconds === 5 && AIR_STRIKE.fire.dps === 10, 'The flames last 5 seconds at 10 damage a second');
      const bug = (x, z, armor = 0) => {
        const b = new Zergling(x, z, 'zergling', 1, 1);
        b.hp = b.maxHp = 10000; b.armor = armor; b.speed = 0; b.update = () => {};
        g.zerglings.push(b); g.world.add(b.obj); return b;
      };
      const run = seconds => { for (let i = Math.round(seconds / 0.05); i > 0; i--) g.update(0.05); };
      const lost = b => b.maxHp - b.hp;
      const fresh = () => {
        g.reset(12345); g.level = 4; g.loadLevel(); g.state = 'wave'; g.queue = []; g.crateT = 1e9;
        g.core.update = () => {};
        for (const m of g.gunners) m.update = () => {};
        const at = { x: g.core.x - 6, z: g.core.z };
        bug(at.x + 40, at.z + 40);       // keeps the round open
        return at;
      };

      // One patch: exact damage over its whole life, then nothing.
      let at = fresh();
      const plain = bug(at.x, at.z), armored = bug(at.x + 0.5, at.z, 3), outside = bug(at.x + 3, at.z);
      const flyer = bug(at.x, at.z + 0.5); flyer.flying = true;
      const ally = new Marine('marine', Math.floor(at.x), Math.floor(at.z), []); ally.update = () => {};
      g.gunners.push(ally); g.world.add(ally.obj);
      const allyHp = ally.hp, glow = (fire.ignite(at.x, at.z), fire.fires[0].glow);
      check(glow.parent === g.scene, 'The patch glows on the ground');
      run(2);
      check(lost(plain) === 20, `2 seconds should burn 20, burned ${lost(plain)}`);
      run(3);
      out.fiveSeconds = lost(plain);
      check(lost(plain) === 50, `5 seconds should burn 50, burned ${lost(plain)}`);
      check(lost(armored) === 50, `Armour should not reduce the burn, burned ${lost(armored)}`);
      check(lost(outside) === 0, 'An enemy outside the flames burned');
      check(lost(flyer) === 0, 'An aircraft burned');
      check(ally.hp === allyHp, 'Our own unit burned');
      check(fire.fires.length === 0 && !glow.parent, 'The patch should be gone after 5 seconds');
      run(2);
      check(lost(plain) === 50, 'Damage continued after the flames went out');

      // Overlapping patches keep the rate at 10 a second.
      at = fresh();
      const overlapped = bug(at.x, at.z);
      fire.ignite(at.x, at.z); fire.ignite(at.x + 0.4, at.z); fire.ignite(at.x, at.z + 0.4);
      run(3);
      out.overlapThreeSeconds = lost(overlapped);
      check(lost(overlapped) === 30, `Overlap should still burn 10 a second, burned ${lost(overlapped)} in 3 s`);

      // A real strike: every bomb leaves a patch after it lands.
      at = fresh();
      g.airStrikeCd = 0;
      check(g.callAirStrike(at.x, at.z), 'The strike was refused');
      check(fire.fires.length === 0, 'Flames appeared before a bomb landed');
      run(1.6);
      out.patches = fire.fires.length;
      check(fire.fires.length === AIR_STRIKE.bombs, `Expected a patch per bomb, found ${fire.fires.length}`);
      run(5);
      check(fire.fires.length === 0, 'A strike\'s flames outlasted 5 seconds');

      // A burn kill counts, and hives burn too.
      at = fresh();
      const victim = bug(at.x, at.z); victim.hp = 8;
      const kills = g.kills, hive = g.hives[0], hiveHp = hive.hp;
      fire.ignite(at.x, at.z); fire.ignite(hive.x, hive.z);
      run(1);
      check(victim.dead && g.kills === kills + 1, 'A burn kill was not counted');
      check(hiveHp - hive.hp === 10, `A hive should burn 10 a second, burned ${hiveHp - hive.hp}`);

      // The flames end with the map.
      const left = fire.fires[0].glow;
      g.loadLevel();
      check(fire.fires.length === 0 && !left.parent, 'A new map kept the old flames');

      // Without the layer a strike still explodes.
      at = fresh();
      g.groundFire = null; g.airStrikeCd = 0;
      const blasted = bug(at.x, at.z);
      check(g.callAirStrike(at.x, at.z), 'The strike was refused without the layer');
      run(2);
      check(lost(blasted) > 0, 'The bombs did no damage without the layer');
      g.groundFire = fire;
      return out;
    });
    assert.deepEqual(errors, []);
    console.log('PASS: 5 s burn at 10 damage a second, armour, no stacking, ground only, a patch per bomb, kills, hives, map change, missing layer', out);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
