const { chromium } = require(process.argv[2] || 'playwright-core');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { window.requestAnimationFrame = () => 1; });
    await page.goto('http://127.0.0.1:8765/');
    await page.waitForFunction(() => window.game?.stage, null, { polling: 50 });
    await page.locator('#introBtn').click();
    await page.evaluate(() => {
      const g = game; g.reset(12345); g.level = 5; g.loadLevel();
      g.startWave(); g.state = 'wave'; g.assault.spawnBoss();
      g.assault.boss.takeDamage(100000, g, 0);
      const time = g.time, charge = g.laserCharge;
      g.update(10);
      if (g.time !== time || g.laserCharge !== charge || !g.pendingEvolution) throw Error('Choice must freeze combat');
      if (g.chooseEvolution('invalid')) throw Error('Invalid pick accepted');
    });
    assert.equal(await page.locator('#evolutionDialog').isVisible(), true);
    assert.equal(await page.locator('[data-evolution]').count(), 3);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#evolutionDialog').isVisible(), true);
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      await page.setViewportSize({ width, height });
      const layout = await page.evaluate(() => {
        const dialog = document.getElementById('evolutionDialog'), r = dialog.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && dialog.scrollWidth <= dialog.clientWidth;
      });
      assert.equal(layout, true, 'Reward dialog must fit viewport');
      await page.screenshot({ path: `/tmp/td-evolutions-${width}.png` });
    }
    await page.locator('[data-evolution="siege"]').click();
    assert.equal(await page.locator('#evolutionDialog').isVisible(), false);
    await page.evaluate(async () => {
      const g = game, check = (ok, message) => { if (!ok) throw Error(message); };
      const { Marine, Zergling, Tracer } = await import('/src/entities.js');
      const { EVOLUTION_RULES: R } = await import('/src/config.js');
      const { captureCheckpoint, restoreCheckpoint, validateCheckpoint } = await import('/src/checkpoints.js');
      check(g.evolutions.siege === 1 && !g.chooseEvolution('chain'), 'Duplicate pick accepted');
      g.assault.defeated(g.assault.boss);
      check(!g.pendingEvolution, 'Boss offers duplicate reward');
      g.queue = []; for (const e of g.zerglings) e.dead = true;
      g.update(0.05); check(g.state === 'raid', 'Choice did not resume combat');
      g.completeWave(); check(g.level === 6 && g.evolutions.siege === 1, 'Next round lost evolution');
      g.minerals = 10000; g.paused = true;
      const deploy = kind => {
        const [x, y] = g.layout.open.find(([x, y]) => g.canBuildAt(x, y));
        check(g.placeGunner(kind, x, y), 'Deployment failed'); return g.gunners.at(-1);
      };
      const tank = deploy('tank');
      tank.update(R.deployTime, g);
      check(tank.siegeDeployed && tank.attackRange === tank.stats.range + 5 && tank.evolutionVisual.visible, 'Siege did not deploy');
      tank.blindT = 5; check(tank.attackRange === (tank.stats.range + 5) / 2, 'Blind ignores siege'); tank.blindT = 0;
      const target = new Zergling(tank.x + 9, tank.z, 'warrior', 100, 1);
      g.zerglings = [target]; g.world.add(target.obj); tank.target = target;
      tank.fire(g); check(g.shells.at(-1).radius === tank.spec.splash + R.siegeSplash, 'Siege splash missing');
      const destination = g.layout.open.find(([x,y]) => g.grid.buildable(x,y) && Math.hypot(x-tank.tx,y-tank.ty) < 5 && g.grid.walkRoute(tank.tx,tank.ty,x,y)?.length > 1);
      check(destination && tank.orderMove(...destination,g), 'No tank move route');
      check(!tank.siegeDeployed && tank.attackRange === tank.stats.range && !tank.evolutionVisual.visible, 'Moving tank kept siege bonus');
      const start = [tank.x, tank.z]; tank.stepMove(.05,g);
      check(Math.hypot(tank.x-start[0],tank.z-start[1]) > 0, 'Siege tank cannot move');

      g.offerEvolution('Test boss'); g.chooseEvolution('chain');
      const walker = deploy('goliath');
      const enemies = [0, 2, 4, 10].map((dx,i) => new Zergling(walker.x+dx, walker.z+2, i === 2 ? 'skyhunter' : 'warrior', 100, 1));
      g.zerglings = enemies; enemies.forEach(e => g.world.add(e.obj));
      const hp = enemies.map(e=>e.hp);
      const shot = new Tracer({ x: enemies[0].x, y: .3, z: enemies[0].z }, enemies[0], 20, walker);
      shot.update(.05,g);
      check(enemies[0].hp < hp[0] && enemies[1].hp < hp[1] && enemies[2].hp < hp[2] && enemies[3].hp === hp[3], 'Chain hops/radius/air targeting failed');
      check(g.fx.beams.length === 2 && walker.evolutionVisual.visible, 'Lightning effects missing');
      const beams = g.fx.beams.length; walker.upgrade(g.marineUpgrades);
      check(walker.evolutionVisual.parent === walker.obj, 'Promotion removed coils');
      const marineShot = new Tracer({ x: enemies[0].x, y:.3, z:enemies[0].z },enemies[0],20,{kind:'marine'});
      marineShot.update(.05,g); check(g.fx.beams.length === beams, 'Non-walker chained');

      g.offerEvolution('Test boss'); g.chooseEvolution('stand');
      const [bx,by] = g.layout.open.find(([x,y])=>g.canBuildAt(x,y));
      g.placeBunker(bx,by); const bunker = g.bunkers.at(-1);
      const soldier = deploy('marine'); soldier.bunker = bunker; bunker.garrison.push(soldier);
      if (soldier.isPlaced(g)) g.grid.clear(soldier.tx,soldier.ty);
      bunker.hp = bunker.maxHp * .31; bunker.takeDamage(bunker.maxHp*.02,g,0);
      check(bunker.lastStandT === 6 && bunker.lastStandCd === 20, 'Low health burst missing');
      const enemy = new Zergling(bunker.x+Math.cos(bunker.facing)*2,bunker.z+Math.sin(bunker.facing)*2,'warrior',100,1);
      g.zerglings = [enemy]; g.world.add(enemy.obj);
      soldier.target = enemy; soldier.yaw = bunker.facing; soldier.cooldown = 0;
      soldier.update(.01,g);
      check(Math.abs(soldier.cooldown-soldier.stats.attackSpeed/3)<1e-9, 'Garrison firing rate unchanged');
      bunker.update(6.1,g); check(bunker.lastStandT === 0, 'Burst never expires');
      bunker.takeDamage(1,g,0); check(bunker.lastStandT === 0, 'Cooldown bypass');
      bunker.update(14,g); bunker.takeDamage(1,g,0); check(bunker.lastStandT === 6, 'Burst does not rearm');

      g.offerEvolution('Test boss'); g.chooseEvolution('siege');
      check(g.evolutions.siege === 2, 'Repeat choice did not rank up');
      // Reach the next checkpoint through the production round transition, which refunds hardware.
      g.level = 20; g.completeWave(); g.paused = true; g.minerals = 10000;
      const future = deploy('tank'); future.update(1.2,g);
      check(future.attackRange === future.stats.range + 5.75, 'New tank missing rank bonus');
      const save = captureCheckpoint(g,{player:'Tester',quickDeployment:true,guideDismissed:true});
      check(validateCheckpoint(save), 'Evolution save invalid');
      for (const evolutions of [{bad:1},{siege:-1},{siege:1.5},{siege:999},[],null])
        check(!validateCheckpoint({...save,evolutions}), 'Malformed evolution accepted');
      restoreCheckpoint(g,save);
      check(g.evolutions.siege===2 && g.evolutions.chain===1 && g.evolutions.stand===1 && g.paused && !g.pendingEvolution, 'Restore lost choices');
      g.gunners[0].update(1.2,g); check(g.gunners[0].attackRange===g.gunners[0].stats.range+5.75,'Restored unit lost effect');
      const legacy = {...save}; delete legacy.evolutions;
      check(validateCheckpoint(legacy),'Legacy save rejected'); restoreCheckpoint(g,legacy);
      check(Object.keys(g.evolutions).length===0,'Legacy defaults incorrect');
      g.reset(123); check(!g.pendingEvolution && Object.keys(g.evolutions).length===0,'New run retained evolutions');
    });
    assert.deepEqual(errors, []);
    console.log('PASS: boss choices, modal pause, desktop/mobile layout, siege movement/splash, chain damage/air, bunker burst/cooldown, ranks, save validation/restore, legacy saves, reset');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exit(1); });
