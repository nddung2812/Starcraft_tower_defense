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
    await page.locator('#introBtn').click();
    const result = await page.evaluate(async () => {
      const { MAW, BREEDS, CELL } = await import('/src/config.js');
      const { scoutRound } = await import('/src/scouting.js');
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const g = game; g.stage.render = () => {};
      const run = (seconds) => { for (let t = 0; t < seconds; t += 0.05) g.update(0.05); };
      const maws = () => g.zerglings.filter(z => z.isMaw);
      const arena = (level) => {
        g.reset(12345); g.level = level; g.loadLevel(); g.state = 'wave'; g.paused = false; g.minerals = 1e6;
        g.assault.plan = null; g.assault.pending = false; g.crateT = 1e9;
        g.queue = [{ at: 1e9, breed: 'zergling', lane: 0 }];       // the wave is still on, but nothing marches
      };
      const near = () => g.layout.open.find(([x, y]) => g.grid.buildable(x, y) && Math.hypot(x - g.core.x, y - g.core.z) < 9 && Math.hypot(x - g.core.x, y - g.core.z) > 3);
      const add = (kind) => { check(g.placeGunner(kind, ...near()), 'Cannot place ' + kind); const u = g.gunners.at(-1); u.silenceT = 1e9; u.spawnT = 1; return u; };

      // Not before its first round, even with a unit standing in the open.
      arena(MAW.firstRound - 1); add('marine'); run(MAW.first + 30);
      check(!g.ambush.marks.length && !maws().length, 'Maw appeared before its first round');

      // Aircraft and bunker troops are never marked.
      arena(MAW.firstRound);
      add('falcon'); const inside = add('marine');
      g.placeBunker(...near()); g.garrison(inside, g.bunkers[0], true);
      run(MAW.first + 12);
      check(!g.ambush.marks.length && !maws().length, 'Maw targeted an aircraft or a garrisoned unit');

      // A ground unit in the open is marked, then swallowed if it stays put.
      const prey = add('marine'); g.emit('selectOnly', prey);
      g.ambush.timer = 0; run(0.1);
      check(g.ambush.marks.length === 1 && g.mawSeen, 'No warning mark');
      const mark = g.ambush.marks[0];
      check(Math.hypot(mark.x - prey.x, mark.z - prey.z) < 0.01 && mark.mesh.parent === g.scene, 'Mark is not under the unit');
      check(!maws().length, 'Maw erupted without a warning');
      const tile = [prey.tx, prey.ty], hp = prey.hp, kills = g.kills;
      run(MAW.telegraph + 0.1);
      const maw = maws()[0];
      check(maw && maw.meal === prey && g.isEnemy(maw), 'Unit was not swallowed');
      check(!g.gunners.includes(prey) && prey.swallowed && !prey.dead, 'Swallowed unit is still on the field');
      check(g.grid.occupant(...tile) === null && g.grid.buildable(...tile), 'Swallowed unit kept its tile');
      check(!g.selection.includes(prey) && g.selected !== prey, 'Swallowed unit stayed selected');
      check(!g.ambush.marks.length && mark.mesh.parent === null, 'Mark was not removed');
      check(maw.maxHp === Math.round(BREEDS.maw.hp * (1 + (g.level - 1) * 0.1)), 'Maw health does not follow the wave');

      // Kill it while it is up: the unit comes back, hurt, on its own tile, and the kill counts.
      run(2);
      maw.takeDamage(1e6, g, 0);
      check(maw.dead && !maw.meal && g.kills === kills + 1, 'Killing the Maw did not score');
      check(g.gunners.includes(prey) && !prey.swallowed && !prey.dead, 'Unit was not freed');
      check(prey.isPlaced(g) && g.grid.occupant(prey.tx, prey.ty) === prey, 'Freed unit does not own its tile');
      check(prey.hp < hp && prey.hp >= 1, 'Time inside the Maw should cost health');
      run(2); check(!maws().length, 'Dead Maw was not cleaned up');

      // Move out of the ring and it comes up empty, then leaves without scoring.
      g.ambush.timer = 0; run(0.1);
      check(g.ambush.marks.length === 1, 'No second warning');
      const far = g.layout.open.find(([x, y]) => g.grid.buildable(x, y) && Math.hypot(x + 0.5 - prey.x, y + 0.5 - prey.z) > 4 && Math.hypot(x - g.core.x, y - g.core.z) < 12);
      g.grid.clear(prey.tx, prey.ty);
      Object.assign(prey, { tx: far[0], ty: far[1], x: far[0] + 0.5, z: far[1] + 0.5 }); g.grid.set(far[0], far[1], CELL.TOWER, prey);
      check(prey.isPlaced(g), 'Fixture move failed');
      run(MAW.telegraph + 0.1);
      const empty = maws()[0];
      check(empty && !empty.meal && g.gunners.includes(prey), 'Unit that dodged was still swallowed');
      const before = g.kills;
      run(MAW.empty + MAW.rise + MAW.dive + 0.5);
      check(!maws().length && g.kills === before, 'Empty Maw should dive without a kill');

      // Left alone, it drags the unit under for good, and the round can still finish.
      g.ambush.timer = 0; run(0.1); run(MAW.telegraph + 0.1);
      const taker = maws()[0];
      check(taker?.meal === prey, 'Third ambush did not connect');
      let took = null; g.on('mawTook', u => { took = u; });
      run(MAW.rise + MAW.hold + MAW.dive + 0.5);
      check(prey.dead && took === prey && !g.gunners.includes(prey) && !maws().length && g.kills === before, 'Unit should be lost when the Maw dives');
      g.queue = []; g.update(0.05);
      check(g.state === 'raid', 'A Maw kept a cleared round open');

      // Later rounds mark two units at once, and a new map clears pending marks.
      arena(MAW.pairRound); add('marine'); add('goliath'); add('tank');
      g.ambush.timer = 0; run(0.1);
      check(g.ambush.marks.length === 2 && g.ambush.marks[0].x !== g.ambush.marks[1].x, 'Late rounds should mark two units');
      const stale = g.ambush.marks.map(m => m.mesh);
      g.loadLevel();
      check(!g.ambush.marks.length && stale.every(m => m.parent === null), 'Marks survived a new map');
      check(scoutRound(MAW.firstRound - 1).maws === 0 && scoutRound(MAW.firstRound).maws === 1 && scoutRound(MAW.pairRound).maws === 2, 'Scouting report is wrong about Maws');

      // A picture of one holding a unit, for the eye.
      arena(MAW.firstRound); const bait = add('goliath'); add('marine');
      g.ambush.timer = 0; run(0.1);
      const spot = g.ambush.marks[0]; run(MAW.telegraph + 1.2);
      document.getElementById('intro').hidden = true;
      g.stage.focus.set(spot.x, 0.6, spot.z); g.stage.dist = 9; g.stage.updateCamera(); g.emit('selectOnly', maws()[0]); g.emit('change');
      return { firstRound: MAW.firstRound, pairRound: MAW.pairRound, telegraph: MAW.telegraph, hold: MAW.hold, held: bait.swallowed || g.gunners.some(u => u.swallowed) || !!maws()[0].meal };
    });
    await page.evaluate(() => { delete game.stage.render; game.stage.render(); });
    assert.match(await page.locator('#pName').textContent(), /Tunnel Maw/);
    assert.match(await page.locator('#pBio').textContent(), /swallows/);
    await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), 'ridgewatch-maw.png') });
    assert.deepEqual(errors, []);
    console.log('PASS: Tunnel Maw first round, air/bunker immunity, warning mark, swallow, rescue, dodge, loss, round end, paired ambush, mark cleanup, scouting and inspector', result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
