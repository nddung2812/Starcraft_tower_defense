const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    const result = await page.evaluate(async () => {
      const { Marine, Bunker, Zergling } = await import('/src/entities.js');
      const { CELL } = await import('/src/config.js');
      const check = (ok, message) => { if (!ok) throw Error(message); };
      const g = game; g.reset(12345); g.state = 'wave'; g.paused = false;
      for (let y = 16; y < 28; y++) for (let x = 16; x < 30; x++) g.grid.set(x, y, CELL.OPEN);
      const b = new Bunker(20, 20, 300, 0); b.spawnT = 1; g.bunkers.push(b); g.world.add(b.obj); g.grid.set(20, 20, CELL.BUNKER, b);
      const soldiers = [new Marine('marine', 19, 20, []), new Marine('marine', 20, 19, []), new Marine('marine', 19, 19, [])];
      for (const m of soldiers) { g.gunners.push(m); g.world.add(m.obj); }
      const enemy = new Zergling(26.5, 20.5, 'warrior', 10, 1); g.zerglings = [enemy]; g.world.add(enemy.obj);
      check(b.model.userData.cannons.length === 2, 'Two cannon models missing');
      const shots = []; const spawn = g.spawnTracer;
      g.spawnTracer = (muzzle, target, damage, source) => { shots.push({ muzzle: muzzle.clone(), damage, source }); };
      b.update(.1, g); check(shots.length === 0, 'Empty bunker fired');
      check(g.commandGarrison([soldiers[0]], b) === 1 && b.garrison.length === 1, 'First Trooper did not enter');
      soldiers[0].update(.1, g);
      check(shots.length === 1 && shots[0].damage === 12, 'One operator must fire one boosted cannon');
      check(soldiers[0].attackRange === 6.4 && soldiers[0].stats.range === 4.4, 'Range bonus or base stats incorrect');
      check(g.commandGarrison([soldiers[1]], b) === 1 && b.garrison.length === 2, 'Second Trooper did not enter');
      check(!g.garrison(soldiers[2], b, true), 'Third Trooper entered');
      soldiers[1].update(.1, g);
      check(shots.length === 2 && shots[1].damage === 12, 'Second cannon did not fire');
      check(shots[0].muzzle.distanceTo(shots[1].muzzle) > .4, 'Both shots came from the same cannon');
      // The cannons turn all the way round: a bug behind the bunker is shot too, without waiting for it to cross the front.
      enemy.x = 16.5; enemy.z = 20.5;
      let steps = 0;
      for (; steps < 20 && shots.length < 4; steps++) for (const m of soldiers.slice(0, 2)) m.update(.05, g);
      check(shots.length === 4, 'Garrison did not fire at a bug behind the bunker');
      check(steps * .05 <= .9, `Garrison was slow to turn on a bug behind it (${(steps * .05).toFixed(2)} s)`);
      check(shots.slice(2).every(s => s.muzzle.x < b.x && s.damage === 12), 'Rear shots did not leave from cannons turned to the rear');
      b.update(.05, g);
      check(b.model.userData.cannons.every(c => Math.abs(c.rotation.y) > 2.5), 'Cannons did not turn to the rear');
      shots.length = 2; enemy.x = 26.5;
      const health = soldiers.slice(0, 2).map(m => m.hp);
      b.takeDamage(9999, g, 0);
      check(b.dead && b.garrison.length === 0, 'Destroyed bunker retained garrison');
      for (const [i, m] of soldiers.slice(0, 2).entries()) {
        check(!m.dead && !m.downed && !m.bunker && m.obj.visible && m.hp === health[i], 'Trooper did not survive intact');
        check(m.attackRange === 4.4 && m.attackDamage === 8, 'Bunker buffs persisted outside');
        check(g.grid.occupant(m.tx, m.ty) === m, 'Ejected Trooper grid occupancy broken');
        enemy.x = m.x + 2; enemy.z = m.z; m.target = enemy; m.yaw = 0; m.cooldown = 0;
        m.update(.1, g);
      }
      check(shots.length === 4 && shots.slice(2).every(s => s.damage === 8), 'Survivors did not resume rifle fire');
      g.spawnTracer = spawn;
      return { cannons: 2, damage: 12, range: 6.4, survivors: 2 };
    });
    assert.deepEqual(errors, []);
    console.log('PASS: empty/one/two operators, cannon muzzles, all-round fire, bonus stats, capacity, destruction and survivor combat', result);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
