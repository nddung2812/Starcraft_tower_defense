// A Medic sent to attack follows the soldiers instead of walking ahead of them to the objective.
const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.route('**/src/hero.js', route => route.abort());   // this suite counts the army, so it runs without the hero (tests/browser-hero.cjs covers the hero)
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/?seed=12345'); await page.waitForFunction(() => window.game);
    await page.locator('#introBtn').click();
    const r = await page.evaluate(async () => {
      const { Zergling } = await import('/src/entities.js');
      const { CELL } = await import('/src/config.js');
      const g = game, out = {};
      g.stage.render = () => {}; g.paused = false; g.level = 6; g.minerals = 99999;
      const quiet = () => { g.state = 'wave'; g.zerglings.length = 0; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; for (const h of g.hives) h.broodT = 1e9; };
      const near = (from, skip = 1) => { for (let r = skip; r < 9; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (g.canBuildAt(from.tx + dx, from.ty + dy)) return [from.tx + dx, from.ty + dy]; };
      const lead = g.gunners[0];
      const [mx, my] = near(lead); g.placeGunner('mender', mx, my);
      const medic = g.gunners.at(-1);
      for (const u of g.gunners) { u.spawnT = 1; u.hp = u.maxHp; }
      quiet();

      // ---- on the march the Medic never gets in front of the soldiers ----
      const soldiers = () => g.gunners.filter(u => !u.spec.heals && !u.dead);
      g.commandAdvanceArmy();
      out.sent = medic.order?.type;
      const hive = medic.order.target, left = u => Math.hypot(hive.x - u.x, hive.z - u.z);
      const start = left(medic);
      let worstLead = -Infinity, farthest = 0;
      for (let i = 0; i < 400; i++) {
        quiet(); g.update(0.05);
        const front = Math.min(...soldiers().map(left));
        worstLead = Math.max(worstLead, front - left(medic));
        farthest = Math.max(farthest, Math.min(...soldiers().map(u => u.distTo(medic))));
      }
      out.worstLead = worstLead; out.farthest = farthest; out.moved = start - left(medic);

      // ---- soldiers stop to fight: the Medic stops with them, it does not carry on alone ----
      const front = soldiers().sort((a, b) => left(a) - left(b))[0];
      const pin = new Zergling(front.x + (hive.x - front.x) / Math.max(1, left(front)) * 3, front.z + (hive.z - front.z) / Math.max(1, left(front)) * 3, 'zergling', 1, 0.001);
      pin.hp = pin.maxHp = 1e7; pin.speed = 0; pin.damage = 0;
      let pinnedLead = -Infinity;
      for (let i = 0; i < 200; i++) {
        g.state = 'wave'; g.queue = [{ at: 1e9, breed: 'zergling', hpScale: 1, speedScale: 1 }]; g.zerglings.length = 0; g.zerglings.push(pin); pin.x = pin.x; g.update(0.05);
        pinnedLead = Math.max(pinnedLead, Math.min(...soldiers().map(left)) - left(medic));
      }
      out.pinnedLead = pinnedLead;
      quiet();

      // ---- a Medic that starts out in front drops back behind them ----
      g.commandStop(g.gunners); for (let i = 0; i < 20; i++) { quiet(); g.update(0.05); }
      for (const u of g.gunners) u.hp = u.maxHp;
      g.commandAdvanceArmy();
      const leader = soldiers().sort((a, b) => left(a) - left(b))[0];
      const way = leader.waypoints?.[Math.min(leader.wp + 7, (leader.waypoints?.length || 1) - 1)];
      out.placedAhead = !!way;
      if (way) { medic.x = way.x; medic.z = way.y; medic.tx = Math.floor(way.x); medic.ty = Math.floor(way.y); medic.waypoints = null; medic.driving = false; medic.chaseT = 0; }
      out.aheadAtStart = Math.min(...soldiers().map(left)) - left(medic);
      const forward = left(medic);
      for (let i = 0; i < 50; i++) { quiet(); g.update(0.05); }
      out.walkedBack = left(medic) - forward;
      for (let i = 0; i < 200; i++) { quiet(); g.update(0.05); }
      out.dropped = Math.min(...soldiers().map(left)) - left(medic);

      // ---- alone, it holds its ground rather than walking at the hive ----
      for (const u of soldiers()) { u.order = null; u.defend = true; }
      medic.order = { type: 'advance', target: hive }; medic.chaseT = 0;
      for (let i = 0; i < 10; i++) { quiet(); g.update(0.05); }
      const before = left(medic); for (let i = 0; i < 120; i++) { quiet(); g.update(0.05); }
      out.alone = Math.abs(before - left(medic));
      out.aloneOrder = medic.order?.type;
      return out;
    });
    assert.equal(r.sent, 'advance');
    assert.ok(r.moved > 3, `The Medic should travel with the army, moved ${r.moved.toFixed(1)} tiles`);
    assert.ok(r.worstLead <= 0.6, `Medic ran ${r.worstLead.toFixed(2)} tiles ahead of the front soldier`);
    assert.ok(r.farthest <= 6, `Medic fell ${r.farthest.toFixed(1)} tiles behind`);
    assert.ok(r.pinnedLead <= 0.6, `Medic passed soldiers who stopped to fight by ${r.pinnedLead.toFixed(2)}`);
    assert.equal(r.placedAhead, true); assert.ok(r.aheadAtStart > 1, 'The Medic should start in front');
    assert.ok(r.walkedBack > 1, `A Medic in front should walk back to the soldiers, moved ${r.walkedBack.toFixed(1)}`);
    assert.ok(r.dropped <= 0.6, `Medic stayed ${r.dropped.toFixed(2)} tiles in front`);
    assert.ok(r.alone < 0.6, `A lone Medic walked ${r.alone.toFixed(1)} tiles toward the hive`);
    assert.equal(r.aloneOrder, 'advance');
    assert.deepEqual(errors, []);
    console.log('PASS: Medic trails the soldiers on the march, stops when they fight, drops back when ahead, holds when alone', r);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
